import React, { useState, useEffect } from "react";
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

export default function CoachQuickStart({ onStartCoachMatch }) {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    teamName: "",
    opponent: "",
    sets: 3,
    points: 25,
    decidingSetPoints: 15,
    playAllSets: false,
  });

  // Fetch teams from user data on mount
  useEffect(() => {
    const fetchTeams = async () => {
      console.log("🔍 CoachQuickStart: Starting fetchTeams");

      if (!user?.id) {
        console.warn("⚠️ No user ID found");
        setLoading(false);
        return;
      }

      try {
        console.log(`📡 Fetching from: ${API_URL}/api/users/${user.id}`);
        const res = await axios.get(`${API_URL}/api/users/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log("📦 User response:", res.data);
        const fetchedTeams = res.data.teams || [];
        console.log("🏐 Teams found:", fetchedTeams);

        setTeams(fetchedTeams);

        // Auto-select first team if available
        if (fetchedTeams.length > 0) {
          console.log("✅ Auto-selecting first team:", fetchedTeams[0]);
          setFormData((prev) => ({ ...prev, teamName: fetchedTeams[0] }));
        } else {
          console.warn("⚠️ No teams in user data");
        }
      } catch (error) {
        console.error("❌ Failed to fetch teams:", error);
        setError("Failed to load teams. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (token && user?.id) {
      fetchTeams();
    }
  }, [token, user?.id]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when user starts typing
    if (error) setError("");
  };

  const validateForm = () => {
    if (!formData.teamName) {
      setError("Please select a team");
      return false;
    }
    if (!formData.opponent.trim()) {
      setError("Please enter an opponent name");
      return false;
    }
    return true;
  };

  const handleStartMatch = async () => {
    console.log("🚀 handleStartMatch fired");

    // VALIDATION: Must have both team and opponent
    if (!validateForm()) {
      console.warn("❌ Form validation failed");
      return;
    }

    try {
      setLoading(true);
      console.log("📝 Form data valid, creating match:", formData);

      // Create new Coach mode match - same structure as SettingsPanel
      const matchData = {
        teamName: formData.teamName,
        mode: "match",
        opponentName: formData.opponent.trim(),
        totalSets: formData.sets,
        playAllSets: formData.playAllSets,
        pointsNonDeciding: formData.points,
        pointsDeciding: formData.decidingSetPoints,
        eventName: "",
        location: "",
        matchData: {
          opponentName: formData.opponent.trim(),
          teamName: formData.teamName,
          sets: formData.sets,
          points: formData.points,
          decidingSetPoints: formData.decidingSetPoints,
          playAllSets: formData.playAllSets,
        },
      };

      console.log("📤 Sending match data to API:", matchData);

      const response = await axios.post(`${API_URL}/api/matches`, matchData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      console.log("📥 Response from API:", response.data);

      const newMatchId = response.data._id;
      console.log("✅ Created Coach match:", newMatchId);

      // Verify the match was created properly
      if (!newMatchId) {
        throw new Error("No match ID returned from server");
      }

      // Call the parent's onStartCoachMatch function to initialize state
      // This follows the SettingsPanel pattern
      if (onStartCoachMatch) {
        console.log("🔔 Calling onStartCoachMatch with complete config");
        onStartCoachMatch({
          matchId: newMatchId,
          opponentName: formData.opponent.trim(),
          teamName: formData.teamName,
          sets: formData.sets,
          points: formData.points,
          decidingSetPoints: formData.decidingSetPoints,
          playAllSets: formData.playAllSets,
        });
        console.log("✅ Callback executed successfully");
      }
    } catch (error) {
      console.error("❌ Failed to create Coach match:", error);
      setError(
        error.response?.data?.message || "Failed to start match. Please try again."
      );
      setLoading(false);
    }
  };

  if (loading && teams.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingMessage}>Loading teams...</div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>No Teams Found</h1>
          <p style={styles.errorMessage}>
            Please create a team first in{" "}
            <a href="/settings" style={{ color: "#1e90ff" }}>
              Settings
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Quick Start Match Mode</h1>
        <p style={styles.subtitle}>
          Set up your match and jump straight to the court
        </p>
		<div style={styles.errorAlert}>
  <span style={{ color: "#d32f2f", fontWeight: "500" }}>
    💡 Match Mode uses a dedicated match type. Create a new match 
    below—your other matches will continue running separately.
  </span>
</div>

        {error && (
          <div style={styles.errorAlert}>
            <span style={{ color: "#d32f2f", fontWeight: "500" }}>⚠️ {error}</span>
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={styles.label}>Select Team *</label>
          <select
            value={formData.teamName || ""}
            onChange={(e) => handleInputChange("teamName", e.target.value)}
            style={styles.select}
          >
            <option value="">-- Choose a team --</option>
            {teams.map((teamName) => (
              <option key={teamName} value={teamName}>
                {teamName}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>
            Opponent Name <span style={{ color: "#d32f2f" }}>*</span>
          </label>
          <input
            type="text"
            placeholder="Enter opponent name"
            value={formData.opponent}
            onChange={(e) => handleInputChange("opponent", e.target.value)}
            style={{
              ...styles.input,
              borderColor: error && !formData.opponent ? "#d32f2f" : "#ddd",
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter" && formData.opponent.trim()) {
                handleStartMatch();
              }
            }}
          />
        </div>

        <div style={styles.gridRow}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Sets to Play</label>
            <input
              type="number"
              min="1"
              max="5"
              value={formData.sets}
              onChange={(e) =>
                handleInputChange("sets", parseInt(e.target.value) || 3)
              }
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Points per Set</label>
            <input
              type="number"
              min="15"
              max="30"
              value={formData.points}
              onChange={(e) =>
                handleInputChange("points", parseInt(e.target.value) || 25)
              }
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.gridRow}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Deciding Set Points</label>
            <input
              type="number"
              min="10"
              max="25"
              value={formData.decidingSetPoints}
              onChange={(e) =>
                handleInputChange(
                  "decidingSetPoints",
                  parseInt(e.target.value) || 25
                )
              }
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Play All Sets?</label>
            <input
              type="checkbox"
              checked={formData.playAllSets}
              onChange={(e) =>
                handleInputChange("playAllSets", e.target.checked)
              }
              style={styles.checkbox}
            />
          </div>
        </div>

        <button
          onClick={handleStartMatch}
          disabled={loading || !formData.teamName || !formData.opponent.trim()}
          style={{
            ...styles.button,
            opacity:
              loading || !formData.teamName || !formData.opponent.trim()
                ? 0.6
                : 1,
            cursor:
              loading || !formData.teamName || !formData.opponent.trim()
                ? "not-allowed"
                : "pointer",
          }}
        >
          {loading ? "Starting Match..." : "Start Match"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "40px",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
    maxWidth: "500px",
    width: "100%",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    marginBottom: "10px",
    color: "#333",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    textAlign: "center",
    marginBottom: "25px",
  },
  errorAlert: {
    padding: "12px 16px",
    background: "#ffebee",
    border: "1px solid #ffcdd2",
    borderRadius: "6px",
    marginBottom: "20px",
    fontSize: "14px",
  },
  formGroup: {
    marginBottom: "20px",
    display: "flex",
    flexDirection: "column",
  },
  label: {
    fontSize: "14px",
    fontWeight: "500",
    marginBottom: "8px",
    color: "#333",
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  select: {
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
    backgroundColor: "white",
    cursor: "pointer",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    cursor: "pointer",
    marginTop: "6px",
  },
  gridRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "15px",
  },
  button: {
    marginTop: "30px",
    padding: "12px 24px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "bold",
    width: "100%",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  loadingMessage: {
    textAlign: "center",
    fontSize: "18px",
    color: "white",
  },
};