// client/src/components/CoachesCornerPages/SavedDrillsPage.js
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { deleteDrill, listMyDrills } from "./coachDrillsApi";

const styles = {
  page: { padding: 16, maxWidth: 980, margin: "0 auto" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  h1: { margin: 0, fontSize: 22 },
  sub: { margin: "6px 0 0", color: "#666", fontSize: 13 },
  toolbar: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: {
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 999,
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
    minWidth: 220,
  },
  btn: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "#33ba35ff",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  btnSecondary: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "white",
    color: "#33ba35ff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 },
  card: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: 14,
  },
  title: { fontSize: 16, fontWeight: 700, margin: 0 },
  meta: { marginTop: 6, fontSize: 12, color: "#111", lineHeight: 1.35 },
  cardActions: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },
  empty: {
    marginTop: 14,
    background: "rgba(0,0,0,0.03)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: 14,
    color: "#333",
  },
};

function formatMeta(d) {
  const age = d?.inputs?.ageGroup || "--";
  const level = d?.inputs?.skillLevel || "--";
  const mins = d?.inputs?.durationMinutes || "--";
  const goal = d?.goal || "--";
  return `Age: ${age} • Level: ${level} • ${mins} min • Goal: ${goal}`;
}

export default function SavedDrillsPage() {
  const { token, user, isSubscriber, hasCoachesCorner } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return drills;
    return drills.filter((d) => {
      const hay = `${d.title || ""} ${d.goal || ""} ${d.inputs?.ageGroup || ""} ${d.inputs?.skillLevel || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [drills, q]);
  
  const unlimited = Boolean(isSubscriber);
  const freeUsed = drills.length >= 1;
  const generateLocked = !unlimited && freeUsed && !hasCoachesCorner;

  const refresh = async () => {
    setMsg("");
    setLoading(true);
    try {
      const data = await listMyDrills(token);
      setDrills(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg(e?.response?.data?.message || e?.message || "Failed to load drills.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onDelete = async (id) => {
    if (!window.confirm("Delete this drill?")) return;
    try {
      await deleteDrill(token, id);
      setDrills((prev) => prev.filter((d) => d._id !== id));
    } catch (e) {
      setMsg(e?.response?.data?.message || e?.message || "Failed to delete.");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>Saved Drills</h1>
          <div style={styles.sub}>Your generated drills. Tap one to view, edit, or rate it.</div>
        </div>
        <div style={styles.toolbar}>
          {drills.length > 0 && (
            <input
              style={styles.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drills…"
            />
          )}
          <Link to="/coaches-corner" style={styles.btnSecondary}>
            Back
          </Link>
          <Link to="/coaches-corner/drill-generator" style={styles.btn}>
            Generate
          </Link>
        </div>
      </div>

      {msg ? <div style={{ marginTop: 10, color: "#b00020" }}>{msg}</div> : null}

      {loading ? (
        <div style={{ marginTop: 14, color: "#666" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          {!hasCoachesCorner ? (
            // User doesn't have Coaches' Corner access - show paid tier offer
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Practice planning shouldn't take your whole night
              </div>

              <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
                You finish a match knowing what went wrong — but turning that into a focused,
                runnable practice takes time you don't have.
                <br /><br />
                Coaches' Corner turns match insight into practice-ready drills.
                Tell it your team, your goals, and your constraints.
                Loggerhead builds a complete drill you can run immediately.
                <br /><br />
                Edit it. Save it. Add personal notes. Export it as a practice PDF.
                <br /><br />
                Your <strong>first drill is free</strong>.
                If it helps, unlock unlimited drills for just <strong>$3.99/month</strong>.
              </div>

              {generateLocked ? (
                <button
                  style={{ ...styles.btn, opacity: 0.45, cursor: "not-allowed" }}
                  disabled
                  title="You've used your free drill. Subscribe to Coaches' Corner for unlimited drills."
                >
                  Generate
                </button>
              ) : (
                <Link to="/coaches-corner/drill-generator" style={styles.btn}>
                  Generate Your Free Drill
                </Link>
              )}

              <div style={{ marginTop: 8, fontSize: 12, color: "#dca6a6ff" }}>
                Upgrade anytime. Cancel anytime.
              </div>
            </>
          ) : (
            // User has Coaches' Corner access - encourage them to build first drill
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Ready to build your first drill?
              </div>

              <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
                Loggerhead's drill builder turns match insights into practice-ready drills.
                Tell it your team, your goals, and your constraints.
                Loggerhead creates a complete, runnable drill tailored to your team.
                <br /><br />
                Customize it, add your coaching notes, and export as a PDF for your team.
                <br /><br />
                Let's build your first drill!
              </div>

              <Link to="/coaches-corner/drill-generator" style={styles.btn}>
                Generate Your First Drill
              </Link>
            </>
          )}
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((d) => (
            <div key={d._id} style={styles.card}>
              <p style={styles.title}>{d.title || "Untitled Drill"}</p>
              <div style={styles.meta}>{formatMeta(d)}</div>
              <div style={styles.meta}>
                Rating: {Number(d.averageRating || 0).toFixed(1)} ({d.ratingsCount || 0})
              </div>

              <div style={styles.cardActions}>
                <Link to={`/coaches-corner/drills/${d._id}`} style={styles.btn}>
                  View
                </Link>
                <Link to={`/coaches-corner/drills/${d._id}/edit`} style={styles.btnSecondary}>
                  Edit
                </Link>
                <button style={styles.btnSecondary} onClick={() => onDelete(d._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}