// App.js
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import axios from "axios";
import VolleyballCourt from "./components/VolleyballCourt";
import Scoreboard from "./components/Scoreboard";
import SettingsPanel from "./components/SettingsPanel";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import Login from "./components/Login";
import Register from "./components/Register";
import Profile from "./components/Profile";
import { AuthProvider, useAuth } from "./components/AuthContext";

const isMobile = typeof window !== "undefined" && window.innerWidth < 480;
const backend = isMobile ? TouchBackend : HTML5Backend;
const navLinkStyle = {
  fontSize: "18px",
  textDecoration: "none",
  color: "#007AFF",
  fontWeight: "600",
  padding: "10px",
};

function PrivateRoute({ children }) {
  const { token, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div>Loading...</div>;
  }

  return token ? children : <Navigate to="/login" />;
}

function App() {
  const [players, setPlayers] = useState([]);
  const [courtPlayers, setCourtPlayers] = useState(
    Array.from({ length: 6 }, () => ({ name: "?" }))
  );

  const [ourScore, setOurScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [serveSide, setServeSide] = useState("our");
  const [benchPlayers, setBenchPlayers] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(() => {
    return localStorage.getItem("selectedTeam") || "";
  });

  useEffect(() => {
    if (selectedTeam) {
      localStorage.setItem("selectedTeam", selectedTeam);
    }
  }, [selectedTeam]);

  const [matchSettings, setMatchSettings] = useState({
    teamName: "Our Team",
    opponentName: "Opponent",
    eventName: "",
    location: "",
    maxSets: 3,
    pointsNonDeciding: 25,
    pointsDeciding: 15,
    currentSet: 1,
    totalSets: 3,
  });

  const [ourSetsWon, setOurSetsWon] = useState(0);
  const [opponentSetsWon, setOpponentSetsWon] = useState(0);
  const [comments, setComments] = useState([]);

  const getAllPlayers = async () => {
    try {
      const response = await axios.get("/api/players");
      setPlayers(
        response.data.filter(
          (p) => !p.isOnCourt && p.team === matchSettings.teamName
        )
      );
    } catch (error) {
      console.error("Failed to fetch players:", error.message);
    }
  };


  
  const handlePlayerUpdate = async (playerId, updatedFields) => {
    try {
      console.log(`Updating player ${playerId} with:`, updatedFields);

      const response = await axios.put(
        `${process.env.REACT_APP_API_URL || "http://localhost:3000"}/api/players/${playerId}`,
        updatedFields
      );

      console.log("Player updated successfully:", response.data);

      setBenchPlayers((prevPlayers) =>
        prevPlayers.map((player) =>
          player._id === playerId ? { ...player, ...updatedFields } : player
        )
      );

      setCourtPlayers((prevCourtPlayers) =>
        prevCourtPlayers.map((player) =>
          player._id === playerId ? { ...player, ...updatedFields } : player
        )
      );

    } catch (error) {
      console.error("Error updating player:", error.response?.data || error.message);
    }
  };
  const handlePlayerDelete = async (playerId) => {
    try {
      await axios.delete(`/api/players/${playerId}`);
      await getAllPlayers();
    } catch (error) {
      console.error("Error deleting player:", error.message);
    }
  };

  const onResetBench = async () => {
    try {
      await axios.delete("/api/players", {
        params: { team: matchSettings.teamName },
      });
      setPlayers([]);
      console.log("Roster reset for team:", matchSettings.teamName);
    } catch (error) {
      console.error("Failed to reset roster:", error.message);
    }
  };

  const handlePlayerCreate = async (playerData) => {
    try {
      console.log("Creating player with data:", playerData);

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL || "http://localhost:3000"}/api/players`,
        playerData
      );

      console.log("Player created successfully:", response.data);

      setBenchPlayers((prevPlayers) => [...prevPlayers, response.data]);

    } catch (error) {
      console.error("Error creating player:", error.response?.data || error.message);
    }
  };

  const addPlayerToCourt = async (player) => {
    try {
      console.log("Adding player to court:", player);

      await axios.put(`/api/players/${player._id}`, { isOnCourt: true });

      setCourtPlayers((prev) => {
        const newCourt = [...prev];
        const index = newCourt.findIndex((p) => p.name === "?" && p.number === "?");
        if (index !== -1) {
          newCourt[index] = player;
        }
        return newCourt;
      });

      setBenchPlayers((prev) => prev.filter((p) => p._id !== player._id));

    } catch (error) {
      console.error("Error adding player to court:", error.message);
    }
  };

  const onServeError = () => {
    if (serveSide === "our") {
      setOpponentScore((prev) => prev + 1);
      setServeSide("opponent");
    } else {
      setOurScore((prev) => prev + 1);
      setServeSide("our");
    }
  };

  const onOurPoint = () => {
    setOurScore((prev) => prev + 1);
  };

  const onOpponentPoint = () => {
    setOpponentScore((prev) => prev + 1);
  };

  const onAddPoint = (team, amount) => {
    if (team === "our") {
      setOurScore((prev) => prev + amount);
    } else {
      setOpponentScore((prev) => prev + amount);
    }
  };

  const onRemovePoint = (team, amount) => {
    if (team === "our") {
      setOurScore((prev) => Math.max(0, prev - amount));
    } else {
      setOpponentScore((prev) => Math.max(0, prev - amount));
    }
  };

  const clearCourt = async () => {
    try {
      console.log("Clearing the court for team:", selectedTeam);

      if (!matchSettings.teamName) {
        console.error("No team selected, cannot clear court.");
        return;
      }

      // Send a single request to update all players for this team
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL || "http://localhost:3000"}/api/players/clear-court`,
        { team: matchSettings.teamName } // Send team name to the backend
      );

      console.log("Court cleared successfully:", response.data);

      // Reset the court
      setCourtPlayers(Array.from({ length: 6 }, () => ({ name: "?" })));
      setBenchPlayers(response.data);
	   updatePlayersOnCourt(Array(6).fill({ name: "?", number: "?" })); // Reset Court


    } catch (error) {
      console.error("Error clearing court:", error);
    }
  };

  // Recall roster for current team from backend
  const onRecallBench = async (team) => {
    if (!team) {
      console.error("No team name provided!");
      alert("Cannot recall roster without a team name.");
      return;
    }

    try {
      console.log("Fetching roster for team:", team);
      const response = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3000"}/api/players/bench/recall`, {
        params: { team },
        withCredentials: true
      });

      console.log("Roster received:", response.data);
      setBenchPlayers((prevPlayers) => {
        const newPlayers = response.data.filter(
          (newPlayer) => !prevPlayers.some((p) => p._id === newPlayer._id)
        );
        return [...prevPlayers, ...newPlayers];
      });
    } catch (error) {
      console.error("Error recalling roster:", error.response?.data || error.message);
    }
  };

  // Monitor set win conditions (simplified)
  useEffect(() => {
    const requiredPoints =
      matchSettings.currentSet === matchSettings.totalSets
        ? matchSettings.pointsDeciding
        : matchSettings.pointsNonDeciding;

    if (
      (ourScore >= requiredPoints || opponentScore >= requiredPoints) &&
      Math.abs(ourScore - opponentScore) >= 2
    ) {
      const winningTeam = ourScore > opponentScore ? "our" : "opponent";
      const winningTeamName =
        winningTeam === "our" ? matchSettings.teamName : matchSettings.opponentName;
      if (
        window.confirm(
          `${winningTeamName} wins the set. Clear court for the next set?`
        )
      ) {
        if (winningTeam === "our") {
          setOurSetsWon((prev) => prev + 1);
        } else {
          setOpponentSetsWon((prev) => prev + 1);
        }
        clearCourt();
        setOurScore(0);
        setOpponentScore(0);
        setMatchSettings((prev) => ({
          ...prev,
          currentSet: prev.currentSet + 1,
        }));
      }
    }
  }, [ourScore, opponentScore, matchSettings]);

  useEffect(() => {
    const setsToWin = matchSettings.maxSets ? Math.ceil(matchSettings.maxSets / 2) : 3;
    if (ourSetsWon >= setsToWin || opponentSetsWon >= setsToWin) {
      alert("Match over!");
    }
  }, [ourSetsWon, opponentSetsWon, matchSettings.maxSets]);

  useEffect(() => {
    getAllPlayers();
  }, []);

  return (
    <AuthProvider>
      <DndProvider backend={backend}>
        <Router>
          <AppContent
            courtPlayers={courtPlayers}
            setCourtPlayers={setCourtPlayers}
            benchPlayers={benchPlayers}
            setBenchPlayers={setBenchPlayers}
            updatePlayersOnCourt={setCourtPlayers}
            serveSide={serveSide}
            opponentName={matchSettings.opponentName}
            onServeError={onServeError}
            onOurPoint={onOurPoint}
            onOpponentPoint={onOpponentPoint}
            ourScore={ourScore}
            opponentScore={opponentScore}
            matchSettings={matchSettings}
            setMatchSettings={setMatchSettings} // Pass setMatchSettings
            onAddPoint={onAddPoint}
            onRemovePoint={onRemovePoint}
            handlePlayerCreate={handlePlayerCreate}
            handlePlayerDelete={handlePlayerDelete}
            handlePlayerUpdate={handlePlayerUpdate}
            onResetBench={onResetBench}
            onRecallBench={onRecallBench}
            selectedTeam={selectedTeam}
            setSelectedTeam={setSelectedTeam}
          />
        </Router>
      </DndProvider>
    </AuthProvider>
  );
}

