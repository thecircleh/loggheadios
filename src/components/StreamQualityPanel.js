// Admin: how live streams are holding up, and whether SRT or bonding would help.
// Data: server GET /api/users/admin-streams (each stream's quality log, client utils/streamQuality.js).
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";

const POOR_SHARE = 0.1; // more than 10% of live time on a red badge
const LONG_DELAY_MS = 250;
const BIG_JITTER_MS = 150;
const LOW_UPLOAD_MBPS = 2.6; // under this, even Medium quality has no headroom

const minutes = (ms) => {
  const m = Math.round((ms || 0) / 60000);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} hr`;
};
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/** What happened to one stream, and what would have helped. */
export function judgeStream(st) {
  if (!st) return { healthy: false, unknown: true, tags: ["No data"], helps: [] };
  const healthTime = (st.goodMs || 0) + (st.fairMs || 0) + (st.poorMs || 0);
  const poorShare = healthTime ? (st.poorMs || 0) / healthTime : 0;
  const tags = [];
  if (!st.reachedLive) tags.push("Never connected");
  if ((st.reconnects || 0) > 0) tags.push(`Dropped ${st.reconnects}×`);
  if (poorShare > POOR_SHARE) tags.push(`Red ${Math.round(poorShare * 100)}% of the time`);
  if ((st.hotMs || 0) > 60000) tags.push("Phone hot");
  const struggling = !st.reachedLive || (st.reconnects || 0) > 0 || poorShare > POOR_SHARE || (st.offlineMs || 0) > 30000;

  const c = st.check;
  const delayed = c && ((c.rttMs || 0) >= LONG_DELAY_MS || (c.pingLoss || 0) > 0 || (c.jitterMs || 0) >= BIG_JITTER_MS);
  const thin = (c && c.uploadMbps < LOW_UPLOAD_MBPS) || (st.avgKbps && st.targetKbps && st.avgKbps < st.targetKbps * 0.6);
  const helps = [];
  if (struggling && delayed) helps.push("SRT");
  // Short on upload: on Wi-Fi, bonding adds cellular. Already on cellular (no Wi-Fi there), the
  // only add-on is a second carrier, like a hotspot from a different carrier.
  if (struggling && thin) helps.push(st.network === "cellular" ? "A 2nd carrier" : "Bonding");
  return { healthy: !struggling, tags, helps, poorShare, delayed, thin };
}

const cell = { border: "1px solid #ddd", padding: "6px 8px", fontSize: 12, verticalAlign: "top" };
const tile = (bg) => ({ flex: 1, minWidth: 150, padding: 14, borderRadius: 8, background: bg });

function HealthBar({ st }) {
  const total = (st?.goodMs || 0) + (st?.fairMs || 0) + (st?.poorMs || 0);
  if (!total) return <span style={{ color: "#aaa" }}>—</span>;
  const part = (ms, color) => <div style={{ width: `${(ms / total) * 100}%`, background: color }} />;
  return (
    <div title={`Green ${pct(st.goodMs, total)}% · Yellow ${pct(st.fairMs, total)}% · Red ${pct(st.poorMs, total)}%`}
      style={{ display: "flex", width: 90, height: 10, borderRadius: 5, overflow: "hidden", background: "#eee" }}>
      {part(st.goodMs || 0, "#4ADE80")}{part(st.fairMs || 0, "#FACC15")}{part(st.poorMs || 0, "#F87171")}
    </div>
  );
}

export default function StreamQualityPanel({ apiUrl, token }) {
  const [days, setDays] = useState(30);
  const [streams, setStreams] = useState(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [onlyStruggling, setOnlyStruggling] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setStreams(null);
    setError("");
    axios.get(`${apiUrl}/api/users/admin-streams?days=${days}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => { if (!cancelled) setStreams(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || err.message); });
    return () => { cancelled = true; };
  }, [apiUrl, token, days]);

  const judged = useMemo(() => (streams || []).map((s) => ({ ...s, verdict: judgeStream(s.stats) })), [streams]);
  const withData = judged.filter((s) => s.stats);
  const count = (fn) => withData.filter(fn).length;
  const healthy = count((s) => s.verdict.healthy);
  const struggling = withData.length - healthy;
  const srt = count((s) => s.verdict.helps.includes("SRT"));
  const bonding = count((s) => s.verdict.helps.includes("Bonding"));
  const secondCarrier = count((s) => s.verdict.helps.includes("A 2nd carrier"));
  const never = count((s) => !s.stats.reachedLive);
  const dropped = count((s) => (s.stats.reconnects || 0) > 0);
  const hot = count((s) => (s.stats.hotMs || 0) > 60000);
  const liveTotal = withData.reduce((n, s) => n + (s.stats.liveMs || 0), 0);
  const onCell = count((s) => s.stats.network === "cellular");

  const rows = judged.filter((s) => !onlyStruggling || (s.stats && !s.verdict.healthy));
  const shown = showAll ? rows : rows.slice(0, 25);

  return (
    <div style={{ marginBottom: 30, padding: 20, background: "#f8f9fa", borderRadius: 8, border: "2px solid #dee2e6" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>📡 Stream quality</h2>
        <label style={{ fontSize: 13 }}>
          Last{" "}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
      </div>
      <p style={{ fontSize: 13, color: "#555", margin: "6px 0 14px" }}>
        Each stream records the connection check (upload, delay, jitter, lost pings) and how it held up:
        time on a green, yellow or red badge, dropouts and actual upload. <strong>SRT</strong> helps streams that
        struggled on long-delay or lossy networks. For streams that ran out of upload, <strong>bonding</strong>
        (adding cellular) helps on Wi-Fi, and <strong>a 2nd carrier</strong> (like a hotspot on a different
        carrier) helps on cellular. Streams from app versions before this log show as "No data".
      </p>

      {error && <p style={{ color: "#b91c1c" }}>Couldn't load streams: {error}</p>}
      {!streams && !error && <p>Loading…</p>}

      {streams && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={tile("#E0E7FF")}>
              <div style={{ fontSize: 12, color: "#555" }}>Streams with data</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{withData.length}</div>
              <div style={{ fontSize: 12, color: "#444" }}>{minutes(liveTotal)} live · {onCell} on cellular</div>
            </div>
            <div style={tile("#DCFCE7")}>
              <div style={{ fontSize: 12, color: "#555" }}>Healthy</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#166534" }}>{healthy} <span style={{ fontSize: 13 }}>({pct(healthy, withData.length)}%)</span></div>
            </div>
            <div style={tile("#FEE2E2")}>
              <div style={{ fontSize: 12, color: "#555" }}>Struggled</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#991B1B" }}>{struggling} <span style={{ fontSize: 13 }}>({pct(struggling, withData.length)}%)</span></div>
              <div style={{ fontSize: 12, color: "#444" }}>{never} never connected · {dropped} dropped · {hot} phone hot</div>
            </div>
            <div style={tile("#FEF3C7")}>
              <div style={{ fontSize: 12, color: "#555" }}>SRT would help</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#92400E" }}>{srt}</div>
              <div style={{ fontSize: 12, color: "#444" }}>struggled with long delay, jitter or lost pings</div>
            </div>
            <div style={tile("#FCE7F3")}>
              <div style={{ fontSize: 12, color: "#555" }}>Bonding would help</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#9D174D" }}>{bonding}</div>
              <div style={{ fontSize: 12, color: "#444" }}>on Wi-Fi, struggled with too little upload</div>
            </div>
            <div style={tile("#EDE9FE")}>
              <div style={{ fontSize: 12, color: "#555" }}>A 2nd carrier would help</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#5B21B6" }}>{secondCarrier}</div>
              <div style={{ fontSize: 12, color: "#444" }}>on cellular, struggled with too little upload</div>
            </div>
          </div>

          <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <input type="checkbox" checked={onlyStruggling} onChange={(e) => setOnlyStruggling(e.target.checked)} />
            Only streams that struggled
          </label>

          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "#666" }}>No streams in this period.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, background: "#fff" }}>
                <thead>
                  <tr style={{ background: "#f1f1f1" }}>
                    {["When", "User", "Phone · network", "Connection check", "Quality", "Live", "Badge", "Upload (avg / low / target)", "Dropouts", "Verdict"].map((h) => (
                      <th key={h} style={{ ...cell, textAlign: "left", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const st = s.stats;
                    const v = s.verdict;
                    const c = st?.check;
                    return (
                      <tr key={s._id} style={{ background: !st ? "#fafafa" : v.healthy ? "#fff" : "#FFF7F7" }}>
                        <td style={cell}>{dayjs(s.createdAt).format("MMM D, h:mm a")}</td>
                        <td style={cell}>{s.email}</td>
                        <td style={cell}>{s.platform || "?"} · {st?.network || "?"}</td>
                        <td style={cell}>
                          {c ? (
                            <>
                              {c.uploadMbps} Mbps up · {c.rttMs} ms
                              {c.jitterMs != null && ` · ±${c.jitterMs} ms`}
                              {c.pingLoss ? ` · ${Math.round(c.pingLoss * 100)}% lost` : ""}
                            </>
                          ) : <span style={{ color: "#aaa" }}>{st ? "skipped" : "—"}</span>}
                        </td>
                        <td style={cell}>{st ? `${st.quality || "?"}${st.picked === "manual" ? " (picked)" : ""}` : "—"}</td>
                        <td style={cell}>{st ? (st.reachedLive ? minutes(st.liveMs) : "never") : minutes(s.durationMs)}</td>
                        <td style={cell}><HealthBar st={st} /></td>
                        <td style={cell}>
                          {st?.avgKbps ? `${(st.avgKbps / 1000).toFixed(1)} / ${((st.minKbps || 0) / 1000).toFixed(1)} / ${((st.targetKbps || 0) / 1000).toFixed(1)} Mbps` : "—"}
                        </td>
                        <td style={cell}>
                          {st ? `${st.reconnects || 0}${st.offlineMs ? ` · ${minutes(st.offlineMs)} off` : ""}` : "—"}
                        </td>
                        <td style={cell}>
                          {!st ? <span style={{ color: "#aaa" }}>No data</span> : v.healthy ? (
                            <span style={{ color: "#166534", fontWeight: 700 }}>Healthy</span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {v.tags.map((t) => (
                                <span key={t} style={{ background: "#FEE2E2", color: "#991B1B", borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{t}</span>
                              ))}
                              {v.helps.map((h) => (
                                <span key={h} style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{h} would help</span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 25 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} style={{ marginTop: 8 }}>
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
