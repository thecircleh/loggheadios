import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import axios from "axios";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const MODE_MAPPINGS = {
  classic: {
    compatibleModes: ["Classic", "Gameflow"],
    newMatchMode: "Classic",
    displayName: "Classic",
    pageTitle: "Classic Mode",
  },
  statbook: {
    compatibleModes: ["Statbook", "Collab", "Express"],
    newMatchMode: "Statbook",
    displayName: "Stat Book",
    pageTitle: "Stat Book",
  },
  match: {
    compatibleModes: ["Match", "Coach"],
    newMatchMode: "Match",
    displayName: "Match Tracking",
    pageTitle: "Match Tracking",
  },
};

const MODE_ROUTES = {
  Classic: "/classic",
  Gameflow: "/classic",
  Statbook: "/stat-book",
  Express: "/stat-book",
  Collab: "/stat-book?collab=true",
  Match: "/match-tracking",
  Coach: "/match-tracking",
};

const MODE_NAMES = {
  Classic: "Classic",
  Gameflow: "Classic",
  Statbook: "Stat Book",
  Express: "Stat Book",
  Collab: "Collaborative Stat Book",
  Match: "Match Tracking",
  Coach: "Match Tracking",
};

const MATCH_AGE_THRESHOLD_MINUTES = 60;

