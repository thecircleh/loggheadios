import axios from "axios";

const STAT_PATTERNS = [
  "/api/players/increment-games-played",
  "/api/players/decrement-games-played",
  "/api/stats/log",
  "/api/player-match-stats/log",
];

const STAT_PARAM_RE = /\/api\/players\/[^/]+\/stats$/;

function isStatMutation(url) {
  if (!url) return false;
  if (STAT_PATTERNS.some(p => url.includes(p))) return true;
  if (STAT_PARAM_RE.test(url)) return true;
  return false;
}

function genId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ── Shared IndexedDB (same DB as useOfflineActionQueue) ───────────────────────
const DB_NAME = "lh-action-queue";
const DB_STORE = "pending";

let dbPromise = null;
function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => { dbPromise = null; reject(e.target.error); };
  });
  return dbPromise;
}

async function queueAction(config) {
  try {
    const db = await getDB();
    const id = config.headers?.["x-idempotency-key"] || genId();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({
      id,
      url: config.url,
      method: config.method || "post",
      data: config.data,
      headers: {},  // token re-injected at drain time
      createdAt: Date.now(),
    });
    // Notify the hook to refresh its count and badge
    window.dispatchEvent(new CustomEvent("lh-queue-updated"));
    console.log(`[StatRetry] Queued for offline replay: ${config.url} (key=${id})`);
  } catch (err) {
    console.warn("[StatRetry] Failed to write to offline queue:", err);
  }
}

// ── Interceptor registration ──────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 10000; // 10s — fail fast on bad connections

let requestInterceptorId = null;
let responseInterceptorId = null;

export function setupStatRetryInterceptor() {
  if (requestInterceptorId !== null) return;

  // Add idempotency key + timeout to every stat mutation
  requestInterceptorId = axios.interceptors.request.use(config => {
    const method = (config.method || "").toLowerCase();
    if (method !== "get" && isStatMutation(config.url)) {
      if (!config.headers["x-idempotency-key"]) {
        config.headers["x-idempotency-key"] = genId();
      }
      if (!config.timeout) {
        config.timeout = REQUEST_TIMEOUT_MS;
      }
    }
    return config;
  });

  // Retry stat mutations on network errors and 5xx; queue to IndexedDB on final failure
  responseInterceptorId = axios.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;

      if (!config || !isStatMutation(config.url)) {
        return Promise.reject(error);
      }

      // Drain calls manage their own retry cycle
      if (config._offlineDrain) {
        return Promise.reject(error);
      }

      // 4xx — application-level failure, don't retry or queue
      if (error.response && error.response.status < 500) {
        return Promise.reject(error);
      }

      const retryCount = config._retryCount || 0;
      const MAX_RETRIES = 2; // 2 retries (3 total attempts) before queuing

      if (retryCount >= MAX_RETRIES) {
        console.warn(`[StatRetry] Giving up after ${MAX_RETRIES} retries — queuing: ${config.url}`);
        await queueAction(config);
        // Return a sentinel so callers know the action is safely queued (not lost)
        return { data: { queued: true }, status: 202, headers: {}, config };
      }

      config._retryCount = retryCount + 1;
      const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s

      console.log(
        `[StatRetry] Retry ${config._retryCount}/${MAX_RETRIES} in ${delay}ms for ${config.url}`
      );

      await sleep(delay);
      return axios(config);
    }
  );
}
