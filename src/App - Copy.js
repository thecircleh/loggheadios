import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { AuthProvider, useAuth } from "./components/AuthContext";
import { isMobile } from "react-device-detect";
// Component imports
import VolleyballCourt from "./components/VolleyballCourt";
import SettingsPanel from "./components/SettingsPanel";
import Login from "./components/Login";
import Register from "./components/Register";
import Profile from "./components/Profile";
import PlayerStatsPage from "./components/PlayerStatsPage";
import EnvCheck from './EnvCheck';
import BetaAdminPage from "./components/BetaAdminPage";
import ExpressStatPage from "./components/ExpressStatPage";
import AdsPreviewPage from './components/AdsPreviewPage';
import About from './pages/about';
import Contact from './pages/contact';
import PrivacyPolicy from './pages/privacyPolicy';
import TermsOfService from './pages/termsOfService';
import FAQPage from './components/FAQPage';
import HowToPage from './components/HowToPage'; 
import BlogList from './components/BlogList';
import SubmitBlog from './components/SubmitBlog';
import BlogPostPage from './components/BlogPostPage';
import BlogApprovalDashboard from './components/BlogApprovalDashboard';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import { useCollaborative } from "./components/collaborative/CollaborativeProvider";
import { CollaborativeProvider } from "./components/collaborative/CollaborativeProvider";
import CoachesCorner from "./components/CoachesCorner";
import SavedDrillsPage from "./components/CoachesCornerPages/SavedDrillsPage";
import DrillDetailPage from "./components/CoachesCornerPages/DrillDetailPage";
import EditDrillPage from "./components/CoachesCornerPages/EditDrillPage";
import CoachCourt from "./components/coachCourt";
import CoachStats from "./components/coachStats";


// Constants
const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 
const APP_VERSION = "vers7 prod2.0";
const AUTO_SAVE_DELAY = 5000;
const PERIODIC_SAVE_INTERVAL = 300000; // 5 minutes
 

console.log(`Loggerhead deployed version: ${APP_VERSION}`);

const backend = isMobile ? TouchBackend : HTML5Backend;

const noSelect = {
  userSelect: "none",
  WebkitUserSelect: "none",
  msUserSelect: "none",
  MozUserSelect: "none",
};

// Utility functions (moved outside component)
function autoJoinMatchIfPossible(matchId, user) {
  try {
    const sid = `${user?.id || 'anon'}-${Date.now()}`;
    if (window.collabJoin) {
      window.collabJoin(matchId, sid);
    } else if (window.socket?.emit) {
      window.socket.emit('join_match', { matchId, sessionId: sid });
    } else {
      console.warn('No collab socket available to auto-join match.');
    }
  } catch (e) {
    console.warn('autoJoinMatchIfPossible failed:', e);
  }
}

function rebuildSetScoresFromActionLog(actionLog) {
  const setScores = [];
  let setCounter = 1;

  for (const log of actionLog) {
    if (log.type === 'set_end' && typeof log.score === 'string') {
      const [ourScoreStr, opponentScoreStr] = log.score.split('-');
      const ourScore = parseInt(ourScoreStr.trim(), 10);
      const opponentScore = parseInt(opponentScoreStr.trim(), 10);

      if (!isNaN(ourScore) && !isNaN(opponentScore)) {
        setScores.push({
          setNumber: setCounter++,
          ourScore,
          opponentScore,
        });
      }
    }
  }

  return setScores;
}

function PrivateRoute({ children, requiredRole }) {
  const { token, loading, user } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!token) return <Navigate to="/login" />;
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/settings" replace />;
  return children;
}





function SubscriptionRoute({ 
  children, 
  feature = "Express Statistical Logging",
  currentMatchId = null,
  matchSettings = null,
  requireAssignmentCheck = false  // NEW: only check when explicitly needed
}) {
  const { token, loading, isSubscriber, hasPremium, user } = useAuth();
  const [checkingAssignment, setCheckingAssignment] = useState(requireAssignmentCheck);
  const [hasAssignment, setHasAssignment] = useState(false);
  
  useEffect(() => {
    const checkAssignments = async () => {
      // Only check if explicitly required AND all conditions met
      if (!requireAssignmentCheck || !currentMatchId || !user?.id || hasPremium) {
        setCheckingAssignment(false);
        return;
      }
      
      // Only check if match is collaborative
      if (!matchSettings?.collaborativeMode?.enabled) {
        setCheckingAssignment(false);
        return;
      }
      
      try {
        const response = await axios.get(
          `${API_URL}/api/matches/${currentMatchId}/assignments`,
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
          }
        );
        
        const assignments = response.data.assignments || [];
        const userHasAssignment = assignments.some(
          assignment => assignment.assignedTo?.userId === user.id && assignment.isActive !== false
        );
        
        setHasAssignment(userHasAssignment);
      } catch (error) {
        console.error('Failed to check assignments:', error);
        setHasAssignment(false);
      } finally {
        setCheckingAssignment(false);
      }
    };
    
    checkAssignments();
  }, [requireAssignmentCheck, currentMatchId, matchSettings?.collaborativeMode?.enabled, user?.id, hasPremium, token]);
  
  if (loading || checkingAssignment) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        fontSize: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px'
      }}>
        <div style={{ marginBottom: '20px', fontSize: '48px' }}>Loading...</div>
        <div>Checking subscription status...</div>
      </div>
    );
  }
  
  if (!token) return <Navigate to="/login" />;
  
  // Allow access if user is a subscriber OR has assignments in collaborative match
  const canAccess = hasPremium || hasAssignment;
  
  if (!canAccess) {
    return <SubscriptionRequired feature={feature} />
  }
  
  return children;
}

function SubscriptionRequired({ feature }) {
  return (
    <div style={{ 
      padding: 40, 
      textAlign: "center", 
      fontSize: '18px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      backgroundColor: '#f8f9fa',
      borderRadius: '12px',
      margin: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <div style={{ marginBottom: '20px', fontSize: '64px' }}>🔒</div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px', color: '#333' }}>
        Premium Feature
      </div>
      <div style={{ color: '#666', marginBottom: '32px', maxWidth: '500px', lineHeight: '1.6' }}>
        {feature} is available to Loggerhead subscribers. Upgrade your account to access advanced logging features and detailed match analytics.
      </div>
      
      <div style={{ 
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #e0e0e0',
        marginBottom: '32px',
        maxWidth: '400px',
        textAlign: 'left'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '16px', color: '#333', textAlign: 'center' }}>
          Premium Features Include:
        </div>
        <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
          • Express Statistical Logging<br/>
		  • Collaborative Match Logging<br/>
          • Advanced Analytics Dashboard<br/>
          • Detailed Performance Metrics<br/>
          • Enhanced Mobile Experience<br/>
          • Export Match Data<br/>
          • Priority Support<br/>
          • Early Access to New Features
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        flexWrap: 'wrap', 
        justifyContent: 'center',
        marginBottom: '24px'
      }}>
        <Link 
          to="/profile" 
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#007AFF',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '12px',
            fontWeight: '600',
            fontSize: '16px',
            boxShadow: '0 2px 6px rgba(0,122,255,0.3)',
            transition: 'transform 0.2s ease',
          }}
          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
        >
          Manage Subscription
        </Link>
        
        <Link 
          to="/settings" 
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#6c757d',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '12px',
            fontWeight: '600',
            fontSize: '16px',
            boxShadow: '0 2px 6px rgba(108,117,125,0.3)',
            transition: 'transform 0.2s ease',
          }}
          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
        >
          Back to Settings
        </Link>
      </div>

      <div style={{
        backgroundColor: '#e7f3ff',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #b3d9ff',
        maxWidth: '500px',
        fontSize: '14px',
        color: '#0c5aa6'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '8px' }}>💡 Did you know?</div>
        <div style={{ lineHeight: '1.5' }}>
          Until 2026, If you're assigned to track specific players in a collaborative match, you can still join that match even without a subscription!
        </div>
      </div>
    </div>
  );
};

function EmailConsentModal({ onEnable, onNotNow }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal" style={{ maxWidth: 420,
    marginTop: "20vh" }}>
	  
        <h3>You are not opted into emails :(  </h3>
        <p>
          Loggerhead uses email to:
          <br />• Notify you when someone joins your match
          <br />• Send collaborative assignments
          <br />• Share important feature updates
		  <br />• Keep you informed of what's going on
        </p>
        <p style={{ fontSize: 13, color: "#666" }}>
          We send very few emails. NO SPAM EVER.
        </p>
        <div className="modal-button-group">
          <button onClick={onEnable} className="modal-submit">
            Enable Email Updates
          </button>
          <button onClick={onNotNow} className="modal-cancel">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}



function App() {
  return (
    <AuthProvider>
      <Router>
        <AppWrapper />
      </Router>
    </AuthProvider>
  );
}

function AppWrapper() {
  // Move matchSettings state HERE (one level up)
  const [matchSettings, setMatchSettings] = useState(null);
  
  return (
    <CollaborativeProvider matchSettings={matchSettings}>
      <AppContent 
        matchSettings={matchSettings}
        setMatchSettings={setMatchSettings}
      />
    </CollaborativeProvider>
  );
}   
  

