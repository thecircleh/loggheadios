import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

export default function PracticeHomePage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const queryTeam = searchParams.get("team") || "";
  const storedTeam = localStorage.getItem("selectedTeam") || "";

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(queryTeam || storedTeam || "");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  
  const [pastSessions, setPastSessions] = useState([]);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [todaySession, setTodaySession] = useState(null);

  const today = useMemo(() => getTodayString(), []);

  useEffect(() => {
    const loadTeams = async () => {
      if (!user?.id || !token) {
        setLoading(false);
        return;
      }

      try {
        const res = await axios.get(`${API_URL}/api/users/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });

        const userTeams = Array.isArray(res.data?.teams) ? res.data.teams : [];
        setTeams(userTeams);

        if (!selectedTeam && userTeams.length > 0) {
          const nextTeam =
            (queryTeam && userTeams.includes(queryTeam) && queryTeam) ||
            (storedTeam && userTeams.includes(storedTeam) && storedTeam) ||
            userTeams[0];

          setSelectedTeam(nextTeam);
          localStorage.setItem("selectedTeam", nextTeam);
        }
      } catch (err) {
        console.error("Failed to load teams:", err);
        setMessage("Failed to load teams.");
      } finally {
        setLoading(false);
      }
    };

    loadTeams();
  }, [user?.id, token]);

  useEffect(() => {
    if (selectedTeam) {
      localStorage.setItem("selectedTeam", selectedTeam);
    }
  }, [selectedTeam]);

  const loadOrCreateSession = async (teamNameOverride = selectedTeam) => {
    if (!teamNameOverride || !token) {
      setMessage("Choose a team first.");
      return;
    }

    try {
      setCreating(true);
      setMessage("");

      const res = await axios.post(
        `${API_URL}/api/practice/session`,
        {
          teamName: teamNameOverride,
          sessionDate: today,
          title: "Practice",
          graceMinutes: 10,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
    } catch (err) {
      console.error("Failed to create/load session:", err);
      setMessage(err.response?.data?.message || "Failed to load practice session.");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (selectedTeam && token) {
      loadOrCreateSession(selectedTeam);
      loadPracticeSessions(selectedTeam);
    }
  }, [selectedTeam, token]);

  const loadPracticeSessions = async (teamNameOverride = selectedTeam) => {
    if (!teamNameOverride || !token) return;

    try {
      // Load past completed sessions
      const pastRes = await axios.get(`${API_URL}/api/practice/sessions`, {
        params: { teamName: teamNameOverride, timeFilter: "past", status: "completed" },
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setPastSessions(Array.isArray(pastRes.data.sessions) ? pastRes.data.sessions.slice(0, 5) : []);

      // Load upcoming sessions (today and future)
      const upcomingRes = await axios.get(`${API_URL}/api/practice/sessions`, {
        params: { teamName: teamNameOverride, timeFilter: "upcoming" },
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const upcoming = Array.isArray(upcomingRes.data.sessions) ? upcomingRes.data.sessions : [];
      setUpcomingSessions(upcoming);

      // Check if today has a session (exclude completed ones - they should only show in recaps)
      const todayRes = await axios.get(`${API_URL}/api/practice/sessions`, {
        params: { teamName: teamNameOverride, timeFilter: "today" },
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const todaySessions = Array.isArray(todayRes.data.sessions) ? todayRes.data.sessions : [];
      // Filter out completed practices - they should only appear in Recent Recaps
      const activeTodaySession = todaySessions.find(s => s.status !== "completed");
      setTodaySession(activeTodaySession || null);
    } catch (err) {
      console.error("Failed to load practice sessions:", err);
      // Don't show error to user - this is background data
    }
  };

  const completePractice = async () => {
    if (!session?._id || !token) return;

    try {
      const res = await axios.patch(
        `${API_URL}/api/practice/complete`,
        { sessionId: session._id },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setSession(res.data);
      setMessage("Practice marked complete.");
    } catch (err) {
      console.error("Failed to complete practice:", err);
      setMessage(err.response?.data?.message || "Failed to complete practice.");
    }
  };

  if (loading) {
    return <div style={styles.page}>Loading practice...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Practice Assist</h1>
        <p style={styles.subtext}>{today}</p>

        {message ? <p style={styles.message}>{message}</p> : null}

        <div style={styles.field}>
          <label style={styles.label}>Team</label>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            style={styles.select}
          >
            <option value="">Select team</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </div>

        {todaySession && (
          <div style={styles.todayPracticeCard}>
            <div style={styles.todayPracticeHeader}>
              🏐 Today's Practice
            </div>
            <div style={styles.todayPracticeContent}>
              <div><strong>Status:</strong> {todaySession.status}</div>
              <div><strong>Drills:</strong> {todaySession.drills?.length || 0} planned</div>
              {todaySession.drills?.length > 0 ? (
                <div style={styles.todayPracticeHint}>
                  ✓ Practice plan ready
                </div>
              ) : (
                <div style={styles.todayPracticeWarning}>
                  ⚠️ Add drills to enable live practice
                </div>
              )}
            </div>
          </div>
        )}

        {!todaySession && selectedTeam && (
          <div style={styles.noPracticeCard}>
            <div>📅 No practice scheduled for today</div>
            <div style={styles.noPracticeHint}>
              Plan a practice to enable live session features
            </div>
          </div>
        )}

        <div style={{
          ...styles.buttonGrid,
          gridTemplateColumns: (todaySession && todaySession.drills?.length > 0) ? "1fr 1fr 1fr" : "1fr 1fr",
        }}>
          <button
            onClick={() => navigate("/coaches-corner/practice-planner")}
            style={styles.primaryButton}
            disabled={!selectedTeam}
          >
            Plan Practice
          </button>

          <button
            onClick={() => navigate("/coaches-corner/practice-attendance")}
            style={styles.secondaryButton}
            disabled={!selectedTeam}
          >
            Attendance
          </button>

          {todaySession && todaySession.drills?.length > 0 && (
            <button
              onClick={() => navigate("/coaches-corner/practice-live")}
              style={styles.liveButton}
              disabled={!selectedTeam}
            >
              ▶ Run Practice
            </button>
          )}
        </div>

        {upcomingSessions.filter(s => s.status !== 'completed').length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Upcoming Practices</div>
            <div style={styles.sessionList}>
              {upcomingSessions
                .filter(s => s.status !== 'completed')
                .map((s) => (
                  <div key={s._id} style={styles.sessionCard}>
                    <div style={styles.sessionDate}>
                      {new Date(s.sessionDate + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div style={styles.sessionInfo}>
                      <div>{s.drills?.length || 0} drills planned</div>
                      <div style={styles.sessionStatus}>{s.status}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/coaches-corner/practice-planner?date=${s.sessionDate}`)}
                      style={styles.sessionButton}
                    >
                      View Plan
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {pastSessions.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Recent Recaps</div>
            <div style={styles.sessionList}>
              {pastSessions.map((s) => (
                <div key={s._id} style={styles.sessionCard}>
                  <div style={styles.sessionDate}>
                    {new Date(s.sessionDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div style={styles.sessionInfo}>
                    <div>{s.drills?.filter(d => d.status === 'completed').length || 0} drills completed</div>
                    <div style={styles.sessionStatus}>✓ Completed</div>
                  </div>
                  <button
                    onClick={() => navigate(`/coaches-corner/practice-recap?sessionId=${s._id}`)}
                    style={styles.sessionButton}
                  >
                    View Recap
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.linkRow}>
          <Link to="/coaches-corner" style={styles.link}>Back to Coaches&apos; Corner</Link>
        </div>
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
  card: {
    maxWidth: 700,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 700,
    color: "#111",
  },
  subtext: {
    marginTop: 6,
    color: "#666",
  },
  message: {
    color: "#1a7f37",
    fontSize: 14,
  },
  field: {
    marginTop: 16,
  },
  label: {
    display: "block",
    marginBottom: 8,
    fontWeight: 600,
  },
  select: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #D1D1D6",
    fontSize: 16,
    background: "#FAFAFA",
  },
  todayPracticeCard: {
    marginTop: 16,
    padding: 16,
    background: "linear-gradient(135deg, #007AFF 0%, #0051D5 100%)",
    borderRadius: 14,
    color: "#fff",
  },
  todayPracticeHeader: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
  },
  todayPracticeContent: {
    display: "grid",
    gap: 6,
    fontSize: 15,
  },
  todayPracticeHint: {
    marginTop: 8,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  todayPracticeWarning: {
    marginTop: 8,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#FFD60A",
  },
  noPracticeCard: {
    marginTop: 16,
    padding: 16,
    background: "#F8F8FA",
    borderRadius: 14,
    textAlign: "center",
    color: "#666",
  },
  noPracticeHint: {
    fontSize: 13,
    marginTop: 6,
  },
  summaryCard: {
    marginTop: 16,
    padding: 16,
    background: "#F8F8FA",
    borderRadius: 14,
    display: "grid",
    gap: 8,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
    color: "#111",
  },
  sessionList: {
    display: "grid",
    gap: 10,
  },
  sessionCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 14,
    background: "#F8F8FA",
    borderRadius: 12,
    border: "1px solid #E5E5EA",
  },
  sessionDate: {
    fontSize: 14,
    fontWeight: 700,
    color: "#007AFF",
    minWidth: 80,
  },
  sessionInfo: {
    flex: 1,
    fontSize: 13,
    color: "#666",
  },
  sessionStatus: {
    marginTop: 4,
    fontSize: 12,
    color: "#888",
  },
  sessionButton: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  buttonGrid: {
    display: "grid",
    gap: 12,
    marginTop: 18,
  },
  primaryButton: {
    padding: 14,
    borderRadius: 14,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: 14,
    borderRadius: 14,
    border: "none",
    background: "#E5E5EA",
    color: "#111",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  liveButton: {
    padding: 14,
    borderRadius: 14,
    border: "none",
    background: "#34C759",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    gridColumn: "1 / -1", // Span full width on its own row
  },
  dangerButton: {
    width: "100%",
    padding: 14,
    borderRadius: 14,
    border: "none",
    background: "#FF3B30",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
  },
  linkRow: {
    marginTop: 18,
    textAlign: "center",
  },
  link: {
    color: "#007AFF",
    textDecoration: "none",
    fontWeight: 600,
  },
};