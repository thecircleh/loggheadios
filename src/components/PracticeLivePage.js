import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const getTodayString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const ACTIVE_ATTENDANCE_STATUSES = ["present", "late"];

const statButtonsByType = {
  serving: [
    { key: "serveIn", label: "In" },
    { key: "serveErrors", label: "Error" },
    { key: "aces", label: "Ace" },
  ],
  passing: [
    { key: "receive0", label: "Error" },
    { key: "receive1", label: "1" },
    { key: "receive2", label: "2" },
    { key: "receive3", label: "3" },
  ],
  attacking: [
    { key: "attacks", label: "0 Attempt" },
    { key: "kills", label: "Kill" },
    { key: "attackErrors", label: "Error" },
  ],
  defense: [
	{ key: "dig0", label: "Error" },
    { key: "dig1", label: "1" },
    { key: "dig2", label: "2" },
    { key: "dig3", label: "3" },
  ],
setting: [	{ key: "setFree", label: "Set --> Freeball" },
    { key: "setAttack", label: "Set --> Attack" },
    { key: "setKill", label: "Set --> Kill" },
    { key: "setError", label: "Error" },
	],
blocking: [	{ key: "blockDown", label: "Block --> Downball" },
    { key: "blockTouch", label: "Block --> Touch" },
    { key: "blockKill", label: "Block --> Kill" },
    { key: "blockError", label: "Error" },
	],
};

