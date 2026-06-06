import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import axios from "axios";

const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

export default function CoachQuickStart({ onStartCoachMatch }) {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    teamId: "",
    opponent: "",
    sets: 3,
    points: 25,
    decidingSetPoints: 25,
    playAllSets: false,
  });

  // Fetch teams on mount
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/teams`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        setTeams(response.data || []);
        // Auto-select first team if available
        if (response.data && response.data.length > 0) {
          setFormData((prev) => ({ ...prev, teamId: response.data[0]._id }));
        }
      } catch (error) {
        console.error("Failed to fetch teams:", error);
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
  };

  const handleStartMatch = async () => {
    if (!formData.teamId || !formData.opponent.trim()) {
      alert("Please select a team and enter an opponent name");
      return;
    }

    try {
      setLoading(true);

      // Create new Coach mode match
      const matchData = {
        teamId: formData.teamId,
        mode: "Coach",
        matchData: {
          opponentName: formData.opponent,
          teamName:
            teams.find((t) => t._id === formData.teamId)?.name ||
            "Our Team",
          sets: formData.sets,
          points: formData.points,
          decidingSetPoints: formData.decidingSetPoints,
          playAllSets: formData.playAllSets,
        },
      };

      const response = await axios.post(
        `${API_URL}/api/matches`,
        matchData,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      const newMatchId = response.data._id;
      console.log("Created Coach match:", newMatchId);

      // Call the parent's onStartCoachMatch function to initialize state
      if (onStartCoachMatch) {
        await onStartCoachMatch({
          matchId: newMatchId,
          opponentName: formData.opponent,
          teamName:
            teams.find((t) => t._id === formData.teamId)?.name ||
            "Our Team",
          sets: formData.sets,
          points: formData.points,
          decidingSetPoints: formData.decidingSetPoints,
          playAllSets: formData.playAllSets,
        });
      }

      // Navigate to the Coach Court
      navigate(`/coaches-corner/court`);
    } catch (error) {
      console.error("Failed to create Coach match:", error);
      alert("Failed to start match. Please try again.");
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
        <div style={styles.errorMessage}>
          No teams found. Please create a team first in{" "}
          <a href="/settings" style={{ color: "#1e90ff" }}>
            Settings
          </a>
          .
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Quick Start Coach Mode</h1>
        <p style={styles.subtitle}>
          Set up your match and jump straight to the court
        </p>

        <div style={styles.formGroup}>
          <label style={styles.label}>Select Team *</label>
          <select
            value={formData.teamId}
            onChange={(e) => handleInputChange("teamId", e.target.value)}
            style={styles.select}
          >
            {teams.map((team) => (
              <option key={team._id} value={team._id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Opponent Name *</label>
          <input
            type="text"
            placeholder="Enter opponent name"
            value={formData.opponent}
            onChange={(e) => handleInputChange("opponent", e.target.value)}
            style={styles.input}
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
          disabled={loading}
          style={{
            ...styles.button,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
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
    marginBottom: "30px",
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
  errorMessage: {
    textAlign: "center",
    fontSize: "16px",
    color: "#ff4444",
    padding: "20px",
    background: "white",
    borderRadius: "8px",
  },
};