function AppContent({ matchSettings, setMatchSettings }) {
  // FIXED: Add missing hooks at the top
  const { user, token, removeToken, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // State variables
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  const [isDismissed, setIsDismissed] = useState(false);
  const [courtPlayers, setCourtPlayers] = useState(
    Array.from({ length: 6 }, (_, i) => ({ id: `empty-${i}`, name: "?", number: "?", isLibero: false }))
  );
  const [deactivatedPlayers, setDeactivatedPlayers]  = useState([]);
  const [ourScore, setOurScore] = useState(0);
  const [creditedPlayersThisSet, setCreditedPlayersThisSet] = useState([]);
  const [ballState, setBallState] = useState("serve");
  const [ballSide, setBallSide] = useState("opponent");
  const [currentServeSide, setCurrentServeSide] = useState("opponent");
  const [setScores, setSetScores] = useState([]);
  const [opponentScore, setOpponentScore] = useState(0);
  const [serveSide, setServeSide] = useState("our");
  
  const [opponentName, setOpponentName] = useState("Enter an Opponent");
  const [benchPlayers, setBenchPlayers] = useState([]);
  const [ourSetsWon, setOurSetsWon] = useState(0);
  const [opponentSetsWon, setOpponentSetsWon] = useState(0);
  const [substitutionLog, setSubstitutionLog] = useState([]);
  const [actionLog, setActionLog] = useState([]);
  const [allowedLiberoSubTarget, setAllowedLiberoSubTarget] = useState(null);
  const [slot5TargetId, setSlot5TargetId] = useState(null);
  const [currentSet, setCurrentSet] = useState(1);
  const [totalSets, setTotalSets] = useState(null);
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [matchRestored, setMatchRestored] = useState(false);
  const [isRestoringMatch, setIsRestoringMatch] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [teamStats, setTeamStats] = useState({
    ourEarned: 0,
    ourError: 0,
    oppEarned: 0,
    oppError: 0,
  });
  const [positionMapping, setPositionMapping] = useState({
    0: '4', 1: '3', 2: '2', 3: '5', 4: '6', 5: '1'
  });
  const [uiPrefs, setUiPrefs] = useState({
    cardDisplayMode: "number-first", // or "name-first"
  });
 
 const [showEmailConsentModal, setShowEmailConsentModal] = useState(false);
  const [emailConsentChecked, setEmailConsentChecked] = useState(false);
  const [hasEmailConsent, setHasEmailConsent] = useState(false);

  // Refs
  const syncPayloadRef = useRef({});
  const creditedPlayersThisSetRef = useRef(new Set());
  const firstServeHandledRef = useRef(false);
  const previousPathname = useRef(location.pathname);
  const isRestoringMatchRef = useRef(false);
  const setEndingInProgressRef = useRef(false);
  const previousUserRef = useRef(user?.id);
  const isRestoringScoresRef = useRef(false);
  const [uiState, setUiState] = useState({setEnding: {waitingForOwner: false,info: null}});
  const lastSavedActionCountRef = useRef(0);
const saveInFlightRef = useRef(false);
const [coachCourtKey, setCoachCourtKey] = useState(0);
const [isSetComplete, setIsSetComplete] = useState(false);
const isCreatingNewMatchRef = useRef(false);

  // Collaborative hooks
  const {
    restoreCollaborativeModeFromMatch,
    updateBallState,
    updateServeSide,
    updateScore,
    collaborativeMode,
    isConnected,
    socket,
    setMatchId,
    syncCourtPlayers,
    syncPositionMapping,
    registerStateCallbacks, 
    broadcastSetEndingDecision,
    broadcastSetEndingCancellation,
	requestSetEndingLock,
  releaseSetEndingLock,
  scoreCooldownActive,
  scoreCooldownRemaining  
  } = useCollaborative();

  // FIXED: Move all utility functions before they're used
 const normalizePlayer = useCallback((p = {}) => ({
    _id: p?._id ?? null,
    id: p?.id ?? p?._id ?? null,
    name: p?.name ?? "?",
    number: p?.number ?? "?",
    isLibero: !!p?.isLibero,
    replacedPlayer: p?.replacedPlayer
      ? {
          _id: p.replacedPlayer?._id ?? p.replacedPlayer?.id ?? null,
          name: p.replacedPlayer?.name ?? "?",
          number: p.replacedPlayer?.number ?? "?"
        }
      : null,
    careerStats: p?.careerStats ?? {},
    seasonStats: p?.seasonStats ?? {},
  }), []);

const POSITIONS_TO_SLOTS = ["4", "3", "2", "5", "6", "1"];

const EMPTY_PLAYER = {
  id: null,
  _id: null,
  name: "?",
  number: "?",
  isLibero: false,
  expressPosition: null,
};



function toCourtOrderByExpressPosition(players = []) {
  const byPos = {};
  for (const p of players) {
    if (!p) continue;
    const k = String(p.expressPosition ?? "");
    if (k) byPos[k] = p;
  }

  return POSITIONS_TO_SLOTS.map((pos) =>
    byPos[pos]
      ? { ...byPos[pos] }
      : { ...EMPTY_PLAYER, id: `empty-pos-${pos}`, expressPosition: pos }
  );
}

const syncCurrentMatchIdToProfile = useCallback(async (newMatchId) => {
    if (!user?.id) return;
    try {
      await axios.put(`${API_URL}/api/users/${user.id}/match-id`, {
        currentMatchId: newMatchId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      console.log("currentMatchId synced to user profile");
    } catch (err) {
      console.error("Failed to sync currentMatchId to user:", err);
    }
  }, [user?.id, token]);


const resetMatchStateOnly = useCallback(() => {
  // scoreboard + sets
  setOurScore(0);
  setOpponentScore(0);
  setOurSetsWon(0);
  setOpponentSetsWon(0);

  // court + logs
  setCourtPlayers(Array.from({ length: 6 }, () => ({ name: "?", number: "?" })));
  setSubstitutionLog([]);
  setActionLog([]);

  // libero / misc rally state
  setAllowedLiberoSubTarget(null);
  setSlot5TargetId(null);

  // match settings “in-match” fields back to start
  setMatchSettings((p) => ({
    ...p,
    currentSet: 1,
  }));
}, []);

const saveMatchData = useCallback(async (showAlert = false) => {
  if (!user?.id) {
    console.error("Cannot save match, user not logged in.");
    if (showAlert) alert("Cannot save match, user not logged in.");
    return null;
  }
  if (!matchSettings?.teamName) {
    console.error("Cannot save match, team name not set.");
    if (showAlert) alert("Cannot save match, team name not set in settings.");
    return null;
  }

  setSaveStatus('saving');

  try {
    // ✅ NEW: Smart conversion based on current mode
    const convertToPositionOrderedArray = (players, mapping) => {
      const positionOrder = ['4','3','2','5','6','1'];
      
      // Check if players already have expressPosition (from Express Mode)
      const hasExpressPositions = players.some(p => p?.expressPosition);
      
      if (hasExpressPositions) {
        // EXPRESS MODE: Players have expressPosition, sort by it
        console.log("💾 Saving from Express Mode - sorting by expressPosition");
        return positionOrder.map(targetPos => {
          const player = players.find(p => p?.expressPosition === targetPos);
          
          if (player && player.name !== "?") {
            return normalizePlayer(player);
          }
          return normalizePlayer({
            id: `empty-pos-${targetPos}`,
            name: "?",
            number: "?",
            isLibero: false,
            expressPosition: targetPos
          });
        });
      } else {
        // COURT MODE: Players in slot order, convert using positionMapping
        console.log("💾 Saving from Court Mode - converting slot→position order");
        const positionToSlot = {};
        Object.entries(mapping || {}).forEach(([slotIndex, position]) => {
          positionToSlot[String(position)] = Number(slotIndex);
        });

        return positionOrder.map((targetPos) => {
          const slotIndex = positionToSlot[targetPos];
          const player = (slotIndex !== undefined) ? players[slotIndex] : null;

          if (player && player.name !== "?") {
            return normalizePlayer({
              ...player,
              expressPosition: targetPos // Add expressPosition when saving
            });
          }
          return normalizePlayer({
            id: `empty-pos-${targetPos}`,
            name: "?",
            number: "?",
            isLibero: false,
            expressPosition: targetPos
          });
        });
      }
    };

    const positionOrderedCourtPlayers = convertToPositionOrderedArray(
      courtPlayers || [], 
      positionMapping
    );
    
    const isCollaborative = matchSettings?.collaborativeMode?.enabled;
	const targetSetsToWin = Math.ceil((matchSettings?.totalSets || 3) / 2);
    const isMatchOver = ourSetsWon >= targetSetsToWin || opponentSetsWon >= targetSetsToWin;

    const matchPayload = {
      userId: user.id,
      timestamp: new Date().toISOString(),
      teamName: matchSettings?.teamName || "",
      opponentName: opponentName || "Opponent",
      eventName: matchSettings?.eventName || "",
      location: matchSettings?.location || "",
      currentSet: matchSettings?.currentSet || 1,
      totalSets: matchSettings?.totalSets || 3,
      playAllSets: !!matchSettings?.playAllSets,
      pointsNonDeciding: matchSettings?.pointsNonDeciding || 25,
      pointsDeciding: matchSettings?.pointsDeciding || 15,
      mode: matchSettings?.mode || "Gameflow",
      collaborativeMode: matchSettings?.collaborativeMode || { enabled: false },
	  // ourScore: ourScore ?? 0,
      // opponentScore: opponentScore ?? 0,
	  
      positionMapping: positionMapping,
      ourSetsWon: ourSetsWon ?? 0,
      opponentSetsWon: opponentSetsWon ?? 0,
      status: isMatchOver ? 'Final' : 'In Progress',
      winner: isMatchOver ? (ourSetsWon > opponentSetsWon ? 'our' : 'opponent') : null,
      ...(isCollaborative ? {} : {
        ourScore: ourScore ?? 0,
        opponentScore: opponentScore ?? 0,
      }),
      setScores: setScores || [],
      gameState: {
        ballState: ballState || "serve",
        ballSide: ballSide || serveSide || "opponent", 
        currentServeSide: currentServeSide || serveSide || "opponent",
        serveSide: serveSide || "opponent"
      },
      courtPlayers: positionOrderedCourtPlayers,
      benchPlayers: (benchPlayers ?? []).filter(Boolean).map(normalizePlayer),
      actionLog: actionLog || [],
      substitutionLog: substitutionLog || [],
      deactivatedPlayers: deactivatedPlayers || [],
      liberoSubTargets: {
        allowedLiberoSubTarget: allowedLiberoSubTarget || null,
        slot5TargetId: slot5TargetId || null,
      },
      creditedPlayersThisSet: creditedPlayersThisSet || [],
      teamStats: teamStats || {
        ourEarned: 0,
        ourError: 0,
        oppEarned: 0,
        oppError: 0,
      },
    };

    let response;
    if (currentMatchId) {
      console.log("💾 UPDATING MATCH - mode:", matchPayload.mode);
      response = await axios.put(`${API_URL}/api/matches/${currentMatchId}`, matchPayload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      console.log("Match updated successfully with position-ordered courtPlayers.");
    } else {
      console.log("💾 CREATING MATCH - mode:", matchPayload.mode);
      response = await axios.post(`${API_URL}/api/matches/save`, matchPayload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      console.log("Match created successfully with position-ordered courtPlayers.");
    }

    if (response?.data?._id) {
      setCurrentMatchId(response.data._id);
      await syncCurrentMatchIdToProfile(response.data._id);
    }

    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 2000);

    if (showAlert) {
      alert("Match saved successfully.");
    }

    return response?.data?._id || null;

  } catch (err) {
    console.error("Failed to save match:", err);
    setSaveStatus('error');
    setTimeout(() => setSaveStatus(null), 3000);
    
    if (showAlert) alert("Failed to save match. See console for details.");
    return null;
  }
}, [
  user?.id,
  courtPlayers,
  benchPlayers,
  matchSettings,
  opponentName,
  ourSetsWon,
  opponentSetsWon,
  setScores,
  ourScore,
  opponentScore,
  actionLog,
  substitutionLog,
  allowedLiberoSubTarget,
  slot5TargetId,
  currentMatchId,
  token,
  teamStats,
  ballState,
  ballSide, 
  currentServeSide,
  serveSide,
  creditedPlayersThisSet,
  deactivatedPlayers,
  positionMapping,
  syncCurrentMatchIdToProfile,
  normalizePlayer
]);

const resetGamesPlayedForNewSet = useCallback(() => {
  console.log("Resetting games played tracking for new set");
  console.log("Previously credited players:", Array.from(creditedPlayersThisSetRef.current));
  
  creditedPlayersThisSetRef.current.clear();
  setCreditedPlayersThisSet([]); 
  firstServeHandledRef.current = false;
}, []);

const [positionMode, setPositionMode] = useState('court');
  
const updateCourtPositions = useCallback(async (newCourtPlayers, newPositionMapping = null, options = {}) => {
  const {
    preservePositions = false,
    source = 'unknown',
    isCollaborativeUpdate = false
  } = options;

  console.log(`🔍 updateCourtPositions called:`, {
    source,
    pathname: location.pathname,
    preservePositions,
    isCollaborativeUpdate,
    playerCount: newCourtPlayers?.length
  });

  // ===== 1. DETERMINE MODE =====
  const isExpressMode = location.pathname === '/express';
  const isCourtMode = location.pathname === '/' || location.pathname === '/match';
  
  // ===== 2. VALIDATE INPUT =====
  if (!Array.isArray(newCourtPlayers) || newCourtPlayers.length !== 6) {
    console.error('❌ Invalid courtPlayers array:', newCourtPlayers);
    return;
  }

  // ===== 3. PROCESS BASED ON MODE =====
  let processedPlayers;

  if (isExpressMode) {
    // EXPRESS MODE: Positions stick to players
    console.log('🟦 EXPRESS MODE: Processing players');
    
    // ✅ FIX: In Express mode, display order is Position 1-6 in slots 0-5
    const EXPRESS_SLOT_TO_POSITION = ['4','3','2','5','6','1'];
    
    processedPlayers = newCourtPlayers.map((player, slotIndex) => {
      if (!player || player.name === "?") {
        // Empty slot - assign position based on display order
        return {
          id: `empty-${slotIndex}`,
          name: "?",
          number: "?",
          isLibero: false,
          expressPosition: EXPRESS_SLOT_TO_POSITION[slotIndex]  // ✅ Use display order
        };
      }
      
      // Real player - preserve their position or assign based on display order
      return {
        ...player,
        // ✅ FIX: Use Express display order as fallback, not Court mapping
        expressPosition: player.expressPosition || EXPRESS_SLOT_TO_POSITION[slotIndex]
      };
    });
    
    console.log('✅ Express mode positions:', processedPlayers.map(p => `${p.name}:Pos${p.expressPosition}`));
    
  } else if (isCourtMode) {
    // COURT MODE: Positions stick to slots
    console.log('🟥 COURT MODE: Processing players');
    
    // ✅ In Court mode, use the actual positionMapping
    const COURT_SLOT_TO_POSITION = positionMapping || {
      0: '4', 1: '3', 2: '2', 3: '5', 4: '6', 5: '1'
    };
    
    if (preservePositions) {
      // When preservePositions=true, don't modify existing positions
      processedPlayers = newCourtPlayers.map((player, slotIndex) => {
        if (!player || player.name === "?") {
          return {
            id: `empty-${slotIndex}`,
            name: "?",
            number: "?",
            isLibero: false,
            expressPosition: COURT_SLOT_TO_POSITION[slotIndex]
          };
        }
        
        return {
          ...player,
          // Preserve existing position if it exists
          expressPosition: player.expressPosition || COURT_SLOT_TO_POSITION[slotIndex]
        };
      });
    } else {
      // Normal Court mode - assign positions based on slot
      processedPlayers = newCourtPlayers.map((player, slotIndex) => {
        const slotPosition = COURT_SLOT_TO_POSITION[slotIndex];
        
        if (!player || player.name === "?") {
          return {
            id: `empty-${slotIndex}`,
            name: "?",
            number: "?",
            isLibero: false,
            expressPosition: slotPosition
          };
        }
        
        return {
          ...player,
          // ✅ In Court mode, position = slot's assigned position
          expressPosition: slotPosition
        };
      });
    }
    
    console.log('✅ Court mode positions:', processedPlayers.map((p, i) => 
      `Slot${i}=Pos${p.expressPosition}:${p.name}`
    ));
    
  } else {
    // UNKNOWN MODE - be defensive, preserve positions
    console.warn('⚠️ Unknown mode, preserving positions');
    processedPlayers = newCourtPlayers.map((player, slotIndex) => ({
      ...player,
      expressPosition: player?.expressPosition || String(slotIndex + 1)  // ✅ Safe fallback
    }));
  }

  // ===== 4. VALIDATE PROCESSED PLAYERS =====
  const hasValidPositions = processedPlayers.every(p => 
    p.expressPosition && ['1','2','3','4','5','6'].includes(p.expressPosition)
  );
  
  if (!hasValidPositions) {
    console.error('❌ Invalid positions after processing:', processedPlayers.map(p => p.expressPosition));
    // ✅ Fix invalid positions using mode-appropriate defaults
    const defaultPositions = isExpressMode 
      ? ['1','2','3','4','5','6']  // Express: display order
      : ['4','3','2','5','6','1'];  // Court: slot order
      
    processedPlayers = processedPlayers.map((player, idx) => ({
      ...player,
      expressPosition: defaultPositions[idx]
    }));
  }

  // ===== 5. UPDATE LOCAL STATE =====
  setCourtPlayers(processedPlayers);
  
  // Don't update positionMapping in express mode or when preserving positions
  if (newPositionMapping && !preservePositions && isCourtMode) {
    const currentMappingStr = JSON.stringify(positionMapping);
    const newMappingStr = JSON.stringify(newPositionMapping);
    
    if (currentMappingStr !== newMappingStr) {
      console.log('🔄 Updating position mapping:', newPositionMapping);
      setPositionMapping(newPositionMapping);
    }
  }

  // ===== 6. COLLABORATIVE SYNC =====
  if (collaborativeMode && isConnected && !isCollaborativeUpdate) {
    try {
      console.log('🔄 Syncing to collaborative users');
      const success = await syncCourtPlayers(processedPlayers, {
        source,
        mode: isExpressMode ? 'express' : 'court',
        timestamp: new Date().toISOString(),
        positionMapping: isCourtMode ? positionMapping : undefined
      });
      
      if (success) {
        console.log('✅ Court players synced to other users');
      } else {
        console.warn('⚠️ Sync returned false, update may not have propagated');
      }
    } catch (error) {
      console.error('❌ Error syncing court players:', error);
    }
  }

  // ===== 7. AUTO-SAVE IN EXPRESS MODE =====
  if (isExpressMode && currentMatchId && !isCollaborativeUpdate) {
    try {
      // Debounced save in Express mode
      setTimeout(async () => {
        await saveMatchData(false);
        console.log('💾 Express: Court positions auto-saved');
      }, 100);
    } catch (err) {
      console.error('💾 Express: Failed to auto-save:', err);
    }
  }

  console.log('✅ updateCourtPositions complete');
  
}, [
  location.pathname,
  positionMapping,
  collaborativeMode,
  isConnected,
  syncCourtPlayers,
  currentMatchId,
  saveMatchData,
  setCourtPlayers,
  setPositionMapping
]);

const swapCourtPlayers = useCallback(async (sourceIndex, targetIndex) => {
  if (sourceIndex === targetIndex) return;
  
  const isExpressMode = location.pathname === '/express';
  
  console.log(`Swapping players: slot ${sourceIndex} <-> slot ${targetIndex} (${isExpressMode ? 'Express' : 'Court'} mode)`);
  
  const newCourtPlayers = [...courtPlayers];
  const sourcePlayer = newCourtPlayers[sourceIndex];
  const targetPlayer = newCourtPlayers[targetIndex];
  
  // Swap players in array
  newCourtPlayers[sourceIndex] = targetPlayer;
  newCourtPlayers[targetIndex] = sourcePlayer;
  
  if (isExpressMode) {
    // ✅ EXPRESS MODE: Positions stay with players (no position swap needed)
    console.log('Express mode: Positions stay with players');
    
    setCourtPlayers(newCourtPlayers);
    
    setActionLog(prev => [
      ...prev,
      {
        action: `Player swap: ${sourcePlayer?.name || 'Empty'} (Pos ${sourcePlayer?.expressPosition}) <-> ${targetPlayer?.name || 'Empty'} (Pos ${targetPlayer?.expressPosition})`,
        timestamp: new Date().toISOString(),
        meta: { 
          type: 'player_swap_express',
          sourceIndex,
          targetIndex,
          mode: 'express'
        }
      }
    ]);
    
  } else {
    // ✅ COURT MODE: Positions swap with slots
    const newPositionMapping = { ...positionMapping };
    const sourcePosition = newPositionMapping[sourceIndex];
    const targetPosition = newPositionMapping[targetIndex];
    
    newPositionMapping[sourceIndex] = targetPosition;
    newPositionMapping[targetIndex] = sourcePosition;
    
    // Update expressPosition to match new slot positions
    if (newCourtPlayers[sourceIndex] && newCourtPlayers[sourceIndex].name !== "?") {
      newCourtPlayers[sourceIndex] = {
        ...newCourtPlayers[sourceIndex],
        expressPosition: newPositionMapping[sourceIndex]
      };
    }
    
    if (newCourtPlayers[targetIndex] && newCourtPlayers[targetIndex].name !== "?") {
      newCourtPlayers[targetIndex] = {
        ...newCourtPlayers[targetIndex],
        expressPosition: newPositionMapping[targetIndex]
      };
    }
    
    setCourtPlayers(newCourtPlayers);
    setPositionMapping(newPositionMapping);
    
    const sourcePlayerName = sourcePlayer?.name !== "?" ? `${sourcePlayer.name} (#${sourcePlayer.number})` : "Empty";
    const targetPlayerName = targetPlayer?.name !== "?" ? `${targetPlayer.name} (#${targetPlayer.number})` : "Empty";
    
    setActionLog(prev => [
      ...prev,
      {
        action: `Player+Position swap: ${sourcePlayerName} (Pos ${sourcePosition}) <-> ${targetPlayerName} (Pos ${targetPosition})`,
        timestamp: new Date().toISOString(),
        meta: { 
          type: 'player_position_swap',
          sourceIndex,
          targetIndex,
          sourcePosition,
          targetPosition,
          mode: 'court'
        }
      }
    ]);
  }
  
  // Auto-save in Express mode
  if (isExpressMode && currentMatchId) {
    try {
      await saveMatchData(false);
      console.log("Express: Swap saved immediately");
    } catch (err) {
      console.error("Express: Failed to save swap:", err);
    }
  }
  
  console.log(`Swap complete in ${isExpressMode ? 'Express' : 'Court'} mode`);
}, [courtPlayers, positionMapping, location.pathname, setActionLog, currentMatchId, saveMatchData]);


const rotateCourtPositions = useCallback(async () => {
  console.log("Rotating court positions clockwise...");
  
  const newPositionMapping = {
    0: positionMapping[1],
    1: positionMapping[2],
    2: positionMapping[5],
    3: positionMapping[0],
    4: positionMapping[3],
    5: positionMapping[4],
  };
  
  // ✅ FIX: Update expressPosition on all players to match new mapping
  const updatedPlayers = courtPlayers.map((player, slotIndex) => {
    if (!player || player.name === "?") {
      return {
        ...player,
        expressPosition: newPositionMapping[slotIndex]
      };
    }
    
    return {
      ...player,
      expressPosition: newPositionMapping[slotIndex]
    };
  });
  
  setCourtPlayers(updatedPlayers);
  setPositionMapping(newPositionMapping);
  
  setActionLog(prev => [
    ...prev,
    {
      action: "Manual rotation: Position labels rotated clockwise",
      timestamp: new Date().toISOString(),
      meta: { 
        type: 'rotation',
        oldMapping: positionMapping,
        newMapping: newPositionMapping 
      }
    }
  ]);
  
  if (currentMatchId) {
    try {
      setTimeout(async () => {
        await saveMatchData(false);
        console.log("Rotation saved immediately");
      }, 100);
    } catch (err) {
      console.error("Failed to save rotation:", err);
    }
  }
  
  console.log("Position mapping rotated:", newPositionMapping);
}, [courtPlayers, positionMapping, setActionLog, currentMatchId, saveMatchData]);

 

  const clearAllMatchState = useCallback(() => {
    console.log("Clearing all match state for user security");
    
    setLoadingMatch(true);
    setCurrentMatchId(null);
    setMatchSettings(null);
    setCourtPlayers(Array.from({ length: 6 }, (_, i) => ({ 
      id: `empty-${i}`, 
      name: "?", 
      number: "?", 
      isLibero: false 
    })));
    setBenchPlayers([]);
    setOurScore(0);
    setOpponentScore(0);
    setOurSetsWon(0);
    setOpponentSetsWon(0);
    setSetScores([]);
    setActionLog([]);
    setSubstitutionLog([]);
    setDeactivatedPlayers([]);
    setCreditedPlayersThisSet([]);
    setOpponentName("Enter an Opponent");
    setAllowedLiberoSubTarget(null);
    setSlot5TargetId(null);
    setTeamStats({
      ourEarned: 0,
      ourError: 0,
      oppEarned: 0,
      oppError: 0,
    });
    
    setPositionMapping({
      0: '4', 1: '3', 2: '2', 3: '5', 4: '6', 5: '1'
    });
    
    // Clear refs
    creditedPlayersThisSetRef.current.clear();
    firstServeHandledRef.current = false;
    isRestoringMatchRef.current = false;
    setEndingInProgressRef.current = false;
    
    setMatchRestored(false);
    setIsRestoringMatch(false);
    setLoadingMatch(false);
    
    console.log("All match state cleared");
  }, []);


 

const refreshBenchPlayers = useCallback(async () => {
  if (!matchSettings?.teamName) return;
  console.log("Manual refreshBenchPlayers triggered");
  try {
    const resBench = await axios.get(
      `${API_URL}/api/players/bench/recall`,
      { 
        params: { team: matchSettings.teamName },
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    setBenchPlayers(resBench.data);
    console.log("Refreshed bench players.");
  } catch (error) {
    console.error("Failed to refresh bench players:", error);
  }
}, [matchSettings?.teamName, token]);

  const refreshCourtPlayers = useCallback(async () => {
    if (!currentMatchId) return;

    console.log("Refreshing court players from match...");

    try {
      const resMatch = await axios.get(`${API_URL}/api/matches/${currentMatchId}`);
      const match = resMatch.data;

      if (match && match.courtPlayers) {
       // Restore court players
const hydratedCourtPlayers = (match.courtPlayers || []).map((slot, i) => {
  if (!slot) {
    console.warn(`Court slot ${i} missing player info. Using placeholder.`);
    return { id: `empty-${i}`, name: "?", number: "?", isLibero: false };
  }

  if (typeof slot === "string") {
    const found = (match.benchPlayers || []).find(p => p._id === slot);
    if (!found) {
      console.warn(`Court slot ${i} could not find player ${slot} in benchPlayers.`);
      return { id: slot, name: "?", number: "?" };
    }
    return {
      _id: found._id,
      id: found._id,
      name: found.name || "?",
      number: found.number || "?",
      isLibero: found.isLibero || false,
      replacedPlayer: found.replacedPlayer || null,
      careerStats: found.careerStats || {},
      seasonStats: found.seasonStats || {},
    };
  } else {
    return {
      _id: slot._id || `empty-${i}`,
      id: slot.id || slot._id || `empty-${i}`,
      name: slot.name || "?",
      number: slot.number || "?",
      isLibero: slot.isLibero || false,
      replacedPlayer: slot.replacedPlayer || null,
      careerStats: slot.careerStats || {},
      seasonStats: slot.seasonStats || {},
    };
  }
});

// 🔥 NEW: Convert from position order to slot order
const hasExpressPositions = hydratedCourtPlayers.some(p => p?.expressPosition);

let finalCourtPlayers;

if (hasExpressPositions) {
  console.log("🔄 refreshCourtPlayers: Converting position order to slot order");
  
  const savedPositionMapping = match.positionMapping || {
    0: '4', 1: '3', 2: '2', 3: '5', 4: '6', 5: '1'
  };
  
  finalCourtPlayers = Array(6).fill(null).map((_, slotIndex) => {
    const positionForThisSlot = savedPositionMapping[slotIndex];
    const playerForThisSlot = hydratedCourtPlayers.find(p => 
      p?.expressPosition === positionForThisSlot
    );
    
    if (playerForThisSlot && playerForThisSlot.name !== "?") {
      return {
        ...playerForThisSlot,
        expressPosition: positionForThisSlot
      };
    }
    return {
      id: `empty-${slotIndex}`,
      name: "?",
      number: "?",
      isLibero: false,
      expressPosition: positionForThisSlot
    };
  });
} else {
  finalCourtPlayers = hydratedCourtPlayers;
}



// Fill any remaining empty slots
const filledCourtPlayers = [
  ...finalCourtPlayers,
  ...Array.from({ length: Math.max(0, 6 - finalCourtPlayers.length) }, (_, i) => ({
    id: `empty-filler-${i}`,
    name: "?",
    number: "?",
    isLibero: false,
  }))
].slice(0, 6);

setCourtPlayers(filledCourtPlayers);
        console.log("Court players refreshed from match.");
      }
    } catch (error) {
      console.error("Failed to refresh court players:", error);
    }
  }, [currentMatchId]);


 const clearCourt = useCallback(async () => {
    console.log("Clearing court and syncing players...");

    if (!user?.id || !matchSettings?.teamName) {
      console.error("Cannot clear court — user or team missing.");
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/api/players`, {
  params: { team: matchSettings.teamName },
  headers: { Authorization: `Bearer ${token}` },
  withCredentials: true,
});

      const allPlayers = res.data || [];
      const playersOnCourt = allPlayers.filter(p => p.isOnCourt);

      if (playersOnCourt.length > 0) {
        await Promise.all(
          playersOnCourt.map(p =>
            axios.put(`${API_URL}/api/players/${p._id}`, { isOnCourt: false })
          )
        );
        console.log(`Updated ${playersOnCourt.length} players off court`);
      } else {
        console.log("No players currently marked on court.");
      }

      setCourtPlayers(
        Array.from({ length: 6 }, (_, i) => ({
          id: `empty-${i}`,
          name: "?",
          number: "?",
          isLibero: false,
        }))
      );

      await refreshBenchPlayers();
      console.log("Court cleared successfully.");
    } catch (error) {
      console.error("Failed to clear court:", error);
      alert("Failed to clear court properly. Please refresh your browser.");
    }
  }, [user?.id, matchSettings?.teamName, refreshBenchPlayers]);

const syncMatchState = useCallback(async () => {
  if (!currentMatchId) return;

  try {
    await axios.put(`${API_URL}/api/matches/${currentMatchId}/sync-state`, syncPayloadRef.current, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
    console.log("✅ Match state synced successfully.");
  } catch (error) {
    console.error("❌ Failed to sync match state:", error);
  }
}, [currentMatchId, token]);
	
const restoreScoresFromDatabase = useCallback((match) => {
  const dbOurScore = typeof match.ourScore === "number" ? match.ourScore : 0;
  const dbOpponentScore = typeof match.opponentScore === "number" ? match.opponentScore : 0;
  
  const maxValidScore = 50;
  const isOurScoreValid = dbOurScore >= 0 && dbOurScore <= maxValidScore;
  const isOppScoreValid = dbOpponentScore >= 0 && dbOpponentScore <= maxValidScore;
  
  if (!isOurScoreValid || !isOppScoreValid) {
    console.warn("Database scores invalid, using 0-0");
    return { 
      ourScore: 0, 
      opponentScore: 0,
      setScores: match.setScores || [],
      currentSet: match.currentSet || 1
    };
  }
  
  const currentSetNumber = match.currentSet || 1;
  const completedSets = match.setScores || [];
  
  // 🔥 FIX #3: Only check if a FUTURE set is marked complete (data corruption)
  const futureSetComplete = completedSets.some(set => set.setNumber > currentSetNumber);
  
  if (futureSetComplete) {
    console.error("❌ Data corruption: Future set marked complete!");
    return { 
      ourScore: 0, 
      opponentScore: 0,
      setScores: completedSets.filter(set => set.setNumber < currentSetNumber),
      currentSet: currentSetNumber
    };
  }
  
  // 🔥 FIX #4: Trust database scores - don't second-guess
  console.log(`✅ Restoring in-progress set ${currentSetNumber}: ${dbOurScore}-${dbOpponentScore}`);
  return { 
    ourScore: dbOurScore, 
    opponentScore: dbOpponentScore,
    setScores: completedSets,
    currentSet: currentSetNumber
  };
}, []);

  const syncCreditedPlayersFromState = useCallback((creditedArray) => {
    creditedPlayersThisSetRef.current.clear();
    setCreditedPlayersThisSet(creditedArray || []);
    
    if (creditedArray) {
      creditedArray.forEach(playerId => {
        creditedPlayersThisSetRef.current.add(playerId);
      });
    }
    
    console.log("Synced credited players:", creditedArray);
  }, []);

const isMatchOwner = useCallback(() => {
  if (!matchSettings || !user) return false;
  // Owner is the user who created the match
  const ownerId = matchSettings.userId || matchSettings.owner?.id || matchSettings.owner?._id;
  return !!ownerId && String(ownerId) === String(user.id || user._id);
}, [matchSettings, user]);

 
 
 
 
 const processSetEnding = useCallback(async (winner, winnerName, newOurSets, newOpponentSets, isMatchOver) => {
  try {
    setEndingInProgressRef.current = true;
    
    // 🔥 FIX #1: Capture current scores BEFORE any state changes
    const finalOurScore = ourScore;
    const finalOpponentScore = opponentScore;
    const finalSetNumber = matchSettings.currentSet;
    
    console.log(`🏆 Processing set ending: ${winnerName} wins ${finalOurScore}-${finalOpponentScore}`);
    
    if (collaborativeMode && !isMatchOwner()) {
      console.log("Non-owner processing set ending - updating local state only");
    } else {
      console.log("Owner processing set ending - saving to database");
      await syncMatchState();
    }

    if (isMatchOver) {
      console.log("🏆 Match is complete, finalizing...");
      
      const finalSetScore = {
        setNumber: finalSetNumber,
        ourScore: finalOurScore,
        opponentScore: finalOpponentScore,
      };
      
      const updatedSetScores = [...setScores, finalSetScore];
      setSetScores(updatedSetScores);
      
      
      if (!collaborativeMode || isMatchOwner()) {
        try {
          await axios.put(`${API_URL}/api/matches/${currentMatchId}`, {
            status: "Final",
            winner: winnerName,
            ourSetsWon: newOurSets,
            opponentSetsWon: newOpponentSets,
            currentSet: finalSetNumber,
            setScores: updatedSetScores,
            finalScore: `${finalOurScore}-${finalOpponentScore}`,
            ourScore: finalOurScore,  // 🔥 FIX: Use captured values
            opponentScore: finalOpponentScore,
          }, {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
          console.log("✅ Completed Match marked as Final in database");
		  setCurrentMatchId(null);  
        } catch (err) {
          console.error("❌ Failed to mark match as final:", err);
        }

        try {
          await axios.put(`${API_URL}/api/users/${user.id}/match-id`, {
            currentMatchId: null,
          }, {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
        } catch (err) {
          console.error("❌ Failed to clear currentMatchId from user profile:", err);
        }
      }
      
      setLoadingMatch(false);
      navigate(`/stats?match=${currentMatchId}&team=${encodeURIComponent(matchSettings.teamName)}`);
      
    } else {
      // Set complete but match continues
      console.log("✅ Set complete, preparing for next set...");
      
      resetGamesPlayedForNewSet();
      
      const newSetScore = {
        setNumber: finalSetNumber,
        ourScore: finalOurScore,
        opponentScore: finalOpponentScore,
      };
      
      const updatedSetScores = [...setScores, newSetScore];
      setSetScores(updatedSetScores);
      
      const updatedActionLog = [
        ...actionLog,
        {
          type: 'set_end',
          winner: winnerName,
          score: `${finalOurScore}-${finalOpponentScore}`,
          timestamp: new Date().toISOString()
        }
      ];
      setActionLog(updatedActionLog);
      
      // 🔥 FIX #2: Save with FINAL scores before resetting
      const nextSet = finalSetNumber + 1;
      
      if (!collaborativeMode || isMatchOwner()) {
        console.log(`💾 Saving set ${finalSetNumber} completion with scores ${finalOurScore}-${finalOpponentScore}`);
        
        try {
          await axios.put(`${API_URL}/api/matches/${currentMatchId}`, {
            ourScore: 0,  // Reset for next set
            opponentScore: 0,  // Reset for next set
            currentSet: nextSet,
            setScores: updatedSetScores,
            ourSetsWon: newOurSets,
            opponentSetsWon: newOpponentSets,
            actionLog: updatedActionLog,
            teamStats: {
              ourEarned: 0,
              ourError: 0,
              oppEarned: 0,
              oppError: 0,
            },
            gameState: {
              ballState: 'serve',
              ballSide: 'opponent',
              currentServeSide: 'opponent',
              serveSide: 'opponent'
            }
          }, {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
          console.log(`✅ Database updated: Set ${nextSet} ready with scores reset to 0-0`);
        } catch (err) {
          console.error("❌ CRITICAL: Failed to save set completion:", err);
          alert("Failed to save set completion. Please refresh the page.");
          return;
        }
      }
      
      // NOW reset local state after database is updated
      console.log("🔄 Resetting local state for next set");
      setOurScore(0);
      setOpponentScore(0);
      setTeamStats({
        ourEarned: 0,
        ourError: 0,
        oppEarned: 0,
        oppError: 0,
      });
      
      setOurSetsWon(newOurSets);
      setOpponentSetsWon(newOpponentSets);
      
      // Reset game state
      setAllowedLiberoSubTarget(null);
      setServeSide("opponent");
      setSlot5TargetId(null);
      setSubstitutionLog([]);
      setBallState("serve");
      setCurrentServeSide("opponent");
      setBallSide("opponent");
      
      // Update match settings with new set number
      setMatchSettings(prev => ({
        ...prev,
        currentSet: nextSet
      }));
      
      // Clear court
      clearCourt();
      
      console.log(`🎉 Ready for set ${nextSet}!`);
    }
  } finally {
    setTimeout(() => {
      setEndingInProgressRef.current = false;
    }, 1000);
  }
}, [
  matchSettings, ourScore, opponentScore, setScores, actionLog, syncMatchState, 
  saveMatchData, clearCourt, resetGamesPlayedForNewSet, currentMatchId, token, 
  user, navigate, collaborativeMode, isMatchOwner
]);

  const processSetEndingFromCoach = useCallback(async (winner) => {
  // Calculate values from current state
  const newOurSets = ourSetsWon + (winner === "our" ? 1 : 0);
  const newOpponentSets = opponentSetsWon + (winner === "opponent" ? 1 : 0);
  
  // Determine match status - FIX: Ensure totalSets is valid (don't let it default to undefined/0)
  const totalSets = matchSettings?.totalSets || 3;  // Default to best-of-3 if undefined
  const setsToWin = Math.ceil(totalSets / 2);
  const isMatchOver = newOurSets >= setsToWin || newOpponentSets >= setsToWin;
  console.log(`🏆 Set ending check: newOurSets=${newOurSets}, newOpponentSets=${newOpponentSets}, totalSets=${totalSets}, setsToWin=${setsToWin}, isMatchOver=${isMatchOver}`);
  
  const winnerName = winner === "our" 
    ? matchSettings?.teamName 
    : opponentName;
  
  // Call with ALL required parameters
  await processSetEnding(winner, winnerName, newOurSets, newOpponentSets, isMatchOver);
}, [ourSetsWon, opponentSetsWon, matchSettings, opponentName, processSetEnding]);

  // Now define functions that depend on processSetEnding
const handleSetEndingAsOwner = useCallback(async (winner, winnerName, newOurSets, newOpponentSets, isMatchOver) => {
  console.log("OWNER: handleSetEndingAsOwner called", {
    winner, winnerName, newOurSets, newOpponentSets, isMatchOver,
    currentScore: `${ourScore}-${opponentScore}`
  });

  if (setEndingInProgressRef.current === false) {
    console.error("OWNER: Called but lock is not set!");
    setEndingInProgressRef.current = true;
  }

  let lockReleaseReason = 'cancelled';
  
  try {
    // Build confirmation message
    const confirmMessage = isMatchOver
      ? `MATCH COMPLETE!\n\n${winnerName} wins the match ${newOurSets}-${newOpponentSets}!\n\nClick OK to view match statistics.`
      : `${winnerName} wins set ${matchSettings.currentSet} (${ourScore}-${opponentScore}).\n\nPrepare for set ${matchSettings.currentSet + 1}?`;
    
    console.log("OWNER: Showing confirmation dialog:", confirmMessage);
    
    // Show confirmation for BOTH set ending and match ending
    const shouldContinue = window.confirm(confirmMessage);
    
    console.log("OWNER: User response:", shouldContinue ? "OK" : "Cancel");

    if (shouldContinue) {
      const setEndingDecision = {
        winner,
        winnerName,
        newOurSets,
        newOpponentSets,
        isMatchOver,
        setNumber: matchSettings.currentSet,
        finalScore: `${ourScore}-${opponentScore}`,
      };
      
      console.log("OWNER: Broadcasting decision to all users");
      broadcastSetEndingDecision(setEndingDecision);
      
      console.log("OWNER: Processing set ending locally");
      await processSetEnding(winner, winnerName, newOurSets, newOpponentSets, isMatchOver);
      
      lockReleaseReason = 'decision_made';
    } else {
      console.log("OWNER: Cancelled - broadcasting cancellation");
      broadcastSetEndingCancellation();
      lockReleaseReason = 'cancelled';
    }
    
  } catch (error) {
    console.error("OWNER: Error in set ending:", error);
    lockReleaseReason = 'error';
    throw error;
  } finally {
    console.log("OWNER: Releasing lock, reason:", lockReleaseReason);
    releaseSetEndingLock(lockReleaseReason);
    setEndingInProgressRef.current = false;
    window.setEndingLockTime = null;
  }
}, [
  broadcastSetEndingDecision, 
  broadcastSetEndingCancellation, 
  releaseSetEndingLock, 
  matchSettings?.currentSet, 
  ourScore, 
  opponentScore, 
  processSetEnding
]);


 const handleSetEndingIndividually = useCallback(async (winner, winnerName, newOurSets, newOpponentSets, isMatchOver) => {
  console.log("🎯 INDIVIDUAL: Set ending handler called", { winner, winnerName, newOurSets, newOpponentSets, isMatchOver });
  
  
  setEndingInProgressRef.current = true;

  try {
    let confirmMessage;
    let shouldContinue = false;

    if (isMatchOver) {
      confirmMessage = `🏆 MATCH COMPLETE!\n\n${winnerName} wins the match ${newOurSets}-${newOpponentSets}!\n\nClick OK to view match statistics.`;
      console.log("🏆 INDIVIDUAL: Showing match completion dialog");
      shouldContinue = true; // Always continue for match completion
    } else {
      confirmMessage = `🎉 ${winnerName} wins set ${matchSettings.currentSet} (${ourScore}-${opponentScore}).\n\nPrepare for set ${matchSettings.currentSet + 1}?`;
      console.log("🎉 INDIVIDUAL: Showing set completion dialog");
    }

    // Show the dialog and get user response
    console.log("📢 INDIVIDUAL: Displaying confirm dialog:", confirmMessage);
    
    try {
      if (!isMatchOver) {
        shouldContinue = window.confirm(confirmMessage);
        console.log("👤 INDIVIDUAL: User response:", shouldContinue ? "OK" : "Cancel");
      }
    } catch (confirmError) {
      console.error("❌ INDIVIDUAL: Confirm dialog failed:", confirmError);
      shouldContinue = true; // Auto-continue if confirm fails
      alert("Set complete! Continuing automatically...");
    }

    if (shouldContinue) {
      console.log("✅ INDIVIDUAL: Proceeding with set ending...");
      await processSetEnding(winner, winnerName, newOurSets, newOpponentSets, isMatchOver);
      console.log("🎉 INDIVIDUAL: Set ending completed successfully");
    } else {
      console.log("❌ INDIVIDUAL: User declined to continue");
      // Show a helpful message
      alert("Set ending cancelled. The set is complete but you chose not to continue. You can advance manually when ready.");
    }
  } catch (error) {
    console.error("💥 INDIVIDUAL: Error in set ending logic:", error);
    alert(`Error processing set ending: ${error.message}. Please check the console and try refreshing.`);
  } finally {
    console.log("🔄 INDIVIDUAL: Clearing set ending flag");
    setEndingInProgressRef.current = false;
  }
}, [matchSettings, ourScore, opponentScore, processSetEnding]);


  const toggleHeader = useCallback(() => setShowHeader(prev => !prev), []);

  const updatePlayersOnCourt = useCallback(async (newCourtPlayers) => {
    if (collaborativeMode && isConnected) {
      try {
        const success = await syncCourtPlayers(newCourtPlayers);
        if (success) {
          setCourtPlayers(newCourtPlayers);
        } else {
          console.warn('Sync failed, updating locally only');
          setCourtPlayers(newCourtPlayers);
        }
      } catch (error) {
        console.error('Collaborative sync error, falling back to local:', error);
        setCourtPlayers(newCourtPlayers);
      }
    } else {
      setCourtPlayers(newCourtPlayers);
    }
  }, [collaborativeMode, isConnected, syncCourtPlayers]);

  const setBallStateWithSync = useCallback((newBallState) => {
    setBallState(newBallState);
    
    if (collaborativeMode && isConnected) {
      updateBallState(newBallState, {
        ballSide: ballSide,
        currentServeSide: currentServeSide
      });
    }
  }, [setBallState, collaborativeMode, isConnected, updateBallState, ballSide, currentServeSide]);

  const setCurrentServeSideWithSync = useCallback((newServeSide) => {
    setCurrentServeSide(newServeSide);
    setBallSide(newServeSide);
    
    if (collaborativeMode && isConnected) {
      updateServeSide(newServeSide);
    }
  }, [setCurrentServeSide, setBallSide, collaborativeMode, isConnected, updateServeSide]);

 

const saveScoreImmediately = useCallback(async (newOurScore, newOpponentScore, reason = 'manual') => {
  if (!currentMatchId) return;
  
  // ✅ Only save to database, don't trigger collaborative updates
  try {
    await axios.put(`${API_URL}/api/matches/${currentMatchId}/score`, {
      ourScore: newOurScore,
      opponentScore: newOpponentScore,
      // ... other fields
    });
  } catch (err) {
    console.error("Failed to save score:", err);
  }
}, [currentMatchId, token]);

const onOurPoint = useCallback(async (skipCollaborative = false, reason = 'manual') => {
  console.trace('🎯 onOurPoint called'); // ✅ Clearer - shows it's a trace, not error
  console.log('onOurPoint params:', { oldScore: ourScore, skipCollaborative, reason });
  

  const oldScore = ourScore;
  const newScore = oldScore + 1;
  
  console.log('onOurPoint called:', { oldScore, newScore, skipCollaborative, reason });
  
  // Always update local state immediately
  
  
  // Only do collaborative if not skipping and conditions are met
  if (!skipCollaborative && collaborativeMode && isConnected) {
    console.log('Sending collaborative update...');
    const success = updateScore('our', 1, reason);
    if (!success) {
      console.warn('Collaborative update failed');
    }
	await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  setOurScore(newScore);
}, [ourScore, collaborativeMode, isConnected, updateScore]);

const onOpponentPoint = useCallback(async (skipCollaborative = false, reason = 'manual') => {
  const oldScore = opponentScore;
  const newScore = oldScore + 1;
  
  console.log('onOpponentPoint called:', { oldScore, newScore, skipCollaborative, reason });
  
  // Always update local state immediately  
  
  
  // Only do collaborative if not skipping and conditions are met
  if (!skipCollaborative && collaborativeMode && isConnected) {
    console.log('Sending collaborative update...');
    const success = updateScore('opponent', 1, reason);
    if (!success) {
      console.warn('Collaborative update failed');
    }
	await new Promise(resolve => setTimeout(resolve, 200));
  }
  setOpponentScore(newScore);
}, [opponentScore, collaborativeMode, isConnected, updateScore]);

const maybeCreditGamesPlayed = useCallback(async (playerId, forceCredit = false, context = "unknown") => {
  if (!playerId || !currentMatchId) {
    console.warn("Cannot credit games played - missing playerId or matchId");
    return false;
  }

  // 🔥 FIX: Actually prevent duplicate credits per set
  if (!forceCredit && creditedPlayersThisSetRef.current.has(playerId)) {
    console.log(`Player ${playerId} already credited this set - skipping (context: ${context})`);
    return true; // Return true to indicate they're already credited
  }

    try {
      console.log(`Crediting games played for player: ${playerId} (context: ${context}, force: ${forceCredit})`);
      
      const maxSetsLimit = matchSettings?.totalSets || 3;
      console.log(`Using maxSetsLimit: ${maxSetsLimit} for player ${playerId}`);
      
      const response = await axios.post(`${API_URL}/api/players/increment-games-played`, {
        playerIds: [playerId],
        matchId: currentMatchId,
        maxSetsLimit: maxSetsLimit,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const results = response.data.results || [];
      const playerResult = results.find(r => r.playerId === playerId);
      
      if (playerResult && !playerResult.success) {
        console.warn(`Server blocked games played for ${playerId}: ${playerResult.error}`);
        return false;
      }

      creditedPlayersThisSetRef.current.add(playerId);
      setCreditedPlayersThisSet(prev => {
        if (prev.includes(playerId)) return prev;
        return [...prev, playerId];
      });
      
      console.log(`Successfully credited games played for player ${playerId} (context: ${context})`);
      return true;
    } catch (err) {
      console.error(`Failed to credit games played for player ${playerId} (context: ${context}):`, err.response?.data || err.message);
      
      if (err.response?.data?.message?.includes('maximum sets') || 
          err.response?.data?.message?.includes('exceeds')) {
        console.warn(`Player ${playerId} blocked - already at games played limit`);
      }
      
      return false;
    }
  }, [currentMatchId, token, matchSettings?.totalSets]);

 
 

  const onAddPoint = useCallback((team, amount = 1) => {
    team === "our"
      ? setOurScore(prev => prev + amount)
      : setOpponentScore(prev => prev + amount);
  }, []);

  const onRemovePoint = useCallback((team, amount = 1) => {
    team === "our"
      ? setOurScore(prev => Math.max(0, prev - amount))
      : setOpponentScore(prev => Math.max(0, prev - amount));
  }, []);

  const handleNewMatch = useCallback(async (newSettings) => {
    console.log("Starting new match setup...");
    setLoadingMatch(true);
    try {
      if (user?.id) {
        await axios.put(`${API_URL}/api/users/${user.id}/match-id`, 
          { currentMatchId: null }, 
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );
        console.log("Cleared currentMatchId from user profile.");
      }

      const payload = {
        userId: user?.id,
        teamName: newSettings?.teamName || "Our Team",
        opponentName: newSettings?.opponentName || opponentName || "Opponent",
        eventName: newSettings?.eventName || "",
        location: newSettings?.location || "",
        currentSet: 1,
        totalSets: newSettings?.totalSets || newSettings?.maxSets || 3,
        playAllSets: !!newSettings?.playAllSets,
        pointsNonDeciding: newSettings?.pointsNonDeciding || 25,
        pointsDeciding: newSettings?.pointsDeciding || 15,
        collaborativeMode: newSettings?.collaborativeMode,
        mode: newSettings?.mode || "Gameflow",
        courtPlayers: Array.from({ length: 6 }, (_, i) => ({
          id: `empty-filler-${i}`,
          name: "?",
          number: "?",
          isLibero: false,
        })),
        benchPlayers: benchPlayers || [],
        ourScore: 0,
        opponentScore: 0,
        ourSetsWon: 0,
        opponentSetsWon: 0,
        actionLog: [],
        substitutionLog: [],
        liberoSubTargets: {},
        setDeactivatedPlayers,
        setScores: [],
        creditedPlayersThisSet: [],
        teamStats: {
          ourEarned: 0,
          ourError: 0,
          oppEarned: 0,
          oppError: 0,
        },
      };

      console.log("📤 MATCH CREATION PAYLOAD - mode:", payload.mode, "full payload:", payload);
      
      const res = await axios.post(`${API_URL}/api/matches/save`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const newMatch = res.data;
      
      console.log("📥 MATCH CREATION RESPONSE - mode:", newMatch.mode, "full match:", newMatch);
      
      setCurrentMatchId(newMatch._id);
      await syncCurrentMatchIdToProfile(newMatch._id);
      
      setMatchSettings({
teamName: newMatch.teamName,
        opponentName: newMatch.opponentName || newSettings?.opponentName || opponentName || "Opponent",
        eventName: newMatch.eventName || "",
        location: newMatch.location || "",
        currentSet: newMatch.currentSet || 1,
        totalSets: newMatch.totalSets || 3,
        playAllSets: !!newSettings?.playAllSets,
        pointsNonDeciding: newMatch.pointsNonDeciding || 25,
        pointsDeciding: newMatch.pointsDeciding || 15,
        mode: newMatch.mode || newSettings?.mode || "Gameflow",
        _id: newMatch._id,
      });
      console.log("✅ matchSettings updated with mode:", newMatch.mode || newSettings?.mode || "Gameflow");

      setCourtPlayers(Array.from({ length: 6 }, (_, i) => ({
        id: `empty-filler-${i}`,
        name: "?",
        number: "?",
        isLibero: false,
      })));

      if (benchPlayers && benchPlayers.length > 0) {
        setBenchPlayers(benchPlayers);
      } else {
        console.warn("Bench players missing or empty during match creation.");
      }

      syncCreditedPlayersFromState([]);
      setSubstitutionLog([]);
      setActionLog([]);
      setAllowedLiberoSubTarget(null);
      setSlot5TargetId(null);
      setOurScore(0);
      setOpponentScore(0);
      setOurSetsWon(0);
      setOpponentSetsWon(0);
      setSetScores(newMatch.setScores || []);
      setServeSide("opponent");

    } catch (err) {
      console.error("Failed to create new match:", err);
      alert("Failed to create a new match. Try again.");
    } finally {
      setLoadingMatch(false);
    }
  }, [user?.id, token, benchPlayers, opponentName, syncCurrentMatchIdToProfile, syncCreditedPlayersFromState]);


const startCoachMatch = useCallback(
  async (teamName, overrides = {}) => {  // ← Arrow function starts HERE
    // 🔥 NOW the flag assignment is inside
    isCreatingNewMatchRef.current = true;
    
    const source = { ...matchSettings, ...overrides };
    const newSettings = {
      ...source,
      teamName,
      opponentName: source?.opponentName || "Opponent",
      totalSets: Math.max(1, source?.totalSets || 3),
      pointsNonDeciding: source?.pointsNonDeciding || 25,
      pointsDeciding: source?.pointsDeciding || 15,
      coachMode: true,
      mode: 'Coach',
      collaborativeMode: { enabled: false },
      playAllSets: !!source?.playAllSets,
    };

    console.log("🏐 COACH MATCH START - newSettings:", newSettings);
    
    setOurSetsWon(0);
    setOpponentSetsWon(0);
    setOurScore(0);
    setOpponentScore(0);
    
    try {
      await handleNewMatch(newSettings);
    } finally {
      // Reset flag after a delay
      setTimeout(() => {
        isCreatingNewMatchRef.current = false;
      }, 1000);
    }
    
    navigate("/coaches-corner/court");
  },
  [matchSettings, handleNewMatch, navigate]
);

const handleDeletePlayer = useCallback(async (id) => {
  try {
    await axios.delete(
      `${API_URL}/api/players/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      }
    );
    await refreshBenchPlayers();
  } catch (error) {
    console.error("Error deleting player:", error);
    alert("Failed to delete player.");
  }
}, [refreshBenchPlayers, token]);

  
  const handlePlayerUpdate = useCallback(async (id, updates) => {
    try {
      await axios.put(`${API_URL}/api/players/${id}`, updates, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      await refreshBenchPlayers();
      console.log("Player updated successfully");
    } catch (error) {
      console.error("Error updating player:", error);
      alert("Failed to update player.");
    }
  }, [refreshBenchPlayers, token]); 

  const removeGamesPlayedCredit = useCallback(async (playerId) => {
    if (!playerId || !currentMatchId) {
      console.warn("Cannot remove games played credit - missing playerId or matchId");
      return false;
    }

    try {
      console.log(`Removing games played credit for player: ${playerId}`);
      
      const response = await axios.post(`${API_URL}/api/players/decrement-games-played`, {
        playerIds: [playerId],
        matchId: currentMatchId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      creditedPlayersThisSetRef.current.delete(playerId);
      setCreditedPlayersThisSet(prev => prev.filter(id => id !== playerId));
      
      console.log(`Successfully removed games played credit for player ${playerId}`, response.data);
      return true;
    } catch (err) {
      console.error(`Failed to remove games played credit for player ${playerId}:`, err.response?.data || err.message);
      return false;
    }
  }, [currentMatchId, token]);

  const handlePlayerCreate = useCallback(async (playerData) => {
    if (!user?.id || !matchSettings?.teamName) {
      alert("Cannot create player: User or Team Name missing.");
      return;
    }
    try {
      await axios.post(`${API_URL}/api/players`, {
        ...playerData,
        userId: user.id,
        team: matchSettings.teamName
      });
      await refreshBenchPlayers();
    } catch (error) {
      console.error("Error creating player:", error);
      alert("Failed to create player. Please select the team above and make sure the player number is unique.");
    }
  }, [user?.id, matchSettings?.teamName, refreshBenchPlayers]);

  const onResetBench = useCallback(async () => {
    if (!matchSettings?.teamName) {
      alert("Cannot reset bench: Team name not set.");
      return;
    }
    const confirmReset = window.confirm(
      `Are you sure you want to delete ALL players associated with team "${matchSettings.teamName}" from the database? This cannot be undone.`
    );
    if (confirmReset) {
      try {
        await axios.delete(`${API_URL}/api/players`, {
          params: { userId: user.id, team: matchSettings.teamName }
        });
        setBenchPlayers([]);
        clearCourt();
        alert(`All players for team "${matchSettings.teamName}" deleted.`);
      } catch (error) {
        console.error("Error resetting bench:", error);
        alert("Failed to reset bench.");
      }
    }
  }, [matchSettings?.teamName, user?.id, clearCourt]);

  const onRecallBench = useCallback(async (team) => {
    if (!team) {
      alert("Please provide a team name to recall.");
      return;
    }
    if (!user?.id) {
      alert("Cannot recall bench: User not logged in.");
      return;
    }
    try {
      const response = await 
		axios.get(`${API_URL}/api/players`, {
  params: { team: team },
  headers: { Authorization: `Bearer ${token}` },
  withCredentials: true,
});
      
      
      const currentCourtPlayerIds = new Set(
        courtPlayers.map(p => p?._id).filter(id => id)
      );
      const fetchedBenchPlayers = response.data.filter(
        player => !currentCourtPlayerIds.has(player._id)
      );
      setBenchPlayers(fetchedBenchPlayers);
      alert(`Players for team "${team}" recalled to bench.`);
    } catch (error) {
      console.error("Error recalling bench:", error);
      alert(`Failed to recall players for team "${team}".`);
    }
  }, [user?.id, courtPlayers]);

  const SaveStatusIndicator = useCallback(() => {
    if (!saveStatus) return null;
    
    const statusConfig = {
      saving: { text: "Saving...", color: "#FFA500", icon: "Loading" },
      saved: { text: "Saved", color: "#4CAF50", icon: "Check" },
      error: { text: "Save Failed", color: "#F44336", icon: "Error" }
    };
    
    const config = statusConfig[saveStatus];
    
    return (
      <div style={{
        position: "fixed",
        top: showHeader ? "120px" : "60px",
        left: "10px",
        zIndex: 1001,
        padding: "8px 12px",
        borderRadius: "6px",
        fontSize: "14px",
        background: config.color,
        color: "white",
        border: "none",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        display: "flex",
        alignItems: "center",
        gap: "5px",
        transition: "all 0.3s ease"
      }}>
        <span>{config.icon}</span>
        <span>{config.text}</span>
      </div>
    );
  }, [saveStatus, showHeader]);

const CONSENT_INTERVAL_DAYS = 28;
const CONSENT_MAX_DISMISSES = 3;

const getConsentMeta = () => ({
  lastPrompt: Number(localStorage.getItem("lh_emailConsent_lastPrompt") || 0),
  dismissCount: Number(localStorage.getItem("lh_emailConsent_dismissCount") || 0),
});

const markConsentPrompted = () => {
  localStorage.setItem("lh_emailConsent_lastPrompt", Date.now().toString());
};

const markConsentDismissed = () => {
  const { dismissCount } = getConsentMeta();
  localStorage.setItem(
    "lh_emailConsent_dismissCount",
    String(dismissCount + 1)
  );
};

const enableEmailConsent = async () => {
  try {
    await axios.put(
      `${API_URL}/api/users/${user.id}`,
      { consentToEmails: true },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      }
    );

    setHasEmailConsent(true);
    setShowEmailConsentModal(false);
    localStorage.removeItem("lh_emailConsent_dismissCount");
  } catch (err) {
    alert("Failed to enable email updates. Please try again.");
  }
};

const dismissEmailConsent = () => {
  markConsentDismissed();
  setShowEmailConsentModal(false);
};


useEffect(() => {
  if (!user?.id || !token) return;

  // never show on auth pages
  if (location.pathname === "/login" || location.pathname === "/register") {
    return;
  }

  let cancelled = false;

  const checkConsent = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      if (cancelled) return;

      const consent = !!res.data?.consentToEmails;
      setHasEmailConsent(consent);
      setEmailConsentChecked(true);

      if (consent) return;

      const { lastPrompt, dismissCount } = getConsentMeta();
      if (dismissCount >= CONSENT_MAX_DISMISSES) return;

      const daysSince =
        (Date.now() - lastPrompt) / (1000 * 60 * 60 * 24);

      if (!lastPrompt || daysSince >= CONSENT_INTERVAL_DAYS) {
        markConsentPrompted();
        setShowEmailConsentModal(true);
      }
    } catch (err) {
      console.warn("Email consent check failed:", err);
    }
  };

  checkConsent();
  return () => { cancelled = true; };
}, [user?.id, token, location.pathname]);



  useEffect(() => {
    const handleUserLogout = () => {
      console.log("User logout detected, clearing match state");
      clearAllMatchState();
    };

    window.addEventListener('userLogout', handleUserLogout);
    return () => window.removeEventListener('userLogout', handleUserLogout);
  }, [clearAllMatchState]);

  useEffect(() => {
    const currentUserId = user?.id;
    const previousUserId = previousUserRef.current;

    if (previousUserId && !currentUserId) {
      console.log(`User logged out, clearing state`);
      clearAllMatchState();
    } else if (previousUserId && currentUserId && previousUserId !== currentUserId) {
      if (!matchSettings?.collaborativeMode?.enabled) {
        console.log(`User switched (non-collaborative), clearing state`);
        clearAllMatchState();
      }
    }

    previousUserRef.current = currentUserId;
  }, [user?.id, clearAllMatchState, matchSettings?.collaborativeMode?.enabled]);

  useEffect(() => {
    if (matchSettings && matchSettings.teamName && !isRestoringMatch) {
      refreshBenchPlayers();
    }
  }, [matchSettings?.teamName, isRestoringMatch, refreshBenchPlayers]);

  useEffect(() => {
    const performAutoSave = async () => {
      try {
        if (currentMatchId && previousPathname.current !== location.pathname) {
          console.log(`Auto-saving match before navigation (${previousPathname.current} -> ${location.pathname})`);
          await saveMatchData(false);
          console.log("Auto-save completed successfully");
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    };

    if (previousPathname.current !== null) {
      performAutoSave();
    }

    previousPathname.current = location.pathname;
  }, [location.pathname, currentMatchId, saveMatchData]);

 useEffect(() => {
  if (!currentMatchId || location.pathname !== "/") return;

  const actionCount = actionLog?.length || 0;

  // ✅ only autosave every 8 actions (tune this)
  if (actionCount - lastSavedActionCountRef.current < 8) return;

  const timeoutId = setTimeout(() => {
    if (saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    saveMatchData(false)
      .then(() => {
        lastSavedActionCountRef.current = actionCount;
      })
      .finally(() => {
        saveInFlightRef.current = false;
      });
  }, AUTO_SAVE_DELAY);

  return () => clearTimeout(timeoutId);
}, [
  courtPlayers,
  positionMapping,
  substitutionLog,
  actionLog?.length,          // ✅ length only
  currentMatchId,
  location.pathname,
  saveMatchData
]);


 useEffect(() => {
  if (!currentMatchId || location.pathname !== "/express" || !matchSettings?.teamName) return;

  const actionCount = actionLog?.length || 0;

  // ✅ only autosave every 12 actions in express (tune this)
  if (actionCount - lastSavedActionCountRef.current < 12) return;

  const timeoutId = setTimeout(() => {
    if (saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    saveMatchData(false)
      .then(() => {
        lastSavedActionCountRef.current = actionCount;
      })
      .finally(() => {
        saveInFlightRef.current = false;
      });
  }, 1500);

  return () => clearTimeout(timeoutId);
}, [
  courtPlayers,
  positionMapping,
  substitutionLog,
  actionLog?.length,          // ✅ length only
  currentMatchId,
  location.pathname,
  matchSettings?.teamName,
  saveMatchData
]);


const handleLogout = useCallback(async () => {
  try {
    // optional: tell server (ignore failures)
    await axios.post(`${API_URL}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
  } catch (_) {}

  removeToken?.();
  setUser?.(null);

  // clear in-app match state via the listener you already have
  window.dispatchEvent(new Event('userLogout'));

  // go to login
  navigate('/login', { replace: true });
}, [token, removeToken, setUser, navigate]);

  useEffect(() => {
    if (!currentMatchId || location.pathname !== '/') return;

    const intervalId = setInterval(async () => {
      try {
        await saveMatchData(false);
        console.log("Periodic auto-save completed (3 min interval)");
      } catch (err) {
        console.error("Periodic auto-save failed:", err);
      }
    }, PERIODIC_SAVE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [currentMatchId, location.pathname, saveMatchData]);

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (!currentMatchId) return;

      try {
        await saveMatchData(false);
      } catch (err) {
        console.error("beforeunload comprehensive save failed, falling back to beacon:", err);
        
        try {
          const blob = new Blob([JSON.stringify(syncPayloadRef.current)], {
            type: "application/json",
          });
          navigator.sendBeacon(`${API_URL}/api/matches/${currentMatchId}/sync-state`, blob);
        } catch (beaconErr) {
          console.error("beacon save also failed:", beaconErr);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentMatchId, saveMatchData]);

  useEffect(() => {
    syncPayloadRef.current = {
      substitutionLog,
      courtPlayers,
      benchPlayers,
      currentSet,
      totalSets,
      actionLog,
      ourScore,
      opponentName,
      opponentScore,
      teamStats,
      ourSetsWon,
      opponentSetsWon,
      setScores,
      liberoSubTargets: {
        allowedLiberoSubTarget,
        slot5TargetId,
      },
      lastUpdated: new Date().toISOString(),
    };
  }, [
    substitutionLog,
    courtPlayers,
    benchPlayers,
    currentSet,
    totalSets,
    actionLog,
    ourScore,
    opponentName,
    opponentScore,
    teamStats,
    ourSetsWon,
    opponentSetsWon,
    setScores,
    allowedLiberoSubTarget,
    slot5TargetId
  ]);

const showWaitForOwnerOverlay = useCallback((info) => {
  console.log("Showing waiting overlay for non-owner:", info);
  setUiState(s => ({
    ...s,
    setEnding: { waitingForOwner: true, info }
  }));
}, []);

// Set ending logic effect
// Replace your entire set ending useEffect with this complete version:

// Add this separate useEffect BEFORE the set ending one - runs independently
// REPLACE your existing set ending useEffects with this single, consolidated version

// 1. Recovery mechanism - runs independently
useEffect(() => {
  const recoveryInterval = setInterval(() => {
    const now = Date.now();
    
    if (setEndingInProgressRef.current && window.setEndingLockTime) {
      const lockAge = now - window.setEndingLockTime;
      if (lockAge > 10000) {
        console.error(`🔓 RECOVERY: Force clearing stuck lock (${lockAge}ms)`);
        setEndingInProgressRef.current = false;
        window.setEndingLockTime = null;
      }
    }
    
    if (isRestoringScoresRef.current && window.scoreRestorationStartTime) {
      const restoreAge = now - window.scoreRestorationStartTime;
      if (restoreAge > 5000) {
        console.error(`🔓 RECOVERY: Force clearing stuck restoration (${restoreAge}ms)`);
        isRestoringScoresRef.current = false;
        window.scoreRestorationStartTime = null;
      }
    }
  }, 10000);

  return () => clearInterval(recoveryInterval);
}, []);

// 2. Single set ending detection - direct dependency on scores


useEffect(() => {

	
  console.log("SET ENDING EFFECT FIRED:", {
    ourScore,
    opponentScore,
    hasMatchId: !!currentMatchId,
    hasSettings: !!matchSettings?.totalSets,
    isRestoring: isRestoringMatchRef.current,
    isRestoringScores: isRestoringScoresRef.current,
    isLocked: setEndingInProgressRef.current,
    pathname: location.pathname,
    timestamp: new Date().toISOString()
  });

  // Early exit conditions
  if (!currentMatchId || !matchSettings?.totalSets || isRestoringMatchRef.current || location.pathname === '/settings') {
    return;
  }

  // Check score restoration flag
  if (isRestoringScoresRef.current) {
    if (!window.scoreRestorationStartTime) {
      window.scoreRestorationStartTime = Date.now();
    }
    const restoreAge = Date.now() - window.scoreRestorationStartTime;
    
    if (restoreAge > 3000) {
      console.warn(`OVERRIDE: Score restoration stuck for ${restoreAge}ms, clearing`);
      isRestoringScoresRef.current = false;
      window.scoreRestorationStartTime = null;
    } else {
      console.log(`EXIT: Scores are restoring (${restoreAge}ms)`);
      return;
    }
  } else {
    window.scoreRestorationStartTime = null;
  }

/* if (location.pathname === "/coaches-corner/court") {
    setEndingInProgressRef.current = false;
  } */


  // Check lock
  if (setEndingInProgressRef.current) {
    if (!window.setEndingLockTime) {
      window.setEndingLockTime = Date.now();
    }
    const lockAge = Date.now() - window.setEndingLockTime;
    
    if (lockAge > 60000) {
      console.error(`RECOVERY: Lock stuck for ${lockAge}ms, forcing clear`);
      setEndingInProgressRef.current = false;
      window.setEndingLockTime = null;
    } else {
      console.log(`EXIT: Set ending locked (${lockAge}ms ago)`);
      return;
    }
  } else {
    window.setEndingLockTime = null;
  }

  // 🔥 FIX: Only delay for owners or non-collaborative mode
  const inCollaborative = !!matchSettings?.collaborativeMode?.enabled;
  const owner = isMatchOwner();
  const shouldDelay = !inCollaborative || owner;
  const delayMs = shouldDelay ? 1000 : 0;

  console.log("DELAYING:", { delayMs, inCollaborative, owner });
  
  const delayTimer = setTimeout(() => {
    console.log("CHECKING SET COMPLETION after delay:", {
      currentSet: matchSettings.currentSet,
      ourScore,
      opponentScore,
      ourSetsWon,
      opponentSetsWon,
      totalSets: matchSettings.totalSets,
      isOwner: owner,
      collaborativeMode: inCollaborative,
      isConnected
    });

    // Calculate requirements
    const isPlayAll = Boolean(matchSettings.playAllSets);
    const isDecidingSet = matchSettings.currentSet === matchSettings.totalSets;
    const requiredPoints = isPlayAll 
      ? (matchSettings.pointsNonDeciding || 25)
      : (isDecidingSet ? (matchSettings.pointsDeciding || 15) : (matchSettings.pointsNonDeciding || 25));

    const isComplete = (ourScore >= requiredPoints || opponentScore >= requiredPoints) && 
                       Math.abs(ourScore - opponentScore) >= 2;

    if (!isComplete) {
      console.log("SET NOT COMPLETE");
      return;
    }

    // Validate we haven't already played all sets
    const setsCompleted = ourSetsWon + opponentSetsWon;
    if (setsCompleted >= matchSettings.totalSets) {
      console.error("ALL SETS ALREADY PLAYED");
      return;
    }

    // Determine winner
    const winner = ourScore > opponentScore ? "our" : "opponent";
    const winnerName = winner === "our"
      ? (matchSettings.teamName || "Our Team")
      : (opponentName || "Opponent");

    const newOurSets = ourSetsWon + (winner === "our" ? 1 : 0);
    const newOpponentSets = opponentSetsWon + (winner === "opponent" ? 1 : 0);
    const totalSetsPlayed = newOurSets + newOpponentSets;
	const totalSets = matchSettings?.totalSets || 3;
	const usingDefault = !matchSettings?.totalSets;
    const setsToWin = Math.ceil(totalSets / 2);
    const isMatchOver = isPlayAll
      ? (totalSetsPlayed >= matchSettings.totalSets)
      : (newOurSets >= setsToWin || newOpponentSets >= setsToWin);

console.log(`totalSets = ${totalSets} (${usingDefault ? 'DEFAULT' : 'from matchSettings'})`);

    console.log("SET COMPLETE DETECTED!", {
      winner,
      score: `${ourScore}-${opponentScore}`,
      newOurSets,
      newOpponentSets,
      isMatchOver
    });

    // Set lock
    setEndingInProgressRef.current = true;
    window.setEndingLockTime = Date.now();
	
if (location.pathname === "/coaches-corner/court") {
  console.log("APP: Intercepted for Coach Mode. Signaling CoachCourt UI.");
  console.log("🔄 Updating sets won:", { newOurSets, newOpponentSets });
  
  // 🔥 NOW update sets won state for Coach mode
  setOurSetsWon(newOurSets);
  setOpponentSetsWon(newOpponentSets);
  
  setIsSetComplete(true);
  return;
}

    const executeSetEnding = async () => {
      try {
        if (!inCollaborative) {
          console.log('INDIVIDUAL: Processing set ending');
          await handleSetEndingIndividually(winner, winnerName, newOurSets, newOpponentSets, isMatchOver);
        } else if (owner) {
          console.log('OWNER: Processing set ending in collaborative mode');
          await handleSetEndingAsOwner(winner, winnerName, newOurSets, newOpponentSets, isMatchOver);
        } else {
          console.log('NON-OWNER: Showing wait overlay with minimum display time');
          const completionInfo = { winner, winnerName, newOurSets, newOpponentSets, isMatchOver };
          
          // 🔥 FIX: Mark when overlay was shown
          window.setEndingOverlayShownAt = Date.now();
          
          if (typeof showWaitForOwnerOverlay === 'function') {
            showWaitForOwnerOverlay(completionInfo);
          }
        }
      } catch (error) {
        console.error("SET ENDING ERROR:", error);
      } finally {
        setTimeout(() => {
          setEndingInProgressRef.current = false;
          window.setEndingLockTime = null;
        }, 10000);
      }
    };

    executeSetEnding();
  }, delayMs);

  return () => {
    clearTimeout(delayTimer);
  };

}, [
  currentMatchId,
  ourScore,
  opponentScore,
  matchSettings?.currentSet,
  matchSettings?.totalSets,
  matchSettings?.playAllSets,
  matchSettings?.pointsNonDeciding,
  matchSettings?.pointsDeciding,
  matchSettings?.teamName,
  matchSettings?.collaborativeMode?.enabled,
  ourSetsWon,
  opponentSetsWon,
  opponentName,
  collaborativeMode,
  isConnected,
  location.pathname,
  handleSetEndingAsOwner,
  handleSetEndingIndividually,
  isMatchOwner,
  showWaitForOwnerOverlay
]);


  useEffect(() => {
    if (!socket || !collaborativeMode) return;

    const toNum = (v) => (v === undefined || v === null ? NaN : Number(v));

    const handleScoreUpdate = (data) => {
      console.log("App.js: Received collaborative score update:", data);

      const our = toNum(data.ourScore);
      const opp = toNum(data.opponentScore);
      if (Number.isFinite(our)) setOurScore(our);
      if (Number.isFinite(opp)) setOpponentScore(opp);

      setTeamStats((prev) => {
        const next = { ...prev };
        switch (data.reason) {
          case 'earned':
            next.ourEarned = (next.ourEarned || 0) + 1;
            break;
          case 'opponent_error':
            next.oppError = (next.oppError || 0) + 1;
            break;
          case 'opponent_earned':
            next.oppEarned = (next.oppEarned || 0) + 1;
            break;
          case 'our_error':
            next.ourError = (next.ourError || 0) + 1;
            break;
          default:
            break;
        }
        return next;
      });

      setBallState('serve');
      setCurrentServeSide(data.team);
      setBallSide(data.team);

    console.log("🔴 APP.JS: After state updates:", {
      setBallStateTo: 'serve',
      setCurrentServeSideTo: data.team,
      setBallSideTo: data.team
    });

      const me = user?.id || user?._id;
      const actorId = data.updatedBy?.userId || data.userId;
      const actorName = actorId === me ? 'You' : (data.updatedBy?.username || 'Another user');
      const actionText = `${actorName} scored: ${data.reason}`;

      setActionLog((prev) => [
        ...prev,
        {
          action: actionText,
          timestamp: data.timestamp || new Date().toISOString(),
          type: 'collaborative_score_update',
          meta: {
            source: 'collaborative',
            team: data.team,
            reason: data.reason,
            newScore: data.newScore
          }
        }
      ]);
    };

    socket.on('score_updated', handleScoreUpdate);
    return () => socket.off('score_updated', handleScoreUpdate);
  }, [
    socket,
    collaborativeMode,
    user?.id,
    user?._id,
    setOurScore,
    setOpponentScore,
    setTeamStats,
    setBallState,
    setCurrentServeSide,
    setBallSide,
    setActionLog
  ]);


useEffect(() => {
  // Only run when pathname actually changes
  if (previousPathname.current === location.pathname) {
    return;
  }
  
  const fromPath = previousPathname.current;
  const toPath = location.pathname;
  
  console.log(`🔄 Navigation: ${fromPath} → ${toPath}`);
  
  // 🔥 FIX: Convert ONLY when switching between Court and Express modes
  if (toPath === '/express' && fromPath === '/') {
    console.log("🔵 Entering Express Mode - converting from slot order to display order");
    
    // Court Mode → Express Mode: Reorder from slot positions to display order
    // Court stores in slot order: [Pos4, Pos3, Pos2, Pos5, Pos6, Pos1]
    // Express needs display order: [Pos1, Pos2, Pos3, Pos4, Pos5, Pos6]
    
    setCourtPlayers(prevPlayers => {
      const displayOrderPlayers = ['4','3','2','5','6','1'].map(targetPosition => {
        // Find which slot has this position
        const slotIndex = Object.entries(positionMapping).find(
          ([slot, pos]) => String(pos) === targetPosition
        )?.[0];
        
        if (slotIndex !== undefined) {
          const player = prevPlayers[Number(slotIndex)];
          if (player && player.name !== "?") {
            return {
              ...player,
              expressPosition: targetPosition
            };
          }
        }
        
        return {
          id: `empty-${targetPosition}`,
          name: "?",
          number: "?",
          isLibero: false,
          expressPosition: targetPosition
        };
      });
      
      console.log("✅ Display order:", displayOrderPlayers.map((p, i) => 
        `DisplaySlot${i}=${p.name}:Pos${p.expressPosition}`
      ));
      
      return displayOrderPlayers;
    });
  } 
  else if (toPath === '/' && fromPath === '/express') {
    console.log("🔴 Returning to Court Mode - converting from display order to slot order");
    
    // Express Mode → Court Mode: Reorder from display order to slot positions
    // Express stores in display order: [Pos1, Pos2, Pos3, Pos4, Pos5, Pos6]
    // Court needs slot order: [Pos4, Pos3, Pos2, Pos5, Pos6, Pos1]
    
    setCourtPlayers(prevPlayers => {
      const slotOrderPlayers = Array(6).fill(null).map((_, slotIndex) => {
        const positionForSlot = positionMapping[slotIndex] || ['4','3','2','5','6','1'][slotIndex];
        
        // Find player with this position in current array
        const player = prevPlayers.find(p => 
          p && p.expressPosition === positionForSlot
        );
        
        if (player && player.name !== "?") {
          return {
            ...player,
            expressPosition: positionForSlot
          };
        }
        
        return {
          id: `empty-${slotIndex}`,
          name: "?",
          number: "?",
          isLibero: false,
          expressPosition: positionForSlot
        };
      });
      
      console.log("✅ Slot order:", slotOrderPlayers.map((p, i) => 
        `Slot${i}=${p.name}:Pos${p.expressPosition}`
      ));
      
      return slotOrderPlayers;
    });
  }
  
  // Update the ref for next navigation
  previousPathname.current = location.pathname;
}, [location.pathname, positionMapping]);

  useEffect(() => {
    let isMounted = true;
    const restoreMatchIdFromUser = async () => {
	if (isCreatingNewMatchRef.current) {
  console.log("Skipping restore (creating new match)");
  if (isMounted) setMatchRestored(true);
  return;  
}
      if (!user?.id) {
        if (isMounted) {
          clearAllMatchState();
          setMatchRestored(true);
        }
        return;
      }

      console.log(`Restoring match data for user: ${user.id} with teams: ${user.teams?.join(', ') || 'none'}`);
      
      try {
        const res = await axios.get(`${API_URL}/api/users/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        
        if (res.data?.id !== user.id && res.data?._id !== user.id) {
          console.error("SECURITY: User ID mismatch in response!");
          clearAllMatchState();
          if (isMounted) setMatchRestored(true);
          return;
        }

        const storedMatchId = res.data?.currentMatchId;
        if (storedMatchId && isMounted) {
          console.log(`Found match ID for user ${user.id}: ${storedMatchId}`);
          setCurrentMatchId(storedMatchId);
          await setMatchId(storedMatchId);
        } else {
          console.log(`No active match found for user ${user.id}`);
        }
      } catch (err) {
        console.error("Fetch match ID failed:", err);
        clearAllMatchState();
      } finally {
        if (isMounted) setMatchRestored(true);
      }
    };

    const timeoutId = setTimeout(restoreMatchIdFromUser, 100);
    
    return () => { 
      clearTimeout(timeoutId);
      isMounted = false; 
    };
  }, [user?.id, user?.teams, token, clearAllMatchState, setMatchId]);

    useEffect(() => {
    const loadMatch = async () => {
      if (!matchRestored || !currentMatchId || !user?.id) return;

      console.log(`Loading match ${currentMatchId} for user ${user.id}`);
      setLoadingMatch(true);
      setIsRestoringMatch(true);
      isRestoringMatchRef.current = true;

      try {
        const res = await axios.get(`${API_URL}/api/matches/${currentMatchId}`);
        const match = res.data;
        
        if (match.status === "Final") {
          console.log(`Match ${currentMatchId} is finalized, clearing currentMatchId`);
          
          try {
            await axios.put(`${API_URL}/api/users/${user.id}/match-id`, {
              currentMatchId: null,
            }, {
              headers: { Authorization: `Bearer ${token}` },
              withCredentials: true,
            });
            console.log("Cleared currentMatchId from user profile");
          } catch (err) {
            console.error("Failed to clear currentMatchId from user profile:", err);
          }
          
          clearAllMatchState();
          return;
        }

        // Security check
        const isOwner = String(match.userId) === String(user.id || user._id);
        const hasTeamAccess = user.teams && user.teams.includes(match.teamName);
        const canAccessMatch = isOwner || hasTeamAccess;

        if (!canAccessMatch) {
          console.error(`SECURITY: User ${user.id} cannot access match ${currentMatchId}`);
          console.log(`Match owner: ${match.userId}, Match team: ${match.teamName}`);
          console.log(`User teams: ${user.teams?.join(', ') || 'none'}`);
          
          alert("Access denied: You don't have permission to view this match. This may be from a different team or user.");
          clearAllMatchState();
          return;
        }

        // Collaborative match check for Game Flow Mode
        if (match.collaborativeMode?.enabled && !isOwner && location.pathname === '/') {
          console.warn(`COLLABORATIVE: Non-owner ${user.id} attempted to access collaborative match ${currentMatchId} in Game Flow Mode`);
          
          alert(
            "This is a collaborative match.\n\n" +
            "Game Flow Mode is only available to the match owner. " +
            "Please use Express Logger mode to contribute to this match.\n\n" +
            "You will be redirected to Express Logger."
          );
          
          // Redirect to Express Logger
          navigate('/express');
          return;
        }

        // Restore match data
        const teamNameFromSettings = match.teamName?.trim();
        const teamNameFallback = "Your Team";
        const resolvedTeamName = teamNameFromSettings || teamNameFallback;
        setTotalSets(match.totalSets);

        if (!resolvedTeamName) {
          alert("This match does not have a valid team name. Please go to Settings and select one.");
          return;
        }

        setOpponentName(match.opponentName || "Opponent");

        setMatchSettings({
          teamName: resolvedTeamName,
          opponentName: match.opponentName || "Opponent",
          eventName: match.eventName || "LOGGERHEAD.APP",
          location: match.location || "",
          currentSet: match.currentSet || 1,
          totalSets: match.totalSets || match.maxSets || 3,
          playAllSets: match.playAllSets ?? false,
          pointsNonDeciding: match.pointsNonDeciding || 25,
          pointsDeciding: match.pointsDeciding || 15,
          mode: match.mode || "Gameflow",
          collaborativeMode: match.collaborativeMode,
          userId: isOwner ? (match.userId || user.id) : undefined,
          _id: match._id,
        });

        // Restore court players
        const hydratedCourtPlayers = (match.courtPlayers || []).map((slot, i) => {
          if (!slot) {
            console.warn(`Court slot ${i} missing player info. Using placeholder.`);
            return { id: `empty-${i}`, name: "?", number: "?", isLibero: false };
          }

          if (typeof slot === "string") {
            const found = (match.benchPlayers || []).find(p => p._id === slot);
            if (!found) {
              console.warn(`Court slot ${i} could not find player ${slot} in benchPlayers.`);
              return { id: slot, name: "?", number: "?" };
            }
            return {
              _id: found._id,
              id: found._id,
              name: found.name || "?",
              number: found.number || "?",
              isLibero: found.isLibero || false,
              replacedPlayer: found.replacedPlayer || null,
              careerStats: found.careerStats || {},
              seasonStats: found.seasonStats || {},
            };
          } else {
            return {
              _id: slot._id || `empty-${i}`,
              id: slot.id || slot._id || `empty-${i}`,
              name: slot.name || "?",
              number: slot.number || "?",
              isLibero: slot.isLibero || false,
              replacedPlayer: slot.replacedPlayer || null,
              careerStats: slot.careerStats || {},
              seasonStats: slot.seasonStats || {},
            };
          }
        });

        const filledCourtPlayers = [
          ...hydratedCourtPlayers,
          ...Array.from({ length: Math.max(0, 6 - hydratedCourtPlayers.length) }, (_, i) => ({
            id: `empty-filler-${i}`,
            name: "?",
            number: "?",
            isLibero: false,
          }))
        ].slice(0, 6);

        setCourtPlayers(filledCourtPlayers);

        if (match.collaborativeMode?.enabled) {
          setTimeout(async () => {
            if (collaborativeMode && isConnected && syncCourtPlayers) {
              console.log("Syncing restored court players to other users");
              
              const success = await syncCourtPlayers(filledCourtPlayers, {
                source: 'match_restoration',
                userId: user.id,
                username: user.username || user.name,
                timestamp: new Date().toISOString()
              });
              
              if (success) {
                console.log("Court players synced after restoration");
              }
            }
          }, 1000);
        }
        
        setBenchPlayers(Array.isArray(match.benchPlayers) ? match.benchPlayers : []);
        
        isRestoringScoresRef.current = true;
        const {
          ourScore: restoredOurScore,
          opponentScore: restoredOpponentScore,
          setScores: restoredSetScores,
          currentSet: restoredCurrentSet,
        } = restoreScoresFromDatabase(match);

        setOurScore(restoredOurScore);
        setOpponentScore(restoredOpponentScore);

        // Use restored setScores/currentSet (may be sanitized if corruption detected)
        setSetScores(Array.isArray(restoredSetScores) ? restoredSetScores : []);
        setCurrentSet(typeof restoredCurrentSet === "number" ? restoredCurrentSet : (match.currentSet || 1));
        setMatchSettings((prev) => ({
          ...prev,
          currentSet: typeof restoredCurrentSet === "number" ? restoredCurrentSet : (match.currentSet || 1),
        }));

        setTimeout(() => {
          isRestoringScoresRef.current = false;
        }, 1000);

setSubstitutionLog(match.substitutionLog || []);
        setActionLog(match.actionLog || []);
        setTeamStats(match.teamStats || {
          ourEarned: 0,
          ourError: 0,
          oppEarned: 0,
          oppError: 0,
        });
        setAllowedLiberoSubTarget(match.liberoSubTargets?.allowedLiberoSubTarget || null);
        setSlot5TargetId(match.liberoSubTargets?.slot5TargetId || null);
        setOurSetsWon(typeof match.ourSetsWon === "number" ? match.ourSetsWon : 0);
        setOpponentSetsWon(typeof match.opponentSetsWon === "number" ? match.opponentSetsWon : 0);
        // setScores restored above
        setDeactivatedPlayers(match.deactivatedPlayers || []);
        
        if (match.positionMapping) {
          setPositionMapping(match.positionMapping);
        } else {
          setPositionMapping({
            0: '4', 1: '3', 2: '2', 3: '5', 4: '6', 5: '1'
          });
        }

        if (match.creditedPlayersThisSet) {
          console.log("Restoring credited players from database:", match.creditedPlayersThisSet);
          syncCreditedPlayersFromState(match.creditedPlayersThisSet);
        } else {
          syncCreditedPlayersFromState([]);
        }

        const totalSetsCompleted = (match.ourSetsWon || 0) + (match.opponentSetsWon || 0);
        const expectedSet = totalSetsCompleted + 1;

        // If DB has an explicit currentSet, trust it.
        // If it's missing, fall back to the derived value.
        if (typeof match.currentSet !== "number") {
          console.warn(`Missing currentSet in match. Using expected set ${expectedSet}.`);
          setCurrentSet(expectedSet);
          setMatchSettings((prev) => ({ ...prev, currentSet: expectedSet }));
        } else if (match.currentSet !== expectedSet) {
          console.warn(`currentSet (${match.currentSet}) differs from expected (${expectedSet}). Trusting DB currentSet.`);
        }const savedGameState = match.gameState;
        if (savedGameState) {
          setServeSide(savedGameState.serveSide || "opponent");
          setBallState(savedGameState.ballState || "serve");
          setBallSide(savedGameState.ballSide || savedGameState.serveSide || "opponent");
          setCurrentServeSide(savedGameState.currentServeSide || savedGameState.serveSide || "opponent");
        } else {
          setServeSide("opponent");
          setBallState("serve");
          setBallSide("opponent");
          setCurrentServeSide("opponent");
        }

        if (match.collaborativeMode && match.collaborativeMode.enabled) {
          console.log("Restoring collaborative mode from match settings");
          const restored = restoreCollaborativeModeFromMatch(match.collaborativeMode);
          if (restored) {
            setTimeout(() => {
              console.log("Auto-joining collaborative match after restore");
            }, 1000);
          }
        }

        console.log("Match loaded successfully:", match);
        await syncCurrentMatchIdToProfile(match._id);
        await setMatchId(match._id);
        console.log("🔍 LOADED FROM DATABASE:", {
  currentSet: match.currentSet,
  ourScore: match.ourScore,
  opponentScore: match.opponentScore,
  courtPlayers: match.courtPlayers.map(p => p?.name),
  timestamp: new Date().toISOString()
});
      } catch (err) {
        console.error("Failed to load match:", err);
        alert(`Failed to load match with ID: ${currentMatchId}. Clearing data.`);
        clearAllMatchState();
      } finally {
        setLoadingMatch(false);
        setIsRestoringMatch(false);
        isRestoringMatchRef.current = false;
      }
    };

    loadMatch();
  }, [
    currentMatchId, 
    matchRestored, 
    user?.id, 
    restoreScoresFromDatabase,
    user?.teams, 
    clearAllMatchState, 
    syncCurrentMatchIdToProfile, 
    syncCreditedPlayersFromState, 
    restoreCollaborativeModeFromMatch,
    setMatchId,
    token,
    collaborativeMode,
    isConnected,
    syncCourtPlayers,
    navigate  // Added to dependencies
  ]);

useEffect(() => {
  console.log('🔍 Set ending handler useEffect check:', {
    hasSocket: !!socket,
    collaborativeMode,
    isConnected,
    currentMatchId,
    hasMatchSettings: !!matchSettings,
    matchCollabEnabled: matchSettings?.collaborativeMode?.enabled
  });

  // ✅ Wait for socket AND collaborative mode to be properly initialized
  if (!socket || !matchSettings) {
    console.log("⚠️ Waiting for socket and match settings to initialize");
    return;
  }

  // Only register handlers if collaborative mode is enabled
  if (!matchSettings?.collaborativeMode?.enabled) {
    console.log("ℹ️ Collaborative mode not enabled, skipping handler registration");
    return;
  }

  console.log('✅ Socket and collaborative mode ready, registering set ending handlers');

  const handleSetEndingDecision = (data) => {
  console.log("📨 NON-OWNER: Received set ending decision from owner:", data);
  
  if (data.matchId !== currentMatchId) {
    console.warn("Received set ending decision for different match, ignoring");
    return;
  }

  if (isMatchOwner()) {
    console.log("📨 OWNER: Skipping own set ending decision broadcast");
    return;
  }

  // 🔥 FIX: Ensure overlay was visible for at least 2 seconds
  const minimumDisplayTime = 2000; // 2 seconds
  const overlayShownAt = window.setEndingOverlayShownAt || 0;
  const timeShown = Date.now() - overlayShownAt;
  const remainingTime = Math.max(0, minimumDisplayTime - timeShown);

  const closeOverlayAndContinue = () => {
    console.log('🔓 Closing waiting overlay');
    setUiState(s => ({
      ...s,
      setEnding: { waitingForOwner: false, info: null }
    }));

    const message = data.isMatchOver 
      ? `${data.winnerName} wins the match ${data.newOurSets}-${data.newOpponentSets}!`
      : `${data.winnerName} wins set ${data.setNumber} (${data.finalScore}). Preparing for next set...`;
    
    alert(message);
    processSetEnding(data.winner, data.winnerName, data.newOurSets, data.newOpponentSets, data.isMatchOver);
  };

  if (remainingTime > 0) {
    console.log(`⏳ Waiting ${remainingTime}ms before closing overlay (minimum display time)`);
    setTimeout(closeOverlayAndContinue, remainingTime);
  } else {
    closeOverlayAndContinue();
  }
};

   

  const handleSetEndingCancelled = (data) => {
    console.log("📨 NON-OWNER: Owner cancelled set ending:", data);
    
    if (data.matchId !== currentMatchId) return;
    
    console.log('🔓 Closing waiting overlay (cancelled)');
    setUiState(s => ({
      ...s,
      setEnding: { waitingForOwner: false, info: null }
    }));
    
    console.log("Match owner chose not to continue to next set");
  };

  console.log('📝 Registering socket event handlers for set ending');
  socket.on('set_ending_decision', handleSetEndingDecision);
  socket.on('set_ending_cancelled', handleSetEndingCancelled);

  return () => {
    console.log('🧹 Cleaning up set ending socket handlers');
    socket.off('set_ending_decision', handleSetEndingDecision);
    socket.off('set_ending_cancelled', handleSetEndingCancelled);
  };
}, [socket, matchSettings, currentMatchId, processSetEnding]); // ✅ Added matchSettings

  useEffect(() => {
    const checkOrientation = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", checkOrientation);
    checkOrientation();
    return () => window.removeEventListener("resize", checkOrientation);
  }, []);

  useEffect(() => {
    console.log("Current setScores state:", setScores);
  }, [setScores]);

  // 🔥 Coach's Corner Dropdown Component
 const CoachesCornerDropdown = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // 🔥 GET COACHES CORNER ACCESS STATUS
  const { hasCoachesCorner } = useAuth();

  const toggleDropdown = (e) => {
    e.preventDefault();
    setDropdownOpen(!dropdownOpen);
  };

  const closeDropdown = () => {
    setDropdownOpen(false);
    setShowMobileMenu(false);
  };

  // 🔥 HANDLE LOCKED ITEMS - show alert instead of navigating
  const handleLockedClick = (e) => {
    e.preventDefault();
    alert("Coaches Corner requires a subscription to access Court & Stats.\n\nDrills are available to all users.");
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <a 
        href="#" 
        onClick={toggleDropdown}
        style={{
          textDecoration: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        Coach's Corner
        <span style={{
          fontSize: '12px',
          transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          display: 'inline-block'
        }}>
          ▼
        </span>
      </a>

      {dropdownOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          backgroundColor: '#fff',
          border: '1px solid #ddd',
          borderRadius: '6px',
          minWidth: '200px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          marginTop: '6px'
        }}>
          {/* DRILLS - Always accessible */}
          <a 
            href="/coaches-corner/drills"
            onClick={closeDropdown}
            style={{
              display: 'block',
              padding: '12px 16px',
              color: '#007AFF',
              textDecoration: 'none',
              borderBottom: '1px solid #f0f0f0',
              transition: 'background-color 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            📚 Drills
          </a>

          {/* COURT - Locked if no Coaches Corner access */}
          <a 
            href={hasCoachesCorner ? "/coaches-corner/court" : "#"}
            onClick={hasCoachesCorner ? closeDropdown : handleLockedClick}
            style={{
              display: 'block',
              padding: '12px 16px',
              color: hasCoachesCorner ? '#007AFF' : '#ccc',
              textDecoration: 'none',
              borderBottom: '1px solid #f0f0f0',
              transition: 'background-color 0.2s',
              cursor: hasCoachesCorner ? 'pointer' : 'not-allowed',
              backgroundColor: hasCoachesCorner ? 'transparent' : '#fafafa',
              opacity: hasCoachesCorner ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (hasCoachesCorner) {
                e.target.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (hasCoachesCorner) {
                e.target.style.backgroundColor = 'transparent';
              } else {
                e.target.style.backgroundColor = '#fafafa';
              }
            }}
            title={hasCoachesCorner ? "Coach's Corner - Court Analytics" : "Requires Coaches Corner subscription"}
          >
            🏐 Court {!hasCoachesCorner && <span style={{ marginLeft: '8px', fontSize: '11px' }}>🔒</span>}
          </a>

          {/* STATS - Locked if no Coaches Corner access */}
          <a 
            href={hasCoachesCorner ? "/coaches-corner/stats" : "#"}
            onClick={hasCoachesCorner ? closeDropdown : handleLockedClick}
            style={{
              display: 'block',
              padding: '12px 16px',
              color: hasCoachesCorner ? '#007AFF' : '#ccc',
              textDecoration: 'none',
              transition: 'background-color 0.2s',
              cursor: hasCoachesCorner ? 'pointer' : 'not-allowed',
              backgroundColor: hasCoachesCorner ? 'transparent' : '#fafafa',
              opacity: hasCoachesCorner ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (hasCoachesCorner) {
                e.target.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (hasCoachesCorner) {
                e.target.style.backgroundColor = 'transparent';
              } else {
                e.target.style.backgroundColor = '#fafafa';
              }
            }}
            title={hasCoachesCorner ? "Coach's Corner - Stats" : "Requires Coaches Corner subscription"}
          >
            📊 Stats {!hasCoachesCorner && <span style={{ marginLeft: '8px', fontSize: '11px' }}>🔒</span>}
          </a>
        </div>
      )}
    </div>
  );
};


  return (
      <DndProvider backend={backend}>
        <>
          {showHeader && (
            <header className="ios-header-bar" key={location.pathname}>
              <div className="ios-header-content">
                <div className="ios-logo-title">
                  <img
                    src="/web-app-manifest-192x192.png"
                    alt="Loggerhead Logo"
                    className="ios-logo-icon"
                  />
                  <span className="ios-app-title">
                    Loggerhead
                    <sub
                      style={{
                        fontSize: "0.6em",
                        marginLeft: "4px",
                        color: "#999999",
                        verticalAlign: "sub",
                      }}
                    >
                      v2.0
                    </sub>
                  </span>
                </div>
                {location.pathname !== "/login" &&
                  location.pathname !== "/register" && (
                    <button
                      className="ios-menu-toggle"
                      onClick={() => setShowMobileMenu((prev) => !prev)}
                    >
                      Menu
                    </button>
                  )}
              </div>
			  
{emailConsentChecked && !hasEmailConsent && showEmailConsentModal && (
  <EmailConsentModal
    onEnable={enableEmailConsent}
    onNotNow={dismissEmailConsent}
  />
)}

              {location.pathname !== "/login" &&
                location.pathname !== "/register" && (
                  <nav className={`ios-nav-links ${showMobileMenu ? "visible" : ""}`}>
                    <a href="/profile">Profile</a> | 
                    <a href="/settings">Rosters & Matches</a> |
                    <a href="/match">Game Flow Logger</a> | 
                    <a href="/express" style={{ 
                      position: 'relative', 
                      textDecoration: 'none',
                      display: 'inline-block' 
                    }}>
                      Express Logger
                    </a> | 
                    <a href="/stats">Player Stats</a> |
					<CoachesCornerDropdown /> |
                    <a href="/blogs/submit">Submit a Blog</a> |
									{user && (
  <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#ff3b30', fontWeight: 600, cursor: 'pointer' }}>
    Logout
  </button>
)}
                  </nav>
                )}

            </header>
          )}

 {location.pathname !== "/profile" && location.pathname !== "/login" && location.pathname !== "/register" && (
  <button
    onClick={toggleHeader}
    style={{
      position: "fixed",
      top: showHeader ? "20px" : "10px",
      right: "10px",
      zIndex: 1001,
      padding: "6px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      background: "#007AFF",
      color: "white",
      border: "none",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      cursor: "pointer",
    }}
  >
    {showHeader ? "Hide Header" : "Show"}
  </button>
)}

          <SaveStatusIndicator />

          {isPortrait && !isDismissed && location.pathname === "/" && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100dvw",
              height: "100dvh",
              backgroundColor: "#ddebe8",
              color: "#111",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              padding: "1rem",
              zIndex: 999999,
              textAlign: "center"
            }}>
              <button
                onClick={() => setIsDismissed(true)}
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "none",
                  border: "none",
                  fontSize: "60px",
                  cursor: "pointer",
                  color: "#555"
                }}
              >
                ×
              </button>
              <img
                src={`${process.env.PUBLIC_URL}/favicon-96x96.png`}
                alt="Flipped Loggerhead"
                style={{
                  width: "250px",
                  height: "250px",
                  transform: "rotate(210deg)",
                  marginBottom: "10%",
                  opacity: 0.9
                }}
              />
              <p style={{ fontWeight: "bold", fontSize: "50px" }}>
                Whoops!
              </p>
              <p style={{ fontSize: "50px" }}>
                Match logging works best in <strong>landscape</strong> mode.<br />
                Please rotate your device and help STANTON right himself.
              </p>
            </div>
          )}

          {user?.role === "admin" && (
            <header className="admin-header">
              <nav style={{
                display: "flex",
                justifyContent: "center",
                backgroundColor: "#333",
                color: "#fff",
                padding: "10px",
                gap: "20px",
                fontSize: "16px"
              }}>
                <Link to="/beta-admin" style={{ color: "#fff", textDecoration: "none" }}>Beta Admin</Link>
                <Link to="/env" style={{ color: "#fff", textDecoration: "none" }}>Env Check</Link>
                <Link to="/admin/blogs" style={{ color: "#fff", textDecoration: "none" }}>Blog Approvals</Link>
              </nav>
            </header>
          )}

{uiState.setEnding.waitingForOwner && uiState.setEnding.info && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 122, 255, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000
  }}>
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      padding: '32px',
      maxWidth: '500px',
      textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '24px' }}>⏳</div>
      <div style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
        Set Complete!
      </div>
      <div style={{ fontSize: '18px', color: '#666', marginBottom: '8px' }}>
        {uiState.setEnding.info.winnerName} wins set {matchSettings?.currentSet}
      </div>
      <div style={{ fontSize: '16px', color: '#999', fontStyle: 'italic', marginTop: '24px' }}>
        Waiting for match owner to continue...
      </div>
    </div>
  </div>
)}

          <Routes>
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/beta-admin" element={<PrivateRoute requiredRole="admin"><BetaAdminPage /></PrivateRoute>} />
            <Route path="/blogs" element={<BlogList />} />
            <Route path="/blogs/:id" element={<BlogPostPage />} />
            <Route path="/blogs/submit" element={<PrivateRoute><SubmitBlog /></PrivateRoute>} />
            <Route
              path="/admin/blogs"
              element={
                <PrivateRoute requiredRole="admin">
                  <BlogApprovalDashboard />
                </PrivateRoute>
              }
            />
			<Route path="/coaches-corner/" element={<CoachesCorner /> } />
            <Route path="/coaches-corner/drills" element={<SavedDrillsPage />} />
            <Route path="/coaches-corner/drills/:drillId" element={<DrillDetailPage />} />
             <Route path="/coaches-corner/drills/:drillId/edit" element={<EditDrillPage />} />

            <Route path="/faq" element={<FAQPage />} />
            <Route path="/how-to" element={<HowToPage />} />
            <Route path="/env" element={<PrivateRoute requiredRole="admin"><EnvCheck /></PrivateRoute>} />
			<Route
  path="/coaches-corner"
  element={
    <PrivateRoute>
      <CoachesCorner />
    </PrivateRoute>
  }
/>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
			<Route path="/coaches-corner/stats" element={<CoachStats />} />
            <Route 
              path="/profile" 
              element={
                <PrivateRoute>
                  <Profile setCurrentMatchId={setCurrentMatchId} />
                </PrivateRoute>
              } 
            />

                       <Route
              path="/"
              element={
                <PrivateRoute>
                  {loadingMatch ? (
                    <div style={{ 
                      padding: 40, 
                      textAlign: "center", 
                      fontSize: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '300px'
                    }}>
                      <div style={{ marginBottom: '20px', fontSize: '48px' }}>Loading</div>
                      <div>Loading match data...</div>
                    </div>
                  ) : !matchRestored ? (
                    <div style={{ 
                      padding: 40, 
                      textAlign: "center", 
                      fontSize: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '400px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '12px',
                      margin: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ marginBottom: '20px', fontSize: '64px' }}>⚙️</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: '#333' }}>
                        Restoring Match Data...
                      </div>
                      <div style={{ color: '#666', maxWidth: '400px' }}>
                        Please wait while we check for any in-progress matches.
                      </div>
                    </div>
                  ) : !currentMatchId ? (
                    <div style={{ 
                      padding: 40, 
                      textAlign: "center", 
                      fontSize: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '400px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '12px',
                      margin: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ marginBottom: '20px', fontSize: '64px' }}>🏐</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: '#333' }}>
                        No Active Match Found
                      </div>
                      <div style={{ color: '#666', marginBottom: '32px', maxWidth: '500px', lineHeight: '1.6' }}>
                        You don't have an active match in progress. Get started by creating a new match or resuming a previously saved match.
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        gap: '16px', 
                        flexWrap: 'wrap', 
                        justifyContent: 'center',
                        marginBottom: '24px'
                      }}>
                        <Link 
                          to="/settings" 
                          style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            backgroundColor: '#007AFF',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: '12px',
                            fontWeight: '600',
                            fontSize: '16px',
                            boxShadow: '0 2px 6px rgba(0,122,255,0.3)',
                            transition: 'transform 0.2s ease',
                          }}
                          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                          Start New Match
                        </Link>
                        
                        <Link 
                          to="/stats" 
                          style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            backgroundColor: '#34C759',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: '12px',
                            fontWeight: '600',
                            fontSize: '16px',
                            boxShadow: '0 2px 6px rgba(52,199,89,0.3)',
                            transition: 'transform 0.2s ease',
                          }}
                          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                          View Past Matches
                        </Link>
                      </div>

                      <div style={{
                        backgroundColor: '#fff',
                        padding: '20px',
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0',
                        maxWidth: '500px',
                        fontSize: '14px',
                        color: '#666'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#333' }}>Quick Start Guide:</div>
                        <div style={{ textAlign: 'left', lineHeight: '1.5' }}>
                          <div>1. Go to Rosters & Matches to configure your team</div>
                          <div>2. Add players to your roster</div>
                          <div>3. Set match details (opponent, location, etc.)</div>
                          <div>4. Start logging your match!</div>
                        </div>
                      </div>
                    </div>
                  ) : !matchSettings ? (
                    <div style={{ 
                      padding: 40, 
                      textAlign: "center", 
                      fontSize: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '400px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '12px',
                      margin: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      border: '1px solid #ffeaa7'
                    }}>
                      <div style={{ marginBottom: '20px', fontSize: '64px' }}>⚠️</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: '#856404' }}>
                        Match Settings Missing
                      </div>
                      <div style={{ color: '#856404', marginBottom: '32px', maxWidth: '500px', lineHeight: '1.6' }}>
                        We found an active match but the settings are incomplete or corrupted. Please go to Settings to reconfigure your match.
                      </div>
                      
                      <Link 
                        to="/settings" 
                        style={{
                          display: 'inline-block',
                          padding: '12px 24px',
                          backgroundColor: '#FF9500',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: '12px',
                          fontWeight: '600',
                          fontSize: '16px',
                          boxShadow: '0 2px 6px rgba(255,149,0,0.3)',
                        }}
                      >
                        Fix Match Settings
                      </Link>
                    </div>
                  ) : matchSettings?.collaborativeMode?.enabled && !isMatchOwner() ? (
                    <div style={{ 
                      padding: 40, 
                      textAlign: "center", 
                      fontSize: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '400px',
                      backgroundColor: '#e7f3ff',
                      borderRadius: '12px',
                      margin: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      border: '1px solid #b3d9ff'
                    }}>
                      <div style={{ marginBottom: '20px', fontSize: '64px' }}>👥</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: '#0c5aa6' }}>
                        Collaborative Match
                      </div>
                      <div style={{ color: '#0c5aa6', marginBottom: '32px', maxWidth: '500px', lineHeight: '1.6' }}>
                        This is a collaborative match. Game Flow Mode is only available to the match owner. 
                        Please use Express Logger mode to contribute to this match.
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        gap: '16px', 
                        flexWrap: 'wrap', 
                        justifyContent: 'center'
                      }}>
                        <Link 
                          to="/express" 
                          style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            backgroundColor: '#007AFF',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: '12px',
                            fontWeight: '600',
                            fontSize: '16px',
                            boxShadow: '0 2px 6px rgba(0,122,255,0.3)',
                            transition: 'transform 0.2s ease',
                          }}
                          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                          Open Express Logger
                        </Link>
                        
                        <Link 
                          to="/settings" 
                          style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            backgroundColor: '#6c757d',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: '12px',
                            fontWeight: '600',
                            fontSize: '16px',
                            boxShadow: '0 2px 6px rgba(108,117,125,0.3)',
                            transition: 'transform 0.2s ease',
                          }}
                          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                          View Settings
                        </Link>
                      </div>

                      <div style={{
                        backgroundColor: '#fff',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0',
                        maxWidth: '500px',
                        fontSize: '14px',
                        color: '#666',
                        marginTop: '24px'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#333' }}>ℹ️ About Collaborative Matches:</div>
                        <div style={{ lineHeight: '1.5' }}>
                          In collaborative matches, the match owner uses Game Flow Mode to manage the overall match flow, 
                          while other contributors use Express Logger to track specific players and statistics.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <VolleyballCourt
                      courtPlayers={courtPlayers}
                      benchPlayers={benchPlayers}
                      setBenchPlayers={setBenchPlayers}
                      setCourtPlayers={setCourtPlayers}
                      updateCourtPositions={updateCourtPositions}
                      updatePlayersOnCourt={updateCourtPositions}
                      positionMapping={positionMapping}
                      rotateCourtPositions={rotateCourtPositions}
                      swapCourtPlayers={swapCourtPlayers} 
                      removeGamesPlayedCredit={removeGamesPlayedCredit}
                      refreshBenchPlayers={refreshBenchPlayers}
                      refreshCourtPlayers={refreshCourtPlayers}
                      serveSide={serveSide}
                      opponentName={opponentName}
                      setOpponentName={setOpponentName}
                      onOurPoint={onOurPoint}
                      onOpponentPoint={onOpponentPoint}
                      ourScore={ourScore}
                      saveMatchData={saveMatchData}
                      opponentScore={opponentScore}
                      ourSets={ourSetsWon}
                      opponentSets={opponentSetsWon}
                      match={matchSettings}
                      onAddPoint={onAddPoint}
                      onRemovePoint={onRemovePoint}
                      currentMatchId={currentMatchId}
                      setServeSide={setServeSide}
                      actionLog={actionLog}
                      setActionLog={setActionLog}
                      substitutionLog={substitutionLog}
                      setSubstitutionLog={setSubstitutionLog}
                      allowedLiberoSubTarget={allowedLiberoSubTarget}
                      slot5TargetId={slot5TargetId}
                      setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
                      setSlot5TargetId={setSlot5TargetId}
                      syncMatchState={syncMatchState}
                      teamStats={teamStats}
                      setTeamStats={setTeamStats}
                      showHeader={showHeader} 
                      setShowHeader={setShowHeader}
                      ballState={ballState}
                      setBallState={setBallState}
                      ballSide={ballSide}
                      setBallSide={setBallSide}
                      currentServeSide={currentServeSide}
                      setCurrentServeSide={setCurrentServeSide}
                      maybeCreditGamesPlayed={maybeCreditGamesPlayed}
                      cardDisplayMode={uiPrefs.cardDisplayMode}
                      setCardDisplayMode={(mode) =>
                        setUiPrefs((p) => ({ ...p, cardDisplayMode: mode }))
                      }
                    />
                  )}
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
                    setBenchPlayers={setBenchPlayers}
                    setCourtPlayers={setCourtPlayers}
                    refreshBenchPlayers={refreshBenchPlayers}
                    refreshCourtPlayers={refreshCourtPlayers}
                    setCurrentMatchId={setCurrentMatchId}
                    opponentName={opponentName}
                    setOpponentName={setOpponentName}
                    onCreatePlayer={handlePlayerCreate}
                    handleDeletePlayer={handleDeletePlayer}
                    onUpdatePlayer={handlePlayerUpdate}
                    onResetBench={onResetBench}
                    currentMatchId={currentMatchId}
                    onRecallBench={onRecallBench}
                    handleNewMatch={handleNewMatch}
					resetMatchStateOnly={resetMatchStateOnly}
                    saveMatchData={saveMatchData}
                    setOurScore={setOurScore}
                    playAllSets={matchSettings?.playAllSets}
                    setOpponentScore={setOpponentScore}
                    setSubstitutionLog={setSubstitutionLog}
                    setActionLog={setActionLog}
                    setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
                    setSlot5TargetId={setSlot5TargetId}
                    ourScore={ourScore}
                    isMobile={isMobile}
                    opponentScore={opponentScore}
                    ourSetsWon={ourSetsWon}
                    opponentSetsWon={opponentSetsWon}
                    setOurSetsWon={setOurSetsWon}
                    setOpponentSetsWon={setOpponentSetsWon}
					onStartCoachMatch={startCoachMatch}
                  />
                </PrivateRoute>
              }
            />
			

