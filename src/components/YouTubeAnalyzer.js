import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";

const getApiUrl = () => {
  const hostname = window.location.hostname;
  return hostname.startsWith("10.") ? `http://${hostname}:3000` : process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const YouTubeAnalyzer = () => {
  const { user, token } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadTeams = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/users/${user?.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const rawTeams = res.data?.teams || "";
        const parsedTeams = typeof rawTeams === "string"
          ? rawTeams.split(",").map((t) => ({ name: t.trim() })).filter(t => t.name)
          : [];

        setTeams(parsedTeams);
        if (parsedTeams.length === 1) {
          setSelectedTeam(parsedTeams[0].name);
        }
      } catch (err) {
        console.error("Team fetch failed:", err);
        setError("Failed to load teams.");
      }
    };

    if (token && user?.id) loadTeams();
  }, [token, user?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const playersRes = await axios.get(`${API_URL}/api/players?team=${encodeURIComponent(selectedTeam.trim())}`);
      const teamPlayers = playersRes.data?.players || [];

      if (teamPlayers.length === 0) throw new Error("No players found for this team.");

      const response = await axios.post(`${API_URL}/api/analyze/analyze_video`, {
        videoUrl,
        team: {
          name: selectedTeam,
          players: teamPlayers,
        },
      });

      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ios-card">
      <h2 className="ios-header">🎥 Analyze YouTube Match</h2>
      <form onSubmit={handleSubmit} className="ios-form">
        {teams.length > 0 && (
          <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} required>
            <option value="">Select a Team</option>
            {teams.map((teams) => (
              <option key={teams} value={teams}>{teams}</option>
            ))}
          </select>
        )}

      
          <input type="text" value={teams[0]} readOnly disabled className="ios-input" />
      

        <input
          type="url"
          placeholder="Paste YouTube video link"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          required
        />

        <button className="ios-button blue" type="submit" disabled={loading}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {result && (
        <div style={{ marginTop: "20px" }}>
          <h3>🧠 AI Analysis Result</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default YouTubeAnalyzer;