import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
  useLocation,
  Outlet,
} from "react-router-dom";
import axios from "axios";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { AuthProvider, useAuth } from "./components/AuthContext";
// Component imports
import VolleyballCourt from "./components/VolleyballCourt";
import SettingsPanel from "./components/SettingsPanel";
import Login from "./components/Login";
import Register from "./components/Register";
import Profile from "./components/Profile";
import HomePage from "./components/homepage";
import PlayerStatsPage from "./components/PlayerStatsPage";
import EnvCheck from './EnvCheck';
import BetaAdminPage from "./components/BetaAdminPage";
import ExpressStatPage from "./components/ExpressStatPage";
import AdsPreviewPage from './components/AdsPreviewPage';
import About from './pages/about';
import Contact from './pages/contact';
import PrivacyPolicy from './pages/privacyPolicy';
import TermsOfService from './pages/termsOfService';
import StatBookContainer from "./components/StatBookContainer";
import MatchTrackingContainer from "./components/MatchTrackingContainer";
import ClassicContainer from "./components/ClassicContainer";
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
import CoachesCornerHome from "./components/CoachesCornerHome";
import SavedDrillsPage from "./components/CoachesCornerPages/SavedDrillsPage";
import DrillDetailPage from "./components/CoachesCornerPages/DrillDetailPage";
import EditDrillPage from "./components/CoachesCornerPages/EditDrillPage";
import GiftSubscriptionPage from "./components/GiftSubscriptionPage";
import GiftSuccessPage from "./components/GiftSuccessPage";
import ReferralPage from "./components/ReferralPage";
import CoachCourt from "./components/coachCourt";
import CoachStats from "./components/coachStats";
import MatchSummaryPage from "./components/matchSummary";
import NotificationModal from "./components/notificationModal";
import CoachQuickStart from "./components/CoachQuickStart";
import Viewer from "./components/viewer";
import YouTubeViewer from "./components/YouTubeViewer";
import PracticeAttendancePage from "./components/PracticeAttendancePage";
import PracticeHomePage from "./components/PracticeHomePage";
import PracticePlannerPage from "./components/PracticePlannerPage";
import PracticeLivePage from "./components/PracticeLivePage";
import PracticeRecapPage from "./components/PracticeRecapPage";
import BottomTabBar from "./components/BottomTabBar";


// Constants
const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 
const APP_VERSION = "vers8 prod3.0";
const AUTO_SAVE_DELAY = 5000;
const PERIODIC_SAVE_INTERVAL = 300000;



  // 5 minutes
 

console.log(`Loggerhead deployed version: ${APP_VERSION}`);

const useDevice = () => {
  const getDevice = () => {
    // === TOUCH DETECTION ===
    const hasTouchPoints = 'maxTouchPoints' in navigator && navigator.maxTouchPoints > 0;
    const hasTouchEvent = 'ontouchstart' in window || window.DocumentTouch && document instanceof window.DocumentTouch;
    const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    
    // Any of these indicates touch capability
    const isTouch = hasTouchPoints || hasTouchEvent || hasCoarsePointer;
    
    // === USER AGENT DETECTION ===
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const platform = navigator.platform || '';
    
    // Mobile-specific patterns
    const iOSPattern = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const androidPattern = /android/i.test(ua);
    const windowsPhonePattern = /windows phone/i.test(ua);
    const mobilePattern = /mobile/i.test(ua);
    const tabletPattern = /tablet|ipad|playbook|silk/i.test(ua);
    
    // Specific device detection
    const isIOS = iOSPattern || (platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad in desktop mode
    const isAndroid = androidPattern;
    const isWindowsPhone = windowsPhonePattern;
    
    // Combined UA mobile detection
    const isMobileUA = isIOS || isAndroid || isWindowsPhone || mobilePattern || tabletPattern;
    
    // === SCREEN METRICS ===
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const viewportWidth = window.innerWidth;
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Mobile screen size detection (accounting for orientation)
    const smallerDimension = Math.min(screenWidth, screenHeight);
    const largerDimension = Math.max(screenWidth, screenHeight);
    
    // Typical mobile: smaller dimension <= 768px
    // Typical tablet: smaller dimension 768-1024px
    // Consider high DPI screens (retina)
    const isMobileScreen = smallerDimension <= 768 || 
                          (smallerDimension <= 1024 && devicePixelRatio >= 2);
    
    // === VIEWPORT DETECTION ===
    const isNarrowViewport = viewportWidth <= 768;
    
    // === MEDIA QUERIES ===
    const hasCoarsePointerMQ = window.matchMedia("(pointer: coarse)").matches;
    const hasNoHover = window.matchMedia("(hover: none)").matches;
    const hasAnyPointer = window.matchMedia("(any-pointer: coarse)").matches;
    
    // === ORIENTATION ===
    const isPortrait = window.matchMedia("(orientation: portrait)").matches ||
                       (window.innerHeight > window.innerWidth);
    
    // === PWA DETECTION ===
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
                        window.navigator.standalone === true; // iOS Safari
    
    // === COMBINED MOBILE DETECTION ===
    // A device is mobile if ANY of these are true:
    const isMobile = 
      isTouch ||                    // Has touch capability
      isMobileUA ||                 // User agent indicates mobile
      isMobileScreen ||             // Screen size is mobile-like
      hasCoarsePointerMQ ||         // Primary pointer is coarse (touch)
      hasNoHover ||                 // Device doesn't support hover
      (isNarrowViewport && isTouch) || // Narrow screen + touch
      isStandalone;                 // Running as PWA (usually mobile)
    
    // === DEVICE TYPE CLASSIFICATION ===
    const isTablet = (smallerDimension > 600 && smallerDimension <= 1024) && isTouch;
    const isPhone = isMobile && !isTablet;
    
    // === LANDSCAPE DETECTION ===
    const isLandscape = !isPortrait;
    
    return {
      // Primary flags
      isMobile,
      isTouch,
      isPortrait,
      isLandscape,
      
      // Device types
      isTablet,
      isPhone,
      isDesktop: !isMobile,
      
      // Platform
      isIOS,
      isAndroid,
      isWindowsPhone,
      
      // Capabilities
      hasHover: !hasNoHover,
      hasCoarsePointer: hasCoarsePointerMQ || hasAnyPointer,
      hasFinePointer: !hasCoarsePointerMQ,
      touchPoints: navigator.maxTouchPoints || 0,
      
      // Metrics
      screenWidth,
      screenHeight,
      viewportWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio,
      
      // PWA
      isStandalone,
      
      // Debug info
      debug: {
        ua,
        platform,
        signals: {
          hasTouchPoints,
          hasTouchEvent,
          hasCoarsePointer,
          isMobileUA,
          isMobileScreen,
          isNarrowViewport,
          hasNoHover,
        }
      }
    };
  };
 
  const [device, setDevice] = useState(getDevice);
 
  useEffect(() => {
    // Create all media query listeners
    const mediaQueries = [
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(any-pointer: coarse)"),
      window.matchMedia("(hover: none)"),
      window.matchMedia("(hover: hover)"),
      window.matchMedia("(orientation: portrait)"),
      window.matchMedia("(orientation: landscape)"),
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(max-width: 768px)"),
      window.matchMedia("(min-width: 769px)"),
    ];
 
    const update = () => {
      setDevice(getDevice());
    };
 
    // Listen to all media query changes
    mediaQueries.forEach(mq => {
      if (mq.addEventListener) {
        mq.addEventListener("change", update);
      } else if (mq.addListener) {
        // Fallback for older browsers
        mq.addListener(update);
      }
    });
 
    // Listen to resize events (handles orientation change, viewport resize)
    window.addEventListener("resize", update);
    
    // Listen to orientation change events (additional coverage)
    window.addEventListener("orientationchange", update);
 
    // Cleanup
    return () => {
      mediaQueries.forEach(mq => {
        if (mq.removeEventListener) {
          mq.removeEventListener("change", update);
        } else if (mq.removeListener) {
          mq.removeListener(update);
        }
      });
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
 
  return device;
};


  


const noSelect = {
  userSelect: "none",
  WebkitUserSelect: "none",
  msUserSelect: "none",
  MozUserSelect: "none",
};

// Utility functions (moved outside component)
function isCoachesCornerFreeWeekend() {
  // Get current time in Eastern timezone
  const now = new Date();
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 4 = Thursday
  const hours = easternTime.getHours();
  
  // Friday (5), Saturday (6), and Sunday (0) anytime
  // Thursday (4) from 5 PM onwards
  // Sunday (0) until 5 PM
  
  const isThursdayAfter5PM = dayOfWeek === 12 && hours >= 25;
  const isFriday = dayOfWeek === 10;
  const isSaturday = dayOfWeek === 99;
  const isSundayBefore5PM = dayOfWeek === 66 && hours < 25;
  
  return isThursdayAfter5PM || isFriday || isSaturday || isSundayBefore5PM;
}

async function autoJoinMatchIfPossible(matchId, user, setCurrentMatchId, token) {
  try {
    console.log(`🔄 Auto-joining match ${matchId} for user ${user?.id}`);
    
    // 1. Update database FIRST - set this match as the user's current match
    if (user?.id && token) {
      try {
        await axios.put(`${API_URL}/api/users/${user.id}/match-id`, {
          currentMatchId: matchId
        }, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        });
        console.log(`✅ Updated currentMatchId to ${matchId} in database`);
      } catch (dbError) {
        console.error('Failed to update currentMatchId in database:', dbError);
        // Continue anyway - socket join might still work
      }
    }
    
    // 2. Update local state
    if (setCurrentMatchId) {
      setCurrentMatchId(matchId);
      console.log(`✅ Updated local currentMatchId to ${matchId}`);
    }
    
    // 3. Join via socket for real-time collaboration
    const sid = `${user?.id || 'anon'}-${Date.now()}`;
    if (window.collabJoin) {
      window.collabJoin(matchId, sid);
      console.log(`✅ Joined match ${matchId} via collabJoin`);
    } else if (window.socket?.emit) {
      window.socket.emit('join_match', { matchId, sessionId: sid });
      console.log(`✅ Joined match ${matchId} via socket.emit`);
    } else {
      console.warn('No collab socket available to auto-join match.');
    }
  } catch (e) {
    console.error('autoJoinMatchIfPossible failed:', e);
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
  const { user, token, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!token) return <Navigate to="/login" />;
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/settings" replace />;
  return children;
}






function SubscriptionRoute({
  children,
  feature = "Premium Feature",
  matchMode,
  currentMatchId = null,
  matchSettings = null,
  requireAssignmentCheck = false,
}) {
  const {
    token,
    loading,
    hasPremium,
    user,
    hasUnusedMatchKey,
    canUseFreeMode,
  } = useAuth();

  const [checkingAssignment, setCheckingAssignment] = useState(requireAssignmentCheck);
  const [hasAssignment, setHasAssignment] = useState(false);

  useEffect(() => {
    const checkAssignments = async () => {
      if (!requireAssignmentCheck || !currentMatchId || !user?.id || hasPremium) {
        setCheckingAssignment(false);
        return;
      }

      if (!matchSettings?.collaborativeMode?.enabled) {
        setCheckingAssignment(false);
        return;
      }

      try {
        const response = await axios.get(
          `${API_URL}/api/matches/${currentMatchId}/assignments`,
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );

        const assignments = response.data.assignments || [];
        const userHasAssignment = assignments.some(
          (assignment) =>
            assignment.assignedTo?.userId === user.id &&
            assignment.isActive !== false
        );

        setHasAssignment(userHasAssignment);
      } catch (error) {
        console.error("Failed to check assignments:", error);
        setHasAssignment(false);
      } finally {
        setCheckingAssignment(false);
      }
    };

    checkAssignments();
  }, [
    requireAssignmentCheck,
    currentMatchId,
    matchSettings?.collaborativeMode?.enabled,
    user?.id,
    hasPremium,
    token,
  ]);

  if (loading || checkingAssignment) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          fontSize: "20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "300px",
        }}
      >
        <div style={{ marginBottom: "20px", fontSize: "48px" }}>Loading...</div>
        <div>Checking access...</div>
      </div>
    );
  }

  if (!token) return <Navigate to="/login" />;

  const hasMatchKey = hasUnusedMatchKey(matchMode);
  const hasDailyFreeAccess = canUseFreeMode(matchMode);

  const canAccess =
    hasPremium ||
    hasAssignment ||
    hasMatchKey ||
    hasDailyFreeAccess;

  if (!canAccess) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          maxWidth: 500,
          margin: "80px auto",
        }}
      >
        <h2 style={{ marginBottom: 20 }}>Access Required</h2>
        <p style={{ marginBottom: 20 }}>
          {feature} is available with Premium, an unused one-time key, your daily free match for this mode, or an active collaborative assignment.
        </p>
        <button
          onClick={() => (window.location.href = "/profile?section=subscription")}
          style={{
            padding: "12px 24px",
            backgroundColor: "#007AFF",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          View Options
        </button>
      </div>
    );
  }

  return children;
}

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