<Route
  path="coaches-corner/court"
  element={
    <PrivateRoute>
      <CoachCourt
        key={coachCourtKey}
        matchSettings={matchSettings}
		setMatchSettings={setMatchSettings} 
		currentMatchId={currentMatchId}
        saveMatchData={saveMatchData}
        courtPlayers={courtPlayers}
        benchPlayers={benchPlayers}
        updatePlayersOnCourt={setCourtPlayers}
        refreshBench={refreshBenchPlayers}
        ourScore={ourScore}
        opponentScore={opponentScore}
        setOurScore={setOurScore}
        setOpponentScore={setOpponentScore}
        onAddPoint={onAddPoint}
        teamName={matchSettings?.teamName || "Our Team"}
        opponentName={matchSettings?.opponentName || "Opponent"}
        ourSetsWon={ourSetsWon}
        opponentSetsWon={opponentSetsWon}
        slot5TargetId={slot5TargetId}
        allowedLiberoSubTarget={allowedLiberoSubTarget}
        setSlot5TargetId={setSlot5TargetId}
        setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
        isSetComplete={isSetComplete}
        setIsSetComplete={setIsSetComplete}  
        processSetEnding={processSetEndingFromCoach}
      />
    </PrivateRoute>
  }
/>


<Route path="/express" element={
  <SubscriptionRoute 
    feature="Express Statistical Logging"
    currentMatchId={currentMatchId}
    matchSettings={matchSettings}
	requireAssignmentCheck={true}
  >
    <ExpressStatPage
      courtPlayers={courtPlayers}
      setCourtPlayers={setCourtPlayers}
      updateCourtPositions={updateCourtPositions}
      rotateCourtPositions={rotateCourtPositions}
      swapCourtPlayers={swapCourtPlayers}
      positionMapping={positionMapping}
      deactivatedPlayers={deactivatedPlayers}
      setDeactivatedPlayers={setDeactivatedPlayers}
      benchPlayers={benchPlayers}
      setBenchPlayers={setBenchPlayers}
      ourScore={ourScore}
      opponentScore={opponentScore}
      currentMatchId={currentMatchId}
	  scoreCooldownActive={scoreCooldownActive}
      scoreCooldownRemaining={scoreCooldownRemaining}
      match={matchSettings}
      actionLog={actionLog}
      setActionLog={setActionLog}
      substitutionLog={substitutionLog}
      setSubstitutionLog={setSubstitutionLog}
      setMatchSettings={setMatchSettings}
      onOurPoint={onOurPoint}
      onOpponentPoint={onOpponentPoint}
      teamStats={teamStats}
      setTeamStats={setTeamStats}
      ballState={ballState}
      setBallState={setBallState}
      ballSide={ballSide}
      setBallSide={setBallSide}
      currentServeSide={currentServeSide}
      setCurrentServeSide={setCurrentServeSide}
      processSetEnding={processSetEnding}
      setEndingInProgressRef={setEndingInProgressRef}
      saveMatchData={saveMatchData}
      maybeCreditGamesPlayed={maybeCreditGamesPlayed}
      token={token}
	  setOurScore={setOurScore}              
      setOpponentScore={setOpponentScore} 
      autoJoinMatchIfPossible={(matchId) => autoJoinMatchIfPossible(matchId, user)}
      isMatchOwner={isMatchOwner}
      allowedLiberoSubTarget={allowedLiberoSubTarget}
      setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
      slot5TargetId={slot5TargetId}
      setSlot5TargetId={setSlot5TargetId}
    />
  </SubscriptionRoute>
} />
            

            <Route
              path="/stats"
              element={
                <PrivateRoute>
                  <PlayerStatsPage
                    currentMatchId={currentMatchId}
                    teamName={matchSettings?.teamName}
                    opponentName={opponentName}
                  />
                </PrivateRoute>
              }
            />
            
            <Route path="/ads-preview" element={<AdsPreviewPage />} />
            <Route path="*" element={<Navigate to="/" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
          </Routes>
        </>
      </DndProvider>
 
  );
}

export default App;