export default function MatchModeSelector({
  currentPage,
  currentMatchId,
  currentMatchMode,
  currentMatchAge = 0,
  onStartNewMatch,
  onResumeMatch,
  onClose,
}) {
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [teams, setTeams] = useState([]);
  const [teamRosters, setTeamRosters] = useState({});
  const [existingMatches, setExistingMatches] = useState([]);
  const [activeTab, setActiveTab] = useState("new");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    teamName: "",
    opponent: "",
    sets: 3,
    points: 25,
    decidingSetPoints: 15,
    playAllSets: false,
  });

  const config = MODE_MAPPINGS[currentPage] || MODE_MAPPINGS.classic;

  const currentModeIsCompatible =
    !!currentMatchMode && config.compatibleModes.includes(currentMatchMode);

  const hasWrongModeActiveMatch =
    !!currentMatchId && !!currentMatchMode && !currentModeIsCompatible;

  const hasStaleMatch =
    !!currentMatchId &&
    !!currentMatchMode &&
    currentModeIsCompatible &&
    currentMatchAge > MATCH_AGE_THRESHOLD_MINUTES;

  const shouldShow =
    !currentMatchId ||
    hasWrongModeActiveMatch ||
    hasStaleMatch;

  const correctRoute = MODE_ROUTES[currentMatchMode] || "/";

  useEffect(() => {
    if (!token || !user?.id || !shouldShow) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);

        const userRes = await axios.get(`${API_URL}/api/users/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const fetchedTeams = userRes.data?.teams || [];
        setTeams(fetchedTeams);

        if (fetchedTeams.length > 0) {
          setFormData((prev) => ({
            ...prev,
            teamName: prev.teamName || fetchedTeams[0],
          }));
        }

        const rosters = {};
        for (const teamName of fetchedTeams) {
          try {
            const playerRes = await axios.get(`${API_URL}/api/players`, {
              params: { team: teamName },
              headers: { Authorization: `Bearer ${token}` },
            });
            rosters[teamName] = playerRes.data || [];
          } catch {
            rosters[teamName] = [];
          }
        }

        setTeamRosters(rosters);

        const allMatches = [];

        for (const teamName of fetchedTeams) {
          try {
            const matchRes = await axios.get(`${API_URL}/api/matches/team`, {
              params: { teamName },
              headers: { Authorization: `Bearer ${token}` },
            });

            if (Array.isArray(matchRes.data)) {
              allMatches.push(...matchRes.data);
            }
          } catch {
            // Ignore one bad team fetch
          }
        }

        const compatibleMatches = allMatches
          .filter((match) => {
            const compatible = config.compatibleModes.includes(match.mode);
            const notCurrent = match._id !== currentMatchId;
            const notFinal =
              match.status !== "Final" &&
              match.status !== "completed" &&
              !match.finalized;

            return compatible && notCurrent && notFinal;
          })
          .sort((a, b) => {
            const da = new Date(a.updatedAt || a.timestamp || a.createdAt || 0);
            const db = new Date(b.updatedAt || b.timestamp || b.createdAt || 0);
            return db - da;
          });

        setExistingMatches(compatibleMatches);

        if (compatibleMatches.length > 0 && hasWrongModeActiveMatch) {
          setActiveTab("resume");
        }
      } catch (err) {
        console.error("Failed to load match selector data:", err);
        setError("Could not load your teams or matches.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [
    token,
    user?.id,
    currentMatchId,
    currentMatchMode,
    currentPage,
    shouldShow,
    hasWrongModeActiveMatch,
    config.compatibleModes,
  ]);

  const filteredMatches = useMemo(() => {
    if (!formData.teamName) return existingMatches;
    return existingMatches.filter((m) => m.teamName === formData.teamName);
  }, [existingMatches, formData.teamName]);

  const selectedRosterCount = teamRosters[formData.teamName]?.length || 0;

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleGoCorrectMode = () => {
    navigate(correctRoute, { replace: true });
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
      return;
    }
    navigate("/", { replace: true });
  };

  const handleStartNewMatch = async () => {
    if (!formData.teamName) {
      setError("Please select a team.");
      return;
    }

    if (selectedRosterCount === 0) {
      setError("Please add players to this team before starting a match.");
      return;
    }

    if (!formData.opponent.trim()) {
      setError("Please enter an opponent name.");
      return;
    }

    try {
      setCreating(true);

      const payload = {
        teamName: formData.teamName,
        opponentName: formData.opponent.trim(),
        mode: config.newMatchMode,
        totalSets: Number(formData.sets) || 3,
        playAllSets: !!formData.playAllSets,
        pointsNonDeciding: Number(formData.points) || 25,
        pointsDeciding: Number(formData.decidingSetPoints) || 15,
        eventName: "",
        location: "",
        matchData: {
          opponentName: formData.opponent.trim(),
          teamName: formData.teamName,
          sets: Number(formData.sets) || 3,
          points: Number(formData.points) || 25,
          decidingSetPoints: Number(formData.decidingSetPoints) || 15,
          playAllSets: !!formData.playAllSets,
        },
      };

      const res = await axios.post(`${API_URL}/api/matches`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const newMatchId = res.data?._id;

      if (!newMatchId) {
        throw new Error("No match id returned.");
      }

      onStartNewMatch?.({
        matchId: newMatchId,
        opponentName: payload.opponentName,
        teamName: payload.teamName,
        sets: payload.totalSets,
        points: payload.pointsNonDeciding,
        decidingSetPoints: payload.pointsDeciding,
        playAllSets: payload.playAllSets,
        mode: payload.mode,
      });
    } catch (err) {
      console.error("Failed to start new match:", err);
      setError(err.response?.data?.message || "Could not start a new match.");
    } finally {
      setCreating(false);
    }
  };

  const handleResumeMatch = (match) => {
    onResumeMatch?.({
      matchId: match._id,
      opponentName: match.opponentName || match.matchData?.opponentName || "Opponent",
      teamName: match.teamName,
      sets: match.totalSets || match.matchData?.sets || 3,
      points: match.pointsNonDeciding || match.matchData?.points || 25,
      decidingSetPoints:
        match.pointsDeciding || match.matchData?.decidingSetPoints || 15,
      playAllSets: match.playAllSets || match.matchData?.playAllSets || false,
      mode: match.mode,
    });
  };

  const formatTime = (match) => {
    const date = new Date(match.updatedAt || match.timestamp || match.createdAt);
    if (Number.isNaN(date.getTime())) return "Unknown time";

    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    return `${Math.floor(minutes / 1440)} days ago`;
  };

  if (!shouldShow) return null;

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.card}>
          <h2 style={styles.title}>Loading matches...</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>{config.pageTitle}</h1>

        {hasWrongModeActiveMatch && (
          <div style={styles.warningBox}>
            <div style={styles.warningTitle}>Active match is in another mode</div>
            <div style={styles.warningText}>
              Your current match was started in{" "}
              <strong>{MODE_NAMES[currentMatchMode] || currentMatchMode}</strong>.
              It cannot be opened in <strong>{config.displayName}</strong>.
            </div>

            <button onClick={handleGoCorrectMode} style={styles.correctModeButton}>
              Resume {MODE_NAMES[currentMatchMode] || currentMatchMode}
            </button>
          </div>
        )}

        {hasStaleMatch && (
          <div style={styles.infoBox}>
            Your current {config.displayName} match is over an hour old. Resume an
            older match or start fresh.
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.buttonGrid}>
          <button
            onClick={() => setActiveTab("new")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "new" ? styles.activeTab : {}),
            }}
          >
            Start New Match
          </button>

          <button
            onClick={() => setActiveTab("resume")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "resume" ? styles.activeTab : {}),
            }}
          >
            Call Up Older Match
          </button>
        </div>

        {activeTab === "new" && (
          <div style={styles.section}>
            <label style={styles.label}>Team</label>
            <select
              value={formData.teamName}
              onChange={(e) => updateField("teamName", e.target.value)}
              style={styles.input}
            >
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>

            {formData.teamName && (
              <div
                style={{
                  ...styles.rosterNote,
                  color: selectedRosterCount > 0 ? "#15803d" : "#b45309",
                }}
              >
                {selectedRosterCount > 0
                  ? `${selectedRosterCount} players on roster`
                  : "This team has no players yet"}
              </div>
            )}

            <label style={styles.label}>Opponent</label>
            <input
              value={formData.opponent}
              onChange={(e) => updateField("opponent", e.target.value)}
              placeholder="Opponent name"
              style={styles.input}
            />

            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Sets</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.sets}
                  onChange={(e) => updateField("sets", e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Points</label>
                <input
                  type="number"
                  min="1"
                  value={formData.points}
                  onChange={(e) => updateField("points", e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Deciding</label>
                <input
                  type="number"
                  min="1"
                  value={formData.decidingSetPoints}
                  onChange={(e) =>
                    updateField("decidingSetPoints", e.target.value)
                  }
                  style={styles.input}
                />
              </div>
            </div>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.playAllSets}
                onChange={(e) => updateField("playAllSets", e.target.checked)}
              />
              Play all sets
            </label>

            <button
              onClick={handleStartNewMatch}
              disabled={creating}
              style={styles.primaryButton}
            >
              {creating ? "Starting..." : `Start New ${config.displayName} Match`}
            </button>
          </div>
        )}

        {activeTab === "resume" && (
          <div style={styles.section}>
            <label style={styles.label}>Filter by team</label>
            <select
              value={formData.teamName}
              onChange={(e) => updateField("teamName", e.target.value)}
              style={styles.input}
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>

            {filteredMatches.length === 0 ? (
              <div style={styles.emptyState}>
                No older {config.displayName} matches found.
              </div>
            ) : (
              <div style={styles.matchList}>
                {filteredMatches.map((match) => (
                  <button
                    key={match._id}
                    onClick={() => handleResumeMatch(match)}
                    style={styles.matchCard}
                  >
                    <div style={styles.matchTitle}>
                      {match.teamName || "Team"} vs{" "}
                      {match.opponentName || match.matchData?.opponentName || "Opponent"}
                    </div>
                    <div style={styles.matchMeta}>
                      {MODE_NAMES[match.mode] || match.mode} • {formatTime(match)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={handleCancel} style={styles.cancelButton}>
          Cancel — Go Home
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  title: {
    margin: "0 0 8px",
    fontSize: 26,
    fontWeight: 800,
    textAlign: "center",
  },
  warningBox: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 17,
    fontWeight: 800,
    marginBottom: 6,
    color: "#9a3412",
  },
  warningText: {
    fontSize: 14,
    lineHeight: 1.45,
    color: "#7c2d12",
    marginBottom: 12,
  },
  correctModeButton: {
    width: "100%",
    padding: "14px 16px",
    border: "none",
    borderRadius: 12,
    background: "#2563eb",
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  },
  infoBox: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  errorBox: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  buttonGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 18,
  },
  tabButton: {
    padding: "12px 10px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    fontWeight: 700,
    cursor: "pointer",
  },
  activeTab: {
    background: "#111827",
    color: "#fff",
    borderColor: "#111827",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    fontSize: 16,
    boxSizing: "border-box",
  },
  rosterNote: {
    fontSize: 13,
    fontWeight: 700,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  primaryButton: {
    marginTop: 8,
    padding: "14px 16px",
    border: "none",
    borderRadius: 12,
    background: "#16a34a",
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  },
  emptyState: {
    textAlign: "center",
    padding: 24,
    color: "#6b7280",
    background: "#f9fafb",
    borderRadius: 12,
  },
  matchList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  matchCard: {
    textAlign: "left",
    padding: 14,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  },
  matchTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#111827",
  },
  matchMeta: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  cancelButton: {
    width: "100%",
    marginTop: 18,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
};