const formatCountdown = (totalSeconds) => {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatStatus = (status) => {
  if (!status) return "";
  return status.replaceAll("_", " ");
};

export default function PracticeLivePage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryTeam = searchParams.get("team") || "";
  const storedTeam = localStorage.getItem("selectedTeam") || "";
  const teamName = queryTeam || storedTeam;
  const sessionDate = useMemo(() => getTodayString(), []);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [message, setMessage] = useState("");
  const [timerFullscreen, setTimerFullscreen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [timerStartOverride, setTimerStartOverride] = useState(null);
  const [showingNotesForDrill, setShowingNotesForDrill] = useState(null);
  const [completing, setCompleting] = useState(false);

  const drills = session?.drills || [];
  const activeDrill =
    drills.find((drill) => drill.id === session?.activeDrillId) || null;

  const attendingPlayers = useMemo(() => {
    const attendance = Array.isArray(session?.attendance) ? session.attendance : [];

    return attendance
      .filter((entry) => ACTIVE_ATTENDANCE_STATUSES.includes(entry.status))
      .sort((a, b) => {
        const aNum = typeof a.playerNumber === "number" ? a.playerNumber : 999;
        const bNum = typeof b.playerNumber === "number" ? b.playerNumber : 999;
        if (aNum !== bNum) return aNum - bNum;
        return (a.playerName || "").localeCompare(b.playerName || "");
      });
  }, [session]);

  useEffect(() => {
    if (!activeDrill?.actualStartTime || !activeDrill?.durationMinutes) {
      setRemainingSeconds(null);
      setTimerExpired(false);
      return;
    }

    // Use override time if available, otherwise use actual start time
    const startTimeToUse = timerStartOverride || activeDrill.actualStartTime;
    const startMs = new Date(startTimeToUse).getTime();
    const durationMs = Number(activeDrill.durationMinutes || 0) * 60 * 1000;

    const tick = () => {
      const endMs = startMs + durationMs;
      const diffMs = endMs - Date.now();
      const nextSeconds = Math.ceil(diffMs / 1000);

      setRemainingSeconds(Math.max(0, nextSeconds));
      setTimerExpired(diffMs <= 0);
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [activeDrill?.actualStartTime, activeDrill?.durationMinutes, timerStartOverride]);

  // Clear timer override when active drill changes
  useEffect(() => {
    setTimerStartOverride(null);
  }, [activeDrill?.id]);

  useEffect(() => {
    if (
      selectedPlayerId &&
      !attendingPlayers.some(
        (player) => String(player.playerId) === String(selectedPlayerId)
      )
    ) {
      setSelectedPlayerId(null);
    }
  }, [attendingPlayers, selectedPlayerId]);

  const loadSession = async () => {
    if (!token) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    if (!teamName) {
      setMessage("No team selected. Go to Settings first and select a team.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const res = await axios.get(`${API_URL}/api/practice/session`, {
        params: { teamName, sessionDate },
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      setSession(res.data);
      setMessage("");
    } catch (err) {
      console.error("Failed to load live practice session:", err);
      setMessage(err.response?.data?.message || "Failed to load practice session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [teamName, token]);

  const startDrill = async (drillId) => {
    if (!session?._id || !drillId) return;

    try {
      const res = await axios.patch(
        `${API_URL}/api/practice/drills/start`,
        {
          sessionId: session._id,
          drillId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
      setMessage("");
    } catch (err) {
      console.error("Failed to start drill:", err);
      setMessage(err.response?.data?.message || "Failed to start drill.");
    }
  };

  const restartActiveDrill = async () => {
    if (!session?._id || !activeDrill?.id) return;
    
    try {
      setRestarting(true);
      
      // Immediately reset the timer locally
      setTimerStartOverride(new Date().toISOString());
      setTimerExpired(false);
      
      // Also call the backend to update the drill
      await startDrill(activeDrill.id);
      setMessage("Clock restarted!");
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error("Failed to restart drill:", err);
      setMessage("Failed to restart clock");
    } finally {
      setRestarting(false);
    }
  };

  const completeDrill = async (drillId) => {
    if (!session?._id || !drillId) return;

    try {
      const res = await axios.patch(
        `${API_URL}/api/practice/drills/complete`,
        {
          sessionId: session._id,
          drillId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
      setSelectedPlayerId(null);
      setMessage("");
    } catch (err) {
      console.error("Failed to complete drill:", err);
      setMessage(err.response?.data?.message || "Failed to complete drill.");
    }
  };

  const skipDrill = async (drillId) => {
    if (!session?._id || !drillId) return;

    try {
      const res = await axios.patch(
        `${API_URL}/api/practice/drills/skip`,
        {
          sessionId: session._id,
          drillId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
      setSelectedPlayerId(null);
      setMessage("");
    } catch (err) {
      console.error("Failed to skip drill:", err);
      setMessage(err.response?.data?.message || "Failed to skip drill.");
    }
  };

  const completePractice = async () => {
    if (!session?._id) return;

    const confirmed = window.confirm(
      "End practice? This will reset attendance and you'll be able to view the practice recap."
    );

    if (!confirmed) return;

    try {
      setCompleting(true);
      setMessage("");

      await axios.patch(
        `${API_URL}/api/practice/complete`,
        { sessionId: session._id },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      // Navigate to recap page
      navigate(`/coaches-corner/practice-recap?sessionId=${session._id}`);
    } catch (err) {
      console.error("Failed to complete practice:", err);
      setMessage(err.response?.data?.message || "Failed to complete practice.");
      setCompleting(false);
    }
  };

  const logStat = async (statKey) => {
    if (!activeDrill || !selectedPlayerId || !session?._id) return;

    try {
      const res = await axios.post(
        `${API_URL}/api/practice/drills/stat`,
        {
          sessionId: session._id,
          drillId: activeDrill.id,
          playerId: selectedPlayerId,
          statKey,
          delta: 1,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
      setMessage("");
    } catch (err) {
      console.error("Failed to log stat:", err);
      setMessage(err.response?.data?.message || "Failed to log stat.");
    }
  };

  const getPlayerStatsSummary = (playerId) => {
    if (!activeDrill) return "";

    const row = activeDrill.playerStats?.find(
      (entry) => String(entry.playerId) === String(playerId)
    );

    if (!row || !row.stats) return "";

    const entries =
      typeof row.stats.entries === "function"
        ? Array.from(row.stats.entries())
        : Object.entries(row.stats);

    return entries
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ");
  };

  const currentSelectedPlayer = attendingPlayers.find(
    (entry) => String(entry.playerId) === String(selectedPlayerId)
  );

  if (loading) {
    return <div style={styles.page}>Loading live practice...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Run Practice</h1>
            <p style={styles.subtext}>
              {teamName || "No team selected"} · {sessionDate}
            </p>
          </div>

          <div style={styles.headerLinks}>
            <Link to="/coaches-corner/practice" style={styles.link}>
              Practice Home
            </Link>
            <Link to="/coaches-corner/practice-planner" style={styles.link}>
              Plan Practice
            </Link>
            <Link to="/coaches-corner/practice-attendance" style={styles.link}>
              Attendance
            </Link>
            <button 
              onClick={completePractice} 
              style={styles.endButton}
              disabled={completing}
            >
              {completing ? "Ending..." : "End Practice"}
            </button>
          </div>
        </div>

        {message ? <p style={styles.message}>{message}</p> : null}

        <div style={styles.topCard}>
          <div style={styles.statusSection}>
            <div><strong>Practice Status:</strong> {session?.status || "unknown"}</div>
            <div><strong>Active Drill:</strong> {activeDrill?.title || "None"}</div>
            <div><strong>Drill Status:</strong> {activeDrill?.status || "n/a"}</div>
            <div><strong>Stats Type:</strong> {activeDrill?.statsType || "none"}</div>
            <div><strong>Attending Players:</strong> {attendingPlayers.length}</div>
          </div>

          {activeDrill ? (
            <div style={styles.timerWrap}>
              <div style={styles.timerLabel}>Drill Clock</div>

              <div
                style={{
                  ...styles.timerValue,
                  color: timerExpired ? "#FF3B30" : "#111",
                }}
              >
                {remainingSeconds == null
                  ? `${activeDrill.durationMinutes || 0}:00`
                  : formatCountdown(remainingSeconds)}
              </div>

              <div style={styles.timerSubtext}>
                {timerExpired
                  ? "Time is up"
                  : `${activeDrill.durationMinutes || 0} minute drill`}
              </div>

              <div style={styles.timerButtonRow}>
                <button 
                  onClick={restartActiveDrill} 
                  style={{
                    ...styles.timerButton,
                    opacity: restarting ? 0.6 : 1,
                  }}
                  disabled={restarting}
                >
                  {restarting ? "Restarting..." : "Restart Clock"}
                </button>
                <button 
                  onClick={() => setTimerFullscreen(true)} 
                  style={styles.timerButton}
                >
                  Fullscreen
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div style={styles.layout}>
          <div style={styles.leftCol}>
            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Practice Flow</h3>

              <div style={styles.drillList}>
                {drills.length === 0 ? (
                  <div style={styles.empty}>No drills planned yet.</div>
                ) : (
                  drills.map((drill) => (
                    <div
                      key={drill.id}
                      style={{
                        ...styles.drillItem,
                        border:
                          drill.id === session?.activeDrillId
                            ? "2px solid #007AFF"
                            : "1px solid #ECECF1",
                      }}
                    >
                      <div>
                        <div style={styles.drillTitleRow}>
                          <div style={styles.drillTitle}>
                            {drill.title || "Untitled Drill"}
                          </div>
                          {drill.notes && drill.notes.trim() && (
                            <button
                              onClick={() => setShowingNotesForDrill(
                                showingNotesForDrill === drill.id ? null : drill.id
                              )}
                              style={styles.infoIcon}
                              title="Show/hide coaching notes"
                            >
                              i
                            </button>
                          )}
                        </div>
                        <div style={styles.drillMeta}>
                          {formatStatus(drill.category)} · {drill.durationMinutes} min ·{" "}
                          {formatStatus(drill.status)}
                        </div>
                        
                        {showingNotesForDrill === drill.id && drill.notes && (
                          <div style={styles.drillNotes}>
                            <div style={styles.notesLabel}>Coaching Notes:</div>
                            <div style={styles.notesText}>{drill.notes}</div>
                          </div>
                        )}
                      </div>

                      <div style={styles.drillButtons}>
                        <button
                          onClick={() => startDrill(drill.id)}
                          style={styles.smallPrimary}
                        >
                          Start
                        </button>

                        <button
                          onClick={() => completeDrill(drill.id)}
                          style={styles.smallSecondary}
                        >
                          Done
                        </button>

                        <button
                          onClick={() => skipDrill(drill.id)}
                          style={styles.smallDanger}
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div style={styles.rightCol}>
            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Attending Players</h3>

              {attendingPlayers.length === 0 ? (
                <div style={styles.noAttendanceContainer}>
                  <div style={styles.noAttendanceIcon}>📋</div>
                  <div style={styles.noAttendanceText}>
                    No players in attendance yet
                  </div>
                  <div style={styles.noAttendanceHint}>
                    Attendance is optional for running practice, but required for tracking stats
                  </div>
                  <Link to="/coaches-corner/practice-attendance" style={styles.attendanceButton}>
                    Take Attendance
                  </Link>
                </div>
              ) : (
                <div style={styles.playerGrid}>
                  {attendingPlayers.map((entry) => (
                    <button
                      key={String(entry.playerId)}
                      onClick={() => setSelectedPlayerId(String(entry.playerId))}
                      style={{
                        ...styles.playerTile,
                        background:
                          String(entry.playerId) === String(selectedPlayerId)
                            ? "#007AFF"
                            : "#F5F5F7",
                        color:
                          String(entry.playerId) === String(selectedPlayerId)
                            ? "#fff"
                            : "#111",
                      }}
                    >
                      <div style={styles.playerName}>{entry.playerName}</div>
                      <div style={styles.playerMeta}>
                        {entry.playerNumber ? `#${entry.playerNumber}` : ""}
                        {entry.status ? ` · ${formatStatus(entry.status)}` : ""}
                      </div>

                      {activeDrill ? (
                        <div style={styles.playerStats}>
                          {getPlayerStatsSummary(entry.playerId)}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Stat Pad</h3>

              {!activeDrill ? (
                <div style={styles.empty}>Start a drill to log stats.</div>
              ) : !activeDrill.statsEnabled || activeDrill.statsType === "none" ? (
                <div style={styles.empty}>This drill is not tracking stats.</div>
              ) : !selectedPlayerId ? (
                <div style={styles.empty}>Select a player first.</div>
              ) : (
                <>
                  <div style={styles.selectedPlayerBanner}>
                    Logging stats for{" "}
                    <strong>{currentSelectedPlayer?.playerName || "Selected Player"}</strong>
                  </div>

                  <div style={styles.statButtonGrid}>
                    {(statButtonsByType[activeDrill.statsType] || []).map((btn) => (
                      <button
                        key={btn.key}
                        onClick={() => logStat(btn.key)}
                        style={styles.primaryButton}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {timerFullscreen && activeDrill ? (
          <div style={styles.fullscreenOverlay}>
            <button 
              onClick={() => setTimerFullscreen(false)} 
              style={styles.closeFullscreen}
            >
              ✕
            </button>

            <div style={styles.fullscreenContent}>
              <div style={styles.fullscreenDrillName}>{activeDrill.title}</div>
              
              <div
                style={{
                  ...styles.fullscreenTimer,
                  color: timerExpired ? "#FF3B30" : "#fff",
                }}
              >
                {remainingSeconds == null
                  ? `${activeDrill.durationMinutes || 0}:00`
                  : formatCountdown(remainingSeconds)}
              </div>

              <div style={styles.fullscreenSubtext}>
                {timerExpired
                  ? "Time is up!"
                  : `${activeDrill.durationMinutes || 0} minute drill`}
              </div>

              <button 
                onClick={restartActiveDrill} 
                style={{
                  ...styles.fullscreenRestartButton,
                  opacity: restarting ? 0.6 : 1,
                }}
                disabled={restarting}
              >
                {restarting ? "Restarting..." : "Restart Clock"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#F2F2F7",
    padding: 16,
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  },
  wrap: {
    maxWidth: 1200,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 700,
  },
  subtext: {
    marginTop: 6,
    color: "#666",
  },
  headerLinks: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  link: {
    color: "#007AFF",
    textDecoration: "none",
    fontWeight: 600,
  },
  endButton: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "#FF3B30",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 15,
  },
  message: {
    marginBottom: 12,
    color: "#1a7f37",
  },
  topCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    display: "flex",
    gap: 16,
    marginBottom: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  statusSection: {
    flex: 1,
    minWidth: 250,
    display: "grid",
    gap: 8,
  },
  timerWrap: {
    minWidth: 280,
    padding: 20,
    borderRadius: 14,
    background: "#F8F8FA",
    display: "grid",
    gap: 6,
  },
  timerLabel: {
    fontSize: 13,
    color: "#666",
    fontWeight: 600,
  },
  timerValue: {
    fontSize: 42,
    fontWeight: 800,
    letterSpacing: 1,
  },
  timerSubtext: {
    fontSize: 13,
    color: "#666",
  },
  timerButtonRow: {
    marginTop: 6,
    display: "flex",
    gap: 8,
  },
  timerButton: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#E5E5EA",
    color: "#111",
    fontWeight: 600,
    cursor: "pointer",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  leftCol: {
    display: "grid",
    gap: 16,
  },
  rightCol: {
    display: "grid",
    gap: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 12,
    fontSize: 20,
  },
  drillList: {
    display: "grid",
    gap: 10,
  },
  drillItem: {
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 10,
    background: "#fff",
  },
  drillTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  drillTitle: {
    fontWeight: 700,
    flex: 1,
  },
  infoIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    background: "#007AFF",
    color: "#fff",
    border: "none",
    fontSize: 14,
    fontWeight: 700,
    fontStyle: "italic",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  drillNotes: {
    marginTop: 8,
    padding: 10,
    background: "#F8F8FA",
    borderRadius: 10,
    borderLeft: "3px solid #007AFF",
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#007AFF",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: "#333",
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
  },
  drillMeta: {
    marginTop: 4,
    color: "#666",
    fontSize: 14,
  },
  drillButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  smallPrimary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontWeight: 600,
  },
  smallSecondary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#E5E5EA",
    color: "#111",
    fontWeight: 600,
  },
  smallDanger: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#FF3B30",
    color: "#fff",
    fontWeight: 600,
  },
  playerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  playerTile: {
    border: "none",
    borderRadius: 14,
    padding: 14,
    textAlign: "left",
    minHeight: 90,
  },
  playerName: {
    fontWeight: 700,
    fontSize: 16,
  },
  playerMeta: {
    marginTop: 4,
    fontSize: 14,
    opacity: 0.85,
  },
  playerStats: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 1.35,
    opacity: 0.95,
  },
  selectedPlayerBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: "#F5F5F7",
    color: "#111",
    fontSize: 14,
  },
  statButtonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
  },
  primaryButton: {
    padding: 14,
    borderRadius: 14,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
  },
  empty: {
    color: "#666",
  },
  noAttendanceContainer: {
    padding: "40px 20px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  noAttendanceIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  noAttendanceText: {
    fontSize: 18,
    fontWeight: 600,
    color: "#111",
  },
  noAttendanceHint: {
    fontSize: 14,
    color: "#666",
    maxWidth: 300,
    lineHeight: 1.5,
  },
  attendanceButton: {
    marginTop: 8,
    padding: "16px 32px",
    background: "#007AFF",
    color: "#fff",
    borderRadius: 14,
    fontSize: 18,
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-block",
    boxShadow: "0 4px 12px rgba(0, 122, 255, 0.3)",
    transition: "transform 0.2s, box-shadow 0.2s",
    cursor: "pointer",
  },
  fullscreenOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  closeFullscreen: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(255,255,255,0.2)",
    border: "none",
    color: "#fff",
    fontSize: 32,
    width: 50,
    height: 50,
    borderRadius: 25,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenContent: {
    textAlign: "center",
    display: "grid",
    gap: 24,
    padding: 40,
  },
  fullscreenDrillName: {
    fontSize: 36,
    fontWeight: 700,
    color: "#fff",
  },
  fullscreenTimer: {
    fontSize: 280,
    fontWeight: 800,
    letterSpacing: 8,
  },
  fullscreenSubtext: {
    fontSize: 28,
    color: "#aaa",
  },
  fullscreenRestartButton: {
    marginTop: 20,
    padding: "20px 40px",
    borderRadius: 16,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontSize: 24,
    fontWeight: 600,
    cursor: "pointer",
  },
};