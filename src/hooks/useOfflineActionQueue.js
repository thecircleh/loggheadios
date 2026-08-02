import { useRef, useCallback, useEffect, useState } from "react";
import axios from "axios";

// ── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = "lh-action-queue";
const DB_STORE = "pending";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function dbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).index("createdAt").getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function dbPut(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

function dbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

function genId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 5000; // retry pending items every 5s while online

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineActionQueue({ token, enabled = false }) {
  const dbRef = useRef(null);
  const drainingRef = useRef(false);
  const drainRef = useRef(null);
  const heartbeatRef = useRef(null);
  const tokenRef = useRef(token);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => { tokenRef.current = token; }, [token]);

  // ── Count ──────────────────────────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    if (!dbRef.current) return 0;
    const items = await dbGetAll(dbRef.current);
    setPendingCount(items.length);
    return items.length;
  }, []);

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  // Fires every HEARTBEAT_MS while items remain so drain keeps going even if
  // network events don't re-fire (common in spotty gym WiFi).
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) return; // already running
    heartbeatRef.current = setInterval(() => {
      if (navigator.onLine) {
        drainRef.current?.();
      }
    }, HEARTBEAT_MS);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // ── Single-pass drain ──────────────────────────────────────────────────────
  // Makes ONE attempt per item per call. Items that fail (5xx/network) are
  // left in the queue for the next heartbeat. Items that succeed or get a 4xx
  // are deleted. This prevents getting stuck on a single failing item.
  const drain = useCallback(async () => {
    if (!enabled || !dbRef.current || drainingRef.current) return;
    if (!navigator.onLine) return;

    drainingRef.current = true;
    try {
      const items = await dbGetAll(dbRef.current);
      if (items.length === 0) {
        stopHeartbeat();
        setPendingCount(0);
        return;
      }

      let remaining = items.length;

      for (const item of items) {
        if (!navigator.onLine) break; // went offline mid-pass — stop, heartbeat will resume

        try {
          await axios({
            method: item.method || "post",
            url: item.url,
            data: item.data,
            headers: {
              Authorization: `Bearer ${tokenRef.current}`,
              "x-idempotency-key": item.id,
              ...item.headers,
            },
            withCredentials: true,
            _offlineDrain: true, // tells the retry interceptor to skip its own retries
          });
          // Success — remove from queue
          await dbDelete(dbRef.current, item.id);
          remaining--;
          setPendingCount(remaining);
          console.log(`[OfflineQueue] Sent and removed: ${item.url} (${remaining} left)`);
        } catch (err) {
          if (err.response && err.response.status < 500) {
            // 4xx — bad action, drop it (retrying won't help)
            console.warn(`[OfflineQueue] Dropping ${item.id} — 4xx (${err.response.status})`);
            await dbDelete(dbRef.current, item.id);
            remaining--;
            setPendingCount(remaining);
          } else {
            // 5xx or network error — leave it, heartbeat will retry
            console.warn(`[OfflineQueue] Will retry ${item.url} on next heartbeat`);
          }
        }
      }

      if (remaining > 0) {
        startHeartbeat(); // keep retrying until queue is empty
      } else {
        stopHeartbeat();
      }
    } finally {
      drainingRef.current = false;
    }
  }, [enabled, stopHeartbeat, startHeartbeat, refreshCount]);

  useEffect(() => { drainRef.current = drain; }, [drain]);

  // ── Open DB on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    openDB()
      .then(async db => {
        dbRef.current = db;
        const all = await dbGetAll(db);
        const cutoff = Date.now() - ACTION_TTL_MS;
        for (const item of all) {
          if (item.createdAt < cutoff) await dbDelete(db, item.id);
        }
        const count = await refreshCount();
        if (count > 0 && navigator.onLine) {
          drainRef.current?.(); // resume leftover queue from previous session
        }
      })
      .catch(err => console.error("[OfflineQueue] DB open failed:", err));

    return () => stopHeartbeat();
  }, [enabled, refreshCount, stopHeartbeat]);

  // ── Network status ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      drainRef.current?.();
    };
    const onOffline = () => {
      setIsOnline(false);
      stopHeartbeat(); // no point heartbeating while offline
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [stopHeartbeat]);

  // ── Cross-module queue updates (from retry interceptor) ─────────────────────
  // The retry interceptor writes stat actions directly to IndexedDB on final
  // failure and dispatches this event so the badge count updates immediately.
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      refreshCount();
      startHeartbeat(); // start draining as soon as something is queued
    };
    window.addEventListener("lh-queue-updated", handler);
    return () => window.removeEventListener("lh-queue-updated", handler);
  }, [enabled, refreshCount, startHeartbeat]);

  // ── Enqueue ─────────────────────────────────────────────────────────────────
  const enqueue = useCallback(async ({ url, method = "post", data, headers = {} }) => {
    if (!enabled) return null;

    const action = {
      id: genId(),
      url,
      method,
      data,
      headers,
      createdAt: Date.now(),
    };

    if (!navigator.onLine) {
      if (dbRef.current) {
        await dbPut(dbRef.current, action);
        await refreshCount();
        console.log(`[OfflineQueue] Offline — queued: ${url}`);
      }
      return null;
    }

    // Online — try immediately first
    try {
      const res = await axios({
        method,
        url,
        data,
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "x-idempotency-key": action.id,
          ...headers,
        },
        withCredentials: true,
      });
      return res;
    } catch (err) {
      if (!err.response || err.response.status >= 500) {
        // Transient failure — persist and let heartbeat drain it
        if (dbRef.current) {
          await dbPut(dbRef.current, action);
          await refreshCount();
          console.warn(`[OfflineQueue] Queued for retry: ${url}`);
          startHeartbeat(); // start heartbeat so drain runs soon
        }
        return null;
      }
      throw err; // 4xx — propagate immediately
    }
  }, [enabled, refreshCount, startHeartbeat]);

  return { enqueue, pendingCount, isOnline };
}
