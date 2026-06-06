import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import AdCourtBottom from './AdCourtBottom';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
 
const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};
 
const API_URL = getApiUrl(); 
 
 
 
const PlayerStatsPage = ({ currentMatchId: propMatchId, teamName: propTeamName, opponentName }) => {
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
 
  const urlMatchId = searchParams.get("match");
  const urlTeamName = searchParams.get("team");
  const [passViewMode, setPassViewMode] = useState("table"); 
  const [attackViewMode, setAttackViewMode] = useState("table");
  const [setViewMode, setSetViewMode] = useState("table");
  const [assistViewMode, setAssistViewMode] = useState("table");
 
  const currentMatchId = propMatchId || urlMatchId;
  const teamName = propTeamName || urlTeamName;
 
  const [selectedTeam, setSelectedTeam] = useState(teamName || "");
  const [selectedMatchId, setSelectedMatchId] = useState(currentMatchId || "all");
  const [selectedEventName, setSelectedEventName] = useState("all");
  
  
 
  const [teams, setTeams] = useState([]);
 
  const [matches, setMatches] = useState([]);
 
  const [players, setPlayers] = useState([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState("All");
  const [statExplanation, setStatExplanation] = useState("");
  const [aiInsights, setAiInsights] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tone, setTone] = useState("Jovial and flamboyant yet comical");
 
const toneOptions = [
    "Jovial and flamboyant yet comical",
    "Professional and analytical",
    "Encouraging and motivational",
    "Blunt and brutally honest",
    "Playful and sarcastic",
    "Melodramatic and theatrical"
  ];
  
    useEffect(() => {
    const fetchSavedInsights = async () => {
      if (!selectedMatchId || selectedMatchId === "all") {
        setAiInsights("");
        return;
      }
      try {
        const res = await axios.get(`${API_URL}/api/matches/${selectedMatchId}/insights`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data?.insights || "";
        setAiInsights(data);
      } catch (err) {
        console.error("Could not fetch saved insights:", err);
        setAiInsights("");
      }
    };
    fetchSavedInsights();
  }, [selectedMatchId, token]);
  
  
  const { isSubscriber, hasPremium } = useAuth();
  
  const statExplanations = {
    K: "Kills",
    E: "Attack Errors",
    TA: "Total Attack Attempts",
    "PCT.": "Hitting Percentage = (K - E) / TA",
    A: "Assists",
    SA: "Service Aces",
    SE: "Service Errors",
    RE: "Reception Errors",
    DIG: "Digs",
	DIGE: "Dig Errors",
    BS: "Block Solo",
    BA: "Block Assist",
    BE: "Block Errors",
    BHE: "Ball Handling Errors",
    PTS: "Points = K + SA + BS + 0.5 × BA",
    GP: "Games Played"
  };
  
 
 
  
 
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const matchParam = params.get("match");
    const teamParam = params.get("team");
	
	
 
    if (matchParam) setSelectedMatchId(matchParam);
    if (teamParam) setSelectedTeam(teamParam);
  }, []);
 
 useEffect(() => {
  const fetchTeams = async () => {
    if (!user?.id || !token) return;

    try {
      const res = await axios.get(`${API_URL}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const fetchedTeams = res.data.teams || [];
      setTeams(fetchedTeams);

      const params = new URLSearchParams(window.location.search);
      const teamParam = params.get("team");
      const validUrlTeam = teamParam && fetchedTeams.includes(teamParam);

      setSelectedTeam((prev) => {
        if (prev && fetchedTeams.includes(prev)) return prev;
        if (validUrlTeam) return teamParam;
        return fetchedTeams[0] || "";
      });
    } catch (err) {
      console.error("Failed to fetch teams:", err);
    }
  };

  fetchTeams();
}, [user?.id, token]);
 
  const handlePurgeStats = async () => {
    if (!selectedTeam) return;
    const confirmed = window.confirm(`Are you sure you want to purge all match stats for team "${selectedTeam}"? This cannot be undone.`);
    if (!confirmed) return;
 
    try {
      const res = await axios.delete(`${API_URL}/api/playerMatchStats/purge/${selectedTeam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert(res.data.message || "Stats purged.");
      // Optionally re-fetch players or stats if needed
    } catch (err) {
      console.error("Failed to purge stats:", err);
      alert("Failed to purge stats.");
    }
  };
 
  useEffect(() => {
    const fetchMatches = async () => {
      if (!selectedTeam) return;
      try {
        const res = await axios.get(`${API_URL}/api/matches/team?teamName=${selectedTeam}`);
        // Filter out matches with mode: "Coach"
        const filteredMatches = (res.data || []).filter(match => match.mode !== "Match");
        setMatches(filteredMatches);
      } catch (err) {
        console.error('Failed to fetch matches:', err);
      }
    };
    fetchMatches();
  }, [selectedTeam]);
 
  useEffect(() => {
    const fetchPlayers = async () => {
      if (!selectedTeam) return;
	  const authHeader = {
    headers: {
      // The token is critical for authentication
      'Authorization': `Bearer ${token}` 
    }
  };
 
      try {
        // Fetch both players and their stats
const [playersRes, statsRes] = await Promise.all([
      // 2. Pass the authHeader to the authenticated 'recall' endpoint
      axios.get(`${API_URL}/api/players/bench/recall?team=${selectedTeam}`, authHeader),
      axios.get(`${API_URL}/api/playerMatchStats/team/${selectedTeam}`),
    ]);
 
        const playersData = playersRes.data || [];
        const statsData = statsRes.data || [];
 
        // Group stats by playerId
        const statsByPlayer = statsData.reduce((acc, stat) => {
          if (!acc[stat.playerId]) acc[stat.playerId] = [];
          acc[stat.playerId].push(stat);
          return acc;
        }, {});
 
        // Merge matchStats onto each player
        const merged = playersData.map(p => ({
          ...p,
          matchStats: statsByPlayer[p._id] || [],
        }));
 
        setPlayers(merged);
      } catch (err) {
        console.error('Failed to fetch players or stats:', err);
      }
    };
 
    fetchPlayers();
  }, [selectedTeam]);
 
  // Get all players filtered by position and selection (includes players with no stats)
  // Used for stat log table where users can see all selected players
  const getFilteredPlayers = () => {
    return players.filter(p => {
      const matchPlayer = selectedPlayerIds.length === 0 || selectedPlayerIds.includes(p._id);
      const matchPosition = selectedPosition === "All" || p.position === selectedPosition;
      return matchPlayer && matchPosition;
    });
  };
 
  // Helper function to check if a player has any stats at all
  const hasAnyStats = (player) => {
    const stats = getStats(player);
    if (!stats) return false;
    
    // Check if any stat value is greater than 0
    const statKeys = [
      'kills', 'attackErrors', 'attacks', 'assists', 'aces', 'serveErrors',
      'receiveErrors', 'digs', 'digErrors', 'blockSolo', 'blockAssist', 
      'blockErrors', 'bhes', 'gamesPlayed', 'dig_0', 'dig_1', 'dig_2', 'dig_3',
      'receive_0', 'receive_1', 'receive_2', 'receive_3'
    ];
    
    return statKeys.some(key => (stats[key] || 0) > 0);
  };
 
  // Get filtered players who have stats (excludes players with no stats)
  // Used for charts/graphs to avoid cluttering visualizations with zero-data players
  const getFilteredPlayersWithStats = () => {
    return getFilteredPlayers().filter(p => hasAnyStats(p));
  };
  
  useEffect(() => {
    if (selectedPosition === "All") {
      setSelectedPlayerIds(players.map(p => p._id));
    } else {
      const filtered = players.filter(p => p.position === selectedPosition);
      setSelectedPlayerIds(filtered.map(p => p._id));
    }
  }, [selectedPosition, players]);

  // Filter out players without stats when a specific match is selected
  useEffect(() => {
    if (!selectedMatchId || selectedMatchId === 'all' || players.length === 0) {
      return; // Don't filter when "all matches" is selected or no players loaded
    }

    // Filter to only players who have stats for this match
    const playersWithStats = players.filter(p => hasAnyStats(p));
    
    // Update selected players to only include those with stats
    setSelectedPlayerIds(playersWithStats.map(p => p._id));
  }, [selectedMatchId, players]);

  // Reset match selection when event filter changes if current selection is invalid
  useEffect(() => {
    if (selectedEventName === "all" || selectedMatchId === "all") {
      return; // Don't need to reset if showing all events or all matches
    }

    // Check if the currently selected match belongs to the selected event
    const currentMatch = matches.find(m => m._id === selectedMatchId);
    if (currentMatch && currentMatch.eventName !== selectedEventName) {
      // Current match is not in the selected event, reset to "all"
      setSelectedMatchId("all");
    }
  }, [selectedEventName, matches, selectedMatchId]);

const getRelevantMatchIds = () => {
  if (selectedMatchId !== "all") {
    return [selectedMatchId];
  }

  const filteredMatches =
    selectedEventName === "all"
      ? matches
      : matches.filter((m) => (m.eventName || "") === selectedEventName);

  return filteredMatches.map((m) => m._id);
};

const handleTeamChange = (nextTeam) => {
  setSelectedTeam(nextTeam);

  // Reset all dependent filters/selections
  setSelectedEventName("all");
  setSelectedMatchId("all");
  setSelectedPosition("All");
  setSelectedPlayerIds([]);
  setStatExplanation("");
  setAiInsights("");
  setIsAnalyzing(false);
};
 
const getStats = (p) => {
  if (!p.matchStats || p.matchStats.length === 0) return {};

  const relevantMatchIds = getRelevantMatchIds();

  if (!relevantMatchIds.length) return {};

  return p.matchStats
    .filter((m) => relevantMatchIds.includes(m.matchId))
    .reduce((sum, match) => {
      const stats = match.stats || {};
      for (const key in stats) {
        if (!sum[key]) sum[key] = 0;
        sum[key] += stats[key] || 0;
      }
      return sum;
    }, {});
};

  const getTeamTotals = () => {
    const totals = {
      kills: 0,
      attackErrors: 0,
      attacks: 0,
      assists: 0,
      aces: 0,
      serveErrors: 0,
      receiveErrors: 0,
      digs: 0,
	  digErrors: 0,
      blockSolo: 0,
      blockAssist: 0,
      blockErrors: 0,
      bhes: 0,
      points: 0,
      gamesPlayed: 0,
	  dig_0: 0,
	  dig_1: 0,
	  dig_2: 0,
      dig_3: 0,
	  receive_0: 0,
      receive_1: 0,
      receive_2: 0,
      receive_3: 0,
  };
    
 
    const filteredPlayers = getFilteredPlayers();
    let totalGamesPlayed = 0;
    let playersWithGames = 0;
 
    filteredPlayers.forEach(p => {
      const s = getStats(p);
      totals.kills += s.kills || 0;
      totals.attackErrors += s.attackErrors || 0;
      totals.attacks += s.attacks || 0;
      totals.assists += s.assists || 0;
      totals.aces += s.aces || 0;
      totals.serveErrors += s.serveErrors || 0;
      totals.receiveErrors += s.receiveErrors || 0;
      totals.digs += s.digs || 0;
	  totals.digErrors += s.digErrors || 0;
      totals.blockSolo += s.blockSolo || 0;
      totals.blockAssist += s.blockAssist || 0;
      totals.blockErrors += s.blockErrors || 0;
      totals.bhes += s.bhes || 0;
      totals.points += (s.kills || 0) + (s.aces || 0) + (s.blockSolo || 0) + 0.5 * (s.blockAssist || 0);
	  totals.dig_0 += s.dig_0 || 0;
	  totals.dig_1 += s.dig_1 || 0;
		totals.dig_2 += s.dig_2 || 0;
		totals.dig_3 += s.dig_3 || 0;
		totals.receive_0 += s.receive_0 || 0;
		totals.receive_1 += s.receive_1 || 0;
		totals.receive_2 += s.receive_2 || 0;
		totals.receive_3 += s.receive_3 || 0;
      
      // For games played, we'll take the maximum (most games any player has played)
      if ((s.gamesPlayed || 0) > 0) {
        totalGamesPlayed = Math.max(totalGamesPlayed, s.gamesPlayed || 0);
        playersWithGames++;
      }
    });
 
    totals.gamesPlayed = totalGamesPlayed;
    return totals;
  };
 
const getPassGradingForPlayer = (p) => {
  const s = getStats(p);
 
  const dig1 = s.dig_1 || 0;
  const dig2 = s.dig_2 || 0;
  const dig3 = s.dig_3 || 0;
  const dig0 = s.dig_0 || 0;        // 🔹 0-grade digs
 
  const digTouches = dig1 + dig2 + dig3 + dig0;
  const digAvg =
    digTouches > 0
      ? ((1 * dig1 + 2 * dig2 + 3 * dig3) / digTouches).toFixed(2)
      : "-";
 
  const rec1 = s.receive_1 || 0;
  const rec2 = s.receive_2 || 0;
  const rec3 = s.receive_3 || 0;
  const rec0 = s.receive_0 || 0; // 🔹 0-grade receives
 
  const recTouches = rec1 + rec2 + rec3 + rec0;
  const recAvg =
    recTouches > 0
      ? ((1 * rec1 + 2 * rec2 + 3 * rec3) / recTouches).toFixed(2)
      : "-";
 
  return {
    dig1,
    dig2,
    dig3,
	dig0,
    digTotal: digTouches,
    digAvg,
    rec1,
    rec2,
    rec3,
	rec0,
    recTotal: recTouches,
    recAvg,
	digErrors: s.digErrors || 0,
	receiveErrors: s.receiveErrors || 0,
  };
};
 
// Get attack breakdown for a player (Hit/Tip/Roll/Dump analysis)
const getAttackStatsForPlayer = (p) => {
  const s = getStats(p);
 
  // Attack attempts by type
  const attackHit = s.attackHit || 0;
  const attackTip = s.attackTip || 0;
  const attackRoll = s.attackRoll || 0;
  const attackDump = s.attackDump || 0;
 
  // Kills by type
  const killHit = s.killHit || 0;
  const killTip = s.killTip || 0;
  const killRoll = s.killRoll || 0;
  const killDump = s.killDump || 0;
 
  // Errors by type
  const errorHit = s.attackErrorHit || 0;
  const errorTip = s.attackErrorTip || 0;
  const errorRoll = s.attackErrorRoll || 0;
  const errorDump = s.attackErrorDump || 0;
 
  // Zeros (in play but not kill) by type
  const zeroHit = attackHit - killHit - errorHit;
  const zeroTip = attackTip - killTip - errorTip;
  const zeroRoll = attackRoll - killRoll - errorRoll;
  const zeroDump = attackDump - killDump - errorDump;
 
  // Totals
  const totalAttacks = s.attacks || 0;
  const totalKills = s.kills || 0;
  const totalErrors = s.attackErrors || 0;
  const totalZeros = s.zeroAttacks || 0;
 
  // Hitting percentages by type
  const hitPct = attackHit > 0 ? (((killHit - errorHit) / attackHit) * 100).toFixed(1) : "-";
  const tipPct = attackTip > 0 ? (((killTip - errorTip) / attackTip) * 100).toFixed(1) : "-";
  const rollPct = attackRoll > 0 ? (((killRoll - errorRoll) / attackRoll) * 100).toFixed(1) : "-";
  const dumpPct = attackDump > 0 ? (((killDump - errorDump) / attackDump) * 100).toFixed(1) : "-";
  const overallPct = totalAttacks > 0 ? (((totalKills - totalErrors) / totalAttacks) * 100).toFixed(1) : "-";
 
  // Kill rates by type
  const hitKillRate = attackHit > 0 ? ((killHit / attackHit) * 100).toFixed(1) : "-";
  const tipKillRate = attackTip > 0 ? ((killTip / attackTip) * 100).toFixed(1) : "-";
  const rollKillRate = attackRoll > 0 ? ((killRoll / attackRoll) * 100).toFixed(1) : "-";
  const dumpKillRate = attackDump > 0 ? ((killDump / attackDump) * 100).toFixed(1) : "-";
 
  return {
    attackHit,
    attackTip,
    attackRoll,
    attackDump,
    killHit,
    killTip,
    killRoll,
    killDump,
    errorHit,
    errorTip,
    errorRoll,
    errorDump,
    zeroHit,
    zeroTip,
    zeroRoll,
    zeroDump,
    totalAttacks,
    totalKills,
    totalErrors,
    totalZeros,
    hitPct,
    tipPct,
    rollPct,
    dumpPct,
    overallPct,
    hitKillRate,
    tipKillRate,
    rollKillRate,
    dumpKillRate,
  };
};
 
// Get set distribution for a player (zone analysis)
const getSetStatsForPlayer = (p) => {
  const s = getStats(p);
 
  // Sets by zone
  const setOutside = s.setOutside || 0;
  const setMiddle = s.setMiddle || 0;
  const setRightside = s.setRightside || 0;
  const setBackrow = s.setBackrow || 0;
 
  // Errors by zone
  const setOutsideErr = s.setOutsideErr || 0;
  const setMiddleErr = s.setMiddleErr || 0;
  const setRightsideErr = s.setRightsideErr || 0;
  const setBackrowErr = s.setBackrowErr || 0;
 
  // Totals
  const totalSets = s.sets || 0;
  const totalAssists = s.assists || 0;
  const totalSetErrors = s.setErrors || 0;
  const zeroSets = s.zeroSets || 0;
 
  // Error rates by zone
  const outsideErrRate = setOutside > 0 ? ((setOutsideErr / setOutside) * 100).toFixed(1) : "-";
  const middleErrRate = setMiddle > 0 ? ((setMiddleErr / setMiddle) * 100).toFixed(1) : "-";
  const rightsideErrRate = setRightside > 0 ? ((setRightsideErr / setRightside) * 100).toFixed(1) : "-";
  const backrowErrRate = setBackrow > 0 ? ((setBackrowErr / setBackrow) * 100).toFixed(1) : "-";
 
  // Overall assist rate
  const overallAssistRate = totalSets > 0 ? ((totalAssists / totalSets) * 100).toFixed(1) : "-";
 
  return {
    setOutside,
    setMiddle,
    setRightside,
    setBackrow,
    setOutsideErr,
    setMiddleErr,
    setRightsideErr,
    setBackrowErr,
    totalSets,
    totalAssists,
    totalSetErrors,
    zeroSets,
    outsideErrRate,
    middleErrRate,
    rightsideErrRate,
    backrowErrRate,
    overallAssistRate,
  };
};

// Get assist distribution by target for a player
const getAssistStatsForPlayer = (p) => {
  const s = getStats(p);

  // Assists by zone
  const assistOutside = s.assistOutside || 0;
  const assistMiddle = s.assistMiddle || 0;
  const assistRightside = s.assistRightside || 0;
  const assistBackrow = s.assistBackrow || 0;

  // Sets by zone (for calculating assist rate)
  const setOutside = s.setOutside || 0;
  const setMiddle = s.setMiddle || 0;
  const setRightside = s.setRightside || 0;
  const setBackrow = s.setBackrow || 0;

  // Totals
  const totalAssists = s.assists || 0;
  const totalSets = s.sets || 0;

  // Assist rates by zone (assists / sets for each zone)
  const outsideAssistRate = setOutside > 0 ? ((assistOutside / setOutside) * 100).toFixed(1) : "-";
  const middleAssistRate = setMiddle > 0 ? ((assistMiddle / setMiddle) * 100).toFixed(1) : "-";
  const rightsideAssistRate = setRightside > 0 ? ((assistRightside / setRightside) * 100).toFixed(1) : "-";
  const backrowAssistRate = setBackrow > 0 ? ((assistBackrow / setBackrow) * 100).toFixed(1) : "-";

  // Overall assist rate
  const overallAssistRate = totalSets > 0 ? ((totalAssists / totalSets) * 100).toFixed(1) : "-";

  return {
    assistOutside,
    assistMiddle,
    assistRightside,
    assistBackrow,
    setOutside,
    setMiddle,
    setRightside,
    setBackrow,
    totalAssists,
    totalSets,
    outsideAssistRate,
    middleAssistRate,
    rightsideAssistRate,
    backrowAssistRate,
    overallAssistRate,
  };
};
 
const hasAnyPassGrades =
  Array.isArray(getFilteredPlayersWithStats()) &&
  getFilteredPlayersWithStats().some(p => {
    const s = getStats(p);
    if (!s) return false;
 
    return (
      (s.receive_1 || 0) > 0 ||
      (s.receive_2 || 0) > 0 ||
      (s.receive_3 || 0) > 0 ||
      (s.dig_1 || 0) > 0 ||
      (s.dig_2 || 0) > 0 ||
      (s.dig_3 || 0) > 0
    );
  });
 
// Check if any players have detailed attack stats
const hasAnyAttackStats =
  Array.isArray(getFilteredPlayersWithStats()) &&
  getFilteredPlayersWithStats().some(p => {
    const s = getStats(p);
    if (!s) return false;
 
    return (
      (s.attackHit || 0) > 0 ||
      (s.attackTip || 0) > 0 ||
      (s.attackRoll || 0) > 0
    );
  });
 
// Check if any players have detailed set stats
const hasAnySetStats =
  Array.isArray(getFilteredPlayersWithStats()) &&
  getFilteredPlayersWithStats().some(p => {
    const s = getStats(p);
    if (!s) return false;
 
    return (
      (s.setOutside || 0) > 0 ||
      (s.setMiddle || 0) > 0 ||
      (s.setRightside || 0) > 0 ||
      (s.setBackrow || 0) > 0
    );
  });

// Check if any players have detailed assist stats
const hasAnyAssistStats =
  Array.isArray(getFilteredPlayersWithStats()) &&
  getFilteredPlayersWithStats().some(p => {
    const s = getStats(p);
    if (!s) return false;

    return (
      (s.assistOutside || 0) > 0 ||
      (s.assistMiddle || 0) > 0 ||
      (s.assistRightside || 0) > 0 ||
      (s.assistBackrow || 0) > 0
    );
  });
 
  const cardContainerStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  };
 
  const cardStyle = {
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    userSelect: 'none',
    width: 100,
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };
 
  useEffect(() => {
    if (statExplanation) {
      const timer = setTimeout(() => {
        setStatExplanation("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [statExplanation]);
 
  const exportPDF = () => {
    const doc = new jsPDF();
    const img = new Image();
    img.src = "/web-app-manifest-512x512.png"; // From public/
 
    img.onload = () => {
      doc.addImage(img, "PNG", 14, 10, 18, 18);
 
      // Use Loggerhead green
      const loggerheadGreen = "#2e7d32";
      doc.setTextColor(loggerheadGreen);
      doc.setFontSize(12);
 
      const opponentLabel = selectedMatchId !== "all"
        ? `Opponent: ${matches.find(m => m._id === selectedMatchId)?.opponentName || "Unknown"}`
        : "Season Summary";
 
      const eventLabel = selectedMatchId !== "all" && matches.find(m => m._id === selectedMatchId)?.eventName
        ? `Event: ${matches.find(m => m._id === selectedMatchId)?.eventName}`
        : "";

      const positionLabel = selectedPosition !== "All"
        ? `${selectedPosition} Comparison`
        : "";
 
      doc.text(`Loggerhead Box Score`, 36, 16);
	  doc.text(`${selectedTeam}`, 36, 21);
      if (positionLabel) doc.text(positionLabel, 36, 26);
      doc.text(opponentLabel, 36, positionLabel ? 32 : 26);
      if (eventLabel) doc.text(eventLabel, 36, positionLabel ? 37 : 31);
 
      doc.setTextColor(0); // Reset to black
 
      const match = matches.find(m => m._id === selectedMatchId);
      if (selectedMatchId !== 'all' && match?.setScores?.length) {
		  
 
 
 
        const headers = match.setScores.map((_, i) => `Set ${i + 1}`);
        const opponentRow = match.setScores.map(set => ({
          content: set.opponentScore.toString(),
          styles: { fontStyle: set.opponentScore > set.ourScore ? 'bold' : 'normal' }
        }));
        const ourRow = match.setScores.map(set => ({
          content: set.ourScore.toString(),
          styles: { fontStyle: set.ourScore > set.opponentScore ? 'bold' : 'normal' }
        }));
 
        autoTable(doc, {
          startY: 10,
          margin: { left: 120 },
          head: [['', ...headers]],
          body: [
            [match.opponentName, ...opponentRow],
            [match.teamName, ...ourRow]
          ],
          styles: { fontSize: 9, cellPadding: 1 },
          headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
          theme: 'grid'
        });
      }
 
      // Create the table
      const result = autoTable(doc, {
        startY: eventLabel ? (positionLabel ? 43 : 37) : (positionLabel ? 38 : 30),
        head: [[
          "#", "Player", "GP",
          "K", "E", "TA", "PCT.",
          "A", "SA", "SE",
          "RE", "DIG",
          "BS", "BA", "BE", "BHE", "PTS"
        ]],
        headStyles: {
          fillColor: [46, 125, 50],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        body: [
          ...getFilteredPlayers().map(p => {
            const s = getStats(p);
            const ta = s.attacks || 0;
            const kills = s.kills || 0;
            const errors = s.attackErrors || 0;
            const pct = ta > 0 ? ((kills - errors) / ta).toFixed(2) : "-";
            const pts = kills + (s.aces || 0) + (s.blockSolo || 0) + 0.5 * (s.blockAssist || 0);
 
            return [
              p.number,
              p.name,
              s.gamesPlayed || 0, // Updated to show actual games played
              kills,
              errors,
              ta,
              pct,
              s.assists || 0,
              s.aces || 0,
              s.serveErrors || 0,
              s.receiveErrors || 0,
              s.digs || 0,
              s.blockSolo || 0,
              s.blockAssist || 0,
              s.blockErrors || 0,
              s.bhes || 0,
              pts.toFixed(1)
            ];
          }),
          // Team Totals Row
          (() => {
            const totals = getTeamTotals();
            const ta = totals.attacks;
            const pct = ta > 0 ? ((totals.kills - totals.attackErrors) / ta).toFixed(2) : "-";
 
            return [
              "",
              "TEAM TOTALS",
              totals.gamesPlayed, // Updated to show actual team games played
              totals.kills,
              totals.attackErrors,
              totals.attacks,
              pct,
              totals.assists,
              totals.aces,
              totals.serveErrors,
              totals.receiveErrors,
              totals.digs,
              totals.blockSolo,
              totals.blockAssist,
              totals.blockErrors,
              totals.bhes,
              totals.points.toFixed(1)
            ];
          })()
        ]
      });
 
      // Now AFTER the table finishes, draw extra legend text
      if (getFilteredPlayers().length > 0) {
        const legendY = result && result.finalY ? result.finalY + 20 : 200;
        doc.setFontSize(8);
        doc.setTextColor("#555");
        doc.text("Legend:", 14, legendY);
        doc.setFontSize(9);
 
        const legendLines = [
          "GP: Games Played   K: Kills   E: Attack Errors   TA: Total Attacks   PCT.: Hitting % (K-E)/TA",
          "A: Assists   SA: Service Aces   SE: Service Errors",
          "RE: Reception Errors   DIG: Digs",
          "BS: Block Solo   BA: Block Assist   BE: Block Errors   BHE: Ball Handling Errors",
          "PTS: Points = K + SA + BS + 0.5 × BA"
        ];
 
        legendLines.forEach((line, i) => {
          doc.text(line, 14, legendY + 6 + i * 5);
        });
		
		if (aiInsights) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setTextColor("#333");
        doc.text("AI Match Summary", 14, 20);
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(aiInsights, 180);
        doc.text(lines, 14, 30);
      }
 
        // Then save the document
        const match = matches.find(m => m._id === selectedMatchId);
        const opponentName = match?.opponentName?.replace(/\s+/g, '') || "UnknownOpponent";
        const date = match?.timestamp
          ? new Date(match.timestamp).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '')
          : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '');
 
        const safeTeam = selectedTeam.replace(/\s+/g, '');
        doc.save(`${safeTeam}_${opponentName}_${date}.pdf`);
      }
    };
  };
  
const exportPremiumPDF = () => {
  const doc = new jsPDF();
  
  // Loggerhead brand colors
  const loggerheadGreen = [46, 125, 50];
  const lightGreen = [232, 245, 233];
  const darkGray = [66, 66, 66];
  
  // Add Loggerhead logo
  const img = new Image();
  img.src = "/web-app-manifest-512x512.png";
  
  img.onload = () => {
    // Logo and branding header
    doc.addImage(img, "PNG", 14, 10, 20, 20);
    
    // Loggerhead title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...loggerheadGreen);
    doc.text('LOGGERHEAD.APP', 38, 18);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...darkGray);
    doc.text('VOLLEYBALL STATISTICS', 38, 24);
    
    // Date and page info in top right
    doc.setFontSize(8);
    doc.setTextColor(100);
    const currentDate = new Date().toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    doc.text(`Generated: ${currentDate}`, 195, 12, { align: 'right' });
    doc.text('Page 1', 195, 16, { align: 'right' });
    
    // Get match data
    const match = matches.find(m => m._id === selectedMatchId);
    const isAllMatches = selectedMatchId === 'all';
    
    // Team and match header section with green background
    doc.setFillColor(...loggerheadGreen);
    doc.rect(0, 35, 210, 20, 'F');
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(selectedTeam.toUpperCase(), 105, 44, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    if (isAllMatches) {
      doc.text('SEASON STATISTICS', 105, 51, { align: 'center' });
    } else {
      doc.text(`vs ${match?.opponentName || 'Unknown Opponent'}`, 105, 51, { align: 'center' });
    }
    
    // Match details section
    let detailsY = 62;
    doc.setTextColor(...darkGray);
    doc.setFontSize(9);
    
    if (!isAllMatches && match) {
      // Match info box
      doc.setDrawColor(...loggerheadGreen);
      doc.setLineWidth(0.5);
      doc.rect(14, detailsY - 2, 182, 28);
      
      // Match details in two columns
      doc.setFont(undefined, 'bold');
      doc.text('MATCH INFORMATION', 14, detailsY + 3);
      doc.setFont(undefined, 'normal');
      
      const matchDate = new Date(match.timestamp).toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      const matchTime = new Date(match.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
      
      // Left column
      doc.setFont(undefined, 'bold');
      doc.text('Date:', 20, detailsY + 9);
      doc.text('Time:', 20, detailsY + 14);
      doc.text('Location:', 20, detailsY + 19);
      doc.text('Event:', 20, detailsY + 24);
      
      doc.setFont(undefined, 'normal');
      doc.text(matchDate, 38, detailsY + 9);
      doc.text(matchTime, 38, detailsY + 14);
      doc.text(match.location || 'Not specified', 38, detailsY + 19);
      doc.text(match.eventName || 'Regular Season', 38, detailsY + 24);
      
      // Right column - Match result
      const ourSetsWon = match.setScores?.filter(set => set.ourScore > set.opponentScore).length || 0;
      const oppSetsWon = match.setScores?.filter(set => set.opponentScore > set.ourScore).length || 0;
      const matchResult = ourSetsWon > oppSetsWon ? 'WIN' : 'LOSS';
      const resultColor = ourSetsWon > oppSetsWon ? loggerheadGreen : [220, 53, 69];
      
      doc.setFont(undefined, 'bold');
      doc.text('Result:', 110, detailsY + 9);
      doc.setTextColor(...resultColor);
      doc.text(`${matchResult} (${ourSetsWon}-${oppSetsWon})`, 128, detailsY + 9);
      
      doc.setTextColor(...darkGray);
      doc.text('Duration:', 110, detailsY + 14);
      doc.text('Attendance:', 110, detailsY + 19);
      
      doc.setFont(undefined, 'normal');
      doc.text(match.duration || '--', 128, detailsY + 14);
      doc.text(match.attendance || '--', 128, detailsY + 19);
      
      detailsY += 35;
      
      // Set scores with enhanced styling
      if (match.setScores?.length) {
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...loggerheadGreen);
        doc.text('SET SCORES', 14, detailsY);
        doc.setTextColor(...darkGray);
        
        const setHeaders = ['Team', ...match.setScores.map((_, i) => `Set ${i + 1}`), 'Total'];
        const opponentScores = match.setScores.map(set => set.opponentScore);
        const ourScores = match.setScores.map(set => set.ourScore);
        
        autoTable(doc, {
          startY: detailsY + 3,
          head: [setHeaders],
          body: [
            [match.opponentName, ...opponentScores, oppSetsWon],
            [match.teamName, ...ourScores, ourSetsWon]
          ],
          styles: { 
            fontSize: 9, 
            cellPadding: 2.5,
            halign: 'center'
          },
          headStyles: { 
            fillColor: loggerheadGreen,
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          bodyStyles: {
            textColor: darkGray
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 40, fontStyle: 'bold' }
          },
          theme: 'striped',
          didParseCell: function(data) {
	if (data.section === 'head' && data.column.index === setHeaders.length - 1) {
    data.cell.styles.textColor = [0, 0, 0];
     data.cell.styles.fillColor = [255, 255, 255]; // optional: white background for contrast
   }
            // Highlight winning scores
            if (data.section === 'body' && data.column.index > 0 && data.column.index <= match.setScores.length) {
              const setIndex = data.column.index - 1;
              const isOurWin = ourScores[setIndex] > opponentScores[setIndex];
              const isOurRow = data.row.index === 1;
              
              if ((isOurWin && isOurRow) || (!isOurWin && !isOurRow)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = loggerheadGreen;
              }
            }
            // Style total column
            if (data.column.index === setHeaders.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = lightGreen;
            }
          }
        });
        
        detailsY = doc.lastAutoTable.finalY + 10;
      }
    } else if (isAllMatches) {
      // Season overview
      const wins = matches.filter(m => {
        const ourSets = m.setScores?.filter(s => s.ourScore > s.opponentScore).length || 0;
        const oppSets = m.setScores?.filter(s => s.opponentScore > s.ourScore).length || 0;
        return ourSets > oppSets;
      }).length;
      const losses = matches.length - wins;
      const winPct = matches.length > 0 ? (wins / matches.length * 100).toFixed(1) : '0.0';
      
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...loggerheadGreen);
      doc.text('SEASON OVERVIEW', 14, detailsY);
      doc.setTextColor(...darkGray);
      
      autoTable(doc, {
        startY: detailsY + 3,
        head: [['Record', 'Win %', 'Total Matches', 'Home', 'Away', 'Neutral']],
        body: [[
          `${wins}-${losses}`,
          `${winPct}%`,
          matches.length.toString(),
          '--',
          '--',
          '--'
        ]],
        styles: { 
          fontSize: 9, 
          cellPadding: 3,
          halign: 'center'
        },
        headStyles: { 
          fillColor: loggerheadGreen,
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        theme: 'striped'
      });
      
      detailsY = doc.lastAutoTable.finalY + 10;
    }
    
    // Player Statistics header
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...loggerheadGreen);
    doc.setFontSize(11);
    doc.text('PLAYER STATISTICS', 14, detailsY);
    
    if (selectedPosition !== 'All') {
      doc.setFontSize(9);
      doc.setTextColor(...darkGray);
      doc.text(`(${selectedPosition} Position Only)`, 14, detailsY + 5);
      detailsY += 5;
    }
    
    // Prepare player data
    const playerRows = getFilteredPlayers().map(p => {
      const s = getStats(p);
      const ta = s.attacks || 0;
      const kills = s.kills || 0;
      const errors = s.attackErrors || 0;
      const pct = ta > 0 ? ((kills - errors) / ta).toFixed(3) : '.000';
      const pts = kills + (s.aces || 0) + (s.blockSolo || 0) + 0.5 * (s.blockAssist || 0);
 
      return [
        p.number.toString(),
        p.name.length > 18 ? p.name.substring(0, 17) + '.' : p.name,
        p.position || '--',
        (s.gamesPlayed || 0).toString(),
        // Attack
        kills.toString(),
        errors.toString(),
        ta.toString(),
        pct,
        // Set
        (s.assists || 0).toString(),
        // Serve
        (s.aces || 0).toString(),
        (s.serveErrors || 0).toString(),
        // Defense
        (s.digs || 0).toString(),
		(s.digErrors || 0).toString(),
        (s.receiveErrors || 0).toString(),
        // Blocking
        (s.blockSolo || 0).toString(),
        (s.blockAssist || 0).toString(),
        (s.blockErrors || 0).toString(),
        // Other
        (s.bhes || 0).toString(),
        pts.toFixed(1)
      ];
    });
 
    // Team totals row
    const totals = getTeamTotals();
    const teamPct = totals.attacks > 0 
      ? ((totals.kills - totals.attackErrors) / totals.attacks).toFixed(3) 
      : '.000';
    
    const totalsRow = [
      '',
      'TEAM TOTALS',
      '',
      totals.gamesPlayed.toString(),
      totals.kills.toString(),
      totals.attackErrors.toString(),
      totals.attacks.toString(),
      teamPct,
      totals.assists.toString(),
      totals.aces.toString(),
      totals.serveErrors.toString(),
      totals.digs.toString(),
	  totals.digErrors.toString(),
      totals.receiveErrors.toString(),
      totals.blockSolo.toString(),
      totals.blockAssist.toString(),
      totals.blockErrors.toString(),
      totals.bhes.toString(),
      totals.points.toFixed(1)
    ];
 
    // Create the main statistics table
   autoTable(doc, {
  startY: detailsY + 5,
  head: [
    [
      {content: '', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}}, 
      {content: 'ATTACK', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
      {content: 'SET', colSpan: 1, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
      {content: 'SERVE', colSpan: 2, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
      {content: 'DEFENSE', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
      {content: 'BLOCKING', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
      {content: '', colSpan: 2, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}}
    ],
    ['#', 'Player', 'Pos', 'GP', 'K', 'E', 'TA', 'PCT', 'A', 'SA', 'SE', 'DIG','DIGE', 'RE', 'BS', 'BA', 'BE', 'BHE', 'PTS']
  ],
  body: [...playerRows, totalsRow],
  styles: { 
    fontSize: 7,
    cellPadding: 1.8,
    lineColor: [200, 200, 200],
    lineWidth: 0.1
  },
  headStyles: { 
    fillColor: lightGreen,
    textColor: darkGray,
    fontStyle: 'bold',
    halign: 'center'
  },
  bodyStyles: {
    halign: 'center',
    textColor: darkGray
  },
  alternateRowStyles: {
    fillColor: [250, 250, 250]
  },
  columnStyles: {
    0: { cellWidth: 7 }, 1: { cellWidth: 32 }, 2: { cellWidth: 10 },
    3: { cellWidth: 8 }, 4: { cellWidth: 9 }, 5: { cellWidth: 9 },
    6: { cellWidth: 10 }, 7: { cellWidth: 11 }, 8: { cellWidth: 9 },
    9: { cellWidth: 9 }, 10: { cellWidth: 9 }, 11: { cellWidth: 8 },
    12: { cellWidth: 12 }, 13: { cellWidth: 9 }, 14: { cellWidth: 9 },
    15: { cellWidth: 9 }, 16: { cellWidth: 9 }, 17: { cellWidth: 10 },
    18: { cellWidth: 11 }
  },
  theme: 'grid',
 
  // 💡 Center table horizontally
  margin: { left: (210 - (7+32+10+8+9+9+10+11+9+9+9+8+12+9+9+9+9+10+11)) / 2 },
 
  didParseCell: function (data) {
    if (data.row.index === playerRows.length && data.section === 'body') {
      data.cell.styles.fontStyle = 'bold';
      data.cell.styles.fillColor = lightGreen;
      data.cell.styles.textColor = loggerheadGreen;
    }
  }
});
 
    
    // Footer with legend
    const footerY = doc.lastAutoTable.finalY + 8;
    if (footerY < 270) {
      doc.setDrawColor(...loggerheadGreen);
      doc.setLineWidth(0.5);
      doc.line(14, footerY, 196, footerY);
      
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.setFont(undefined, 'italic');
      
      const legendText = [
        'K: Kills | E: Errors | TA: Total Attacks | PCT: Hitting % | A: Assists | SA: Service Aces | SE: Service Errors',
        'DIG: Digs | DIGE: Dig Errors | RE: Reception Errors | BS: Block Solo | BA: Block Assist | BE: Block Errors ',
        'BHE: Ball Handling Errors | PTS: Points (K + SA + BS + 0.5 × BA) | GP: Games Played | Pos: Position'
      ];
      
      legendText.forEach((line, i) => {
        doc.text(line, 105, footerY + 5 + (i * 4), { align: 'center' });
      });
      
      // Loggerhead footer branding
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...loggerheadGreen);
      doc.setFontSize(8);
      doc.text('© Loggerhead.app Volleyball Statistics', 105, footerY + 20, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      doc.text('https://ui.loggerhead.app', 105, footerY + 24, { align: 'center' });
    }
    
    // ===== PAGE 2: ATTACK ANALYSIS BY TYPE =====
    doc.addPage();
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...loggerheadGreen);
    doc.text('ATTACK ANALYSIS BY TYPE', 105, 20, { align: 'center' });
    
    const attackRows = getFilteredPlayers()
      .filter(p => {
        const s = getStats(p);
        // Only include players with attack type stats
        return (s.attackHit || 0) > 0 || (s.attackTip || 0) > 0 || 
               (s.attackRoll || 0) > 0 || (s.attackDump || 0) > 0;
      })
      .map(p => {
      const s = getStats(p);
      
      const hitAtt = s.attackHit || 0;
      const hitK = s.killHit || 0;
      const hitE = s.attackErrorHit || 0;
      const hitPct = hitAtt > 0 ? ((hitK - hitE) / hitAtt).toFixed(3) : '.000';
      
      const tipAtt = s.attackTip || 0;
      const tipK = s.killTip || 0;
      const tipE = s.attackErrorTip || 0;
      const tipPct = tipAtt > 0 ? ((tipK - tipE) / tipAtt).toFixed(3) : '.000';
      
      const rollAtt = s.attackRoll || 0;
      const rollK = s.killRoll || 0;
      const rollE = s.attackErrorRoll || 0;
      const rollPct = rollAtt > 0 ? ((rollK - rollE) / rollAtt).toFixed(3) : '.000';
      
      const dumpAtt = s.attackDump || 0;
      const dumpK = s.killDump || 0;
      const dumpE = s.attackErrorDump || 0;
      const dumpPct = dumpAtt > 0 ? ((dumpK - dumpE) / dumpAtt).toFixed(3) : '.000';
      
      return [
        p.number.toString(),
        p.name.length > 18 ? p.name.substring(0, 17) + '.' : p.name,
        p.position || '--',
        hitAtt.toString(), hitK.toString(), hitE.toString(), hitPct,
        tipAtt.toString(), tipK.toString(), tipE.toString(), tipPct,
        rollAtt.toString(), rollK.toString(), rollE.toString(), rollPct,
        dumpAtt.toString(), dumpK.toString(), dumpE.toString(), dumpPct
      ];
    });
    
    autoTable(doc, {
      startY: 28,
      head: [
        [
          {content: '', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'HIT', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'TIP', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'ROLL', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'DUMP', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}}
        ],
        ['#', 'Player', 'Pos', 'Att', 'K', 'E', 'PCT', 'Att', 'K', 'E', 'PCT', 'Att', 'K', 'E', 'PCT', 'Att', 'K', 'E', 'PCT']
      ],
      body: attackRows,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: lightGreen,
        textColor: darkGray,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        halign: 'center',
        textColor: darkGray
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        0: { cellWidth: 7 }, 1: { cellWidth: 30 }, 2: { cellWidth: 10 }
      },
      theme: 'grid'
    });
    
    // ===== PAGE 3: SET DISTRIBUTION BY ZONE =====
    doc.addPage();
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...loggerheadGreen);
    doc.text('SET DISTRIBUTION BY ZONE', 105, 20, { align: 'center' });
    
    const setRows = getFilteredPlayers()
      .filter(p => {
        const s = getStats(p);
        // Only include players with setting stats
        return (s.setOutside || 0) > 0 || (s.setMiddle || 0) > 0 || 
               (s.setRightside || 0) > 0 || (s.setBackrow || 0) > 0;
      })
      .map(p => {
      const s = getStats(p);
      
      const outSets = s.setOutside || 0;
      const outAst = s.assistOutside || 0;
      const outErr = s.setOutsideErr || 0;
      const outPct = outSets > 0 ? ((outAst / outSets) * 100).toFixed(1) : '0.0';
      
      const midSets = s.setMiddle || 0;
      const midAst = s.assistMiddle || 0;
      const midErr = s.setMiddleErr || 0;
      const midPct = midSets > 0 ? ((midAst / midSets) * 100).toFixed(1) : '0.0';
      
      const rightSets = s.setRightside || 0;
      const rightAst = s.assistRightside || 0;
      const rightErr = s.setRightsideErr || 0;
      const rightPct = rightSets > 0 ? ((rightAst / rightSets) * 100).toFixed(1) : '0.0';
      
      const backSets = s.setBackrow || 0;
      const backAst = s.assistBackrow || 0;
      const backErr = s.setBackrowErr || 0;
      const backPct = backSets > 0 ? ((backAst / backSets) * 100).toFixed(1) : '0.0';
      
      const totalSets = outSets + midSets + rightSets + backSets;
      const totalAst = s.assists || 0;
      const totalPct = totalSets > 0 ? ((totalAst / totalSets) * 100).toFixed(1) : '0.0';
      
      return [
        p.number.toString(),
        p.name.length > 18 ? p.name.substring(0, 17) + '.' : p.name,
        p.position || '--',
        outSets.toString(), outAst.toString(), outErr.toString(), outPct,
        midSets.toString(), midAst.toString(), midErr.toString(), midPct,
        rightSets.toString(), rightAst.toString(), rightErr.toString(), rightPct,
        backSets.toString(), backAst.toString(), backErr.toString(), backPct,
        totalSets.toString(), totalAst.toString(), totalPct
      ];
    });
    
    autoTable(doc, {
      startY: 28,
      head: [
        [
          {content: '', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'OUTSIDE', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'MIDDLE', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'RIGHT', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'BACKROW', colSpan: 4, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'TOTAL', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}}
        ],
        ['#', 'Player', 'Pos', 'Sets', 'Ast', 'Err', 'Ast%', 'Sets', 'Ast', 'Err', 'Ast%', 'Sets', 'Ast', 'Err', 'Ast%', 'Sets', 'Ast', 'Err', 'Ast%', 'Sets', 'Ast', 'Ast%']
      ],
      body: setRows,
      styles: {
        fontSize: 6.5,
        cellPadding: 1.2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: lightGreen,
        textColor: darkGray,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        halign: 'center',
        textColor: darkGray
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        0: { cellWidth: 7 }, 1: { cellWidth: 28 }, 2: { cellWidth: 9 }
      },
      theme: 'grid'
    });
    
    // ===== PAGE 4: ASSISTS BY TARGET ZONE =====
    doc.addPage();
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...loggerheadGreen);
    doc.text('ASSISTS BY TARGET ZONE', 105, 20, { align: 'center' });
    
    const assistRows = getFilteredPlayers()
      .filter(p => {
        const s = getStats(p);
        // Only include players with assists
        return (s.assists || 0) > 0;
      })
      .map(p => {
      const s = getStats(p);
      
      const outSets = s.setOutside || 0;
      const outAst = s.assistOutside || 0;
      const outConv = outSets > 0 ? ((outAst / outSets) * 100).toFixed(1) : '0.0';
      
      const midSets = s.setMiddle || 0;
      const midAst = s.assistMiddle || 0;
      const midConv = midSets > 0 ? ((midAst / midSets) * 100).toFixed(1) : '0.0';
      
      const rightSets = s.setRightside || 0;
      const rightAst = s.assistRightside || 0;
      const rightConv = rightSets > 0 ? ((rightAst / rightSets) * 100).toFixed(1) : '0.0';
      
      const backSets = s.setBackrow || 0;
      const backAst = s.assistBackrow || 0;
      const backConv = backSets > 0 ? ((backAst / backSets) * 100).toFixed(1) : '0.0';
      
      const totalSets = outSets + midSets + rightSets + backSets;
      const totalAst = s.assists || 0;
      const overallRate = totalSets > 0 ? ((totalAst / totalSets) * 100).toFixed(1) : '0.0';
      
      return [
        p.number.toString(),
        p.name.length > 18 ? p.name.substring(0, 17) + '.' : p.name,
        p.position || '--',
        outSets.toString(), outAst.toString(), outConv,
        midSets.toString(), midAst.toString(), midConv,
        rightSets.toString(), rightAst.toString(), rightConv,
        backSets.toString(), backAst.toString(), backConv,
        overallRate
      ];
    });
    
    autoTable(doc, {
      startY: 28,
      head: [
        [
          {content: '', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'OUTSIDE', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'MIDDLE', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'RIGHT', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: 'BACKROW', colSpan: 3, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}},
          {content: '', colSpan: 1, styles: {fillColor: loggerheadGreen, textColor: [255, 255, 255], fontStyle: 'bold'}}
        ],
        ['#', 'Player', 'Pos', 'Sets', 'Ast', 'Conv%', 'Sets', 'Ast', 'Conv%', 'Sets', 'Ast', 'Conv%', 'Sets', 'Ast', 'Conv%', 'Overall%']
      ],
      body: assistRows,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: lightGreen,
        textColor: darkGray,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        halign: 'center',
        textColor: darkGray
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        0: { cellWidth: 7 }, 1: { cellWidth: 30 }, 2: { cellWidth: 10 }
      },
      theme: 'grid'
    });
    
    // Add AI Insights on new page if available
    if (aiInsights) {
      doc.addPage();
      
      // Header for insights page
      doc.addImage(img, "PNG", 14, 10, 15, 15);
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...loggerheadGreen);
      doc.text('LOGGERHEAD', 32, 16);
      doc.setFontSize(10);
      doc.text('AI MATCH ANALYSIS', 32, 21);
      
      // Insights content
      doc.setFontSize(11);
      doc.setTextColor(...darkGray);
      doc.setFont(undefined, 'normal');
      
      const lines = doc.splitTextToSize(aiInsights, 175);
      let yPos = 35;
      
      lines.forEach(line => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, 14, yPos);
        yPos += 5;
      });
    }
    
    // Generate filename
    const date = match?.timestamp
      ? new Date(match.timestamp).toLocaleDateString('en-US', { 
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit'
        }).replace(/\//g, '')
      : new Date().toLocaleDateString('en-US', { 
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit'
        }).replace(/\//g, '');
    
    const safeTeam = selectedTeam.replace(/[^a-zA-Z0-9]/g, '');
    const safeOpponent = isAllMatches 
      ? 'SeasonStats' 
      : (match?.opponentName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
    
    doc.save(`Loggerhead_${safeTeam}_${safeOpponent}_${date}.pdf`);
  };
  
  // Error handling if image fails to load
  img.onerror = () => {
    console.error("Failed to load logo, generating PDF without logo");
    // You could call the PDF generation without the logo here
    // or show an error message to the user
  };
};
  
const handleExportPDF = () => {
  if (hasPremium) {
    exportPremiumPDF();
  } else {
    exportPDF();
  }
};
 
const handleAnalyzeMatchLog = async () => {
  if (!selectedMatchId || selectedMatchId === "all") {
    alert("Please select a specific match to analyze.");
    return;
  }
 
  setIsAnalyzing(true); // Start loading indicator
 
  try {
    const res = await axios.get(`${API_URL}/api/matches/${selectedMatchId}`);
    const match = res.data;
 
    if (!match?.actionLog || match.actionLog.length === 0) {
      alert("No action log found for this match.");
      return;
    }
	
	const winner =
  match.ourSetsWon > match.opponentSetsWon
    ? selectedTeam
    : match.opponentName;
 
    const aiRes = await axios.post(`${API_URL}/api/analyze/analyze-log`, {
      actionLog: match.actionLog,
      matchContext: {
        teamName: match.teamName,
        opponentName: match.opponentName,
        eventName: match.eventName,
        location: match.location,
        setScores: match.setScores,
		winnner: winner,
        date: match.timestamp
      },
	  tone
    });
 
    const result = aiRes.data?.parsed;
    if (result) {
      setAiInsights(result);
    } else {
      alert("AI responded but no content was returned.");
    }
  } catch (err) {
    console.error("❌ Failed to analyze match:", err.message);
    alert("Failed to analyze match log. Make sure your subscription is active and you have selected a match.");
  } finally {
    setIsAnalyzing(false); // End loading indicator
  }
};
 
const formatAiInsightsAsNarrative = (parsedJson) => {
  if (typeof parsedJson === "string") {
    try {
      parsedJson = JSON.parse(parsedJson);
    } catch (err) {
      return <pre style={{ whiteSpace: "pre-wrap" }}>{parsedJson}</pre>;
    }
  }
 
  const { playerStats = {}, insights = [] } = parsedJson;
 
  const readableLabel = {
    kills: "kills",
    attacks: "attacks",
    attackErrors: "attack errors",
    sets: "sets",
    assists: "assists",
    digs: "digs",
    touches: "touches",
    serveAces: "serve aces",
    serveErrors: "serve errors",
    serveInPlay: "serves in play",
    serveReceivedAttempts: "serve receive attempts"
  };
 
  const paragraphStyle = {
    marginBottom: "1em",
    lineHeight: 1.6,
    fontSize: "16px"
  };
 
  const buildSentence = (name, stats) => {
    const statSentences = Object.entries(stats)
      .filter(([_, val]) => val > 0)
      .map(([key, val]) => {
        const label = readableLabel[key] || key;
        return `${val} ${label}`;
      });
 
    if (statSentences.length === 0) return null;
 
    const statText =
      statSentences.length === 1
        ? statSentences[0]
        : statSentences.slice(0, -1).join(", ") + ", and " + statSentences.slice(-1);
 
    return `${name} contributed with ${statText}.`;
  };
 
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: "20px", fontWeight: "700", color: "#1C1C1E", marginBottom: "12px" }}>
        Match Report
      </h3>
 
      {Object.entries(playerStats)
        .map(([name, stats]) => buildSentence(name, stats))
        .filter(Boolean)
        .map((sentence, i) => (
          <p key={i} style={paragraphStyle}>{sentence}</p>
        ))}
 
      {insights.length > 0 && (
        <>
          <h4 style={{ fontSize: "18px", fontWeight: "600", marginTop: "24px", color: "#444" }}>
            Key Highlights
          </h4>
          {insights.map((insight, i) => (
            <p key={i + "-i"} style={paragraphStyle}>{insight}</p>
          ))}
        </>
      )}
    </div>
  );
};
 
  const exportCSV = () => {
    const match = matches.find(m => m._id === selectedMatchId);
    const isAllMatches = selectedMatchId === 'all';
    
    // Build comprehensive CSV with multiple sections
    const csvLines = [];
    
    // ===== HEADER: MATCH INFORMATION =====
    csvLines.push("LOGGERHEAD VOLLEYBALL STATS EXPORT");
    csvLines.push(`Team: ${selectedTeam}`);
    if (!isAllMatches && match) {
      csvLines.push(`Opponent: ${match.opponentName || 'Unknown'}`);
      csvLines.push(`Event: ${match.eventName || 'Regular Season'}`);
      csvLines.push(`Date: ${new Date(match.timestamp).toLocaleDateString()}`);
      csvLines.push(`Location: ${match.location || 'Not specified'}`);
    } else {
      csvLines.push("Export Type: Season Summary");
    }
    csvLines.push("");
    csvLines.push("");
    
    // ===== SECTION 1: BASIC BOX SCORE =====
    csvLines.push("=== BASIC BOX SCORE ===");
    csvLines.push("");
    
    const basicHeaders = [
      "#", "Player", "Position", "GP",
      "K", "E", "TA", "PCT",
      "A", "SA", "SE",
      "RE", "DIG", "DIGE",
      "BS", "BA", "BE", "BHE", "PTS"
    ];
    csvLines.push(basicHeaders.join(","));
    
    getFilteredPlayers().forEach(p => {
      const s = getStats(p);
      const ta = s.attacks || 0;
      const kills = s.kills || 0;
      const errors = s.attackErrors || 0;
      const pct = ta > 0 ? ((kills - errors) / ta).toFixed(3) : ".000";
      const pts = kills + (s.aces || 0) + (s.blockSolo || 0) + 0.5 * (s.blockAssist || 0);
      
      csvLines.push([
        p.number,
        `"${p.name}"`, // Quote names to handle commas
        p.position,
        s.gamesPlayed || 0,
        kills,
        errors,
        ta,
        pct,
        s.assists || 0,
        s.aces || 0,
        s.serveErrors || 0,
        s.receiveErrors || 0,
        s.digs || 0,
        s.digErrors || 0,
        s.blockSolo || 0,
        s.blockAssist || 0,
        s.blockErrors || 0,
        s.bhes || 0,
        pts.toFixed(1)
      ].join(","));
    });
    
    csvLines.push("");
    csvLines.push("");
    
    // ===== SECTION 2: ATTACK ANALYSIS BY TYPE =====
    csvLines.push("=== ATTACK ANALYSIS BY TYPE ===");
    csvLines.push("");
    
    const attackHeaders = [
      "#", "Player", "Position",
      "Hit Att", "Hit K", "Hit E", "Hit %",
      "Tip Att", "Tip K", "Tip E", "Tip %",
      "Roll Att", "Roll K", "Roll E", "Roll %",
      "Dump Att", "Dump K", "Dump E", "Dump %"
    ];
    csvLines.push(attackHeaders.join(","));
    
    getFilteredPlayers().forEach(p => {
      const s = getStats(p);
      
      // Only include players with attack type stats
      const hasAttackTypeStats = (s.attackHit || 0) > 0 || (s.attackTip || 0) > 0 || 
                                  (s.attackRoll || 0) > 0 || (s.attackDump || 0) > 0;
      if (!hasAttackTypeStats) return;
      
      const hitAtt = s.attackHit || 0;
      const hitK = s.killHit || 0;
      const hitE = s.attackErrorHit || 0;
      const hitPct = hitAtt > 0 ? ((hitK - hitE) / hitAtt).toFixed(3) : ".000";
      
      const tipAtt = s.attackTip || 0;
      const tipK = s.killTip || 0;
      const tipE = s.attackErrorTip || 0;
      const tipPct = tipAtt > 0 ? ((tipK - tipE) / tipAtt).toFixed(3) : ".000";
      
      const rollAtt = s.attackRoll || 0;
      const rollK = s.killRoll || 0;
      const rollE = s.attackErrorRoll || 0;
      const rollPct = rollAtt > 0 ? ((rollK - rollE) / rollAtt).toFixed(3) : ".000";
      
      const dumpAtt = s.attackDump || 0;
      const dumpK = s.killDump || 0;
      const dumpE = s.attackErrorDump || 0;
      const dumpPct = dumpAtt > 0 ? ((dumpK - dumpE) / dumpAtt).toFixed(3) : ".000";
      
      csvLines.push([
        p.number,
        `"${p.name}"`,
        p.position,
        hitAtt, hitK, hitE, hitPct,
        tipAtt, tipK, tipE, tipPct,
        rollAtt, rollK, rollE, rollPct,
        dumpAtt, dumpK, dumpE, dumpPct
      ].join(","));
    });
    
    csvLines.push("");
    csvLines.push("");
    
    // ===== SECTION 3: SET DISTRIBUTION BY ZONE =====
    csvLines.push("=== SET DISTRIBUTION BY ZONE ===");
    csvLines.push("");
    
    const setHeaders = [
      "#", "Player", "Position",
      "Outside Sets", "Outside Ast", "Outside Err", "Outside Ast %",
      "Middle Sets", "Middle Ast", "Middle Err", "Middle Ast %",
      "Right Sets", "Right Ast", "Right Err", "Right Ast %",
      "Backrow Sets", "Backrow Ast", "Backrow Err", "Backrow Ast %",
      "Total Sets", "Total Ast", "Total Ast %"
    ];
    csvLines.push(setHeaders.join(","));
    
    getFilteredPlayers().forEach(p => {
      const s = getStats(p);
      
      // Only include players with setting stats
      const hasSettingStats = (s.setOutside || 0) > 0 || (s.setMiddle || 0) > 0 || 
                              (s.setRightside || 0) > 0 || (s.setBackrow || 0) > 0;
      if (!hasSettingStats) return;
      
      const outSets = s.setOutside || 0;
      const outAst = s.assistOutside || 0;
      const outErr = s.setOutsideErr || 0;
      const outPct = outSets > 0 ? ((outAst / outSets) * 100).toFixed(1) : "0.0";
      
      const midSets = s.setMiddle || 0;
      const midAst = s.assistMiddle || 0;
      const midErr = s.setMiddleErr || 0;
      const midPct = midSets > 0 ? ((midAst / midSets) * 100).toFixed(1) : "0.0";
      
      const rightSets = s.setRightside || 0;
      const rightAst = s.assistRightside || 0;
      const rightErr = s.setRightsideErr || 0;
      const rightPct = rightSets > 0 ? ((rightAst / rightSets) * 100).toFixed(1) : "0.0";
      
      const backSets = s.setBackrow || 0;
      const backAst = s.assistBackrow || 0;
      const backErr = s.setBackrowErr || 0;
      const backPct = backSets > 0 ? ((backAst / backSets) * 100).toFixed(1) : "0.0";
      
      const totalSets = outSets + midSets + rightSets + backSets;
      const totalAst = s.assists || 0;
      const totalPct = totalSets > 0 ? ((totalAst / totalSets) * 100).toFixed(1) : "0.0";
      
      csvLines.push([
        p.number,
        `"${p.name}"`,
        p.position,
        outSets, outAst, outErr, outPct,
        midSets, midAst, midErr, midPct,
        rightSets, rightAst, rightErr, rightPct,
        backSets, backAst, backErr, backPct,
        totalSets, totalAst, totalPct
      ].join(","));
    });
    
    csvLines.push("");
    csvLines.push("");
    
    // ===== SECTION 4: ASSISTS BY TARGET ZONE =====
    csvLines.push("=== ASSISTS BY TARGET ZONE ===");
    csvLines.push("");
    
    const assistHeaders = [
      "#", "Player", "Position",
      "Outside Sets", "Outside Ast", "Outside Conversion %",
      "Middle Sets", "Middle Ast", "Middle Conversion %",
      "Right Sets", "Right Ast", "Right Conversion %",
      "Backrow Sets", "Backrow Ast", "Backrow Conversion %",
      "Overall Assist Rate %"
    ];
    csvLines.push(assistHeaders.join(","));
    
    getFilteredPlayers().forEach(p => {
      const s = getStats(p);
      
      // Only include players with assists
      const hasAssists = (s.assists || 0) > 0;
      if (!hasAssists) return;
      
      const outSets = s.setOutside || 0;
      const outAst = s.assistOutside || 0;
      const outConv = outSets > 0 ? ((outAst / outSets) * 100).toFixed(1) : "0.0";
      
      const midSets = s.setMiddle || 0;
      const midAst = s.assistMiddle || 0;
      const midConv = midSets > 0 ? ((midAst / midSets) * 100).toFixed(1) : "0.0";
      
      const rightSets = s.setRightside || 0;
      const rightAst = s.assistRightside || 0;
      const rightConv = rightSets > 0 ? ((rightAst / rightSets) * 100).toFixed(1) : "0.0";
      
      const backSets = s.setBackrow || 0;
      const backAst = s.assistBackrow || 0;
      const backConv = backSets > 0 ? ((backAst / backSets) * 100).toFixed(1) : "0.0";
      
      const totalSets = outSets + midSets + rightSets + backSets;
      const totalAst = s.assists || 0;
      const overallRate = totalSets > 0 ? ((totalAst / totalSets) * 100).toFixed(1) : "0.0";
      
      csvLines.push([
        p.number,
        `"${p.name}"`,
        p.position,
        outSets, outAst, outConv,
        midSets, midAst, midConv,
        rightSets, rightAst, rightConv,
        backSets, backAst, backConv,
        overallRate
      ].join(","));
    });
    
    csvLines.push("");
    csvLines.push("");
    
    // ===== SECTION 5: PASS GRADES =====
    csvLines.push("=== PASS GRADES ===");
    csvLines.push("");
    
    const passHeaders = [
      "#", "Player", "Position",
      "Rec 0", "Rec 1", "Rec 2", "Rec 3", "Total Rec", "Rec Errors",
      "Dig 0", "Dig 1", "Dig 2", "Dig 3", "Total Digs", "Dig Errors"
    ];
    csvLines.push(passHeaders.join(","));
    
    getFilteredPlayers().forEach(p => {
      const s = getStats(p);
      
      const rec0 = s.receive_0 || 0;
      const rec1 = s.receive_1 || 0;
      const rec2 = s.receive_2 || 0;
      const rec3 = s.receive_3 || 0;
      const totalRec = rec0 + rec1 + rec2 + rec3;
      const recErr = s.receiveErrors || 0;
      
      const dig0 = s.dig_0 || 0;
      const dig1 = s.dig_1 || 0;
      const dig2 = s.dig_2 || 0;
      const dig3 = s.dig_3 || 0;
      const totalDig = s.digs || 0;
      const digErr = s.digErrors || 0;
      
      // Only include players with passing stats
      const hasPassStats = totalRec > 0 || totalDig > 0 || recErr > 0 || digErr > 0;
      if (!hasPassStats) return;
      
      csvLines.push([
        p.number,
        `"${p.name}"`,
        p.position,
        rec0, rec1, rec2, rec3, totalRec, recErr,
        dig0, dig1, dig2, dig3, totalDig, digErr
      ].join(","));
    });
    
    // Generate filename
    const opponentName = match?.opponentName?.replace(/\s+/g, '') || "UnknownOpponent";
    const date = match?.timestamp
      ? new Date(match.timestamp).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '')
      : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '');
    
    const safeTeam = selectedTeam.replace(/\s+/g, '');
    const filename = `${safeTeam}_${opponentName}_${date}_detailed.csv`;
    
    const csv = csvLines.join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
 
  const td = {
    border: "1px solid #ccc",
    padding: "6px",
    textAlign: "center",
  };
 
 
 // Add this function to your PlayerStatsPage component
 