function AppContent({
  courtPlayers,
  setCourtPlayers,
  benchPlayers,
  setBenchPlayers,
  updatePlayersOnCourt,
  refreshBench,
  serveSide,
  opponentName,
  onServeError,
  onOurPoint,
  onOpponentPoint,
  ourScore,
  opponentScore,
  matchSettings,
  setMatchSettings,
  onAddPoint,
  onRemovePoint,
  handlePlayerCreate,
  handlePlayerDelete,
  handlePlayerUpdate,
  onResetBench,
  onRecallBench,
  selectedTeam,
  setSelectedTeam
}) {
  const location = useLocation();
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

  useEffect(() => {
    const checkOrientation = () => {
      const isNowPortrait = window.matchMedia("(orientation: portrait)").matches;
      setIsPortrait(isNowPortrait);
    };

    const mediaQuery = window.matchMedia("(orientation: portrait)");
    mediaQuery.addEventListener("change", checkOrientation);

    checkOrientation();

    return () => {
      mediaQuery.removeEventListener("change", checkOrientation);
    };
  }, [location.pathname]); // Update on route change
	
	
  return (
    <div>
      {/* Hide header on login page */}
      {location.pathname !== "/login" && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            background: "#fff",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif",
            position: "sticky",
            top: 0,
            zIndex: 1000,
            height: "60px", // Makes it feel more like a native navbar
          }}
        >
          {/* Logo - Larger for Better Visibility */}
          <img
            src={`${process.env.PUBLIC_URL}/favicon-96x96.png`}
            alt="Loggerhead Logo"
            style={{
              height: "60px",
              width: "60px",
              objectFit: "contain",
            }}
          />

          {/* Title - Larger & Centered for iPhone */}
          <h1
            style={{
              fontSize: "30px",
              fontWeight: "bold",
              margin: "0",
              textAlign: "left",
              flexGrow: 1,
            }}
          >
            Loggerhead
          </h1>

          {/* Navigation - Bigger Clickable Area */}
          <nav style={{ display: "flex", gap: "16px" }}>
            <Link to="/" style={navLinkStyle}>🏐 Match</Link>
            <Link to="/settings" style={navLinkStyle}>⚙️ Settings</Link>
            <Link to="/profile" style={navLinkStyle}>👤 Profile</Link>
          </nav>
        </header>
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              {/* Portrait Mode Overlay (Conditionally Rendered) */}
              {location.pathname === "/" && isPortrait && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    backgroundColor: "rgba(0, 0, 0, 0.9)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    fontSize: "3.0rem",
                    textAlign: "center",
                    zIndex: 9999,
                    padding: "20px",
                  }}
                >
                  <p>Please rotate your device.</p>
                  <p>This app is optimized for landscape mode.</p>
                  <p>🔄</p>
                </div>
              )}
              <div>
                <VolleyballCourt
                  courtPlayers={courtPlayers}
                  benchPlayers={benchPlayers}
				   refreshBench={() => getBenchPlayers(matchSettings.teamName)}
                  setBenchPlayers={setBenchPlayers}
                  updatePlayersOnCourt={setCourtPlayers}
                  serveSide={serveSide}
                  opponentName={opponentName}
                  onServeError={onServeError}
                  onOurPoint={onOurPoint}
                  onOpponentPoint={onOpponentPoint}
                  ourScore={ourScore}
                  opponentScore={opponentScore}
                  matchSettings={matchSettings}
                  onAddPoint={onAddPoint}
                  onRemovePoint={onRemovePoint}
                />
              </div>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SettingsPanel
                matchSettings={matchSettings}
                setMatchSettings={setMatchSettings}
                benchPlayers={benchPlayers}
                setBenchPlayers={setBenchPlayers}  // Add this line
                onCreatePlayer={handlePlayerCreate}
                onDeletePlayer={handlePlayerDelete}
                onUpdatePlayer={handlePlayerUpdate}
                onResetBench={onResetBench}
                refreshBench={refreshBench}
                onRecallBench={onRecallBench}
                selectedTeam={selectedTeam}
                setSelectedTeam={setSelectedTeam}
              />
            </PrivateRoute>
          }
        />

      </Routes>
    </div>
  );
}

export default App;