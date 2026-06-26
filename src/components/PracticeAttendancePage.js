import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith("10.")) {
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

const statusColors = {
  present: "#34C759",
  late: "#FF9500",
  excused: "#007AFF",
  absent: "#E5E5EA",
  left_early: "#FF3B30",
};

export default function PracticeAttendancePage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();

  const queryTeam = searchParams.get("team") || "";
  const storedTeam = localStorage.getItem("selectedTeam") || "";
  const teamName = queryTeam || storedTeam;
  const sessionDate = useMemo(() => getTodayString(), []);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coachMode, setCoachMode] = useState(false);
  const [message, setMessage] = useState("");

  const loadSession = async () => {
    if (!token) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    if (!teamName) {
      setMessage("No team selected. Go to Rosters & Matches first and select a team.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const res = await axios.post(
        `${API_URL}/api/practice/session`,
        {
          teamName,
          sessionDate,
          title: "Practice",
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
      setMessage("");
    } catch (err) {
      console.error("Failed loading practice attendance:", err);
      setMessage(err.response?.data?.message || "Failed to load practice attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [teamName, token]);

  const sortedAttendance = useMemo(() => {
    if (!session?.attendance) return [];
    return [...session.attendance].sort((a, b) => {
      const aNum = typeof a.playerNumber === "number" ? a.playerNumber : 999;
      const bNum = typeof b.playerNumber === "number" ? b.playerNumber : 999;
      if (aNum !== bNum) return aNum - bNum;
      return (a.playerName || "").localeCompare(b.playerName || "");
    });
  }, [session]);

  const totals = useMemo(() => {
    const entries = session?.attendance || [];
    return {
      present: entries.filter((e) => e.status === "present").length,
      late: entries.filter((e) => e.status === "late").length,
      excused: entries.filter((e) => e.status === "excused").length,
      absent: entries.filter((e) => e.status === "absent").length,
    };
  }, [session]);

  const checkInPlayer = async (playerId) => {
    if (!session?._id || session?.isLocked || coachMode) return;

    try {
      const res = await axios.post(
        `${API_URL}/api/practice/checkin`,
        {
          sessionId: session._id,
          playerId,
          source: "self_checkin",
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      setSession(res.data);
    } catch (err) {
      console.error("Failed check-in", err);
      setMessage(err.response?.data?.message || "Failed to check in player.");
    }
  };

  const coachSetStatus = async (playerId, status) => {
    if (!session?._id) return;

    try {
      const res = await axios.patch(
        `${API_URL}/api/practice/attendance`,
        {
          sessionId: session._id,
          playerId,
          status,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      setSession(res.data);
    } catch (err) {
      console.error("Failed attendance update", err);
      setMessage(err.response?.data?.message || "Failed to update attendance.");
    }
  };

  const toggleLock = async () => {
    if (!session?._id) return;

    try {
      const res = await axios.patch(
        `${API_URL}/api/practice/lock`,
        {
          sessionId: session._id,
          isLocked: !session.isLocked,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      setSession(res.data);
    } catch (err) {
      console.error("Failed lock toggle", err);
      setMessage(err.response?.data?.message || "Failed to change lock state.");
    }
  };

  if (loading) {
    return <div style={styles.page}>Loading practice attendance...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Practice Attendance</h1>
          <div style={styles.subTitle}>{teamName || "No team selected"} · {sessionDate}</div>
        </div>

        <div style={styles.headerActions}>
          <Link to="/coaches-corner/practice" style={styles.linkButton}>Practice Home</Link>
          <Link to="/coaches-corner/practice-live" style={styles.linkButton}>Run Practice</Link>

          <button onClick={() => setCoachMode((v) => !v)} style={styles.secondaryButton}>
            {coachMode ? "Player View" : "Coach Edit"}
          </button>

          <button onClick={toggleLock} style={styles.primaryButton}>
            {session?.isLocked ? "Unlock" : "Lock"}
          </button>
        </div>
      </div>

      {message ? <div style={styles.helperText}>{message}</div> : null}

      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>Present: {totals.present}</div>
        <div style={styles.summaryCard}>Late: {totals.late}</div>
        <div style={styles.summaryCard}>Excused: {totals.excused}</div>
        <div style={styles.summaryCard}>Absent: {totals.absent}</div>
      </div>

      {session?.isLocked && <div style={styles.lockedBanner}>Attendance is locked.</div>}

      <div style={styles.grid}>
        {sortedAttendance.map((entry) => {
          const bg = statusColors[entry.status] || "#E5E5EA";

          return (
            <div
              key={String(entry.playerId)}
              onClick={() => checkInPlayer(entry.playerId)}
              style={{
                ...styles.playerTile,
                backgroundColor: bg,
                cursor: coachMode || session?.isLocked ? "default" : "pointer",
                opacity: session?.isLocked ? 0.8 : 1,
              }}
            >
              <div style={styles.playerNumber}>
                {entry.playerNumber ? `#${entry.playerNumber}` : ""}
              </div>
              <div style={styles.playerName}>{entry.playerName}</div>
              <div style={styles.playerStatus}>{entry.status.replace("_", " ")}</div>
              <div style={styles.playerTime}>
                {entry.checkedInAt
                  ? new Date(entry.checkedInAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : ""}
              </div>

              {coachMode && (
                <div style={styles.statusButtons}>
                  <button onClick={(e) => { e.stopPropagation(); coachSetStatus(entry.playerId, "present"); }} style={styles.smallButton}>Here</button>
                  <button onClick={(e) => { e.stopPropagation(); coachSetStatus(entry.playerId, "late"); }} style={styles.smallButton}>Late</button>
                  <button onClick={(e) => { e.stopPropagation(); coachSetStatus(entry.playerId, "excused"); }} style={styles.smallButton}>Excused</button>
                  <button onClick={(e) => { e.stopPropagation(); coachSetStatus(entry.playerId, "absent"); }} style={styles.smallButton}>Absent</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 16,
    background: "#F2F2F7",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: "#111",
  },
  subTitle: {
    color: "#666",
    marginTop: 4,
    fontSize: 15,
  },
  headerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  linkButton: {
    padding: "12px 14px",
    borderRadius: 12,
    background: "#E5E5EA",
    color: "#111",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 15,
  },
  primaryButton: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontWeight: 600,
    fontSize: 15,
  },
  secondaryButton: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#E5E5EA",
    color: "#111",
    fontWeight: 600,
    fontSize: 15,
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 14,
    fontWeight: 700,
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  helperText: {
    marginBottom: 12,
    color: "#1a7f37",
  },
  lockedBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: "#FFF3CD",
    color: "#7A5C00",
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },
  playerTile: {
    borderRadius: 18,
    padding: 16,
    minHeight: 150,
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  playerNumber: {
    fontSize: 14,
    fontWeight: 700,
    opacity: 0.8,
  },
  playerName: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.1,
    color: "#111",
  },
  playerStatus: {
    fontSize: 14,
    fontWeight: 600,
    textTransform: "capitalize",
    color: "#111",
  },
  playerTime: {
    fontSize: 13,
    color: "#222",
  },
  statusButtons: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 12,
  },
  smallButton: {
    border: "none",
    borderRadius: 10,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.85)",
    fontWeight: 600,
  },
};