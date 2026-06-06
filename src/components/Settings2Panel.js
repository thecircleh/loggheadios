import React, { useState, useEffect, useCallback } from 'react'; // Import useCallback
import axios from 'axios';
import { useAuth } from './AuthContext';
import PlayerIcon from "./PlayerIcon";
import { useNavigate } from 'react-router-dom';





const API_URL = process.env.REACT_APP_API_URL;

const SettingsPanel = ({
  matchSettings,
  setMatchSettings,
  setCurrentMatchId,
  currentMatchId,
  benchPlayers,
  setBenchPlayers,
  onCreatePlayer,
  onDeletePlayer,
  onResetBench,
  refreshBench,
  onRecallBench,
  handleNewMatch,
  setSubstitutionLog,
  setActionLog,
  setAllowedLiberoSubTarget,
  setSlot5TargetId,
  ourSetsWon,
  opponentSetsWon,
  ourScore,
  opponentScore,
  handleDeletePlayer,
  setOurScore,
  setOpponentScore,
  courtPlayers,
  setCourtPlayers,
  substitutionLog,
  actionLog,
  playerStats,
  allowedLiberoSubTarget,
  slot5TargetId,
  saveCurrentMatchToDB
}) => {
  const { user, token } = useAuth();
  const [userTeams, setUserTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const navigate = useNavigate();
  const [opponentName, setOpponentName] = useState(() => matchSettings?.opponentName ?? '');
  const [eventName, setEventName] = useState(() => matchSettings?.eventName ?? '');
  const [location, setLocation] = useState(() => matchSettings?.location ?? '');
  const [maxSets, setMaxSets] = useState(() => matchSettings?.maxSets ?? 3);
  const [pointsNonDeciding, setPointsNonDeciding] = useState(() => matchSettings?.pointsNonDeciding ?? 25);
  const [pointsDeciding, setPointsDeciding] = useState(() => matchSettings?.pointsDeciding ?? 15);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [savedMatches, setSavedMatches] = useState([]);
  const [newPlayerPosition, setNewPlayerPosition] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(() => matchSettings?.teamName || '');
  
  
  useEffect(() => {
  if (matchSettings?.teamName && selectedTeam !== matchSettings.teamName) {
    setSelectedTeam(matchSettings.teamName);
  }
}, [matchSettings?.teamName]);

  // Use useCallback to prevent unnecessary re-creation of the handleRecallBench function
  const handleRecallBench = useCallback(async (teamName) => {
    const res = await axios.get(`${API_URL}/api/players/bench/recall`, { params: { team: teamName } });
    setBenchPlayers(res.data);
  }, [setBenchPlayers]);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoadingTeams(true);
      try {
        if (!user || !user.id) return;

        const res = await axios.get(`${API_URL}/api/users/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.data && Array.isArray(res.data.teams)) {
          setUserTeams(res.data.teams);

          if (!selectedTeam && res.data.teams.length > 0) {
            const defaultTeam = res.data.teams[0];
            setSelectedTeam(defaultTeam); // Default to first team
            setMatchSettings(prev => ({
              ...prev,
              opponentName: "Opponent",
              teamName: defaultTeam
            }));
            handleRecallBench(defaultTeam); // Automatically recall this team's bench
          }
        } else {
          console.warn("No teams found in user profile.");
        }
      } catch (err) {
        console.error("Failed to fetch user teams:", err);
      } finally {
        setLoadingTeams(false);
      }
    };
    fetchTeams();
  }, [user, token, setMatchSettings, handleRecallBench, setSelectedTeam]);

  useEffect(() => {
    if (selectedTeam) {
      handleRecallBench(selectedTeam);
    }
  }, [selectedTeam, handleRecallBench]);

  useEffect(() => {
    const fetchSavedMatches = async () => {
      if (!user?.id) return;
      try {
        const res = await axios.get(`${API_URL}/api/matches/recall?userId=${user.id}`);
        setSavedMatches(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to fetch saved matches', err);
        setSavedMatches([]); // fallback
      }
    };
    fetchSavedMatches();
  }, [user, setSavedMatches]);

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!selectedTeam.trim()) return alert("Select a team before adding players.");
    if (!newPlayerName.trim() || !newPlayerNumber.trim()) return alert("Player name and number required.");

    const newPlayerData = {
      name: newPlayerName,
      number: parseInt(newPlayerNumber, 10),
      position: newPlayerPosition,
      team: selectedTeam
    };
    try {
      await onCreatePlayer(newPlayerData);
      setNewPlayerName('');
      setNewPlayerNumber('');
      handleRecallBench(selectedTeam);
    } catch (error) {
      console.error("Error adding player:", error);
    }
  };

const formContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  padding: '10px 0',
};

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const inputStyle = {
  padding: '10px',
  fontSize: '16px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  marginTop: '4px',
};

const buttonStyle = {
  padding: '12px',
  backgroundColor: '#007AFF',
  color: '#fff',
  fontSize: '16px',
  border: 'none',
  borderRadius: '6px',
  marginTop: '10px',
};





  const handleLiberoToggle = async (playerId) => {
    try {
      // Optimistically update the UI
      setBenchPlayers((prevPlayers) =>
        prevPlayers.map((player) =>
          player._id === playerId ? { ...player, isLibero: !player.isLibero } : player
        )
      );

      // Call the backend to update the player
      await axios.put(`${API_URL}/api/players/${playerId}`, { isLibero: !benchPlayers.find(p => p._id === playerId).isLibero });

      // Refresh the bench to ensure data is up-to-date.  The optimistic update should make this seamless.
      handleRecallBench(selectedTeam);

    } catch (error) {
      console.error("Error toggling libero status:", error);
      // Revert the optimistic update if the backend call fails
      setBenchPlayers((prevPlayers) =>
        prevPlayers.map((player) =>
          player._id === playerId ? { ...player, isLibero: !player.isLibero } : player
        )
      );
      alert("Failed to update libero status. Please try again.");
    }
  };

  const handleSaveAndStartMatch = async () => {
    try {
      if (!selectedTeam || !opponentName.trim()) {
        alert("Please select a team and enter an opponent name.");
        return;
      }

      const updatedSettings = {
        teamName: selectedTeam,
        opponentName,
        eventName,
        location,
        maxSets,
        pointsNonDeciding,
        pointsDeciding,
        currentSet: 1,
        ourSetsWon: 0,
        opponentSetsWon: 0,
      };

      // Optimistically update the UI in App.js
      setMatchSettings(updatedSettings);

      await axios.put(`${API_URL}/api/players/clear-court`, { team: selectedTeam });

      const recallRes = await axios.get(`${API_URL}/api/players/bench/recall`, {
        params: { team: selectedTeam },
      });
      const recalledBench = recallRes.data;

      setBenchPlayers(recalledBench); // benchPlayers in SettingsPanel
      // setPlayers(recalledBench); // players in App.js to track all players, on and off court

      setOurScore(0);
      setOpponentScore(0);
      setSubstitutionLog([]);
      setActionLog([]);
      setAllowedLiberoSubTarget(null);
      setSlot5TargetId(null);
      setCourtPlayers(Array.from({ length: 6 }, () => ({ name: "?", number: "?" })));

      const startingMatch = {
        userId: user.id,
        teamName: selectedTeam,
        opponentName,
        eventName,
        location,
        currentSet: 1,
        ourSetsWon: 0,
        opponentSetsWon: 0,
        ourScore: 0,
        opponentScore: 0,
        courtPlayers: Array.from({ length: 6 }, () => ({ name: "?", number: "?" })),
        benchPlayers: recalledBench,
        substitutionLog: [],
        actionLog: [],
        liberoSubTargets: {
          allowedLiberoSubTarget: null,
          slot5TargetId: null,
        },
      };

      const res = await axios.post('/api/matches', startingMatch);
      const newMatchId = res.data._id;
      setCurrentMatchId(newMatchId);

      // Navigate programmatically
      navigate("/");
    } catch (err) {
      console.error("❌ Failed to start match:", err.message);
      alert("Failed to start match. See console for details.");
    }
  };

  const handleResumeMatch = (match) => {
    setCourtPlayers(match.courtPlayers);
    setBenchPlayers(match.benchPlayers);
    setOurScore(match.ourScore);
    setOpponentScore(match.opponentScore);
    setSubstitutionLog(match.substitutionLog);
    setActionLog(match.actionLog);
    setMatchSettings(prev => ({
      ...prev,
      teamName: match.teamName,
      opponentName: match.opponentName,
      eventName: match.eventName,
      location: match.location,
      currentSet: match.currentSet,
    }));
    setAllowedLiberoSubTarget(match.liberoSubTargets?.allowedLiberoSubTarget || null);
    setSlot5TargetId(match.liberoSubTargets?.slot5TargetId || null);
    alert(`Resumed match: ${match.teamName} vs ${match.opponentName}`);
  };

  const handleDeleteMatch = async (matchId) => {
    if (!window.confirm("Delete this match permanently?")) return;
    try {
      await axios.delete(`${API_URL}/api/matches/delete/${matchId}`);
      setSavedMatches((prev) => prev.filter((m) => m._id !== matchId));
    } catch (err) {
      console.error("Failed to delete match", err);
    }
  };

return (
  <div style={styles.container}>
    {/* 1. Team & Roster Management */}
    <h2 style={styles.header}>1. Team & Roster</h2>

    <div>
      <h4>Select Team</h4>
      {loadingTeams ? (
        <p>Loading teams...</p>
      ) : userTeams.length === 0 ? (
        <p>No teams found.</p>
      ) : (
        userTeams.map((team) => (
          <label key={team} style={{ display: 'block', marginBottom: '8px' }}>
            <input
              type="radio"
              value={team}
              checked={selectedTeam === team}
              onChange={() => {
                setSelectedTeam(team);
                setMatchSettings((prev) => ({ ...prev, teamName: team }));
              }}
            />{" "}
            {team}
          </label>
        ))
      )}
    </div>

    <div style={{ marginTop: 10 }}>
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Team Roster</h3>
        <div style={styles.rosterContainer}>
          {Array.isArray(benchPlayers) && benchPlayers.length > 0 ? (
            <div style={styles.gridContainer}>
              {benchPlayers.map((player) => (
                <div key={player._id} style={styles.playerCard}>
                  <div style={styles.playerInfo}>
                    <span style={styles.playerName}>{player.name}</span>
                    <span style={styles.playerNumber}>#{player.number}</span>
                    <small style={{ fontSize: '12px', color: '#666' }}>{player.position || '—'}</small>
                    <select
                      value={player.position}
                      onChange={async (e) => {
                        const newPos = e.target.value;
                        e.preventDefault();
                        await axios.put(`${API_URL}/api/players/${player._id}`, { position: newPos });
                        handleRecallBench(selectedTeam);
                      }}
                      style={{ fontSize: '12px', marginTop: '4px', width: '100%' }}
                    >
                      <option value="">—</option>
                      <option value="OH">OH</option>
                      <option value="MB">MB</option>
                      <option value="S">S</option>
                      <option value="OPP">OPP</option>
                      <option value="DS">DS</option>
                      <option value="L">L</option>
                    </select>
                  </div>

                  <label
                    style={{
                      ...styles.toggleLabel,
                      backgroundColor: player.isLibero
                        ? styles.toggleChecked.backgroundColor
                        : styles.toggleLabel.backgroundColor,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={player.isLibero || false}
                      onChange={() => handleLiberoToggle(player._id)}
                      style={styles.toggleInput}
                    />
                    <span
                      style={{
                        ...styles.toggleSlider,
                        left: player.isLibero
                          ? styles.toggleSliderChecked.left
                          : styles.toggleSlider.left,
                      }}
                    ></span>
                  </label>

                  <button
                    onClick={() => handleDeletePlayer(player._id)}
                    style={styles.deleteButton}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.noPlayersText}>No players in the roster.</p>
          )}
        </div>
      </div>
    </div>

    <form onSubmit={handleAddPlayer} style={styles.form}>
      <input
        type="text"
        placeholder="Name"
        value={newPlayerName}
        onChange={(e) => setNewPlayerName(e.target.value)}
        style={styles.input}
      />
      <input
        type="number"
        placeholder="Number"
        value={newPlayerNumber}
        onChange={(e) => setNewPlayerNumber(e.target.value)}
        style={styles.input}
      />
      <select
        value={newPlayerPosition}
        onChange={(e) => setNewPlayerPosition(e.target.value)}
        style={styles.input}
      >
        <option value="">Select Position</option>
        <option value="OH">OH</option>
        <option value="MB">MB</option>
        <option value="S">S</option>
        <option value="OPP">OPP</option>
        <option value="DS">DS</option>
      </select>
      <button type="submit" style={styles.primaryButton}>Add</button>
    </form>

    <div style={styles.buttonRow}>
      <button onClick={onResetBench} style={styles.secondaryButton}>Reset Roster</button>
      <button
        onClick={() => {
          console.log("Recalled team:", selectedTeam);
          if (!selectedTeam) {
            console.error("No team selected!");
            alert("Please select a team before recalling the roster.");
            return;
          }
          handleRecallBench(selectedTeam);
        }}
        style={styles.secondaryButton}
      >
        Recall Roster
      </button>
    </div>

    {/* SECTION: MATCH SETTINGS */}
    <h2 style={{ marginTop: 40 }}>2. Match Settings</h2>
    <div style={formContainerStyle}>
      <div style={fieldStyle}>
        <label>Opponent</label>
        <input
          type="text"
          value={opponentName}
          onChange={(e) => setOpponentName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label>Event</label>
        <input
          type="text"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label>Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label>Max Sets</label>
        <input
          type="number"
          value={maxSets}
          onChange={(e) => setMaxSets(parseInt(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label>Points/Set</label>
        <input
          type="number"
          value={pointsNonDeciding}
          onChange={(e) => setPointsNonDeciding(parseInt(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label>Deciding Set</label>
        <input
          type="number"
          value={pointsDeciding}
          onChange={(e) => setPointsDeciding(parseInt(e.target.value))}
          style={inputStyle}
        />
      </div>
    </div>

    {/* SECTION: MATCH LIFECYCLE */}
    <h2 style={{ marginTop: 40 }}>3. Match Lifecycle</h2>
    <button onClick={handleSaveAndStartMatch} style={styles.primaryButton}>
      Save and Start Match
    </button>

    <h4 style={{ marginTop: 20 }}>Resume Saved Match</h4>
    {savedMatches.length === 0 ? (
      <p>No saved matches found.</p>
    ) : (
      <ul>
        {savedMatches.map((match) => (
          <li key={match._id}>
            Set {match.currentSet} – {match.teamName} ({match.ourScore}) vs {match.opponentName} ({match.opponentScore})
            <button onClick={() => handleResumeMatch(match)}>▶️ Resume</button>
            <button onClick={() => handleDeleteMatch(match._id)}>🗑️ Delete</button>
          </li>
        ))}
      </ul>
    )}
  </div>
);


const styles = {
  container: {
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    backgroundColor: '#F2F2F7', // iOS background color
    minHeight: '100vh',
  },
  header: {
    fontSize: '22px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#1C1C1E',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
    marginBottom: '15px',
    transition: '0.2s ease-in-out',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '10px',
    color: '#1C1E',
  },
  rosterContainer: {
    padding: "12px",
    backgroundColor: "#FFFFFF",
    borderRadius: "14px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  },
  gridContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "10px",
    padding: "10px",
  },
  playerCard: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    transition: "0.2s ease-in-out",
    textAlign: "center",
    minHeight: "130px",
  },
  playerInfo: {
    textAlign: "center",
    fontSize: "14px",
    fontWeight: "500",
    color: "#1C1E",
  },
  playerName: {
    fontSize: "16px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  playerNumber: {
    fontSize: "14px",
    color: "#8E8E93",
  },

toggleLabel: {
  display: "flex",
  alignItems: "center",
  position: "relative",
  width: "50px",
  height: "26px",
  backgroundColor: "#D1D1D6", // Default iOS gray
  borderRadius: "13px",
  cursor: "pointer",
  transition: "background 0.3s ease-in-out",
},

toggleInput: {
  opacity: 0, // Hide checkbox completely
  width: 0,
  height: 0,
  position: "absolute",
},

toggleSlider: {
  position: "absolute",
  top: "3px",
  left: "4px",
  width: "20px",
  height: "20px",
  backgroundColor: "white",
  borderRadius: "50%",
  transition: "0.3s ease-in-out",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2)", // Subtle shadow
},

toggleChecked: {
  backgroundColor: "#34C759", // iOS green when active
},

toggleSliderChecked: {
  left: "26px", // Moves right when toggled
},


  deleteButton: {
    backgroundColor: "#111",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    transition: "0.2s ease-in-out",
  },
  inputGroup: {
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    borderRadius: '12px',
    border: '1px solid #D1D1D6',
    backgroundColor: '#FAFAFA',
  },
  primaryButton: {
    width: '100%',
    padding: '14px',
    fontSize: '17px',
    backgroundColor: '#007AFF',
    color: 'white',
    border: 'none',
    borderRadius: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
    justifyContent: 'center',
	borderRadius: '10px',
  },
secondaryButton: {
  padding: '12px',
  backgroundColor: '#E5E5EA', // iOS system gray
  border: 'none',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: '600',
  color: '#1C1E', // Dark gray for text
  cursor: 'pointer',
  transition: '0.2s ease-in-out',
  textAlign: 'center',
},
secondaryButtonHover: {
  backgroundColor: '#D1D1D6', // Slightly darker gray on hover
},
};


export default SettingsPanel;