const exportMaxPreps = () => {
  // Must select a specific match for MaxPreps export
  const match = matches.find(m => m._id === selectedMatchId);
  if (!match || selectedMatchId === 'all') {
    alert("Please select a specific match to export to MaxPreps format.");
    return;
  }
 
  // Create filename: DateofMatch_OurTeamName_OpponentsTeamName_EventName.txt
  const date = new Date(match.timestamp).toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: '2-digit' 
  }).replace(/\//g, '');
  
  const safeTeamName = selectedTeam.replace(/[^a-zA-Z0-9]/g, '');
  const safeOpponentName = match.opponentName.replace(/[^a-zA-Z0-9]/g, '');
  const safeEventName = (match.eventName || 'RegularSeason').replace(/[^a-zA-Z0-9]/g, '');
  const filename = `MAXPREPS_${date}_${safeTeamName}_${safeOpponentName}_${safeEventName}.txt`;
 
  // MaxPreps Stat Supplier ID (provided by user)
  const maxPrepsId = "0ad661c5-6451-4163-938d-3fc9d76e9b3b";
 
  // Build the file content
  const lines = [];
  
  // First line: 32 character Stat Supplier ID
  lines.push(maxPrepsId);
  
  // Add match information as comments (lines starting with # are ignored by MaxPreps)
  lines.push(`# Match: ${selectedTeam} vs ${match.opponentName}`);
  lines.push(`# Event: ${match.eventName || 'Regular Season'}`);
  lines.push(`# Date: ${new Date(match.timestamp).toLocaleDateString()}`);
  lines.push(`# Location: ${match.location || 'Not specified'}`);
  lines.push("");
  
  /*
   * Field Mappings from your stats to MaxPreps:
   * Jersey → player.number
   * MatchGamesPlayed → stats.gamesPlayed (updated to use actual value)
   * TotalServes → calculated from aces + serve errors
   * ServingAces → stats.aces
   * ServingErrors → stats.serveErrors  
   * ServingPoints → stats.aces (serving points = aces)
   * AttacksAttempts → stats.attacks
   * AttacksKills → stats.kills
   * AttacksErrors → stats.attackErrors
   * ServingReceivedSuccess → estimated (not directly tracked)
   * ServingReceivedErrors → stats.receiveErrors
   * BlocksSolo → stats.blockSolo
   * BlocksAssists → stats.blockAssist
   * BlocksErrors → stats.blockErrors
   * BallHandlingAttempt → 0 (calculated)
   * Assists → stats.assists
   * AssistsErrors → stats.bhes (Ball Handling Errors)
   * Digs → stats.digs
   * digErrors → 0 (not tracked)
   */
  
  // Second line: Field headers (pipe delimited)
  // All supported MaxPreps Girls Volleyball fields
  const headers = [
    "Jersey",
    "MatchGamesPlayed",
    "TotalServes",
    "ServingAces", 
    "ServingErrors",
    "ServingPoints",
    "AttacksAttempts",
    "AttacksKills",
    "AttacksErrors",
    "ServingReceivedSuccess",
    "ServingReceivedErrors",
    "BlocksSolo",
    "BlocksAssists",
    "BlocksErrors",
    "BallHandlingAttempt",
    "Assists",
    "AssistsErrors",
    "Digs",
    "digErrors"
  ];
  lines.push(headers.join("|"));
  
  // Data lines: one per player with stats
  getFilteredPlayers().forEach(player => {
    const stats = getStats(player);
    
    // Include any player who has played in at least one game
    if (stats.gamesPlayed > 0) {
      // Calculate derived stats
      const totalServes = (stats.aces || 0) + (stats.serveErrors || 0); // Minimum serves = aces + errors
      const servingReceivedSuccess = Math.max(0, (stats.receiveErrors || 0) > 0 ? 1 : 0); 
      const ballhandlingattempt = (stats.digs || 0) + (stats.sets || 0) + (stats.receptions || 0); // Basic estimation
      
      const dataRow = [
        player.number.toString(),
        stats.gamesPlayed || 0, // Use actual games played, fallback to 1
        stats.serves || 0,
        stats.aces || 0,
        stats.serveErrors || 0,
        stats.aces || 0, // ServingPoints = ServingAces
        stats.attacks || 0,
        stats.kills || 0,
        stats.attackErrors || 0,
        0, // servingReceiveSucccess Not tracked 
        stats.receiveErrors || 0,
        stats.blockSolo || 0,
        stats.blockAssist || 0,
        stats.blockErrors || 0,
        ballhandlingattempt || 0,
        stats.assists || 0,
        stats.bhes || 0, // AssistsErrors = Ball Handling Errors
        stats.digs || 0,
        stats.digErrors ||0 // digErrors - not tracked
      ];
      
      // Include ALL players with gamesPlayed > 0, regardless of other stats
      lines.push(dataRow.join("|"));
    }
  });
 
  // Create and download file
  const content = lines.join("\n");
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log("MaxPreps export created:", filename);
  console.log("Content preview:", content);
};
const handleSaveInsights = async () => {
    if (!selectedMatchId || !aiInsights) return;
    try {
      await axios.put(
        `${API_URL}/api/matches/${selectedMatchId}/insights`,
        { insights: aiInsights },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert("Insights saved to match record.");
    } catch (err) {
      console.error("Failed to save insights:", err);
      alert("Failed to save insights.");
    }
  };
 
  return (
    <div style={{ padding: '20px', maxWidth: 1000, margin: '0 auto' }}>
      <h2>Player Stats – {selectedTeam}</h2>
 
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <label>Team: </label>
          <select value={selectedTeam} onChange={(e) => handleTeamChange(e.target.value)}>
  {teams.map(team => (
    <option key={team} value={team}>{team}</option>
  ))}
</select>
        </div>
 
         <div>
          <label>Event/Tournament: </label>
          <select value={selectedEventName} onChange={(e) => setSelectedEventName(e.target.value)}>
            <option value="all">All Events</option>
            {matches
  .filter((match, index, self) => 
    index === self.findIndex(m => m.eventName === match.eventName)
  )
  .map(match => (
    <option key={match._id} value={match.eventName}>
      {match.eventName}
    </option>
  ))}
          </select>
        </div>
 
        <div>
          <label>Match: </label>
          <select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)}>
            <option value="all">All Matches</option>
            {matches
              .filter(match => selectedEventName === "all" || match.eventName === selectedEventName)
              .map(match => (
              <option key={match._id} value={match._id}>
                {match.opponentName} – {new Date(match.timestamp).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
 
        <div>
          <label>Position: </label>
          <select value={selectedPosition} onChange={(e) => setSelectedPosition(e.target.value)}>
            <option>All</option>
            <option>OH</option>
            <option>MB</option>
            <option>S</option>
            <option>DS</option>
          </select>
        </div>
 
        <div>
          <label>Players:</label>
          <div style={cardContainerStyle}>
            {players.map((p) => {
              const isSelected = selectedPlayerIds.includes(p._id);
              return (
                <div
                  key={p._id}
                  onClick={() => {
                    setSelectedPlayerIds(prev =>
                      prev.includes(p._id)
                        ? prev.filter(id => id !== p._id)
                        : [...prev, p._id]
                    );
                  }}
                  style={{
                    ...cardStyle,
                    border: isSelected ? '2px solid #007AFF' : '1px solid #ccc',
                    backgroundColor: isSelected ? '#e6f0ff' : '#fff',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 'bold' }}># {p.number}</div>
                  <div style={{ fontWeight: 'bold' }}>{(p.name || '').slice(0, 9)}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{p.position || '–'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {statExplanation && (
        <div
          style={{
            marginBottom: 12,
            padding: "12px 16px",
            backgroundColor: "#e0f7e9",
            border: "2px solid #34C759",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: "600",
            color: "#1c1c1e",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            transition: "all 0.2s ease-in-out",
          }}
        >
          {statExplanation}
        </div>
      )}
 
      {selectedMatchId !== "all" && (() => {
        const match = matches.find(m => m._id === selectedMatchId);
        if (!match?.setScores?.length) return null;
 
        return (
          <div style={{ margin: '20px 0', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif' }}>
            <h4 style={{ marginBottom: 8, fontSize: '18px', fontWeight: 600, color: '#1C1C1E' }}>
              Match Summary
            </h4>
            <div style={{
              display: 'inline-block',
              border: '2px solid #007AFF',
              borderRadius: '12px',
              padding: '16px',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            }}>
              <table style={{ borderCollapse: 'collapse', backgroundColor: '#ffffff', fontSize: '16px', fontWeight: 500, color: '#1C1C1E' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 12px' }}></th>
                    {match.setScores.map((_, i) => (
                      <th key={i} style={{
                        padding: '6px 12px',
                        borderBottom: '2px solid #007AFF',
                        fontWeight: '600',
                        fontSize: '16px',
                      }}>
                        Set {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: '600', padding: '8px 12px', textAlign: 'right' }}>
                      {match.opponentName}
                    </td>
                    {match.setScores.map((set, i) => (
                      <td key={i} style={{
                        textAlign: 'center',
                        padding: '8px 12px',
                        fontWeight: set.opponentScore > set.ourScore ? '600' : '500',
                        color: set.opponentScore > set.ourScore ? '#007AFF' : '#1C1C1E',
                      }}>
                        {set.opponentScore}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600', padding: '8px 12px', textAlign: 'right' }}>
                      {match.teamName}
                    </td>
                    {match.setScores.map((set, i) => (
                      <td key={i} style={{
                        textAlign: 'center',
                        padding: '8px 12px',
                        fontWeight: set.ourScore > set.opponentScore ? '600' : '500',
                        color: set.ourScore > set.opponentScore ? '#007AFF' : '#1C1C1E',
                      }}>
                        {set.ourScore}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
 
      <div style={{ overflowX: 'auto', border: '1px solid #ccc', borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f9f9f9", borderBottom: "2px solid #ccc" }}>
              <th rowSpan="2">#</th>
              <th rowSpan="2">Player</th>
              <th rowSpan="2">GP</th>
              <th colSpan="4">Attacking</th>
              <th>Setting</th>
              <th colSpan="2">Serving</th>
              <th>RE</th>
              <th>Dig</th>
              <th colSpan="3">Blocking</th>
              <th>BHE</th>
              <th>PTS</th>
            </tr>
            <tr style={{ backgroundColor: "#f9f9f9", cursor: "pointer" }}>
              {["K", "E", "TA", "PCT.", "A", "SA", "SE", "RE", "DIG", "BS", "BA", "BE", "BHE", "PTS"].map((abbr) => (
                <th key={abbr} onClick={() => setStatExplanation(statExplanations[abbr] || "")}>
                  {abbr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {getFilteredPlayers().map((p) => {
              const s = getStats(p);
              const kills = s.kills || 0;
              const errors = s.attackErrors || 0;
              const ta = s.attacks || 0;
              const pct = ta > 0 ? ((kills - errors) / ta).toFixed(2) : "-";
              const pts = kills + (s.aces || 0) + (s.blockSolo || 0) + 0.5 * (s.blockAssist || 0);
 
              return (
                <tr key={p._id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{p.number}</td>
                  <td style={td}>{p.name}</td>
                  <td style={td} onClick={() => setStatExplanation(statExplanations["GP"] || "")} style={{...td, cursor: "pointer"}}>
                    {s.gamesPlayed || 0}
                  </td>
                  <td style={td}>{kills}</td>
                  <td style={td}>{errors}</td>
                  <td style={td}>{ta}</td>
                  <td style={td}>{pct}</td>
                  <td style={td}>{s.assists || 0}</td>
                  <td style={td}>{s.aces || 0}</td>
                  <td style={td}>{s.serveErrors || 0}</td>
                  <td style={td}>{s.receiveErrors || 0}</td>
                  <td style={td}>{s.digs || 0}</td>
                  <td style={td}>{s.blockSolo || 0}</td>
                  <td style={td}>{s.blockAssist || 0}</td>
                  <td style={td}>{s.blockErrors || 0}</td>
                  <td style={td}>{s.bhes || 0}</td>
                  <td style={td}>{pts.toFixed(1)}</td>
                </tr>
              );
            })}
            {(() => {
              const totals = getTeamTotals();
              const ta = totals.attacks;
              const pct = ta > 0 ? ((totals.kills - totals.attackErrors) / ta).toFixed(2) : "-";
 
              return (
                <tr style={{ backgroundColor: "#f0f8ff", fontWeight: "bold" }}>
                  <td style={td}>–</td>
                  <td style={td}>Team Totals</td>
                  <td style={td}>{totals.gamesPlayed}</td>
                  <td style={td}>{totals.kills}</td>
                  <td style={td}>{totals.attackErrors}</td>
                  <td style={td}>{totals.attacks}</td>
                  <td style={td}>{pct}</td>
                  <td style={td}>{totals.assists}</td>
                  <td style={td}>{totals.aces}</td>
                  <td style={td}>{totals.serveErrors}</td>
                  <td style={td}>{totals.receiveErrors}</td>
                  <td style={td}>{totals.digs}</td>
                  <td style={td}>{totals.blockSolo}</td>
                  <td style={td}>{totals.blockAssist}</td>
                  <td style={td}>{totals.blockErrors}</td>
                  <td style={td}>{totals.bhes}</td>
                  <td style={td}>{totals.points.toFixed(1)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
 
{hasAnyPassGrades && (
  <div style={{ marginTop: 24 }}>
    <h3
      style={{
        marginBottom: 8,
        fontSize: 18,
        fontWeight: 600,
        color: "#1C1C1E",
      }}
    >
      Pass Grading
    </h3>
 
    <p
      style={{
        marginTop: 0,
        marginBottom: 8,
        fontSize: 13,
        color: "#4B5563",
      }}
    >
      Shows the distribution and average grade for{" "}
      <strong>digs</strong> and <strong>serve receive</strong>, using
      your in-match pass grading (0–3, where 0 = error).
    </p>
 
    {/* View toggle */}
    <div
      style={{
        display: "inline-flex",
        borderRadius: 999,
        border: "1px solid #D1D5DB",
        padding: 2,
        marginBottom: 10,
        backgroundColor: "#F9FAFB",
      }}
    >
      <button
        type="button"
        onClick={() => setPassViewMode("table")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            passViewMode === "table" ? "#111827" : "transparent",
          color: passViewMode === "table" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => setPassViewMode("graph")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            passViewMode === "graph" ? "#111827" : "transparent",
          color: passViewMode === "graph" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Graphs
      </button>
    </div>
 
    {/* TABLE VIEW */}
    {passViewMode === "table" && (
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                backgroundColor: "#f9f9f9",
                borderBottom: "2px solid #ccc",
              }}
            >
              <th rowSpan="2" style={td}>
                #
              </th>
              <th rowSpan="2" style={td}>
                Player
              </th>
 
              <th colSpan="5" style={td}>
                Digs (graded)
              </th>
              <th colSpan="5" style={td}>
                Serve Receive (graded)
              </th>
            </tr>
 
            <tr style={{ backgroundColor: "#f9f9f9" }}>
              {/* Digs */}
              <th style={td}>0</th>
              <th style={td}>1</th>
              <th style={td}>2</th>
              <th style={td}>3</th>
              <th style={td}>Avg</th>
 
              {/* Serve Receive */}
              <th style={td}>0</th>
              <th style={td}>1</th>
              <th style={td}>2</th>
              <th style={td}>3</th>
              <th style={td}>Avg</th>
            </tr>
          </thead>
 
          <tbody>
            {getFilteredPlayersWithStats().map((p) => {
              const g = getPassGradingForPlayer(p);
              return (
                <tr key={p._id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{p.number}</td>
                  <td style={{ ...td, textAlign: "left" }}>{p.name}</td>
 
                  {/* DIGS 0–3 + AVG */}
                  <td style={td}>{g.digErrors}</td>
                  <td style={td}>{g.dig1}</td>
                  <td style={td}>{g.dig2}</td>
                  <td style={td}>{g.dig3}</td>
                  <td style={td}>{g.digAvg}</td>
 
                  {/* RECEIVE 0–3 + AVG */}
                  <td style={td}>{g.receiveErrors}</td>
                  <td style={td}>{g.rec1}</td>
                  <td style={td}>{g.rec2}</td>
                  <td style={td}>{g.rec3}</td>
                  <td style={td}>{g.recAvg}</td>
                </tr>
              );
            })}
 
            {/* Team totals row */}
            {(() => {
              const totals = getTeamTotals();
 
              const digTotal =
                (totals.digErrors || 0) +
                (totals.dig_1 || 0) +
                (totals.dig_2 || 0) +
                (totals.dig_3 || 0);
 
              const digAvg =
                digTotal > 0
                  ? (
                      (1 * (totals.dig_1 || 0) +
                        2 * (totals.dig_2 || 0) +
                        3 * (totals.dig_3 || 0)) /
                      digTotal
                    ).toFixed(2)
                  : "-";
 
              const recTotal =
                (totals.receiveErrors || 0) +
                (totals.receive_1 || 0) +
                (totals.receive_2 || 0) +
                (totals.receive_3 || 0);
 
              const recAvg =
                recTotal > 0
                  ? (
                      (1 * (totals.receive_1 || 0) +
                        2 * (totals.receive_2 || 0) +
                        3 * (totals.receive_3 || 0)) /
                      recTotal
                    ).toFixed(2)
                  : "-";
 
              return (
                <tr
                  style={{ backgroundColor: "#f0f8ff", fontWeight: "bold" }}
                >
                  <td style={td}>–</td>
                  <td style={td}>Team Totals</td>
 
                  {/* DIGS 0–3 */}
                  <td style={td}>{totals.digErrors}</td>
                  <td style={td}>{totals.dig_1}</td>
                  <td style={td}>{totals.dig_2}</td>
                  <td style={td}>{totals.dig_3}</td>
                  <td style={td}>{digAvg}</td>
 
                  {/* RECEIVE 0–3 */}
                  <td style={td}>{totals.receiveErrors}</td>
                  <td style={td}>{totals.receive_1}</td>
                  <td style={td}>{totals.receive_2}</td>
                  <td style={td}>{totals.receive_3}</td>
                  <td style={td}>{recAvg}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    )}
 
    {/* GRAPH VIEW */}
 {passViewMode === "graph" && (
  <div style={{ marginTop: 8 }}>
    {getFilteredPlayersWithStats().map((p) => {
      const g = getPassGradingForPlayer(p);
 
      const digTotal =
        (g.digErrors || 0) + (g.dig1 || 0) + (g.dig2 || 0) + (g.dig3 || 0);
      const recTotal =
        (g.receiveErrors || 0) +
        (g.rec1 || 0) +
        (g.rec2 || 0) +
        (g.rec3 || 0);
 
      const renderRow = (label, counts, total, avg) => {
        const [c0, c1, c2, c3] = counts;
 
        const makeSeg = (count, text, color) => {
          if (!total || !count) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={text}
              style={{
                flex: count,
                minWidth: `${Math.max(pct, 6)}%`,
                backgroundColor: color,
                color: "#FFFFFF",
                fontSize: 10,
                textAlign: "center",
                padding: "2px 0",
              }}
            >
              {text}
            </div>
          );
        };
 
        return (
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                fontSize: 11,
                color: "#4B5563",
                marginBottom: 2,
              }}
            >
              {label}{" "}
              {total
                ? `(${total} touches, avg ${avg})`
                : "(no graded touches)"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 2,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: "#E5E7EB",
              }}
            >
              {makeSeg(c0, "0", "#DC2626")}
              {makeSeg(c1, "1", "#F97316")}
              {makeSeg(c2, "2", "#FACC15")}
              {makeSeg(c3, "3", "#16A34A")}
            </div>
          </div>
        );
      };
 
      return (
        <div
          key={p._id}
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            backgroundColor: "#F9FAFB",
            border: "1px solid #E5E7EB",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            <span>
              #{p.number} {p.name}
            </span>
            <span style={{ fontSize: 12, color: "#6B7280" }}>
              D Avg: {g.digAvg} &nbsp;•&nbsp; R Avg: {g.recAvg}
            </span>
          </div>
 
          {renderRow(
            "Digs",
            [g.digErrors || 0, g.dig1 || 0, g.dig2 || 0, g.dig3 || 0],
            digTotal,
            g.digAvg
          )}
 
          {renderRow(
            "Serve Receive",
            [
              g.receiveErrors || 0,
              g.rec1 || 0,
              g.rec2 || 0,
              g.rec3 || 0,
            ],
            recTotal,
            g.recAvg
          )}
        </div>
      );
    })}
  </div>
)}
 
  </div>
)}
 
{/* ATTACK STATS SECTION */}
{hasAnyAttackStats && (
  <div style={{ marginTop: 30 }}>
    <h3
      style={{
        marginTop: 20,
        marginBottom: 8,
        fontSize: 18,
        fontWeight: 600,
        color: "#1C1C1E",
      }}
    >
      Attack Analysis
    </h3>
 
    <p
      style={{
        marginTop: 0,
        marginBottom: 8,
        fontSize: 13,
        color: "#4B5563",
      }}
    >
      Shows attack distribution by type (<strong>Hit</strong>, <strong>Tip</strong>, <strong>Roll</strong>, <strong>Dump</strong>) 
      with kills, errors, and hitting percentages for each type.
    </p>
 
    {/* View toggle */}
    <div
      style={{
        display: "inline-flex",
        borderRadius: 999,
        border: "1px solid #D1D5DB",
        padding: 2,
        marginBottom: 10,
        backgroundColor: "#F9FAFB",
      }}
    >
      <button
        type="button"
        onClick={() => setAttackViewMode("table")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            attackViewMode === "table" ? "#111827" : "transparent",
          color: attackViewMode === "table" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => setAttackViewMode("graph")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            attackViewMode === "graph" ? "#111827" : "transparent",
          color: attackViewMode === "graph" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Graphs
      </button>
    </div>
 
    {/* TABLE VIEW */}
    {attackViewMode === "table" && (
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                backgroundColor: "#f9f9f9",
                borderBottom: "2px solid #ccc",
              }}
            >
              <th rowSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                #
              </th>
              <th rowSpan="2" style={{ padding: 8, textAlign: "left", borderRight: "1px solid #eee" }}>
                Player
              </th>
 
              <th colSpan="4" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Hit
              </th>
              <th colSpan="4" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Tip
              </th>
              <th colSpan="4" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Roll
              </th>
              <th colSpan="4" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Dump
              </th>
              <th rowSpan="2" style={{ padding: 8, textAlign: "center" }}>
                Overall %
              </th>
            </tr>
 
            <tr style={{ backgroundColor: "#f9f9f9" }}>
              {/* Hit */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Att</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>K</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>E</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>
 
              {/* Tip */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Att</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>K</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>E</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>
 
              {/* Roll */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Att</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>K</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>E</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>
 
              {/* Dump */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Att</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>K</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>E</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>
            </tr>
          </thead>
 
          <tbody>
            {getFilteredPlayersWithStats().map((p) => {
              const a = getAttackStatsForPlayer(p);
              if (a.totalAttacks === 0) return null; // Skip players with no attacks
 
              return (
                <tr key={p._id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{p.number}</td>
                  <td style={{ padding: 8, textAlign: "left", borderRight: "1px solid #eee" }}>{p.name}</td>
 
                  {/* HIT */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.attackHit}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.killHit}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.errorHit}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.hitPct}%</td>
 
                  {/* TIP */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.attackTip}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.killTip}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.errorTip}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.tipPct}%</td>
 
                  {/* ROLL */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.attackRoll}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.killRoll}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.errorRoll}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.rollPct}%</td>
 
                  {/* DUMP */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.attackDump}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.killDump}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.errorDump}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.dumpPct}%</td>
 
                  {/* OVERALL */}
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 700, backgroundColor: "#f0f8ff" }}>
                    {a.overallPct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
 
    {/* GRAPH VIEW */}
    {attackViewMode === "graph" && (
      <div style={{ marginTop: 8 }}>
        {getFilteredPlayersWithStats().map((p) => {
          const a = getAttackStatsForPlayer(p);
          if (a.totalAttacks === 0) return null;
 
          const renderAttackBar = (label, attempts, kills, errors, pct) => {
            if (!attempts) return null;
 
            const killPercent = (kills / attempts) * 100;
            const errorPercent = (errors / attempts) * 100;
            const zeroPercent = 100 - killPercent - errorPercent;
 
            return (
              <div style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#4B5563",
                    marginBottom: 2,
                  }}
                >
                  {label} ({attempts} attempts, {pct}% efficiency)
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    borderRadius: 4,
                    overflow: "hidden",
                    backgroundColor: "#E5E7EB",
                    height: 24,
                  }}
                >
                  {kills > 0 && (
                    <div
                      style={{
                        width: `${killPercent}%`,
                        backgroundColor: "#16A34A",
                        color: "#FFFFFF",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      K: {kills}
                    </div>
                  )}
                  {errors > 0 && (
                    <div
                      style={{
                        width: `${errorPercent}%`,
                        backgroundColor: "#DC2626",
                        color: "#FFFFFF",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      E: {errors}
                    </div>
                  )}
                  {zeroPercent > 0 && (
                    <div
                      style={{
                        width: `${zeroPercent}%`,
                        backgroundColor: "#FACC15",
                        color: "#111827",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      In Play
                    </div>
                  )}
                </div>
              </div>
            );
          };
 
          return (
            <div
              key={p._id}
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span style={{ fontSize: 12, color: "#6B7280" }}>
                  Overall: {a.totalKills}/{a.totalAttacks} ({a.overallPct}%)
                </span>
              </div>
 
              {renderAttackBar("Hit", a.attackHit, a.killHit, a.errorHit, a.hitPct)}
              {renderAttackBar("Tip", a.attackTip, a.killTip, a.errorTip, a.tipPct)}
              {renderAttackBar("Roll", a.attackRoll, a.killRoll, a.errorRoll, a.rollPct)}
              {renderAttackBar("Dump", a.attackDump, a.killDump, a.errorDump, a.dumpPct)}
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
 
{/* SET STATS SECTION */}
{hasAnySetStats && (
  <div style={{ marginTop: 30 }}>
    <h3
      style={{
        marginTop: 20,
        marginBottom: 8,
        fontSize: 18,
        fontWeight: 600,
        color: "#1C1C1E",
      }}
    >
      Set Distribution
    </h3>
 
    <p
      style={{
        marginTop: 0,
        marginBottom: 8,
        fontSize: 13,
        color: "#4B5563",
      }}
    >
      Shows set distribution by zone (<strong>Outside</strong>, <strong>Middle</strong>, 
      <strong>Rightside</strong>, <strong>Backrow</strong>) with assists and error rates.
    </p>
 
    {/* View toggle */}
    <div
      style={{
        display: "inline-flex",
        borderRadius: 999,
        border: "1px solid #D1D5DB",
        padding: 2,
        marginBottom: 10,
        backgroundColor: "#F9FAFB",
      }}
    >
      <button
        type="button"
        onClick={() => setSetViewMode("table")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            setViewMode === "table" ? "#111827" : "transparent",
          color: setViewMode === "table" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => setSetViewMode("graph")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            setViewMode === "graph" ? "#111827" : "transparent",
          color: setViewMode === "graph" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Graphs
      </button>
    </div>
 
    {/* TABLE VIEW */}
    {setViewMode === "table" && (
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                backgroundColor: "#f9f9f9",
                borderBottom: "2px solid #ccc",
              }}
            >
              <th rowSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                #
              </th>
              <th rowSpan="2" style={{ padding: 8, textAlign: "left", borderRight: "1px solid #eee" }}>
                Player
              </th>
 
              <th colSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Outside
              </th>
              <th colSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Middle
              </th>
              <th colSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Rightside
              </th>
              <th colSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Backrow
              </th>
              <th rowSpan="2" style={{ padding: 8, textAlign: "center" }}>
                Assist %
              </th>
            </tr>
 
            <tr style={{ backgroundColor: "#f9f9f9" }}>
              {/* Outside */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>Err</th>
 
              {/* Middle */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>Err</th>
 
              {/* Rightside */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>Err</th>
 
              {/* Backrow */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>Err</th>
            </tr>
          </thead>
 
          <tbody>
            {getFilteredPlayersWithStats().map((p) => {
              const s = getSetStatsForPlayer(p);
              if (s.totalSets === 0) return null; // Skip players with no sets
 
              return (
                <tr key={p._id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{p.number}</td>
                  <td style={{ padding: 8, textAlign: "left", borderRight: "1px solid #eee" }}>{p.name}</td>
 
                  {/* OUTSIDE */}
                  <td style={{ padding: 8, textAlign: "center" }}>{s.setOutside}</td>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{s.setOutsideErr}</td>
 
                  {/* MIDDLE */}
                  <td style={{ padding: 8, textAlign: "center" }}>{s.setMiddle}</td>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{s.setMiddleErr}</td>
 
                  {/* RIGHTSIDE */}
                  <td style={{ padding: 8, textAlign: "center" }}>{s.setRightside}</td>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{s.setRightsideErr}</td>
 
                  {/* BACKROW */}
                  <td style={{ padding: 8, textAlign: "center" }}>{s.setBackrow}</td>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{s.setBackrowErr}</td>
 
                  {/* ASSIST % */}
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 700, backgroundColor: "#f0f8ff" }}>
                    {s.overallAssistRate}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
 
    {/* GRAPH VIEW */}
    {setViewMode === "graph" && (
      <div style={{ marginTop: 8 }}>
        {getFilteredPlayersWithStats().map((p) => {
          const s = getSetStatsForPlayer(p);
          if (s.totalSets === 0) return null;
 
          const renderSetBar = (label, sets, errors, errRate) => {
            if (!sets) return null;
 
            const goodPercent = ((sets - errors) / sets) * 100;
            const errorPercent = (errors / sets) * 100;
 
            return (
              <div style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#4B5563",
                    marginBottom: 2,
                  }}
                >
                  {label} ({sets} sets, {errRate}% error rate)
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    borderRadius: 4,
                    overflow: "hidden",
                    backgroundColor: "#E5E7EB",
                    height: 24,
                  }}
                >
                  {goodPercent > 0 && (
                    <div
                      style={{
                        width: `${goodPercent}%`,
                        backgroundColor: "#16A34A",
                        color: "#FFFFFF",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      Good: {sets - errors}
                    </div>
                  )}
                  {errors > 0 && (
                    <div
                      style={{
                        width: `${errorPercent}%`,
                        backgroundColor: "#DC2626",
                        color: "#FFFFFF",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      Err: {errors}
                    </div>
                  )}
                </div>
              </div>
            );
          };
 
          return (
            <div
              key={p._id}
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span style={{ fontSize: 12, color: "#6B7280" }}>
                  {s.totalAssists}/{s.totalSets} Assists ({s.overallAssistRate}%)
                </span>
              </div>
 
              {renderSetBar("Outside", s.setOutside, s.setOutsideErr, s.outsideErrRate)}
              {renderSetBar("Middle", s.setMiddle, s.setMiddleErr, s.middleErrRate)}
              {renderSetBar("Rightside", s.setRightside, s.setRightsideErr, s.rightsideErrRate)}
              {renderSetBar("Backrow", s.setBackrow, s.setBackrowErr, s.backrowErrRate)}
            </div>
          );
        })}
      </div>
    )}
  </div>
)}

{/* ASSIST STATS SECTION */}
{hasAnyAssistStats && (
  <div style={{ marginTop: 30 }}>
    <h3
      style={{
        marginTop: 20,
        marginBottom: 8,
        fontSize: 18,
        fontWeight: 600,
        color: "#1C1C1E",
      }}
    >
      Assists by Target
    </h3>

    <p
      style={{
        marginTop: 0,
        marginBottom: 8,
        fontSize: 13,
        color: "#4B5563",
      }}
    >
      Shows assist distribution by target zone (<strong>Outside</strong>, <strong>Middle</strong>, 
      <strong>Rightside</strong>, <strong>Backrow</strong>) with assist rates for each zone.
    </p>

    {/* View toggle */}
    <div
      style={{
        display: "inline-flex",
        borderRadius: 999,
        border: "1px solid #D1D5DB",
        padding: 2,
        marginBottom: 10,
        backgroundColor: "#F9FAFB",
      }}
    >
      <button
        type="button"
        onClick={() => setAssistViewMode("table")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            assistViewMode === "table" ? "#111827" : "transparent",
          color: assistViewMode === "table" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => setAssistViewMode("graph")}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          backgroundColor:
            assistViewMode === "graph" ? "#111827" : "transparent",
          color: assistViewMode === "graph" ? "#FFFFFF" : "#4B5563",
          transition: "background-color 0.15s ease",
        }}
      >
        Graphs
      </button>
    </div>

    {/* TABLE VIEW */}
    {assistViewMode === "table" && (
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                backgroundColor: "#f9f9f9",
                borderBottom: "2px solid #ccc",
              }}
            >
              <th rowSpan="2" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                #
              </th>
              <th rowSpan="2" style={{ padding: 8, textAlign: "left", borderRight: "1px solid #eee" }}>
                Player
              </th>

              <th colSpan="3" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Outside
              </th>
              <th colSpan="3" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Middle
              </th>
              <th colSpan="3" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Rightside
              </th>
              <th colSpan="3" style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>
                Backrow
              </th>
              <th rowSpan="2" style={{ padding: 8, textAlign: "center" }}>
                Overall Ast%
              </th>
            </tr>

            <tr style={{ backgroundColor: "#f9f9f9" }}>
              {/* Outside */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Ast</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>

              {/* Middle */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Ast</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>

              {/* Rightside */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Ast</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>

              {/* Backrow */}
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Sets</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11 }}>Ast</th>
              <th style={{ padding: 8, textAlign: "center", fontSize: 11, borderRight: "1px solid #eee" }}>%</th>
            </tr>
          </thead>

          <tbody>
            {getFilteredPlayersWithStats().map((p) => {
              const a = getAssistStatsForPlayer(p);
              if (a.totalAssists === 0) return null;

              return (
                <tr key={p._id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8, textAlign: "center", borderRight: "1px solid #eee" }}>{p.number}</td>
                  <td style={{ padding: 8, textAlign: "left", borderRight: "1px solid #eee" }}>{p.name}</td>

                  {/* OUTSIDE */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.setOutside}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.assistOutside}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.outsideAssistRate}%</td>

                  {/* MIDDLE */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.setMiddle}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.assistMiddle}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.middleAssistRate}%</td>

                  {/* RIGHTSIDE */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.setRightside}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.assistRightside}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.rightsideAssistRate}%</td>

                  {/* BACKROW */}
                  <td style={{ padding: 8, textAlign: "center" }}>{a.setBackrow}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>{a.assistBackrow}</td>
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 600, borderRight: "1px solid #eee" }}>{a.backrowAssistRate}%</td>

                  {/* OVERALL */}
                  <td style={{ padding: 8, textAlign: "center", fontWeight: 700, backgroundColor: "#f0f8ff" }}>
                    {a.overallAssistRate}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {/* GRAPH VIEW */}
    {assistViewMode === "graph" && (
      <div style={{ marginTop: 8 }}>
        {getFilteredPlayersWithStats().map((p) => {
          const a = getAssistStatsForPlayer(p);
          if (a.totalAssists === 0) return null;

          const renderAssistBar = (label, sets, assists, assistRate) => {
            if (!sets) return null;

            const assistPercent = (assists / sets) * 100;
            const noAssistPercent = 100 - assistPercent;

            return (
              <div style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#4B5563",
                    marginBottom: 2,
                  }}
                >
                  {label} ({assists}/{sets} assists, {assistRate}% rate)
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    borderRadius: 4,
                    overflow: "hidden",
                    backgroundColor: "#E5E7EB",
                    height: 24,
                  }}
                >
                  {assistPercent > 0 && (
                    <div
                      style={{
                        width: `${assistPercent}%`,
                        backgroundColor: "#16A34A",
                        color: "#FFFFFF",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      Assist: {assists}
                    </div>
                  )}
                  {noAssistPercent > 0 && (
                    <div
                      style={{
                        width: `${noAssistPercent}%`,
                        backgroundColor: "#9CA3AF",
                        color: "#FFFFFF",
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      No Ast: {sets - assists}
                    </div>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div
              key={p._id}
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span style={{ fontSize: 12, color: "#6B7280" }}>
                  {a.totalAssists}/{a.totalSets} Assists ({a.overallAssistRate}%)
                </span>
              </div>

              {renderAssistBar("Outside", a.setOutside, a.assistOutside, a.outsideAssistRate)}
              {renderAssistBar("Middle", a.setMiddle, a.assistMiddle, a.middleAssistRate)}
              {renderAssistBar("Rightside", a.setRightside, a.assistRightside, a.rightsideAssistRate)}
              {renderAssistBar("Backrow", a.setBackrow, a.assistBackrow, a.backrowAssistRate)}
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
 
<div
  style={{
    marginTop: 20,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  }}
>
        <button
    onClick={handleExportPDF}
    style={{ marginRight: 12, padding: "8px 16px", background: "#007AFF", color: "white", border: "none", borderRadius: 6 }}
  >
    {hasPremium ? "Export Premium PDF" : "Export PDF"}
  </button>
        <button onClick={exportCSV} style={{ marginRight: 12, padding: "8px 16px", background: "#34C759", color: "white", border: "none", borderRadius: 6 }}>Export CSV</button>
         <button onClick={exportMaxPreps} style={{ marginRight: 12, padding: "8px 16px", background: "#FF6B35", color: "white", border: "none", borderRadius: 6 }}>Export MaxPreps</button>
        <button onClick={handlePurgeStats} style={{marginRight: 12, padding: "8px 16px", background: "#FF3B30", color: "white", border: "none", borderRadius: 6 }}>Purge All Team Stats</button>
</div>
<div
  style={{
    marginTop: 20,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  }}
>		
  {!hasPremium && (
      <AdCourtBottom />
  )}		
		
 {!aiInsights && !isAnalyzing && (
          <><label htmlFor="tone-select" style={{ fontWeight: 800 }}>AI INSIGHTS GENERATION - </label> 
		  
            <label htmlFor="tone-select" style={{ fontWeight: 600 }}>Tone:</label>
            <select
              id="tone-select"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              style={{ marginRight: 12, padding: '6px 10px', borderRadius: 6 }}
            >
              {toneOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button
              onClick={handleAnalyzeMatchLog}
              style={{ marginRight: 12, padding: '8px 16px', background: '#5E5CE6', color: 'white', border: 'none', borderRadius: 6 }}
            >
              Get Insights
            </button>
          </>
        )}
 
        {isAnalyzing && (
          <button disabled style={{ padding: '8px 16px', background: '#ccc', borderRadius: 6 }}>
            Generating insights...
          </button>
        )}
 
        { aiInsights && !isAnalyzing && (
          <>
            <button
              onClick={() => setAiInsights("")}
              style={{ marginRight: 12, padding: '8px 16px', background: '#ccc', color: '#111', border: 'none', borderRadius: 6 }}
            >
              Clear Insights
            </button>
            <button
              onClick={handleSaveInsights}
              style={{ marginRight: 12, padding: '8px 16px', background: '#007AFF', color: 'white', border: 'none', borderRadius: 6 }}
            >
              Save Insights
            </button>
          </>
        )}
      </div>
 
      { aiInsights && (
        <div
          style={{
            marginTop: 20,
            backgroundColor: "#f5f5f7",
            border: "2px solid #5E5CE6",
            padding: "16px",
            borderRadius: "12px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
            color: "#1C1C1E",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          }}
        >
          <div>
            {formatAiInsightsAsNarrative(aiInsights)}
          </div>
        </div>
      )}
    </div>
  );
};
 
export default PlayerStatsPage;