const NotificationBell = ({ count, onClick }) => (
  <div 
    onClick={onClick}
    style={{ 
      position: 'relative', 
      display: 'flex', 
      alignItems: 'center', 
      padding: '8px', 
      cursor: 'pointer',
      borderRadius: '50%',
      transition: 'background 0.2s'
    }}
    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(52, 199, 89, 0.1)'}
    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8C18 4.69 15.31 2 12 2C8.69 2 6 4.69 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.73 21C13.55 21.3 13.3 21.55 13 21.73C12.69 21.9 12.35 22 12 22C11.65 22 11.31 21.9 11 21.73C10.7 21.55 10.45 21.3 10.27 21" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    
    {count > 0 && (
      <span style={{
        position: 'absolute',
        top: '6px',
        right: '6px',
        backgroundColor: '#FF3B30',
        color: 'white',
        fontSize: '10px',
        fontWeight: 'bold',
        borderRadius: '10px',
        padding: '2px 5px',
        minWidth: '14px',
        textAlign: 'center',
        border: '2px solid white'
      }}>
        {count}
      </span>
    )}
  </div>
);


function CoachBridgeJobsPage() {
  return (
    <div style={{ height: "calc(100vh - 60px)", background: "#fff" }}>
      <iframe
        title="CoachBridge Volleyball Jobs"
        src="https://coachbridge.org/jobs/?q=volleyball&l="
        style={{
          width: "100%",
          height: "100%",
          border: "0",
        }}
      />
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
  const {
  user,
  token,
  removeToken,
  setUser,
  hasUnusedMatchKey,
  canUseFreeMode,
} = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // State variables
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
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
  const [isRestoringMatch, setIsRestoringMatch] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [teamStats, setTeamStats] = useState({
    ourEarned: 0,
    ourError: 0,
    oppEarned: 0,
    oppError: 0,
  });
  const isCreatingNewMatchRef = useRef(false);
  const [showMatchAccessModal, setShowMatchAccessModal] = useState(false);
const [matchAccessError, setMatchAccessError] = useState("");
const [pendingMatchPayload, setPendingMatchPayload] = useState(null);
const [pendingMatchMode, setPendingMatchMode] = useState(null);

  const matchFinalizedRef = useRef(false);
  const skipStatusOverrideRef = useRef(false);
  const [positionMapping, setPositionMapping] = useState({
    0: '4', 1: '3', 2: '2', 3: '5', 4: '6', 5: '1'
  });
 

  const [coachCourtKey, setCoachCourtKey] = useState(0);
  const [isSetComplete, setIsSetComplete] = useState(false);
  const [coachSetEndingDecision, setCoachSetEndingDecision] = useState(null);
  const [isSetEndingInProgress, setIsSetEndingInProgress] = useState(false);
 
 const [showEmailConsentModal, setShowEmailConsentModal] = useState(false);
  const [emailConsentChecked, setEmailConsentChecked] = useState(false);
  const [hasEmailConsent, setHasEmailConsent] = useState(false);
  
const [activeDropdown, setActiveDropdown] = useState(null); // 'blog', 'coaches', or null


const handleToggleDropdown = (name) => {
  setActiveDropdown(activeDropdown === name ? null : name);
};

const closeAllDropdowns = () => {
  setActiveDropdown(null);
  setShowMobileMenu(false); 
};

const [setEndingDialog, setSetEndingDialog] = useState({
  open: false,
  stage: 'set', // 'set' | 'match'
  winner: null, // 'our' | 'opponent'
  ourScore: '',
  opponentScore: '',
  ourSetsWonPreview: 0,
  opponentSetsWonPreview: 0,
  setNumber: 1,
  isMatchOver: false,
  celebratory: false,
});
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

const { isMobile, isPortrait, isTouch } = useDevice();

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

const getLoggerheadModeFromPath = useCallback((pathname) => {
  if (pathname === "/stat-book" || pathname === "/express") return "statbook";
  if (pathname === "/match-tracking") return "match";
  return null;
}, []);

const getAccessKeyForMode = useCallback((mode) => {
  const normalizedMode =
    mode === "Statbook" ? "statbook" :
    mode === "Match" ? "match" :
    String(mode || "").toLowerCase().includes("stat") ? "statbook" :
    String(mode || "").toLowerCase().includes("match") ? "match" :
    null;

  if (!normalizedMode) return null;

  const unusedKey = (user?.matchKeys || []).find(
    (k) =>
      !k.used &&
      String(k.mode || "").toLowerCase() === normalizedMode &&
      k.key
  );

  return unusedKey?.key || null;
}, [user?.matchKeys]);

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

  setSaveStatus("saving");

  let matchPayload;

  try {
    const convertToPositionOrderedArray = (players, mapping) => {
      const positionOrder = ["4", "3", "2", "5", "6", "1"];
      const hasExpressPositions = players.some((p) => p?.expressPosition);

      if (hasExpressPositions) {
        console.log("💾 Saving from Express Mode - sorting by expressPosition");
        return positionOrder.map((targetPos) => {
          const player = players.find((p) => p?.expressPosition === targetPos);

          if (player && player.name !== "?") {
            return normalizePlayer(player);
          }

          return normalizePlayer({
            id: `empty-pos-${targetPos}`,
            name: "?",
            number: "?",
            isLibero: false,
            expressPosition: targetPos,
          });
        });
      }

      console.log("💾 Saving from Court Mode - converting slot→position order");
      const positionToSlot = {};
      Object.entries(mapping || {}).forEach(([slotIndex, position]) => {
        positionToSlot[String(position)] = Number(slotIndex);
      });

      return positionOrder.map((targetPos) => {
        const slotIndex = positionToSlot[targetPos];
        const player = slotIndex !== undefined ? players[slotIndex] : null;

        if (player && player.name !== "?") {
          return normalizePlayer({
            ...player,
            expressPosition: targetPos,
          });
        }

        return normalizePlayer({
          id: `empty-pos-${targetPos}`,
          name: "?",
          number: "?",
          isLibero: false,
          expressPosition: targetPos,
        });
      });
    };

    const positionOrderedCourtPlayers = convertToPositionOrderedArray(
      courtPlayers || [],
      positionMapping
    );

    const isCollaborative = matchSettings?.collaborativeMode?.enabled;
    const targetSetsToWin = Math.ceil((matchSettings?.totalSets || 3) / 2);
    const isMatchOver =
      ourSetsWon >= targetSetsToWin || opponentSetsWon >= targetSetsToWin;

    let computedStatus = isMatchOver ? "Final" : "In Progress";
    let computedWinner = isMatchOver
      ? ourSetsWon > opponentSetsWon
        ? "our"
        : "opponent"
      : null;

    if (skipStatusOverrideRef.current) {
      console.log("⚠️ AUTO-SAVE: Skipping status override - match already finalized");
      computedStatus = undefined;
      computedWinner = undefined;
    }

    matchPayload = {
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
      mode: matchSettings?.mode || getLoggerheadModeFromPath(location.pathname) || "Match",
      collaborativeMode: matchSettings?.collaborativeMode || { enabled: false },
      positionMapping,
      ourSetsWon: ourSetsWon ?? 0,
      opponentSetsWon: opponentSetsWon ?? 0,
      ...(computedStatus !== undefined && { status: computedStatus }),
      ...(computedWinner !== undefined && { winner: computedWinner }),
      ...(isCollaborative
        ? {}
        : {
            ourScore: ourScore ?? 0,
            opponentScore: opponentScore ?? 0,
          }),
      setScores: setScores || [],
      gameState: {
        ballState: ballState || "serve",
        ballSide: ballSide || serveSide || "opponent",
        currentServeSide: currentServeSide || serveSide || "opponent",
        serveSide: serveSide || "opponent",
      },
      expressSettings: matchSettings?.expressSettings || {
        playerOnOffStatus: {},
        passGradingEnabled: false,
        setDistributionTrackingEnabled: false,
        attackTypeTrackingEnabled: false,
        scoringEnabled: true,
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
      response = await axios.put(`${API_URL}/api/matches/${currentMatchId}`, matchPayload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      console.log("Match updated successfully with position-ordered courtPlayers.");
    } else {
      response = await axios.post(`${API_URL}/api/matches/save`, matchPayload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      console.log("Match created successfully with position-ordered courtPlayers.");
    }

    if (response?.data?._id) {
      setTimeout(() => {
        setCurrentMatchId(response.data._id);
      }, 100);

      await syncCurrentMatchIdToProfile(response.data._id);
    }

    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(null), 2000);

    if (showAlert) {
      alert("Match saved successfully.");
    }

    return response?.data?._id || null;
  } catch (err) {
    const apiError = err?.response?.data?.error;

    if (
      !currentMatchId &&
      matchPayload &&
      (apiError === "MATCH_LIMIT_REACHED" || apiError === "INVALID_MATCH_KEY")
    ) {
      setPendingMatchPayload(matchPayload);
      setPendingMatchMode(
        getLoggerheadModeFromPath(location.pathname) || matchSettings?.mode || null
      );
      setMatchAccessError(
        err?.response?.data?.message ||
          "You have already used your free match for this mode in the current 2AM ET window."
      );
      setShowMatchAccessModal(true);
      setSaveStatus(null);
      return null;
    }

    console.error("Failed to save match:", err);
    setSaveStatus("error");
    setTimeout(() => setSaveStatus(null), 3000);

    if (showAlert) {
      alert("Failed to save match. See console for details.");
    }

    return null;
  }
}, [
  user?.id,
  matchSettings,
  opponentName,
  courtPlayers,
  positionMapping,
  ourSetsWon,
  opponentSetsWon,
  currentMatchId,
  setScores,
  ballState,
  ballSide,
  currentServeSide,
  serveSide,
  benchPlayers,
  actionLog,
  substitutionLog,
  deactivatedPlayers,
  allowedLiberoSubTarget,
  slot5TargetId,
  creditedPlayersThisSet,
  teamStats,
  ourScore,
  opponentScore,
  token,
  location.pathname,
  getLoggerheadModeFromPath,
  syncCurrentMatchIdToProfile,
  normalizePlayer,
]);


const maybeCreditGamesPlayed = useCallback(async (playerId, forceCredit = false, context = "unknown") => {
  if (!playerId || !currentMatchId) {
    console.warn("❌ Cannot credit games played - missing playerId or matchId");
    return false;
  }

  // 🔥 FIX: Add ref to prevent duplicate calls during API wait
  if (!forceCredit && creditedPlayersThisSetRef.current.has(playerId)) {
    console.log(`⏭️ Player ${playerId} already credited this set - skipping (context: ${context})`);
    return true;
  }

  try {
    // 🔥 CRITICAL FIX: Mark as credited IMMEDIATELY before API call
    // This prevents race conditions where second call comes in while first is waiting
    creditedPlayersThisSetRef.current.add(playerId);
    
    console.log(`💳 Crediting games played for player: ${playerId} (context: ${context}, force: ${forceCredit})`);
    
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
      console.warn(`❌ Server blocked games played for ${playerId}: ${playerResult.error}`);
      // If server rejected it, remove from our tracking since it didn't go through
      creditedPlayersThisSetRef.current.delete(playerId);
      setCreditedPlayersThisSet(prev => prev.filter(id => id !== playerId));
      return false;
    }

    // 🔥 Update state to match ref (now that API succeeded)
    setCreditedPlayersThisSet(prev => {
      if (prev.includes(playerId)) return prev;
      const updated = [...prev, playerId];
      console.log(`📝 Updated creditedPlayersThisSet state: ${updated.join(", ")}`);
      return updated;
    });
    
    console.log(`✅ Successfully credited games played for player ${playerId} (context: ${context})`);
    return true;
  } catch (err) {
    // If API failed, remove from tracking
    creditedPlayersThisSetRef.current.delete(playerId);
    setCreditedPlayersThisSet(prev => prev.filter(id => id !== playerId));
    
    console.error(`❌ Failed to credit games played for player ${playerId} (context: ${context}):`, err.response?.data || err.message);
    
    if (err.response?.data?.message?.includes('maximum sets') || 
        err.response?.data?.message?.includes('exceeds')) {
      console.warn(`⚠️ Player ${playerId} blocked - already at games played limit`);
    }
    
    return false;
  }
}, [currentMatchId, token, matchSettings?.totalSets]);




const creditInitialCourtPlayers = useCallback(async () => {
  console.log("🎯 creditInitialCourtPlayers: Starting initial court player credits");
  
  // ✅ CRITICAL: Don't try to credit if match isn't ready yet
  if (!currentMatchId) {
    console.warn("⚠️ No currentMatchId - match not ready yet, skipping credit");
    return;
  }
  
  // ✅ NEW: Don't try to credit if court is empty
  if (!courtPlayers || courtPlayers.length === 0) {
    console.warn("⚠️ No court players available - skipping credit");
    return;
  }
  
  const validCourtPlayers = courtPlayers.filter(p => p && p.id && p.name !== "?");
  console.log(`Found ${validCourtPlayers.length} valid court players to credit`);
  
  // ✅ NEW: Safeguard - don't credit if no valid players
  if (validCourtPlayers.length === 0) {
    console.log("ℹ️ Court is empty - skipping initial credit");
    return;
  }
  
  let creditCount = 0;
  for (const player of validCourtPlayers) {
    if (!creditedPlayersThisSetRef.current.has(player.id)) {
      const success = await maybeCreditGamesPlayed(
        player.id,
        false,
        "initial_court_setup"
      );
      if (success) {
        creditCount++;
      }
    } else {
      console.log(`⏭️ Player ${player.id} (${player.name}) already credited this set, skipping`);
    }
  }
  
  console.log(`✅ Credited ${creditCount} initial court players this set`);
}, [currentMatchId, courtPlayers, maybeCreditGamesPlayed]);

const resetGamesPlayedForNewSet = useCallback(() => {
  console.log("🔄 Resetting games played tracking for new set");
  creditedPlayersThisSetRef.current.clear();
  setCreditedPlayersThisSet([]);
  firstServeHandledRef.current = false;
  
  console.log("ℹ️ Credits will be set when court is populated");
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
  const isExpressMode = location.pathname === '/stat-book';
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
        mode: isExpressMode ? 'statbook' : 'court',
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
  
  const isExpressMode = location.pathname === '/stat-book';
  
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
          mode: 'statbook'
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
  
  console.log(`Swap complete in ${isExpressMode ? 'Statbook' : 'Match'} mode`);
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
    skipStatusOverrideRef.current = false; // ⚠️ RESET FLAG FOR NEXT MATCH
    
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
  if (!currentMatchId || !matchSettings) {
    console.warn("Cannot sync - missing matchId or settings");
    return;
  }
  
  try {
    // ✅ NEW: Capture creditedPlayersThisSet before syncing
    const creditedSnapshot = Array.from(creditedPlayersThisSetRef.current);
    
    const payload = {
      ourScore,
      opponentScore,
      currentSet: matchSettings.currentSet,
      ourSetsWon,
      opponentSetsWon,
      actionLog,
      substitutionLog,
      teamStats,
      setScores,
      matchSettings,
      creditedPlayersThisSet: creditedSnapshot, // ✅ NEW: Include in sync
      gameState: {
        ballState,
        ballSide,
        currentServeSide,
        serveSide
      }
    };
    
    console.log("💾 Syncing match state to database...", {
      set: matchSettings.currentSet,
      score: `${ourScore}-${opponentScore}`,
      creditedCount: creditedSnapshot.length
    });
    
    await axios.put(`${API_URL}/api/matches/${currentMatchId}`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
    
    console.log("✅ Match state synced successfully");
  } catch (err) {
    console.error("❌ Failed to sync match state:", err);
  }
}, [
  currentMatchId, matchSettings, ourScore, opponentScore, 
  ourSetsWon, opponentSetsWon, actionLog, substitutionLog, 
  teamStats, setScores, token, ballState, ballSide, 
  currentServeSide, serveSide
]);
	

	
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

  
 const processSetEnding = useCallback(async (winner, winnerName, newOurSets, newOpponentSets, isMatchOver, overrideScores = null) => {
  try {
    setEndingInProgressRef.current = true;
    
    // 🔥 FIX #1: Capture current scores BEFORE any state changes
   const finalOurScore = overrideScores?.ourScore ?? ourScore;
   const finalOpponentScore = overrideScores?.opponentScore ?? opponentScore;
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
      
	  const creditedPlayersSnapshot = Array.from(creditedPlayersThisSetRef.current);
      console.log(`💾 Saving creditedPlayersThisSet for match completion: [${creditedPlayersSnapshot.join(", ")}]`);
      
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
            ourScore: finalOurScore,  
            opponentScore: finalOpponentScore,
			creditedPlayersThisSet: creditedPlayersSnapshot, 
          }, {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
          console.log("✅ Completed Match marked as Final in database");
		  console.log("✅ Final creditedPlayersThisSet persisted to database"); 
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
            },
            expressSettings: {
              ...(matchSettings?.expressSettings || {}),
              playerOnOffStatus: {},  // Reset all players to OFF
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
  currentSet: nextSet,
  expressSettings: {
    ...(prev?.expressSettings || {}),
    playerOnOffStatus: {},
  },
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
  user, navigate, collaborativeMode, isMatchOwner, creditInitialCourtPlayers
]);

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
  openEndSetDialog({
  winner,
  ourScore,
  opponentScore,
});
return;
    
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

const previewOurScore = Math.max(0, Number(setEndingDialog.ourScore) || 0);
const previewOpponentScore = Math.max(0, Number(setEndingDialog.opponentScore) || 0);

const previewWinner =
  previewOurScore > previewOpponentScore ? 'our' : 'opponent';

const previewWinnerName =
  previewWinner === 'our'
    ? (matchSettings?.teamName || 'Our Team')
    : (matchSettings?.opponentName || 'Opponent');

const previewOurSets =
  ourSetsWon + (previewWinner === 'our' ? 1 : 0);

const previewOpponentSets =
  opponentSetsWon + (previewWinner === 'opponent' ? 1 : 0);

const previewTotalSets = matchSettings?.totalSets || 3;
const previewSetsToWin = Math.ceil(previewTotalSets / 2);
const previewIsPlayAll = Boolean(matchSettings?.playAllSets);
const previewTotalSetsPlayed = previewOurSets + previewOpponentSets;

const previewIsMatchOver = previewIsPlayAll
  ? previewTotalSetsPlayed >= previewTotalSets
  : previewOurSets >= previewSetsToWin || previewOpponentSets >= previewSetsToWin;



const openEndSetDialog = useCallback((payload) => {
  const {
    winner,
    ourScore: proposedOurScore,
    opponentScore: proposedOpponentScore,
  } = payload;

  const winnerName =
    winner === 'our'
      ? (matchSettings?.teamName || 'Our Team')
      : (matchSettings?.opponentName || 'Opponent');

  setSetEndingDialog({
  open: true,
  stage: 'set',
  winner,
  winnerName,
  ourScore: String(proposedOurScore ?? ''),
  opponentScore: String(proposedOpponentScore ?? ''),
  ourSetsWonPreview: ourSetsWon,
  opponentSetsWonPreview: opponentSetsWon,
  setNumber: matchSettings?.currentSet || 1,
  isMatchOver: false,
  celebratory: winner === 'our',
});
}, [matchSettings, ourSetsWon, opponentSetsWon]);

const confirmEndSetDialog = useCallback(async () => {
 const confirmedOurScore = previewOurScore;
const confirmedOpponentScore = previewOpponentScore;

const winner = previewWinner;
const winnerName = previewWinnerName;

const newOurSets = previewOurSets;
const newOpponentSets = previewOpponentSets;


  const totalSets = matchSettings?.totalSets || 3;
  const setsToWin = Math.ceil(totalSets / 2);
  const isPlayAll = Boolean(matchSettings?.playAllSets);

  const totalSetsPlayed = newOurSets + newOpponentSets;
const isMatchOver = previewIsMatchOver;

  setOurScore(confirmedOurScore);
  setOpponentScore(confirmedOpponentScore);
  setSetEndingDialog(prev => ({
    ...prev,
    open: false,
    winner,
    winnerName,
    ourSetsWonPreview: newOurSets,
    opponentSetsWonPreview: newOpponentSets,
    isMatchOver,
    celebratory: winner === 'our',
  }));

  if (collaborativeMode && matchSettings?.collaborativeMode?.enabled && isMatchOwner()) {
    const setEndingDecision = {
      winner,
      winnerName,
      newOurSets,
      newOpponentSets,
      isMatchOver,
      setNumber: matchSettings?.currentSet,
      finalScore: `${confirmedOurScore}-${confirmedOpponentScore}`,
    };

    broadcastSetEndingDecision(setEndingDecision);
  }

  await processSetEnding(
    winner,
    winnerName,
    newOurSets,
    newOpponentSets,
    isMatchOver,
    {
      ourScore: confirmedOurScore,
      opponentScore: confirmedOpponentScore,
    }
  );

  if (collaborativeMode && matchSettings?.collaborativeMode?.enabled && isMatchOwner()) {
    releaseSetEndingLock('decision_made');
    setEndingInProgressRef.current = false;
    window.setEndingLockTime = null;
  }
}, [
  previewOurScore,
  previewOpponentScore,
  previewWinner,
  previewWinnerName,
  previewOurSets,
  previewOpponentSets,
  previewIsMatchOver,
  collaborativeMode,
  matchSettings,
  isMatchOwner,
  broadcastSetEndingDecision,
  processSetEnding,
  releaseSetEndingLock
]);

const cancelEndSetDialog = useCallback(() => {
  setSetEndingDialog(prev => ({ ...prev, open: false }));
}, []);


const markNotificationRead = useCallback(async (id) => {
  try {
    await axios.patch(
      `${API_URL}/api/notifications/${id}/read`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    console.warn("Mark notification read failed:", e?.message || e);
  }
}, [token]);

const dismissOneNotification = useCallback(async (id) => {
  await markNotificationRead(id);
  setUnreadNotifications((prev) => prev.filter((n) => n._id !== id));
}, [markNotificationRead]);

const dismissAllNotifications = useCallback(async () => {
  // Optimistic UI
  const ids = unreadNotifications.map((n) => n._id);
  setUnreadNotifications([]);

  // Best-effort marking
  await Promise.all(ids.map((id) => markNotificationRead(id)));
}, [unreadNotifications, markNotificationRead]);



useEffect(() => {
  if (isPortrait) {
    setShowHeader(true);
  }
}, [isPortrait]);

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



useEffect(() => {
  if (!token || !user?.id) return;
  if (location.pathname === "/login" || location.pathname === "/register") return;

  const sessionKey = `shownNotifications:${user.id}`;

  const fetchUnread = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/notifications?unread=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const list = Array.isArray(res.data) ? res.data : [];
      setUnreadNotifications(list);

      // Show automatically once per session if there are unread
      if (list.length > 0 && !sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        setShowNotificationModal(true);
      }
    } catch (e) {
      // keep silent; notifications should never block login
      console.warn("Notifications fetch failed:", e?.message || e);
    }
  };

  fetchUnread();
}, [token, user?.id, location.pathname]);


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

const handleGoToPremiumPlans = useCallback(() => {
  setShowMatchAccessModal(false);
  navigate("/profile?section=subscription");
}, [navigate]);

const handleBuyMatchKey = useCallback(async () => {
  if (!pendingMatchMode) {
    setMatchAccessError("Unable to determine which match key to purchase.");
    return;
  }

  try {
    const res = await axios.post(
      `${API_URL}/api/billing/create-checkout-session`,
      {
        purchaseType: "match_key",
        mode: pendingMatchMode,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      }
    );

    window.location.href = res.data.url;
  } catch (err) {
    console.error("Failed to start key checkout:", err);
    setMatchAccessError(
      err?.response?.data?.error || "Unable to start key checkout."
    );
  }
}, [pendingMatchMode, token]);


const handleNewMatch = useCallback(async (newSettings) => {
  console.log("Starting new match setup...");
  setLoadingMatch(true);

  let payload;

  try {
    if (user?.id) {
      await axios.put(
        `${API_URL}/api/users/${user.id}/match-id`,
        { currentMatchId: null },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      console.log("Cleared currentMatchId from user profile.");
    }

 const modeForAccess = newSettings?.mode || getLoggerheadModeFromPath(location.pathname) || "match";
const shouldAttachAccessKey =
  !canUseFreeMode(modeForAccess) && hasUnusedMatchKey(modeForAccess);

payload = {
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
  mode: modeForAccess,
  accessKey: shouldAttachAccessKey ? getAccessKeyForMode(modeForAccess) : undefined,
  collaborativeMode: newSettings?.collaborativeMode,
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

    const res = await axios.post(`${API_URL}/api/matches/save`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });

    const newMatch = res.data;
    console.log("New match created:", newMatch);

    setTimeout(() => {
      setCurrentMatchId(newMatch._id);
    }, 100);

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
      mode: newMatch.mode || newSettings?.mode || "Match",
      _id: newMatch._id,
    });

    setCourtPlayers(
      Array.from({ length: 6 }, (_, i) => ({
        id: `empty-filler-${i}`,
        name: "?",
        number: "?",
        isLibero: false,
      }))
    );

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
    const apiError = err?.response?.data?.error;

    if (
      payload &&
      (apiError === "MATCH_LIMIT_REACHED" || apiError === "INVALID_MATCH_KEY")
    ) {
      setPendingMatchPayload(payload);
      setPendingMatchMode(payload.mode);
      setMatchAccessError(
        err?.response?.data?.message ||
          "You have already used your free match for this mode in the current 2AM ET window."
      );
      setShowMatchAccessModal(true);
      setLoadingMatch(false);
      return;
    }

    console.error("Failed to create new match:", err);
    alert("Failed to create a new match. Try again.");
  } finally {
    setLoadingMatch(false);
  }
}, [
  user?.id,
  token,
  opponentName,
  benchPlayers,
  location.pathname,
  getLoggerheadModeFromPath,
  syncCurrentMatchIdToProfile,
  syncCreditedPlayersFromState,
  canUseFreeMode,
hasUnusedMatchKey,
getAccessKeyForMode,
user?.matchKeys,
]);




const endMatch = useCallback(async (finalSetsWon) => {
  if (!currentMatchId || !token) {
    console.error("❌ Cannot end match - missing currentMatchId or token");
    return null;
  }
  
  if (matchFinalizedRef.current) return;
matchFinalizedRef.current = true;

  try {
    console.log("🏆 FINALIZING COACH MATCH...", {
      matchId: currentMatchId,
      finalSetsWon
    });

    // Determine winner
    const winner = finalSetsWon.our > finalSetsWon.opponent ? "our" : "their";
    const winnerName = winner === "our" 
      ? (matchSettings?.teamName || "Our Team")
      : (matchSettings?.opponentName || "Opponent");

    // Build final setScores array including current set
    const currentSetScore = {
      setNumber: matchSettings?.currentSet || setScores.length + 1,
      ourScore: ourScore,
      opponentScore: opponentScore,
    };
    const finalSetScores = [...setScores, currentSetScore];
console.log("CALLING end-match");
    // Call the /end-match endpoint for analytics aggregation
    const response = await axios.post(
      `${API_URL}/api/coach-match-analytics/${currentMatchId}/end-match`,
      {
        winner,
        finalSetsWon: {
          our: finalSetsWon.our,
          opponent: finalSetsWon.opponent
        },
        status: "completed"
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      }
    );

    const matchData = response.data.data;
    console.log("✅ MATCH FINALIZED SUCCESSFULLY", matchData);

    // ⚠️ CHECK FOR MISSING ANALYTICS
    if (!matchData.validation.allSetsHaveAnalytics) {
      console.warn("⚠️ INCOMPLETE ANALYTICS DETECTED:");
      matchData.validation.warnings.forEach((warning) => {
        console.warn(`  - ${warning}`);
      });
    }

 /*    // ✅ UPDATE PLAYER CAREER STATS FROM AGGREGATES
    console.log("📊 UPDATING PLAYER CAREER STATS...");
    try {
      for (const player of (matchData.playerAggregates || [])) {
        if (!player.playerId) continue;

        await axios.put(
          `${API_URL}/api/players/${player.playerId}/career-stats`,
          {
            matchId: currentMatchId,
            setsPlayed: player.setsPlayed,
            addPlusMinus: player.totalPlusMinus,
            addSubstitutions: player.substitutionsMade,
            lastMatchDate: new Date()
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
          }
        );
        console.log(`✅ Updated ${player.name} career stats`);
      }
    } catch (statsError) {
      console.error("⚠️ Career stats update failed:", statsError);
    }
 */
    // ✅ UPDATE MATCH TABLE WITH FINAL STATUS AND SET SCORES
    console.log("📝 UPDATING MATCH TABLE WITH FINAL STATUS...");
    try {
      await axios.put(
        `${API_URL}/api/matches/${currentMatchId}`,
        {
          status: "Final",
          winner: winnerName,
          ourSetsWon: finalSetsWon.our,
          opponentSetsWon: finalSetsWon.opponent,
          setScores: finalSetScores, 
          currentSet: null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      console.log("✅ Match table updated with Final status");
      skipStatusOverrideRef.current = true; // ⚠️ PREVENT AUTO-SAVE FROM OVERWRITING
    } catch (statusError) {
      console.error("⚠️ Failed to update match table status:", statusError);
    }

    // ✅ CLEAR USER'S ACTIVE MATCH ID
    console.log("🧹 Clearing user's active match...");
    try {
      await axios.put(
        `${API_URL}/api/users/${user.id}/match-id`,
        { currentMatchId: null },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      console.log("✅ User's active match cleared");
    } catch (clearError) {
      console.error("⚠️ Failed to clear user's active match:", clearError);
    }

    // ✅ NAVIGATE TO MATCH SUMMARY PAGE
    console.log("📱 Navigating to match summary...");
    navigate(`/match-summary/${currentMatchId}`, {
      state: {
        matchData,
        matchStats: matchData.matchStats,
        playerAggregates: matchData.playerAggregates,
        rotationAggregates: matchData.rotationAggregates,
        validation: matchData.validation,
        completedSets: matchData.completedSets,
        winner,
        winnerName,
        finalSetsWon
      }
    });

    return matchData;

  } catch (error) {
    console.error("❌ FAILED TO END MATCH:", error);
    const errorMsg = error.response?.data?.message || error.message;
    alert(
      `Failed to finalize match: ${errorMsg}\n\n` +
      `Match data may be partially saved. Try again or contact support.`
    );
    return null;
  }
}, [currentMatchId, token, matchSettings?.teamName, matchSettings?.opponentName, matchSettings?.currentSet, setScores, ourScore, opponentScore, user, navigate]);

const ensureMatchIsFinalAndNavigate = useCallback(async (finalSetsWon) => {
  if (!currentMatchId || !token || !user?.id) {
    console.error("❌ Cannot finalize - missing currentMatchId, token, or user.id");
    return;
  }

  try {
    console.log("🔒 ENSURING MATCH IS MARKED FINAL", {
      matchId: currentMatchId,
      finalSetsWon,
    });

    // Determine winner
    const winner = finalSetsWon.our > finalSetsWon.opponent ? "our" : "their";
    const winnerName =
      winner === "our"
        ? matchSettings?.teamName || "Our Team"
        : matchSettings?.opponentName || "Opponent";

    // STEP 1: Explicitly mark match as Final in database
    console.log("📝 Updating match status to Final...");
    const updateResponse = await axios.put(
      `${API_URL}/api/matches/${currentMatchId}`,
      {
        status: "Final",
        winner: winnerName,
        ourSetsWon: finalSetsWon.our,
        opponentSetsWon: finalSetsWon.opponent,
        currentSet: null,
        isSetLive: false,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      }
    );

    console.log("✅ Match status set to Final in database");

    // STEP 2: Clear user's active match
    console.log("🧹 Clearing user's active match...");
    try {
      await axios.put(
        `${API_URL}/api/users/${user.id}/match-id`,
        { currentMatchId: null },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      console.log("✅ User's active match cleared");
    } catch (clearError) {
      console.warn("⚠️ Failed to clear active match:", clearError);
      // Don't stop navigation if this fails
    }

    // STEP 3: Navigate to match summary
    console.log("📱 Navigating to match summary...");
    navigate(`/match-summary/${currentMatchId}`, {
      state: {
        finalSetsWon,
        winner,
        winnerName,
        ensuredFinal: true, // Flag that we explicitly set Final status
      },
    });
  } catch (error) {
    console.error("❌ Failed to finalize match:", error);
    console.error("Error details:", error.response?.data || error.message);
    alert("Failed to finalize match. Please try again.");
  }
}, [currentMatchId, token, user?.id, matchSettings?.teamName, matchSettings?.opponentName, navigate]);


const processCoachSetEnding = useCallback(async (decision) => {
  if (!decision) {
    console.error("❌ No decision provided to processCoachSetEnding");
    return;
  }

  const {
    winner,
    winnerName,
    newOurSets,
    newOpponentSets,
    isMatchOver,
    setNumber,
    finalScore
  } = decision;

  console.log("🏆 COACH: Processing set ending decision", {
    winner, winnerName, newOurSets, newOpponentSets, isMatchOver, setNumber, finalScore
  });

  try {
    // 1. ARCHIVE SET IN ANALYTICS DATABASE
    if (currentMatchId && token) {
      try {
        const [ourScoreStr, theirScoreStr] = finalScore.split('-');
        const finalOurScore = parseInt(ourScoreStr.trim(), 10);
        const finalTheirScore = parseInt(theirScoreStr.trim(), 10);

        console.log("📤 COACH: Calling /end-set to finalize set in analytics", { setNumber, isMatchOver });
        
        await axios.post(
          `${API_URL}/api/coach-match-analytics/${currentMatchId}/end-set`,
          {
            finalOurScore,
            finalTheirScore,
            winner: winner === 'our' ? 'our' : 'their',
            isMatchOver,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );
        
        console.log("✅ COACH: Set finalized in analytics - completedSets now contains set", setNumber);
      } catch (err) {
        console.error("❌ COACH: Failed to finalize set in analytics:", err);
      }
    }

    // 2. HANDLE BASED ON WHETHER MATCH IS OVER
    if (isMatchOver) {
      // ✅ MATCH OVER: endMatch handles everything (setScores, Final status, navigation)
      console.log("🏆 COACH: Match is over - calling endMatch");
      
      await endMatch({
        our: newOurSets,
        opponent: newOpponentSets
      });
      
      console.log("✅ COACH: endMatch completed");
    } else {
      // ✅ MATCH CONTINUES: processSetEnding handles next set setup
      setEndingInProgressRef.current = false;
      
      console.log("🔄 COACH: Match continues - transitioning to next set");
      await processSetEnding(
        winner,
        winnerName,
        newOurSets,
        newOpponentSets,
        isMatchOver
      );
    }

  } catch (error) {
    console.error("❌ COACH: Failed to process set ending:", error);
  } finally {
    setCoachSetEndingDecision(null);
    setIsSetEndingInProgress(false);
    setEndingInProgressRef.current = false;
  }
}, [processSetEnding, endMatch, currentMatchId, token]);


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
  const checkForCoachMatch = async () => {
    console.log("═══════════════════════════════════════");
    console.log("🔍 CHECK COACH MATCH useEffect FIRED");
    console.log("═══════════════════════════════════════");
    console.log("Dependencies: currentMatchId =", currentMatchId);
    console.log("Dependencies: token =", token ? "✓" : "✗");
    console.log("Dependencies: user.id =", user?.id);
    
    if (!token || !user?.id) {
      console.log("❌ EARLY EXIT: No token or user.id");
      return;
    }

    if (!currentMatchId) {
      console.log("❌ EARLY EXIT: No currentMatchId");
      return;
    }

    try {
      console.log(`📡 FETCHING MATCH FROM DB: /api/matches/${currentMatchId}`);
      
      const matchRes = await axios.get(
        `${API_URL}/api/matches/${currentMatchId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("📦 FULL RESPONSE RECEIVED:", matchRes.data);
      console.log("Mode field value:", matchRes.data.mode);
      console.log("Type of mode:", typeof matchRes.data.mode);

      const isCoachMode = matchRes.data.mode === "Match";
      console.log("COMPARISON RESULT (mode === 'Match'):", isCoachMode);

      if (isCoachMode) {
        console.log("✅ SUCCESS: Setting hasExistingCoachMatch = TRUE");
      } else {
        console.log(`❌ FAILED: mode is "${matchRes.data.mode}", not "Coach"`);
      }
    } catch (error) {
      console.error("❌ ERROR FETCHING MATCH:", error.message);
      console.error("Error response:", error.response?.data);
      console.error("Error status:", error.response?.status);
    } finally {
      console.log("SETTING checkingCoachMatch = false");
      console.log("═══════════════════════════════════════");
    }
  };

    const timer = setTimeout(() => {
    checkForCoachMatch();
  }, 1000);

  return () => clearTimeout(timer);
}, [currentMatchId, token, user?.id]);

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
  if (!currentMatchId || location.pathname !== "/stat-book" || !matchSettings?.teamName) return;

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
          // FIX #3: Delay currentMatchId setting to let iOS state batch process
          setTimeout(() => {
            setCurrentMatchId(storedMatchId);
          }, 100);
          await setMatchId(storedMatchId);
        } else {
          console.log(`No active match found for user ${user.id}`);
        }
      } catch (err) {
        console.error("Fetch match ID failed:", err);
        // Don't clear match state on network errors - iOS may not be ready yet
        // Only clear if we got a definitive auth failure
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          clearAllMatchState();
        }
      } finally {
        if (isMounted) setMatchRestored(true);
      }
    };

    const timeoutId = setTimeout(restoreMatchIdFromUser, 500);
    
    return () => { 
      clearTimeout(timeoutId);
      isMounted = false; 
    };
  }, [user?.id, JSON.stringify(user?.teams), token, clearAllMatchState, setMatchId]);

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
          collaborativeMode: match.collaborativeMode,
		  mode: match.mode,
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
        
        // ✅ REMOVED redundant credit call - credited players already restored from DB (line 3612)
        // VolleyballCourt useEffect will automatically credit any NEW players added to court
        
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
    console.log("Current setScores state:", setScores);
  }, [setScores]);

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
  currentSet: matchSettings?.currentSet,
  ourScore,
  opponentScore,
  ourSetsWon,
  opponentSetsWon,
  totalSets: matchSettings?.totalSets,
  isOwner: owner,
  collaborativeMode: inCollaborative,
  isConnected,
  pointsDeciding: matchSettings?.pointsDeciding,
  pointsNonDeciding: matchSettings?.pointsNonDeciding,
});

    // Calculate requirements
const isPlayAll = Boolean(matchSettings.playAllSets);
const isDecidingSet = matchSettings.currentSet === matchSettings.totalSets;
   const toPosIntOrUndef = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};
const nonDecidingPts =
  toPosIntOrUndef(matchSettings?.pointsNonDeciding) ??
  25;

const decidingPts =
  toPosIntOrUndef(matchSettings?.pointsDeciding) ??
  15;

const requiredPoints = isPlayAll ? nonDecidingPts : (isDecidingSet ? decidingPts : nonDecidingPts);

console.log("REQUIRED POINTS:", {
  requiredPoints,
  isPlayAll,
  isDecidingSet,
  pointsNonDeciding: matchSettings?.pointsNonDeciding,
  pointsDeciding: matchSettings?.pointsDeciding,
  maxPoints: matchSettings?.maxPoints,
  maxPointsDeciding: matchSettings?.maxPointsDeciding,
});

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
	
if (location.pathname === "/match-tracking") {
  console.log("🎯 COACH MODE: Set complete detected");
  
  // ✅ Calculate everything in App.js (single source of truth)
  const totalSets = matchSettings?.totalSets || 3;
  const setsToWin = Math.ceil(totalSets / 2);
  const isMatchOver = isPlayAll
    ? (totalSetsPlayed >= totalSets)
    : (newOurSets >= setsToWin || newOpponentSets >= setsToWin);
  
  console.log("🏆 COACH DECISION CALCULATED:", {
    winner,
    winnerName,
    newOurSets,
    newOpponentSets,
    totalSets,
    setsToWin,
    isMatchOver,
    finalScore: `${ourScore}-${opponentScore}`,
    setNumber: matchSettings.currentSet
  });
  
  // ✅ Create immutable decision object
  const decision = {
    winner,
    winnerName,
    newOurSets,
    newOpponentSets,
    isMatchOver,
    setNumber: matchSettings.currentSet,
    finalScore: `${ourScore}-${opponentScore}`,
    totalSets,
    setsToWin
  };
  
  // ✅ Pass decision to coachCourt via state
  // coachCourt will display it and call onSetEndingConfirm when user clicks Continue
  setCoachSetEndingDecision(decision);
  
  // Lock to prevent double-triggers
  setEndingInProgressRef.current = true;
  window.setEndingLockTime = Date.now();
  
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

 const BlogDropdown = ({ isOpen, onToggle, onClose }) => {
  return (
    <div 
      className="ios-nav-dropdown-wrapper" 
      onMouseLeave={onClose} // Optional: close when mouse leaves
    >
      <a href="#" onClick={(e) => { e.preventDefault(); onToggle('blog'); }} className="ios-nav-link">
        Blog
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>›</span>
      </a>

      {isOpen && (
        <div className="ios-dropdown-menu">
          <a 
            href="https://www.loggerhead.app/blog"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="ios-dropdown-item primary-green"
          >
            See the Blog
          </a>
          <a href="/blogs/submit" onClick={onClose} className="ios-dropdown-item">
            Submit a Blog
          </a>
        </div>
      )}
    </div>
  );
};

const StatDropdown = ({ isOpen, onToggle, onClose }) => {
  return (
    <div className="ios-nav-dropdown-wrapper" onMouseLeave={onClose}>
      <a href="#" onClick={(e) => { e.preventDefault(); onToggle('stats'); }} className="ios-nav-link">
        Stats
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>›</span>
      </a>
      {isOpen && (
        <div className="ios-dropdown-menu">
          <a href="/stats" onClick={onClose} className="ios-dropdown-item">
            Stat Book/Classic Stats
          </a>
          <a href="/coaches-corner/stats"  onClick={onClose} className="ios-dropdown-item">
            Match Mode Stats
          </a>
        </div>
      )}
    </div>
  );
};

const LoggingModeDropdown = ({ isOpen, onToggle, onClose }) => {
  return (
    <div className="ios-nav-dropdown-wrapper" onMouseLeave={onClose}>
      <a href="#" onClick={(e) => { e.preventDefault(); onToggle('modes'); }} className="ios-nav-link">
        Logging Modes
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>›</span>
      </a>
      {isOpen && (
        <div className="ios-dropdown-menu">
          <a href="/stat-book" onClick={onClose} className="ios-dropdown-item">
            Stat Book Mode
          </a>
          <a href="/match-tracking"  onClick={onClose} className="ios-dropdown-item">
            Match Mode
          </a>
		  <a href="/classic"  onClick={onClose} className="ios-dropdown-item">
            Classic Mode
          </a>
        </div>
      )}
    </div>
  );
};

  // 🏆 COACHES CORNER DROPDOWN COMPONENT
const CoachesCornerDropdown = ({ isOpen, onToggle, onClose }) => {
  return (
    <div className="ios-nav-dropdown-wrapper" onMouseLeave={onClose}>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onToggle("coaches");
        }}
        className="ios-nav-link"
      >
        Coaches' Corner
        <span className={`dropdown-arrow ${isOpen ? "open" : ""}`}>›</span>
      </a>

      {isOpen && (
        <div className="ios-dropdown-menu">
          <a href="/coaches-corner" onClick={onClose} className="ios-dropdown-item primary-green">
            Home
          </a>

          <a href="/coaches-corner/drills" onClick={onClose} className="ios-dropdown-item">
            My Drills
          </a>

          <a href="/coaches-corner/practice" onClick={onClose} className="ios-dropdown-item">
            Practice Assist
          </a>

          <a href="/coaches-corner/referrals" onClick={onClose} className="ios-dropdown-item">
            Referrals
          </a>
		  
		  <a href="/coaches-corner/jobs" onClick={onClose} className="ios-dropdown-item">
   Jobs
</a>
        </div>
      )}
    </div>
  );
};




  return (
<DndProvider
  key={isMobile ? "touch" : "html5"}
  backend={isMobile ? TouchBackend : HTML5Backend}
>
        <>
{setEndingDialog.open && (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: 'center',
      zIndex: 10001,
      paddingTop: isMobile ? 'max(16px, env(safe-area-inset-top))' : '20px',
      paddingRight: '12px',
      paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom))' : '20px',
      paddingLeft: '12px',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}
  >
    <div
      style={{
        width: 'min(92vw, 520px)',
        maxWidth: '520px',
        maxHeight: 'calc(100dvh - 24px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: '#fff',
        borderRadius: isMobile ? '14px' : '16px',
        padding: isMobile ? '16px' : '24px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        margin: isMobile ? '0 auto 12px auto' : '0',
      }}
    >
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 700, marginBottom: '6px' }}>
          End Set {setEndingDialog.setNumber}
        </div>
        <div style={{ fontSize: isMobile ? '14px' : '15px', color: '#666' }}>
          {(matchSettings?.teamName || 'Our Team')} vs {(matchSettings?.opponentName || 'Opponent')}
        </div>
      </div>

     {previewWinner === 'our' && (
  <div
    style={{
      fontSize: isMobile ? '16px' : '18px',
      marginBottom: '14px',
      color: '#16a34a',
      fontWeight: 700,
      lineHeight: 1.3,
    }}
  >
    🎉 {previewWinnerName} won the set!
  </div>
)}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
            {matchSettings?.teamName || 'Our Team'}
          </label>
<input
  type="number"
  inputMode="numeric"
  value={setEndingDialog.ourScore}
  onChange={(e) =>
    setSetEndingDialog((prev) => ({
      ...prev,
      ourScore: e.target.value,
    }))
  }
  style={{
    width: '100%',
    padding: isMobile ? '12px' : '10px',
    fontSize: isMobile ? '18px' : '16px',
    borderRadius: '10px',
    border: '1px solid #ccc',
    boxSizing: 'border-box',
  }}
/>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
            {matchSettings?.opponentName || 'Opponent'}
          </label>
<input
  type="number"
  inputMode="numeric"
  value={setEndingDialog.opponentScore}
  onChange={(e) =>
    setSetEndingDialog((prev) => ({
      ...prev,
      opponentScore: e.target.value,
    }))
  }
  style={{
    width: '100%',
    padding: isMobile ? '12px' : '10px',
    fontSize: isMobile ? '18px' : '16px',
    borderRadius: '10px',
    border: '1px solid #ccc',
    boxSizing: 'border-box',
  }}
/>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          gap: '10px',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={cancelEndSetDialog}
          style={{
            padding: isMobile ? '14px 16px' : '12px 16px',
            borderRadius: '10px',
            border: '1px solid #ccc',
            background: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            width: isMobile ? '100%' : 'auto',
          }}
        >
          Undo / Keep Playing
        </button>

        <button
  onClick={confirmEndSetDialog}
  style={{
    padding: isMobile ? '14px 16px' : '12px 16px',
    borderRadius: '10px',
    border: 'none',
    background: '#007AFF',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    width: isMobile ? '100%' : 'auto',
  }}
>
  {previewIsMatchOver
    ? `${previewWinnerName} wins the match`
    : `Start Set ${setEndingDialog.setNumber + 1}`}
</button>
      </div>
    </div>
  </div>
)}  

{showMatchAccessModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10002,
      padding: "16px",
    }}
  >
    <div
      style={{
        width: "min(92vw, 460px)",
        background: "#fff",
        borderRadius: "16px",
        padding: isMobile ? "18px" : "22px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
        Free Match Used
      </div>

      <div style={{ fontSize: "15px", color: "#666", lineHeight: 1.4, marginBottom: "14px" }}>
        {matchAccessError ||
          `You already used your free ${pendingMatchMode || "match"} for the current 2AM ET window.`}
      </div>

      <div style={{ fontSize: "15px", color: "#1C1C1E", lineHeight: 1.45, marginBottom: "18px" }}>
        Buy a one-time key for this mode, or upgrade to Premium for unlimited Stat Book and Match Tracking.
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <button
          onClick={handleBuyMatchKey}
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: "none",
            background: "#007AFF",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Buy {pendingMatchMode === "statbook" ? "Stat Book" : "Match Tracking"} Key
        </button>

        <button
          onClick={handleGoToPremiumPlans}
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid #007AFF",
            background: "#fff",
            color: "#007AFF",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          See Premium Plans
        </button>

        <button
          onClick={() => {
            setShowMatchAccessModal(false);
            setPendingMatchPayload(null);
            setPendingMatchMode(null);
            setMatchAccessError("");
          }}
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}


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
                      v3.0
                    </sub>
                  </span>
			<NotificationBell 
    count={unreadNotifications.length} 
    onClick={() => setShowNotificationModal(true)} 
  />
                  
                  {/* Coaches' Corner Free Weekend Scroll - Only show 5 PM Thu to 5 PM Sun Eastern */}
                  {isCoachesCornerFreeWeekend() && (
                  <div style={{
                    marginLeft: isMobile ? '8px' : '16px',
                    marginRight: isMobile ? '8px' : '0',
                    padding: isMobile ? '6px 10px' : '8px 16px',
                    backgroundColor: '#FFD700',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: isMobile ? '4px' : '8px',
                    animation: 'bounce 2s infinite',
                    fontSize: isMobile ? '11px' : '13px',
                    fontWeight: 'bold',
                    color: '#333',
                    whiteSpace: isMobile ? 'normal' : 'nowrap',
                    overflow: 'visible',
                    textAlign: 'center',
                    maxWidth: isMobile ? '100%' : 'auto',
                  }}>
                    <span style={{ fontSize: isMobile ? '14px' : '16px' }}>🎉</span>
                    <span>Welcome to Coaches' Corner Free Weekend!</span>
                    {!isMobile && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>
                        Don't have access? Update your profile to Coach and refresh.
                      </span>
                    )}
                    {isMobile && (
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>
                        Update profile to Coach & refresh
                      </span>
                    )}
                  </div>
                  )}

                  <style>{`
                    @keyframes bounce {
                      0%, 100% {
                        transform: scale(1);
                      }
                      50% {
                        transform: scale(1.05);
                      }
                    }
                  `}</style>
                </div>
                {location.pathname !== "/login" &&
  location.pathname !== "/register" && (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
     

      {!isNativeApp && (
      <button
        className="ios-menu-toggle"
        onClick={() => setShowMobileMenu((prev) => !prev)}
      >
        Menu
      </button>
      )}
    </div>
)}
              </div>
			  
{emailConsentChecked && !hasEmailConsent && showEmailConsentModal && (
  <EmailConsentModal
    onEnable={enableEmailConsent}
    onNotNow={dismissEmailConsent}
  />
)}



<NotificationModal
  open={showNotificationModal}
  notifications={unreadNotifications}
  onDismissOne={dismissOneNotification}
  onDismissAll={dismissAllNotifications}
  onClose={() => setShowNotificationModal(false)}
/>



{location.pathname !== "/login" && location.pathname !== "/register" && (
  <nav className={`ios-nav-links ${showMobileMenu ? "visible" : ""}`}>
    <Link to="/profile" className="ios-nav-link">Profile</Link>
    <Link to="/settings" className="ios-nav-link">Rosters & Matches</Link>
	<LoggingModeDropdown
  isOpen={activeDropdown === 'modes'}
  onToggle={handleToggleDropdown}
  onClose={closeAllDropdowns}
/>
    
   <div className="ios-nav-dropdown-wrapper">
    <StatDropdown 
    isOpen={activeDropdown === 'stats'} 
    onToggle={handleToggleDropdown} 
    onClose={closeAllDropdowns} 
  />
  </div>
    
    <div className="ios-nav-dropdown-wrapper">
    <CoachesCornerDropdown 
    isOpen={activeDropdown === 'coaches'} 
    onToggle={handleToggleDropdown} 
    onClose={closeAllDropdowns} 
  />
  </div>


    <div className="ios-nav-dropdown-wrapper">
      <BlogDropdown 
    isOpen={activeDropdown === 'blog'} 
    onToggle={handleToggleDropdown} 
    onClose={closeAllDropdowns} 
  />
    </div>

    {user && (
      <button onClick={handleLogout} className="ios-logout-btn">
        Logout
      </button>
    )}
  </nav>
)}

                

            </header>
          )}

 { location.pathname !== "/" &&
  location.pathname !== "/login" &&
  location.pathname !== "/register" &&
  !isPortrait  &&(
  <button
    onClick={toggleHeader}
    style={{
      position: "fixed",
      top: showHeader ? "70px" : "5px",
      right: showHeader ? "90%" : "10%",
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
    {showHeader ? "Hide Header" : "Show Header"}
  </button>
)}

          <SaveStatusIndicator />

          {!isMobile && isPortrait && !isDismissed && location.pathname === "/classic" && (
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
                <Link to="/beta-admin" style={{ color: "#fff", textDecoration: "none" }}>Admin</Link>
                <Link to="/env" style={{ color: "#fff", textDecoration: "none" }}>Env Check</Link>
				<Link to="/viewer" style={{ color: "#fff", textDecoration: "none" }}>Viewer</Link>
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
	
			<Route path="/faq" element={<FAQPage />} />
            <Route path="/how-to" element={<HowToPage />} />
            <Route path="/env" element={<PrivateRoute requiredRole="admin"><EnvCheck /></PrivateRoute>} />
			
			{/* Coaches Corner (NESTED) */}
			<Route
              path="/coaches-corner"
              element={
                <PrivateRoute>
                  <Outlet />
                </PrivateRoute>
              }
            >
              {/* /coaches-corner - Marketing/Landing Page */}
              <Route index element={<CoachesCornerHome />} />
   
              {/* /coaches-corner/drill-generator - AI Drill Generation */}
              <Route path="drill-generator" element={<CoachesCorner />} />

              {/* /coaches-corner/stats */}
              <Route path="stats" element={<CoachStats />} />

              {/* /coaches-corner/drills */}
              <Route path="drills" element={<SavedDrillsPage />} />
              <Route path="drills/:drillId" element={<DrillDetailPage />} />
              <Route path="drills/:drillId/edit" element={<EditDrillPage />} />

              {/* /coaches-corner/practice routes */}
              <Route path="practice" element={<PracticeHomePage />} />
              <Route path="practice-attendance" element={<PracticeAttendancePage />} />
              <Route path="practice-planner" element={<PracticePlannerPage />} />
              <Route path="practice-live" element={<PracticeLivePage />} />
              <Route path="practice-recap" element={<PracticeRecapPage />} />
			  
			  {/* /coaches-corner/referrals */}
			  <Route path="referrals" element={<ReferralPage />} 
/>
<Route
  path="jobs"
  element={
    <PrivateRoute>
      <CoachBridgeJobsPage />
    </PrivateRoute>
  }
/>
            </Route>
			
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
			<Route path="/viewer" element={<Viewer />} />
			
            {/* Home Page */}
            <Route 
              path="/" 
              element={
                <PrivateRoute>
                  <HomePage matchSettings={matchSettings} />
                </PrivateRoute>
              } 
            />
            
            {/* Profile Page */}
            <Route 
              path="/profile" 
              element={
                <PrivateRoute>
                  <Profile setCurrentMatchId={setCurrentMatchId} />
                </PrivateRoute>
              } 
            />

<Route
  path="/classic"
  element={
    <PrivateRoute>
      <ClassicContainer
        // Match state
        currentMatchId={currentMatchId}
        setCurrentMatchId={setCurrentMatchId}
        matchSettings={matchSettings}
        setMatchSettings={setMatchSettings}
		isMobile={isMobile}
		isPortrait={isPortrait}
		isTouch={isTouch}
        // Court and player state
        courtPlayers={courtPlayers}
        benchPlayers={benchPlayers}
        setBenchPlayers={setBenchPlayers}
        setCourtPlayers={setCourtPlayers}
        updateCourtPositions={updateCourtPositions}
        positionMapping={positionMapping}
        rotateCourtPositions={rotateCourtPositions}
        swapCourtPlayers={swapCourtPlayers}
        
        // Score state
        serveSide={serveSide}
        setServeSide={setServeSide}
        opponentName={opponentName}
        setOpponentName={setOpponentName}
        ourScore={ourScore}
        opponentScore={opponentScore}
        ourSetsWon={ourSetsWon}
        opponentSetsWon={opponentSetsWon}
        
        // Action and substitution logs
        actionLog={actionLog}
        setActionLog={setActionLog}
        substitutionLog={substitutionLog}
        setSubstitutionLog={setSubstitutionLog}
        
        // Libero tracking
        allowedLiberoSubTarget={allowedLiberoSubTarget}
        slot5TargetId={slot5TargetId}
        setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
        setSlot5TargetId={setSlot5TargetId}
        
        // Functions
        onAddPoint={onAddPoint}
        onRemovePoint={onRemovePoint}
        removeGamesPlayedCredit={removeGamesPlayedCredit}
        refreshBenchPlayers={refreshBenchPlayers}
        refreshCourtPlayers={refreshCourtPlayers}
        syncMatchState={syncMatchState}
        saveMatchData={saveMatchData}
        
        // Team stats
        teamStats={teamStats}
        setTeamStats={setTeamStats}
        
        // UI state
        showHeader={showHeader}
        setShowHeader={setShowHeader}
        ballState={ballState}
        setBallState={setBallState}
        ballSide={ballSide}
        setBallSide={setBallSide}
        currentServeSide={currentServeSide}
        setCurrentServeSide={setCurrentServeSide}
        
        // Games played tracking
        maybeCreditGamesPlayed={maybeCreditGamesPlayed}
        creditedPlayersThisSet={creditedPlayersThisSet}
        creditedPlayersThisSetRef={creditedPlayersThisSetRef}
        creditInitialCourtPlayers={creditInitialCourtPlayers}
        
        // UI preferences
        
        // Other functions
        onOurPoint={onOurPoint}
        onOpponentPoint={onOpponentPoint}
        updatePlayersOnCourt={updateCourtPositions}
      />
    </PrivateRoute>
  }
/>
       

            <Route
              path="/match-summary/:matchId"
              element={
                <PrivateRoute>
                  <MatchSummaryPage />
                </PrivateRoute>
              }
            />
			
<Route
  path="/match-tracking"
  element={
    <SubscriptionRoute
      feature="Match Tracking"
      matchMode="match"
      currentMatchId={currentMatchId}
      matchSettings={matchSettings}
      requireAssignmentCheck={false}
    >
      <MatchTrackingContainer
        currentMatchId={currentMatchId}
        setCurrentMatchId={setCurrentMatchId}
        matchSettings={matchSettings}
        isMobile={isMobile}
        isPortrait={isPortrait}
        isTouch={isTouch}
        setMatchSettings={setMatchSettings}
        courtPlayers={courtPlayers}
        benchPlayers={benchPlayers}
        updatePlayersOnCourt={setCourtPlayers}
        refreshBench={refreshBenchPlayers}
        ourScore={ourScore}
        opponentScore={opponentScore}
        setOurScore={setOurScore}
        setOpponentScore={setOpponentScore}
        ourSetsWon={ourSetsWon}
        opponentSetsWon={opponentSetsWon}
        slot5TargetId={slot5TargetId}
        allowedLiberoSubTarget={allowedLiberoSubTarget}
        setSlot5TargetId={setSlot5TargetId}
        setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
        isSetComplete={isSetComplete}
        setIsSetComplete={setIsSetComplete}
        coachSetEndingDecision={coachSetEndingDecision}
        isSetEndingInProgress={isSetEndingInProgress}
        onAddPoint={onAddPoint}
        saveMatchData={saveMatchData}
        processCoachSetEnding={processCoachSetEnding}
        ensureMatchIsFinalAndNavigate={ensureMatchIsFinalAndNavigate}
        matchFinalizedRef={matchFinalizedRef}
        setEndingInProgressRef={setEndingInProgressRef}
        coachCourtKey={coachCourtKey}
      />
    </SubscriptionRoute>
  }
/>

            {/* Coaches Corner (NESTED) */}

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
	                isPortrait={isPortrait}
	                isTouch={isTouch}
                    opponentScore={opponentScore}
                    ourSetsWon={ourSetsWon}
                    opponentSetsWon={opponentSetsWon}
                    setOurSetsWon={setOurSetsWon}
                    setOpponentSetsWon={setOpponentSetsWon}
                  />
                </PrivateRoute>
              }
            />

<Route path="/stat-book" element={
 <SubscriptionRoute
  feature="Stat Book Logging"
  matchMode="statbook"
  currentMatchId={currentMatchId}
  matchSettings={matchSettings}
  requireAssignmentCheck={true}
>
    <StatBookContainer
      // Match state
      currentMatchId={currentMatchId}
      setCurrentMatchId={setCurrentMatchId}
      match={matchSettings}
      setMatch={setMatchSettings}
      
      // Court and player state
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
      
      // Score state
      ourScore={ourScore}
      opponentScore={opponentScore}
      setOurScore={setOurScore}
      setOpponentScore={setOpponentScore}
      
      // Action and stats state
      actionLog={actionLog}
      setActionLog={setActionLog}
      substitutionLog={substitutionLog}
      setSubstitutionLog={setSubstitutionLog}
      teamStats={teamStats}
      setTeamStats={setTeamStats}
      
      // Ball state
      ballState={ballState}
      setBallState={setBallState}
      ballSide={ballSide}
      setBallSide={setBallSide}
      currentServeSide={currentServeSide}
      setCurrentServeSide={setCurrentServeSide}
      
      // Libero tracking
      allowedLiberoSubTarget={allowedLiberoSubTarget}
      setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
      slot5TargetId={slot5TargetId}
      setSlot5TargetId={setSlot5TargetId}
      
      // Functions
      setMatchSettings={setMatchSettings}
      onOurPoint={onOurPoint}
      onOpponentPoint={onOpponentPoint}
      processSetEnding={processSetEnding}
      openEndSetDialog={openEndSetDialog}
      handleNewMatch={handleNewMatch}
      setEndingInProgressRef={setEndingInProgressRef}
      saveMatchData={saveMatchData}
      maybeCreditGamesPlayed={maybeCreditGamesPlayed}
      autoJoinMatchIfPossible={(matchId) => autoJoinMatchIfPossible(matchId, user, setCurrentMatchId, token)}
      
      // Other props
      isMobile={isMobile}
	  isPortrait={isPortrait}
	  isTouch={isTouch}
      scoreCooldownActive={scoreCooldownActive}
      scoreCooldownRemaining={scoreCooldownRemaining}
      token={token}
      isMatchOwner={isMatchOwner}
      updatePlayersOnCourt={updateCourtPositions}
    />
  </SubscriptionRoute>
} />

            {/* Legacy /express route - redirects to /stat-book */}
            <Route path="/express" element={
              <Navigate to="/stat-book" replace />
            } />

            <Route
              path="/stats"
              element={
                <PrivateRoute>
                  <PlayerStatsPage
                    currentMatchId={currentMatchId}
                    teamName={matchSettings?.teamName}
                    opponentName={matchSettings?.opponentName || "Opponent"}
                  />
                </PrivateRoute>
              }
            />
            <Route path="/gift" element={<PrivateRoute><GiftSubscriptionPage /></PrivateRoute>} />
            <Route path="/gift/success" element={<PrivateRoute><GiftSuccessPage /></PrivateRoute>} />
            <Route path="/ads-preview" element={<AdsPreviewPage />} />
            <Route path="*" element={<Navigate to="/" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
          </Routes>
        <BottomTabBar isNative={!!(window.Capacitor?.isNativePlatform?.())} isMobile={isMobile} />
        </>
      </DndProvider>
 
  );
}

export default App;