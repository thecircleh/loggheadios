/**
 * VolleyballCourt Component
 * 
 * PORTRAIT MODE OPTIMIZATIONS:
 * - Main container switches to column layout in portrait mode (instead of row)
 * - Scoreboard/Bench section becomes full-width layout at top
 * - Bench uses 5-column vertical grid with 58px cards, 6px gaps, 200px max height
 * - Court area with 85px player slots (larger than previous 75px)
 * - Logs panel stacked vertically at bottom with reduced 90px heights per log
 * - Modals (serve zone, ace target, error context) are centered and sized for portrait
 * - All spacing, padding, and gaps reduced for portrait to maximize visible area
 * 
 * LANDSCAPE MODE OPTIMIZATIONS:
 * - Bench uses 5-column grid (increased from 3) with 65px cards for more visible players
 * - Scrollable bench to accommodate full roster
 * - 80px court player slots
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import VolleyballIcon from "./VolleyballIcon";
import Scoreboard from "./Scoreboard";
import logAndSyncStat from './logAndSyncStat';
import { useDrag, useDrop } from "react-dnd";
import AdCourtBottom from './AdCourtBottom';
import { useAuth } from './AuthContext';
import { restoreStateAfterUndo } from "./undoHelpers";
import { undoKillSequence } from "./undoKillSequence";
import useSimpleVoiceCommands from "../hooks/useSimpleVoiceCommands";
import VideoPlayerTracking from './VideoPlayerTracking';



const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 

const undoStatsFromActionLog = async (startIndex, courtPlayers, actionLog, setPlayerStats) => {
  const statMapping = {
    "Kill": "kills",
    "Assist": "assists",
    "Service Ace": "aces",
    "Service Error": "serveErrors",
    "Error": "errors",
    "Block kill": "blockSolo",
    "Block error": "blockErrors"
  };

  const statDeltas = {}; // { playerId: { statName: -1 } }

  for (let i = startIndex; i < actionLog.length; i++) {
    const entry = actionLog[i];
    const match = entry.action.match(/(.*?) (Kill|Assist|Service Ace|Service Error|Block kill|Block error|Error)/);
    if (match) {
      const name = match[1].trim();
      const label = match[2];
      const statKey = statMapping[label] || "errors";
      const player = Object.values(courtPlayers).find(p => p.name === name);
      if (player && statKey) {
        if (!statDeltas[player._id]) statDeltas[player._id] = {};
        if (!statDeltas[player._id][statKey]) statDeltas[player._id][statKey] = 0;
        statDeltas[player._id][statKey] -= 1;
      }
    }
  }

  setPlayerStats(prev => {
    const updated = { ...prev };
    for (const playerId in statDeltas) {
      if (!updated[playerId]) continue;
      for (const statKey in statDeltas[playerId]) {
        updated[playerId][statKey] = Math.max(0, (updated[playerId][statKey] || 0) + statDeltas[playerId][statKey]);
      }
    }
    return updated;
  });
};



// Desktop constants
const serverSlotPositionDesktop = { top: "56%", left: "60%" };
const opponentServePositionDesktop = { top: "2%", left: "25%" };
const inPlayPositionDesktop = { top: "2%", left: "70%" };
const ourInPlayPositionDesktop = {top: "2%", right: "70%"};
// Mobile constants
const serverSlotPositionMobile = { top: "56%",left: "60%" };
const opponentServePositionMobile = { top: "2%", left: "30%" };
const inPlayPositionMobile = { top: "2%", left: "70%" };
const ourInPlayPositionMobile = {top: "2%", right: "70%"};

// {top: "25%", right: "15%"};






const noSelect = {
  userSelect: "none",
  WebkitUserSelect: "none",
  msUserSelect: "none",
  MozUserSelect: "none",
};


const touchRoles = ["Dig", "Set", "Attack"];
const serveReceiveRole = "ServeReceive";


// Helper to compare two arrays (order matters)
const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};






const DraggableBenchCard = ({
  player,
  benchCardStyle,
  canSub,
  slot5TargetId,
  allowedLiberoSubTarget,
  currentServeSide,
  setShowServeZoneOverlay,
  setShowFillCourtOverlay
}) => {
const [{ isDragging }, drag] = useDrag(
  () => ({
    type: "PLAYER",
    item: () => {
      if (currentServeSide === "our") {
        setShowServeZoneOverlay(false);
      }
      setShowFillCourtOverlay(false);
      return player;
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      if (canSub && currentServeSide === "our") {
        setShowServeZoneOverlay(true);
      }
      setShowFillCourtOverlay(true);
    },
    canDrag: canSub,
  }),
  [player, canSub, currentServeSide, setShowServeZoneOverlay, setShowFillCourtOverlay]
);

  return (
    <div
      ref={canSub ? drag : null} // attach always; canDrag controls behavior
      style={{
        ...benchCardStyle(player),
        opacity: canSub ? (isDragging ? 0.5 : 1) : 0.5,
        cursor: canSub ? "grab" : "default",
      }}
    >
      <span style={{
          color:
            ((slot5TargetId && player?._id === slot5TargetId._id) ||
              (allowedLiberoSubTarget && player?._id === allowedLiberoSubTarget._id))
              ? "#FF3B30"
              : "#333",
        }}>
        
		
		{player ? player.number : ""}
      </span>
    </div>
  );
};




 


function VolleyballCourt({
  courtPlayers,
  benchPlayers,
  setBenchPlayers,
  setCourtPlayers,
  updatePlayersOnCourt,  
  updateCourtPositions,  
  positionMapping,  
  rotateCourtPositions,  
  swapCourtPlayers,  
  refreshBench,
  refreshBenchPlayers,
  refreshCourtPlayers,
  removeGamesPlayedCredit,
  serveSide,
  opponentName,
  setOpponentName,
  onServeError,
  onOurPoint,
  onOpponentPoint,
  isMobile,
  isPortrait,
  isTouch,
  ourScore,
  saveMatchData,
  opponentScore,
  ourSets,
  opponentSets,
  match,
  onAddPoint,
  onRemovePoint,
  currentMatchId,
  syncMatchState,
  setServeSide,
  actionLog,
  setActionLog,
  substitutionLog,
  setSubstitutionLog,
  allowedLiberoSubTarget,
  slot5TargetId,
  setAllowedLiberoSubTarget,
  setSlot5TargetId,
  teamStats,
  setTeamStats,
  showHeader,
  setShowHeader,
  ballState,
  setBallState,
  ballSide,
  setBallSide,
  currentServeSide,
  setCurrentServeSide,
  maybeCreditGamesPlayed,
  creditedPlayersThisSet,
  creditedPlayersThisSetRef,
  creditInitialCourtPlayers
}) {

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState(null);
  const [voiceConfidence, setVoiceConfidence] = useState(null);
  const [showVoiceHelp, setShowVoiceHelp] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [undoMessage, setUndoMessage] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
const [showVideoBackground, setShowVideoBackground] = useState(false);
const [videoOpacity, setVideoOpacity] = useState(0.5);
const [enableAITracking, setEnableAITracking] = useState(false);
const [localVideoUrl, setLocalVideoUrl] = useState("");
const videoElementRef = useRef(null);

const toggleVideoBackground = useCallback(() => {
  if (isMobile || process.env.NODE_ENV !== 'development') return;
  setShowVideoBackground(!showVideoBackground);
}, [showVideoBackground, isMobile]);

const toggleAITracking = useCallback(() => {
  if (isMobile || process.env.NODE_ENV !== 'development') return;
  if (!localVideoUrl) {
    alert("AI Tracking requires a local video file. Please upload a .mp4 file.");
    return;
  }
  setEnableAITracking(!enableAITracking);
}, [enableAITracking, isMobile, localVideoUrl]);

// YouTube helper functions
function extractYouTubeVideoId(url) {
  if (!url || typeof url !== "string") return null;
  
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function getYouTubeEmbedUrl(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    loop: "1",
    playlist: videoId
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
  
  const [touches, setTouches] = useState([]);
  const [courtHistory, setCourtHistory] = useState([]);
  const serverSlotPosition = isMobile
  ? serverSlotPositionMobile
  : serverSlotPositionDesktop;
const opponentServePosition = isMobile
  ? opponentServePositionMobile
  : opponentServePositionDesktop;
const inPlayPosition = isMobile ? inPlayPositionMobile : inPlayPositionDesktop;
const ourInPlayPosition = isMobile ? ourInPlayPositionMobile : ourInPlayPositionDesktop;
const [ballPosition, setBallPosition] = useState(
    serveSide === "opponent" ? opponentServePosition : serverSlotPosition  
  );
  const [serveSideHistory, setServeSideHistory] = useState([]);
  const [flashSlots, setFlashSlots] = useState(Array(6).fill(false));
  const [actionZoneFlash, setActionZoneFlash] = useState(false);
  const [errorContext, setErrorContext] = useState(null);
  // "Free Ball" state remains unchanged
  const [freeBallModifier, setFreeBallModifier] = useState(null);
  // Block state – stores the block selection (if any)
  const [blockInfo, setBlockInfo] = useState(null);
  // Controls whether the block circles are visible.
  const [blockCirclesVisible, setBlockCirclesVisible] = useState(false);
  const [pendingErrorType, setPendingErrorType] = useState(null); // e.g. "Receiving", "Setting", etc.
const [awaitingRefBlownDecision, setAwaitingRefBlownDecision] = useState(false);
const [hasDraggedPlayer, setHasDraggedPlayer] = useState(false);
const [substitutionCount, setSubstitutionCount] = useState(0);
const MAX_SUBS_PER_SET = 99;
const slot2Ref = useRef(null);
const { user } = useAuth();
 const { isSubscriber, hasPremium } = useAuth();
 const { token } = useAuth();
const [showErrorTypeModal, setShowErrorTypeModal] = useState(false);
const [pendingErrorCallback, setPendingErrorCallback] = useState(null);
const [showAceTargetModal, setShowAceTargetModal] = useState(false);
const [pendingAceCallback, setPendingAceCallback] = useState(null);
const [showServeZoneOverlay, setShowServeZoneOverlay] = useState(false);
const [showPortraitServeControls, setShowPortraitServeControls] = useState(false);
const [showFillCourtOverlay, setShowFillCourtOverlay] = useState(true);
const [showVoiceSubscriptionModal, setShowVoiceSubscriptionModal] = useState(false);
const [selectedServeZone, setSelectedServeZone] = useState(null);
const [serveZoneMode, setServeZoneMode] = useState(6);
const [pendingServeZoneAction, setPendingServeZoneAction] = useState(null);
const [advancedLoggingEnabled, setAdvancedLoggingEnabled] = useState(true);
const [rotationHistory, setRotationHistory] = useState([]);
const lastTouchSlotRef = useRef(null); 
const positionLabels = positionMapping
? [positionMapping[0], positionMapping[1], positionMapping[2],
   positionMapping[3], positionMapping[4], positionMapping[5]]
: ["4", "3", "2", "5", "6", "1"];

  const containerRef = useRef(null);
  const lastTouchTimeRef = useRef(0);
// REMOVED: creditedPlayersThisSetRef - now managed by App.js parent component
const prevBallStateRef = useRef(null);


const hasEmptyCourtSlots = courtPlayers.some(
  (p) =>
    !p ||
    p.name === "?" ||
    p.number === "?" ||
    p.number === null ||
    p.number === undefined
);

    const subLogRef = useRef(null);
    const actionLogRef = useRef(null);
	
	useEffect(() => {
  if (subLogRef.current) {
    subLogRef.current.scrollTop = subLogRef.current.scrollHeight;
  }
}, [substitutionLog]);

// ✅ auto-scroll action log
useEffect(() => {
  if (actionLogRef.current) {
    actionLogRef.current.scrollTop = actionLogRef.current.scrollHeight;
  }
}, [actionLog]);

// Track previous ballState for error classification
useEffect(() => {
  prevBallStateRef.current = ballState;
}, [ballState]);



const splitPlayerName = (name, maxLength = 10) => {
  if (!name) return { line1: "", line2: "" };
  
  // If name is short enough, no need to split
  if (name.length <= maxLength) {
    return { line1: name, line2: "" };
  }
  
  // Find the last space in the name
  const lastSpaceIndex = name.lastIndexOf(' ');
  
  // If no space found, just truncate to maxLength
  if (lastSpaceIndex === -1) {
    return { line1: name.slice(0, maxLength), line2: "" };
  }
  
  // Split on the last space
  let firstName = name.slice(0, lastSpaceIndex);
  let lastName = name.slice(lastSpaceIndex + 1);
  
  // Ensure each part is within the character limit
  if (firstName.length > maxLength) {
    firstName = firstName.slice(0, maxLength);
  }
  
  if (lastName.length > maxLength) {
    lastName = lastName.slice(0, maxLength);
  }
  
  return { line1: firstName, line2: lastName };
};


const speak = (text) => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8;
    utterance.volume = 2;
    speechSynthesis.speak(utterance);
  }
};

const [deviceInfo, setDeviceInfo] = useState(() => {
  if (typeof window !== "undefined") {
    return {
      isLandscape: window.innerWidth > window.innerHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  }
  return { isLandscape: false, viewportHeight: 0, viewportWidth: 0 };
});

useEffect(() => {
  if (process.env.NODE_ENV !== "production") {
    console.log("🏐 matchSettings:", match);
    console.log("🏐 courtPlayers:", courtPlayers);
    console.log("🏐 benchPlayers:", benchPlayers);
    console.log("✅ Court and Bench synced successfully.");
  }
}, [courtPlayers, benchPlayers, match]);

useEffect(() => {
  // Safety: don't run if no court players
  if (!courtPlayers || courtPlayers.length === 0) {
    return;
  }
  
  // Get valid players (not empty slots like "?")
  const validCourtPlayers = courtPlayers.filter(
    p => p && p._id && p.id && p.name !== "?"
  );
  
  // If no valid players, skip (court is still being populated)
  if (validCourtPlayers.length === 0) {
    console.log("ℹ️ No valid court players yet - skipping initial credit");
    return;
  }
  
  // If already credited this set, skip (prevents double credit)
  if (creditedPlayersThisSet && creditedPlayersThisSet.length > 0) {
    console.log("ℹ️ Players already credited this set - skipping");
    return;
  }
  
  // ✅ CREDIT THE PLAYERS NOW
  console.log("🎯 Court populated with valid players - crediting initial players");
  if (typeof creditInitialCourtPlayers === 'function') {
    creditInitialCourtPlayers();
  }
}, [courtPlayers, creditedPlayersThisSet, creditInitialCourtPlayers]);


function extractYouTubeVideoId(url) {
  if (!url || typeof url !== "string") return null;
  
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
 
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
 
  return null;
}
 
function getYouTubeEmbedUrl(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
 
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",           // REQUIRED for autoplay
    controls: "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    loop: "1",
    playlist: videoId
  });
 
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}


useEffect(() => {
  const handleResize = () => {
    setDeviceInfo({
      isLandscape: window.innerWidth > window.innerHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    });
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
  };
}, []);


const modalBtnStyle = {
  width: "100%",
  padding: "10px",
  margin: "6px 0",
  borderRadius: "8px",
  border: "none",
  fontWeight: "600",
  fontSize: "16px",
  backgroundColor: "#007AFF",
  color: "#fff",
  cursor: "pointer"
};


const syncCourtAndBench = async (courtPlayersArray, benchPlayersArray) => {
  if (!currentMatchId) return; // ✅ Always safe

  try {
    const courtFullObjects = courtPlayersArray.map(p => p);
    const benchFullObjects = benchPlayersArray.map(p => p);

    await axios.put(`${API_URL}/api/matches/${currentMatchId}/sync-players`, {
      courtPlayers: courtFullObjects,
      benchPlayers: benchFullObjects,
    });
    console.log("✅ Court and Bench synced successfully.");
  } catch (error) {
    console.error("❌ Failed to sync court and bench:", error);
  }
  
};

const getContextualHints = () => {
  if (!voiceEnabled) {
    if (!hasPremium && user?.role !== 'admin') {
      return "Subscribe today to streamline stats collection using your voice!";
    } else {
      return "Click above to streamline stats collection using your voice!";
    }
  } else if (!hasPremium && user?.role !== 'admin') {
    return "Please subscribe to use voice logging";
    } else if (errorContext && awaitingRefBlownDecision) {
    return "Say: 'yes' (referee error) or 'no' (player error)";
  } else if (errorContext && !awaitingRefBlownDecision) {
    const touchCount = errorContext.touchCount;
    if (touchCount === 1) {
      return "Say: 'receiving error' or 'attacking error'";
    } else if (touchCount === 2) {
      return "Say: 'setting error' or 'attacking error'";
    }
    return "Say: error type or 'dismiss'";
  } else if (showErrorTypeModal) {
    return "Say: 'out', 'net', or 'foot fault'";
  } else if (showAceTargetModal) {
    return "Say: player's jersey number or 'unsure'";
  } else if (advancedLoggingEnabled && ballState === "serve" && currentServeSide === "our") {
    return "Say: 'zone number', 'unsure', 'out', 'net', or 'foot fault'";
  } else if (ballState === "serve") {
    if (currentServeSide === "our" && !showServeZoneOverlay) {
      return "Say: 'ace', 'error', or 'in play'";
    } else {
      return "Say: 'the receiving player's #' or 'opponent ace' or 'service error'";
    }
  } else if (ballState === "inplay") {
    if (blockCirclesVisible) {
      return "Say: 'block kill', 'block error', 'block in play' followed by player(s) # or just the player number that received the ball";
    } else {
      return "Say: 'kill', 'error', 'in play', or player #s";
    }
  }
  return "Say: 'rotate', 'switch serve', or 'undo'";
};

const VoiceInterface = () => {
const hasVoiceAccess = hasPremium || user?.role === 'admin';
  
  const MicIcon = ({ strikethrough = false }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="13" rx="3" fill="rgba(255,255,255,0.25)" stroke="#fff" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {strikethrough && <line x1="3" y1="3" x2="21" y2="21" stroke="#fff" strokeWidth="2.2" />}
    </svg>
  );

  const getVoiceStatus = () => {
    if (!hasVoiceAccess) return { text: "Voice Logging", color: "#FF3B30", icon: <MicIcon strikethrough /> };
    if (!voiceEnabled) return { text: "Off", color: "#8E8E93", icon: <MicIcon /> };
    if (isListening) return { text: "Listening", color: "#34C759", icon: <MicIcon /> };
    return { text: "Ready", color: "#007AFF", icon: <MicIcon /> };
  };
    const voiceStatus = getVoiceStatus();

const handleVoiceButtonClick = () => {
  if (!hasVoiceAccess()) {
    setShowVoiceSubscriptionModal(true);
    return;
  }
  // Only allow toggling if user has access
  setVoiceEnabled(prev => !prev);
};

  return (
    <div
      style={{
        position: (isMobile && isPortrait) ? "static" : "absolute",
        top: (isMobile && isPortrait) ? undefined : "150px",
        left: (isMobile && isPortrait) ? undefined : "3px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        zIndex: 400
      }}
    >
      {/* Voice Command Display */}
      {voiceCommand && (
        <div
          style={{
            backgroundColor: voiceConfidence === "high" ? "#34C759" : 
                           voiceConfidence === "medium" ? "#FF9500" : "#FF3B30",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "600",
            maxWidth: "200px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            animation: "fadeInOut 3s ease-in-out",
          }}
        >
          {lastCommand}
        </div>
      )}

      {/* Main Voice Button */}
<button
  onClick={() => setVoiceEnabled(prev => !prev)}
  style={{
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    backgroundColor: voiceStatus.color,
    border: "none",
    color: "#fff",
    fontSize: "24px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    transition: "background-color 0.3s ease",
    lineHeight: "60px", // ✅ Locks text vertically
    textAlign: "center", // ✅ Avoids weird center shift
    display: "flex",      // ✅ Ensures consistent alignment
    alignItems: "center",
    justifyContent: "center",
  }}
  title={`Voice Commands: ${voiceEnabled ? 'ON' : 'OFF'}`}
>
  {voiceStatus.icon}
</button>

      {/* Status Text */}
      <div style={{ 
        fontSize: "10px", 
        color: "#555",
        fontWeight: "600",
        textAlign: "center"
      }}>
        {voiceStatus.text}
      </div>

      {/* Context Hints */}
   
        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.8)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: "12px",
            fontSize: "10px",
            maxWidth: "100px",
            textAlign: "center",
            lineHeight: "1.2",
			zindex: 9999,
          }}
        >
          {getContextualHints()}
        </div>
    

 
    </div>
  );
};

// Voice Command Help Modal Component - move this OUTSIDE of renderCourtArea
const VoiceHelpModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const commandGroups = [
    {
      title: "Serve Commands",
      commands: [
        "ace, service ace, aced them",
        "error, serve error, service fault", 
        "in play, serve good, serve over"
      ]
    },
    {
      title: "Rally Commands", 
      commands: [
        "kill, winner, put it away",
        "error, out, attack error",
        "in play, dig it up, continue"
      ]
    },
    {
      title: "Block Commands",
      commands: [
        "block kill, stuff, roofed",
        "block error, block net",
        "block in play, deflection"
      ]
    },
    {
      title: "Player Commands",
      commands: [
        "Use player names or numbers",
        "[Player] touch, [Player] dig",
        "setter, middle, libero"
      ]
    },
    {
      title: "Court Management",
      commands: [
        "rotate, rotation",
        "switch serve, change serve", 
        "clear court, undo, free ball",
		"replay"
      ]
    },
    {
      title: "Number Sequences",
      commands: [
        "'5 12 7 kill' (dig, set, attack)",
        "'3 9 error' (complete rally)",
        "Any jersey numbers + result"
      ]
    }
  ];

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.7)",
      zIndex: 9999,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    }}>
      <div style={{
        background: "#fff",
        padding: "24px",
        borderRadius: "16px",
        maxWidth: "600px",
        maxHeight: "80vh",
        overflow: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px"
        }}>
          <h2 style={{ margin: 0 }}>Voice Commands Guide</h2>
          <button 
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer"
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "20px"
        }}>
          {commandGroups.map((group, index) => (
            <div key={index} style={{
              backgroundColor: "#f8f9fa",
              padding: "16px",
              borderRadius: "12px"
            }}>
              <h3 style={{
                margin: "0 0 12px 0",
                color: "#333",
                fontSize: "16px"
              }}>
                {group.title}
              </h3>
              <ul style={{
                margin: 0,
                paddingLeft: "16px",
                fontSize: "14px",
                lineHeight: "1.6"
              }}>
                {group.commands.map((command, cmdIndex) => (
                  <li key={cmdIndex} style={{ marginBottom: "4px" }}>
                    <code style={{
                      backgroundColor: "#e9ecef",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "13px"
                    }}>
                      {command}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


const AdvancedLoggingToggle = () => (
  <button
    onClick={() => setAdvancedLoggingEnabled(prev => !prev)}
    style={{
       position: (isMobile && isPortrait) ? "static" : "absolute",
      top: (isMobile && isPortrait) ? undefined : (isPortrait ? "5%" : (isMobile ? "75%" : "92%")),
      right: (isMobile && isPortrait) ? undefined : (isMobile ? "1%" : "1.1%"),
      width: (isMobile && isPortrait) ? "100%" : (isMobile ? "180px" : "220px"),
      height: isMobile ? "44px" : "40px",
      boxSizing: "border-box",
      borderRadius: "12px",
      backgroundColor: advancedLoggingEnabled ? "#34C759" : "#8E8E93",
      border: "none",
      color: "#FFFFFF",
      cursor: "pointer",
      fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
      fontSize: "0.7rem",
      fontWeight: "600",
      boxShadow: "0px 2px 4px rgba(0,0,0,0.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "2px",
      transition: "background-color 0.2s ease, transform 0.1s ease",
    }}
    onMouseDown={(e) => (e.target.style.transform = "scale(0.97)")}
    onMouseUp={(e) => (e.target.style.transform = "scale(1)")}
    title={`Advanced Logging: ${advancedLoggingEnabled ? 'ON' : 'OFF'}`}
  >
    <div style={{ fontSize: "1.2rem" }}>
      {advancedLoggingEnabled ? "📊" : "⚡"}
    </div>
    <div style={{ fontSize: "0.6rem", textAlign: "center", lineHeight: "1" }}>
      {advancedLoggingEnabled ? "ADVANCED LOGGING" : "FAST LOGGING"}
    </div>
  </button>
);


const voiceAnimationStyles = `
@keyframes fadeInOut {
  0% { opacity: 0; transform: scale(0.8); }
  20% { opacity: 1; transform: scale(1); }
  80% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
}
`;


const logFreeBallOutcome = ({
  outcome, // "inplay" | "kill" | "error"
  sender,
  setter,
}) => {
  if (!sender) return;

  let senderLabel = "";
  let senderStatKeys = [];

  if (outcome === "inplay") {
    senderLabel = "Free Ball";
    senderStatKeys = ["freeballs"];
  } else if (outcome === "kill") {
    senderLabel = "Free Ball Kill";
    senderStatKeys = ["freeballKills", "points", "freeballs", "kills"];
  } else if (outcome === "error") {
    senderLabel = "Free Ball Error";
    senderStatKeys = ["freeballErrors", "freeballs"];
  }

  logAndSyncStat({
    playerId: sender._id,
    playerName: sender.name,
    label: senderLabel,
    statKeys: senderStatKeys,
    setActionLog,
    setPlayerStats,
    playerStats,
    currentMatchId,
    teamId: match?.teamName,
  });

  // Handle setter logging
  if (setter) {
    if (outcome === "kill"||"free ball kill") {
      logAndSyncStat({
        playerId: setter._id,
        playerName: setter.name,
        label: "Assist",
        statKeys: ["assists"],
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });
     
      setActionLog((prev) => [
        ...prev,
        {
          action: `Assist credited to ${setter.name}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } else {
      logAndSyncStat({
        playerId: setter._id,
        playerName: setter.name,
        label: "Zero Set",
        statKeys: ["zeroSets"],
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });
    }
  }
};

// const removeGamesPlayedCredit = useCallback(async (playerId) => {
  // if (!playerId || !currentMatchId) {
    // console.warn("⚠️ Cannot remove games played credit - missing playerId or matchId");
    // return false;
  // }

  // try {
    // console.log(`🔄 Removing games played credit for player: ${playerId}`);
    
    // const response = await axios.post(`${API_URL}/api/players/decrement-games-played`, {
      // playerIds: [playerId],
      // matchId: currentMatchId,
    // }, {
      // headers: { Authorization: `Bearer ${token}` },
      // withCredentials: true,
    // });//

 //   Remove from credited set
    // creditedPlayersThisSetRef.current.delete(playerId);
    
    // console.log(`✅ Successfully removed games played credit for player ${playerId}`, response.data);
    // return true;
  // } catch (err) {
    // console.error(`❌ Failed to remove games played credit for player ${playerId}:`, err.response?.data || err.message);
    // return false;
  // }
// }, [currentMatchId, token]);

// Function to validate and fix games played at rally start


useEffect(() => {
  const styleElement = document.createElement("style");
  styleElement.textContent = voiceAnimationStyles;
  document.head.appendChild(styleElement);
  
  return () => {
    document.head.removeChild(styleElement);
  };
}, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.userSelect = "none";
    }
  }, []);
  
  useEffect(() => {
  const totalOur = teamStats.ourEarned + teamStats.oppError;
  const totalOpp = teamStats.oppEarned + teamStats.ourError;
  
  if (totalOur !== ourScore || totalOpp !== opponentScore) {
    console.warn('⚠️ Team stats mismatch!', {
      statsOur: totalOur, actualOur: ourScore,
      statsOpp: totalOpp, actualOpp: opponentScore
    });
  }
}, [teamStats, ourScore, opponentScore]);
  
const { isListening, lastCommand } = useSimpleVoiceCommands(
  (command) => handleVoiceCommand(command),
  courtPlayers,
  voiceEnabled && (hasPremium || user?.role === 'admin'),
  {
    ballState,
    currentServeSide, 
    showServeZoneOverlay,
    showErrorTypeModal,
	showAceTargetModal,
    blockCirclesVisible,
    touches,
	advancedLoggingEnabled,
	errorContext,
    awaitingRefBlownDecision,
    pendingErrorType  
  }
);





const handleVoiceCommand = (command) => {
  console.log("🎙️ Processing voice command:", command);
  
  // Add processing lock to prevent duplicate commands
  if (window.__voiceProcessingLock) {
    console.log("⛔ Voice command blocked - already processing");
    return;
  }
  
  window.__voiceProcessingLock = true;
  setTimeout(() => (window.__voiceProcessingLock = false), 200);
  
  setVoiceCommand(command);
  setVoiceConfidence(command.confidence);
  
  // Clear command display after 3 seconds
  setTimeout(() => {
    setVoiceCommand(null);
    setVoiceConfidence(null);
  }, 3000);

  switch (command.type) {
    case "serve_action":
      if (ballState === "serve") {
        handleActionDrop(command.action);
      } else {
        console.warn("Serve command ignored - not in serve state");
      }
      break;

    case "ace_target":
      if (showAceTargetModal && typeof pendingAceCallback === "function") {
        console.log("🎾 Processing ace target voice command:", command);
        setShowAceTargetModal(false);
        
        if (command.action === "unsure") {
          console.log("🎾 Voice selected: unsure");
          pendingAceCallback(null);
        } else if (command.action === "select_player") {
          console.log(`🎾 Voice selected: Player #${command.playerNumber} at slot ${command.slotIndex}`);
          pendingAceCallback(command.slotIndex);
        }
        
        setPendingAceCallback(null);
      } else {
        console.warn("Ace target command ignored - modal not showing or no callback set");
      }
      break;

    case "error_classification":
      if (!errorContext) {
        console.warn("Error classification command ignored - no error context active");
        break;
      }

      const { action, errorType } = command;

      switch (action) {
        case "select_error_type":
          console.log(`🚨 Voice selected error type: ${errorType}`);
          setPendingErrorType(errorType);
          setAwaitingRefBlownDecision(true);
          speak(`${errorType} error selected. Was it referee blown?`);
          break;

        case "referee_error":
          if (awaitingRefBlownDecision) {
            console.log("🚨 Voice selected: Referee error");
            
            logError("bhes");
            setActionLog(prev => [
              ...prev,
              {
                action: `${errorContext.playerName} referee blown error`,
                timestamp: new Date().toISOString(),
              },
            ]);
            
            resetRally("opponent");
            setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
            
            setPendingErrorType(null);
            setAwaitingRefBlownDecision(false);
            setErrorContext(null);
            
            speak("Ball Handling Error logged");
          }
          break;

        case "player_error":
          if (awaitingRefBlownDecision && pendingErrorType) {
            console.log(`🚨 Voice selected: Player ${pendingErrorType} error`);
            
            let label = "";
            let keys = [];

            if (pendingErrorType === "Receiving") {
              label = "Receiving Error";
              keys = ["receiveErrors", "receptions"];
            } else if (pendingErrorType === "Setting") {
              label = "Setting Error";
              keys = ["setErrors", "sets"];
            } else {
              label = "Attacking Error";
              keys = ["attackErrors", "attacks"];
            }

            logError(keys[0], [keys[1]]);
            setActionLog(prev => [
              ...prev,
              {
                action: `${errorContext.playerName} ${label}`,
                timestamp: new Date().toISOString(),
              },
            ]);

            resetRally("opponent");
            setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
            
            setPendingErrorType(null);
            setAwaitingRefBlownDecision(false);
            setErrorContext(null);
            
            speak(`${label} logged`);
          }
          break;

        case "dismiss":
          console.log("🚨 Voice dismissed error classification");
          
          setPendingErrorType(null);
          setAwaitingRefBlownDecision(false);
          setErrorContext(null);
          
          speak("Error classification dismissed");
          break;

        default:
          console.warn("Unknown error classification action:", action);
      }
      break;

    case "rally_action":
      if (ballState === "inplay") {
        handleActionDrop(command.action);
      } else {
        console.warn("Rally command ignored - not in rally state");
      }
      break;

    case "block_action":
      if (ballState === "inplay" && blockCirclesVisible) {
        handleActionDrop(command.action);
      } else {
        console.warn("Block command ignored - blocks not available");
      }
      break;

    case "player_touch":
      if (command.slotIndex !== undefined) {
        registerBallTouchOnSlot(command.slotIndex);
      }
      break;

    case "player_sequence":
      if (command.numbers && command.numbers.length > 0) {
        const roles = ["Dig", "Set", "Attack"];
        const newTouches = [];

        for (let i = 0; i < command.numbers.length && i < roles.length; i++) {
          const jerseyNumber = command.numbers[i];
          const slotIndex = courtPlayers.findIndex(p => parseInt(p.number, 10) === jerseyNumber);
          if (slotIndex !== -1) {
            newTouches.push({ slotIndex, role: roles[i], side: "our" });
          }
        }

        if (newTouches.length > 0) {
          console.log(`🏐 Voice sequence: ${command.numbers.join(',')} → ${newTouches.length} touches`);
          
          // Set up the touches array
          setTouches(newTouches);
          
          // Log the touches first
          setActionLog((prev) => [
            ...prev,
            ...newTouches.map(t => ({
              action: `${courtPlayers[t.slotIndex]?.name || "?"} touched ball (${t.role})`,
              timestamp: new Date().toISOString(),
              touchInfo: t,
            })),
          ]);

          console.log(`🏐 Set up ${newTouches.length} touches from voice sequence`);
        }
      }
      break;

    case "result_only":
      // Handle standalone result words like "kill", "error", "ace"
      const resultAction = command.result === "kill" ? "Kill" :
                          command.result === "error" ? "Error" :
                          command.result === "ace" ? "Ace" :
                          command.result === "in play" ? "InPlay" :
                          command.result === "out" ? "Error" :
                          null;
      
      if (resultAction) {
        handleActionDrop(resultAction);
      } else {
        console.warn("Unknown result word:", command.result);
      }
      break;

    case "block_sequence":
      if (ballState === "inplay" && blockCirclesVisible) {
        const { numbers, result } = command;
        
        // Convert player numbers to slot indices
        const slots = numbers.map(num => {
          const player = courtPlayers.find(p => parseInt(p.number) === num);
          return player ? courtPlayers.findIndex(p => p === player) : -1;
        }).filter(slot => slot !== -1);
        
        if (slots.length > 0) {
          console.log(`🏐 Voice block sequence: Players ${numbers.join(',')} → ${result}`);
          
          // Create blockInfo object
          const voiceBlockInfo = { slots };
          
          // Set up blockInfo state (for UI consistency)
          setBlockInfo(voiceBlockInfo);
          
          // Log the block attempt
          const involvedPlayers = slots.map(i => courtPlayers[i]).filter(Boolean);
          const playerList = involvedPlayers.map(p => `${p.name} (#${p.number})`).join(" & ");
          
          const blockType = ["Single", "Double", "Triple"][slots.length - 1];
          const attemptAction = `${blockType} block attempt by ${playerList}`;
          
          setActionLog(prev => {
            const filtered = prev.filter(
              entry => typeof entry.action !== "string" ||
              (!entry.action.includes("block attempt") &&
               !entry.action.includes("Double block") &&
               !entry.action.includes("Triple block"))
            );
            return [...filtered, { action: attemptAction, timestamp: new Date().toISOString() }];
          });
          
          // Convert result to action format and execute immediately with blockInfo
          const actionMap = {
            "kill": "Kill",
            "error": "Error", 
            "in play": "InPlay"
          };
          
          const action = actionMap[result];
          if (action) {
            // Pass blockInfo directly to avoid timing issues
            handleActionDrop(action, null, voiceBlockInfo);
            speak(`Block ${result} by ${numbers.length} player${numbers.length > 1 ? 's' : ''}`);
          }
        } else {
          console.warn("No valid players found for block sequence:", numbers);
        }
      } else {
        console.warn("Block sequence ignored - not in correct state");
      }
      break;

    case "court_action":
      switch (command.action) {
        case "rotate":
          if (ballState === "serve") {
            rotatePlayers();
            speak("Players rotated");
          }
          break;
        case "clear":
          if (ballState === "serve") {
            clearCourt();
            speak("Court cleared");
          }
          break;
        case "switch_serve":
          handleSwitchServe();
          speak(`Serve switched to ${currentServeSide === "our" ? "opponent" : "our"} team`);
          break;
        case "free_ball":
          if (ballState === "inplay") {
            handleFreeBallClick();
          }
          break;
        case "undo":
          handleUndoLastAction();
          speak("Action undone");
          break;
        case "replay":
          handleReplayClick();
          speak("Replay called");
          break;
      }
      break;

    // FIXED: Improved sequence handling with immediate processing
    case "sequence":
      const { numbers, result } = command;
      const roles = ["Dig", "Set", "Attack"];
      const newTouches = [];

      console.log(`🏐 Processing voice sequence immediately: ${numbers.join(',')} → ${result}`);

      // Build touches array
      for (let i = 0; i < numbers.length && i < roles.length; i++) {
        const jerseyNumber = numbers[i];
        const slotIndex = courtPlayers.findIndex(p => parseInt(p.number, 10) === jerseyNumber);
        if (slotIndex !== -1) {
          newTouches.push({ slotIndex, role: roles[i], side: "our" });
        }
      }

      if (newTouches.length > 0) {
        // Set touches immediately
        setTouches(newTouches);
        
        console.log(`🏐 Set ${newTouches.length} touches from voice sequence`);
        
        // Log the touches
        const touchActions = newTouches.map(t => ({
          action: `${courtPlayers[t.slotIndex]?.name || "?"} touched ball (${t.role})`,
          timestamp: new Date().toISOString(),
          touchInfo: t,
        }));
        
        setActionLog((prev) => [...prev, ...touchActions]);
        
        // Process the result immediately (no setTimeout)
        console.log(`🏐 Processing result: ${result}`);
        
        if (result === "kill") {
          // Ensure we're in the correct state for kill processing
          setBallState("inplay");
          setBallSide("our");
          
          // Process kill immediately
          handleActionDrop("Kill");
          console.log("✅ Kill processed for our team");
          
        } else if (result === "error") {
          setBallState("inplay");
          setBallSide("our");
          handleActionDrop("Error");
          
        } else if (result === "in play") {
          setBallState("inplay");
          setBallSide("our");
          handleActionDrop("InPlay");
          
        } else {
          console.warn("Unknown sequence result:", result);
        }
      }
      break;

    case "serve_zone":
      // Handle serve zone commands when zone overlay is showing
      if (showServeZoneOverlay) {
        if (command.action === "select_zone") {
          // Select the zone and close overlay
          setSelectedServeZone(command.zone);
          setShowServeZoneOverlay(false);
          console.log(`🎙️ Voice selected zone: ${command.zone}`);
        } else if (command.action === "unsure") {
          // Close overlay without selecting zone
          setSelectedServeZone(null);
          setShowServeZoneOverlay(false);
          console.log("🎙️ Voice selected: unsure");
        } else if (command.action === "service_error") {
          // Handle service error with specified type from zone overlay
          setSelectedServeZone(null);
          setShowServeZoneOverlay(false);
          setShowErrorTypeModal(false);

          if (typeof pendingErrorCallback === "function") {
            pendingErrorCallback(command.errorType);
            setPendingErrorCallback(null);
          } else {
            // Direct error handling
            setTimeout(() => handleActionDrop("Error", true), 0);
          }
          console.log(`🎙️ Voice service error from zone overlay: ${command.errorType}`);
        }
      }
      // Handle error type commands when error type modal is showing
      else if (showErrorTypeModal && command.action === "service_error") {
        console.log(`🎙️ Voice error type from modal: ${command.errorType}`);
        
        // Close the modal
        setShowErrorTypeModal(false);
        
        // Execute the pending callback with the error type
        if (typeof pendingErrorCallback === "function") {
          pendingErrorCallback(command.errorType);
          setPendingErrorCallback(null);
        } else {
          console.warn("No pending error callback set when selecting error type via voice");
          // Fallback - try direct error handling
          setTimeout(() => handleActionDrop("Error", true), 0);
        }
      }
      else {
        console.warn("Zone/error command ignored - no relevant overlay or modal showing");
      }
      break;
      
    default:
      console.warn("Unknown voice command type:", command.type);
  }
};

 
function safeMatch(actionLine, regex) {
  return typeof actionLine === "string" ? actionLine.match(regex) : null;
}


const shouldShowUndoButton = (actionLog) => {
  if (!Array.isArray(actionLog) || actionLog.length === 0) return false;

  const last = actionLog[actionLog.length - 1];
  const action = last?.action?.toLowerCase() || "";

  // ❌ Hide for any kill or any attack error
  if (action.includes("kill") || action.includes("attack error")) {
    return true;
  }

  return true;
};


  // =========== STYLES ===========
  const leftColumnStyle = {
    display: "flex",
    flexDirection: (isMobile && isPortrait) ? "row" : "column",
    width: (isMobile && isPortrait) ? "100%" : "185px",
    gap: (isMobile && isPortrait) ? "8px" : "10px",
    order: (isMobile && isPortrait) ? 5 : 0,
    alignItems: (isMobile && isPortrait) ? "flex-start" : undefined,
  };

const mainContainerStyle = useMemo(() => ({
  display: "flex",
  flexDirection: (isMobile && isPortrait) ? "column" : "row",
  width: "100%",
  maxWidth: (isMobile && isPortrait) ? "900px" : "1000px",
  margin: "0 auto",
  borderRadius: "10px",
  boxShadow: "0 3px 8px rgba(0,0,0,0.1)",
  padding: (isMobile && isPortrait) ? "8px" : (isMobile ? "10px" : "15px"),
  gap: (isMobile && isPortrait) ? "8px" : (isMobile ? "10px" : "15px"),
  minHeight: (isMobile && isPortrait) ? "auto" : "450px",
  position: "relative",
  overflowX: "hidden",
  boxSizing: "border-box",
  backgroundColor: "#f5f5f5" // Always solid - transparency handled at court area level
}), [isMobile, isPortrait]);


  const courtAreaStyle = {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
	noSelect,
    order: (isMobile && isPortrait) ? 0 : 0,
	  backgroundColor: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl))
    ? "transparent"  // Fully transparent to see video
    : "#f5f5f5",
  backdropFilter: "none",  // No blur needed
  borderRadius: showVideoBackground ? "16px" : "0",
  boxShadow: showVideoBackground 
    ? "0 8px 32px rgba(0,0,0,0.3)"
    : "none",
  pointerEvents: "auto",
  overflow: "hidden"  // Clip video to court bounds
};
  

const mobileHeader = isMobile && showHeader;
const mobileNoHeader = isMobile && !showHeader;



 const benchPanelStyle = {
    flexGrow: 1,
    backgroundColor: "#f9f9f9",
    borderRadius: "4px",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
    padding: "5px",
    overflow: "hidden",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: (isMobile && isPortrait) ? "auto" : "300px",
    maxHeight: (isMobile && isPortrait) ? "120px" : "300px",
	noSelect,
  };

  const benchTitleStyle = {
    margin: 0,
    marginBottom: "5px",
    fontSize: "1em",
    fontWeight: "bold",
    textAlign: "center",
    color: "#507300",
	noSelect,
  };

const benchGridStyle = {
  display: "grid",
  gridTemplateColumns: (isMobile && isPortrait)
    ? "repeat(auto-fill, minmax(50px, 1fr))"
    : (isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)"),
  gap: "2px",
  flexGrow: 1,
  overflowX: "auto",
  overflowY: "auto",
  maxHeight: (isMobile && isPortrait) ? "auto" : "300",
};

  const benchCardStyle = (player) => ({
	width: (isMobile && isPortrait) ? "50px" : (isMobile ? "55px" : "40px"),
	height: (isMobile && isPortrait) ? "46px" : (isMobile ? "50px" : "40px"),
	fontSize: (isMobile && isPortrait) ? "1.0rem" : (isMobile ? "1.2rem" : "0.9rem"),
    border: "1px solid rgba(0,0,0,0.15)",
    backgroundColor: player?.isLibero ? "#FFDADA" : "#FFFFFF",
    display: "grid",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
    color: "#333",
    cursor: player ? "grab" : "default",
    userSelect: "none",
    WebkitUserSelect: "none", // Prevents text selection in Safari
    msUserSelect: "none", // Prevents text selection in old Edge
    touchAction: "manipulation",
    transition: "transform 0.1s ease",
	noSelect,
  });
  // Add a hover & active effect
  const benchCardHoverStyle = {
    backgroundColor: "rgba(0,0,0,0.05)",
  };

  const benchCardActiveStyle = {
    transform: "scale(1.2)", // Subtle tap/drag effect
  };

const courtTitleStyle = {
  margin: (isMobile && isPortrait) ? "0 0 6px 0" : "0 0 10px 0",
  fontSize: "1.2em",
  fontWeight: "bold",
  textAlign: "center",
  color: "#333",
  position: "relative",
  zIndex: 1
};

const getNetLabelStyle = () => ({
  textAlign: "center",
  marginBottom: (isMobile && isPortrait) ? "12px" : "10px",
  marginTop: (isMobile && isPortrait) ? "30px" : "40px",
  fontWeight: "bold",
  color: ballSide === "our" ? "#34C759" : "#007AFF",
  overflow: "hidden",
  whiteSpace: "nowrap",
  width: "100%",
});

  const rowStyle = {
    display: "flex",
    gap: (isMobile && isPortrait) ? "12px" : "10px",
    justifyContent: "center",
    marginBottom: (isMobile && isPortrait) ? "8px" : "10px",
    position: "relative",
    zIndex: 1
  };

const slotStyle = (index, player, flash) => {
  const size = (isMobile && isPortrait) ? 85 : (isMobile && deviceInfo.isLandscape ? 80 : (isMobile ? 90 : 100));
  
  // Determine background color based on video state
  let bgColor;
  if (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) {
    // Completely transparent when video is active
    bgColor = "transparent";
  } else {
    // Solid colors when no video
    bgColor = flash
      ? "#FFF8E1"
      : player.name === "?"
        ? "#E5E5EA"
        : "#FFFFFF";
  }
  
  return {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "12px",
    border: player.isLibero
      ? "2px solid #FF3B30"
      : positionLabels[index] === "1"
        ? "2px solid #FFD700"
        : (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl))
          ? "2px solid rgba(255, 255, 255, 0.8)"  // White borders when video active
          : "1px solid rgba(0,0,0,0.2)",
    backgroundColor: bgColor,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    boxShadow: player.isLibero
      ? "0px 3px 6px rgba(255, 59, 48, 0.3)"
      : positionLabels[index] === "1"
        ? "0px 3px 6px rgba(255, 215, 0, 0.3)"
        : "0px 2px 4px rgba(0,0,0,0.1)",
    cursor: "pointer",
    fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
    fontWeight: "600",
    transition: "background-color 0.2s ease, transform 0.1s ease",
    minHeight: isMobile ? "44px" : "auto",
    minWidth: isMobile ? "44px" : "auto",
    backdropFilter: "none"  // No blur - completely clear
  };
};

  // Adds smooth press animation
  const slotPressStyle = {
    transform: "scale(0.97)",
  };


  const slotNameStyle = {
    fontSize: (isMobile && isPortrait) ? "0.7rem" : (isPortrait ? "1.4rem" : "0.9rem"),
    color: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) ? "#FFF" : "#333",
    textShadow: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) 
      ? "0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)" 
      : "none",
    fontWeight: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) ? "700" : "600"
  };

  const slotNumberStyle = {
    fontSize: (isMobile && isPortrait) ? "1.3rem" : (isPortrait ? "2.5rem" : "0.75rem"),
    color: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) ? "#FFF" : "#666",
    textShadow: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) 
      ? "0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)" 
      : "none",
    fontWeight: (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl)) ? "700" : "normal"
  };

  const slotPosStyle = {
    position: "absolute",
    bottom: "3px",
    right: "3px",
    fontSize: "0.6rem",
    color: "#666",
  };

  const badgeStyle = {
    position: "absolute",
    top: "5px",
    left: "5px",
    padding: "3px 6px",
    fontSize: "0.65rem",
    fontWeight: "bold",
    color: "#fff",
    borderRadius: "6px", // Rounded iOS-style badge
  };

  const serverBadgeStyle = {
    ...badgeStyle,
    backgroundColor: "#FFD700", // Gold
  };

  const liberoBadgeStyle = {
    ...badgeStyle,
    backgroundColor: "#FF3B30", // Apple Red
  };

const logsPanelStyle = {
  width: (isMobile && isPortrait) ? "100%" : (isMobile ? "180px" : "220px"),
  flexShrink: 0,
  flexGrow: 0,
  display: "flex",
  flexDirection: (isMobile && isPortrait) ? "column" : "column",
  gap: (isMobile && isPortrait) ? "6px" : "10px",
  ...noSelect,
  order: (isMobile && isPortrait) ? 6 : (isMobile ? 3 : 0),
};

  const logCardStyle = {
    backgroundColor: "#f9f9f9",
    borderRadius: "8px",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
    padding: "8px",
    flex: "1 1 auto",
    overflowY: "auto",
  minHeight: (isMobile && isPortrait) ? "200px" : (isMobile ? "160px" : "210px"),
  maxHeight: (isMobile && isPortrait) ? "200px" : (isMobile ? "160px" : "210px"),
  };

  const logTitleStyle = {
    margin: "0 0 5px 0",
    fontSize: "0.9em",
    fontWeight: "bold",
    color: "#333",
  };

  const logListStyle = {
    listStyle: "none",
    padding: 0,
    margin: 0,
    fontSize: "0.8rem",
  };

  const logItemStyle = {
    marginBottom: "4px",
    color: "#444",
  };

const buttonStyle = {
  padding: isMobile && deviceInfo.isLandscape ? "8px 12px" : "12px 16px",
  fontSize: isMobile && deviceInfo.isLandscape ? "0.8rem" : "1em",
  backgroundColor: "#fd9426",
  height: isMobile && deviceInfo.isLandscape ? "40px" : "50px",
  width: isMobile && deviceInfo.isLandscape ? "100px" : "100px",
  minWidth: isMobile && deviceInfo.isLandscape ? "80px" : "80px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  color: "#FFFFFF",
  boxShadow: "0px 2px 4px rgba(0,0,0,0.15)",
  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
  transition: "background-color 0.2s ease, transform 0.1s ease",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "600",
  textAlign: "center",
  whiteSpace: isMobile && deviceInfo.isLandscape ? "nowrap" : "normal"
};

const buttonStyle2 = {
  padding: isMobile && deviceInfo.isLandscape ? "8px 12px" : "12px 16px",
  fontSize: isMobile && deviceInfo.isLandscape ? "0.8rem" : "1em",
  backgroundColor: "#fd9426",
  height: isMobile && isPortrait ? "50px" : "40px",
  width: isMobile && isPortrait ? "100px" : (isMobile && deviceInfo.isLandscape ? "100px" : "100px"),
  minWidth: isMobile && deviceInfo.isLandscape ? "80px" : "80px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  color: "#FFFFFF",
  boxShadow: "0px 2px 4px rgba(0,0,0,0.15)",
  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
  transition: "background-color 0.2s ease, transform 0.1s ease",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "600",
  textAlign: "center",
  whiteSpace: isMobile && deviceInfo.isLandscape ? "nowrap" : "normal"
};

  const buttonHoverStyle = {
    backgroundColor: "#005FCC",
  };

  const buttonActiveStyle = {
    transform: "scale(0.98)", // Slight press effect
    backgroundColor: "#005FCC",
  };
  
  
  const iosButtonStyle = {
  display: "block",
  width: "100%",
  padding: "12px",
  margin: "8px 0",
  fontSize: "1rem",
  fontWeight: "600",
  backgroundColor: "#007AFF",
  color: "#fff",
  border: "none",
  borderRadius: "12px",
  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
  boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
  transition: "transform 0.1s ease-in-out",
};

  // ========== UTILITY FUNCTIONS ==========
  const flashActionZone = () => {
    setActionZoneFlash(true);
    setTimeout(() => setActionZoneFlash(false), 300);
  };


  // When a non-block tap occurs, clear block circles.
  const clearBlockCirclesIfNeeded = () => {
    if (blockCirclesVisible) {
      setBlockCirclesVisible(false);
      setBlockInfo(null);
    }
  };

  // Always clear block circles if a player is touched.
 const ignoreTouchesIfBlocked = () => {
  return blockInfo !== null;
};

const rotatePlayers = async () => {
  // Save current state before rotation
  const rotationRecord = {
    beforeCourt: [...courtPlayers],
    beforeServe: currentServeSide,
    timestamp: new Date().toISOString(),
    actionLogLength: actionLog.length // Track where we were in action log
  };
  
  setRotationHistory(prev => [...prev, rotationRecord]);
  setCourtHistory(prev => [...prev, [...courtPlayers]]);
  
  const oldCourt = [...courtPlayers];
  let newCourt = [...oldCourt];



// Handle Libero rotation off court
if (oldCourt[3]?.isLibero && oldCourt[3]?.replacedPlayer) {
  const libero = oldCourt[3];
  const replacedPlayer = libero.replacedPlayer;

  try {
    // Update database: libero off court, replaced player on court
    await Promise.all([
      axios.put(`/api/players/${libero._id}`, { isOnCourt: false },{headers: {Authorization: `Bearer ${token}`}}),
      axios.put(`/api/players/${replacedPlayer._id}`, { isOnCourt: true },{headers: {Authorization: `Bearer ${token}`}})
    ]);

    // Update local bench: add libero back to bench
setBenchPlayers(prev => {
  const alreadyBenched = prev.some(p => p._id === libero._id);
  const updated = alreadyBenched
    ? prev
    : [...prev, { ...libero, isOnCourt: false }];

  return updated.sort((a, b) => (a.number || 0) - (b.number || 0));
});
  } catch (error) {
    console.error("❌ Libero substitution failed:", error);
    return;
  }

  // ⬇️ Move replaced player into slot 0
  newCourt[0] = replacedPlayer;

  const playerRotatingIntoSlot5 = oldCourt[2]; // Player that moves to slot5
if (playerRotatingIntoSlot5 && playerRotatingIntoSlot5.name !== "?" && !playerRotatingIntoSlot5.isLibero) {
  setSlot5TargetId(playerRotatingIntoSlot5);
  await syncMatchState();  // ensure this is passed from App.js
  console.log("✅ slot5TargetId updated and synced:", playerRotatingIntoSlot5);
}
} else {
  newCourt[0] = oldCourt[3];
}

// Finish rotation
newCourt[1] = oldCourt[0];
newCourt[2] = oldCourt[1];
newCourt[3] = oldCourt[4];
newCourt[4] = oldCourt[5];
newCourt[5] = oldCourt[2];

await updatePlayersOnCourt(newCourt);

// Set slot5TargetId after update
console.log("🔄 Rotation complete.");
console.log("➡️ Current slot5TargetId:", slot5TargetId);
  }
  
  
const didLastActionCauseRotation = (removedAction, actionLog) => {
  if (!removedAction || !removedAction.action) return false;
  
  const action = removedAction.action.toLowerCase();
  
  // Check if this action awarded us a point when opponent was serving
  const isOurPoint = 
    (action.includes("kill") && !action.includes("opponent kill")) ||
    action.includes("opponent error") ||
    action.includes("opponent service error") ||
    action.includes("block kill") ||
    // Check meta data if available
    removedAction.meta?.awardedPointTo === "our";
  // If we scored and rotation history shows a recent rotation, it likely caused it
  if (isOurPoint && rotationHistory.length > 0) {
    const lastRotation = rotationHistory[rotationHistory.length - 1];
    // Check if rotation happened after or around the same time as this action
    const rotationTime = new Date(lastRotation.timestamp);
    const actionTime = new Date(removedAction.timestamp);
    const timeDiff = Math.abs(rotationTime - actionTime);
    
    // If rotation happened within 5 seconds of the action, consider it related
    return timeDiff < 5000 && lastRotation.beforeServe === "opponent";
  }
  
  return false;
};

// Function to undo a rotation
const undoRotation = () => {
  if (rotationHistory.length === 0) {
    console.warn("No rotation to undo");
    return false;
  }
  
  const lastRotation = rotationHistory[rotationHistory.length - 1];
  console.log("🔄 Undoing rotation, restoring court to:", lastRotation.beforeCourt);
  
  // Restore court players
  setCourtPlayers(lastRotation.beforeCourt);
  
  // Restore serve side
  setCurrentServeSide(lastRotation.beforeServe);
  if (setServeSide) {
    setServeSide(lastRotation.beforeServe);
  }
  
  // Clean up history
  setRotationHistory(prev => prev.slice(0, -1));
  setCourtHistory(prev => prev.slice(0, -1));
  
  console.log("✅ Rotation undone successfully");
  return true;
};

// Function to clear rotation history
const clearRotationHistory = () => {
  setRotationHistory([]);
  setCourtHistory([]);
  setServeSideHistory([]);
  console.log("🗑️ Rotation history cleared");
};


const logError = (errorKey) => {
  console.log("🚨 logError called", errorKey);

  const player = courtPlayers[errorContext.slotIndex];
  if (!player) {
    console.log("❌ No player found for slot", errorContext.slotIndex);
    return;
  }

  console.log("✅ Logging for", player.name); // fixed Player -> player

  logAndSyncStat({
    playerId: player._id,
    playerName: player.name,
    label: getErrorLabel(errorKey),
    statKeys: [errorKey],
    setActionLog,
    setPlayerStats,
    playerStats,
    currentMatchId,
    teamId: match?.teamName,
  });
};

const getErrorLabel = (key) => {
  if (key === "bhes") return "Ball Handling Error";
  if (key === "receiveErrors") return "Receiving Error";
  if (key === "setErrors") return "Setting Error";
  if (key === "attackErrors") return "Attacking Error";
  return key;
};

  const handleFreeBallClick = () => {
    if (ballState !== "inplay") return;

    if (!freeBallModifier) {
      if (touches.length === 0) {
        setFreeBallModifier("received");
        setActionLog((prev) => [
          ...prev,
          {
            action: "Opponent Sent a Free Ball",
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        const lastTouch = touches[touches.length - 1];
        const player = courtPlayers[lastTouch.slotIndex];
        setActionLog((prev) => [
          ...prev,
          {
            action: `${player?.name || "Unknown"} sent a free ball`,
            timestamp: new Date().toISOString(),
          },
        ]);
        setFreeBallModifier("sent");
      }
    } else {
      setFreeBallModifier(null);
      setActionLog((prev) => [
        ...prev,
        {
          action: "Free Ball modifier cleared",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

const formatPlayerAction = (player, label) => {
  const name = player?.name?.trim() || "Unknown";
  const number = player?.number ?? "?";
  return `${name} (#${number}) ${label}`;
};



const undoStatChange = async ({ playerId, playerName, statKeys, teamId, setPlayerStats, currentMatchId }) => {
  try {
    await logAndSyncStat({
      playerId,
      playerName,
      statKeys,
      setPlayerStats,
      currentMatchId,
      teamId,
      delta: -1,
    });

    console.log(`↩️ Reversed stat for ${playerId}`, statKeys);
  } catch (err) {
    console.error("❌ Failed to undo stat change:", err.message);
  }
};

const handleReplayClick = () => {
  if (actionLog.length === 0) return;

  let lastPointIndex = -1;
  let lastServeIndex = -1;
  let lastServer = null;
  let lastServerAction = null;
  let lastPointTeam = null;

  // Find the last serve and last awarded point
  for (let i = actionLog.length - 1; i >= 0; i--) {
    const action = actionLog[i].action;
    
    // ✅ NEW: Look for serve actions with updated patterns
    if (action.includes("Serve") || action.includes("Service")) {
      lastServeIndex = i;
      lastServerAction = action;
      
      // Determine who served based on new action patterns
      if (action.match(/(.+?) \(#(\d+)\) Serve/)) {
        // Pattern: "PlayerName (#Number) Serve is..." = Our team served
        lastServer = "our";
      } else if (action.includes("Service Ace") || action.includes("Service Error")) {
        // Pattern: "TeamName Service Ace" or "Opponent Service Error" = Opponent served
        lastServer = "opponent";
      } else {
        // Fallback: if it contains a player pattern, assume it's our serve
        lastServer = action.match(/(.+?) \(#(\d+)\)/) ? "our" : "opponent";
      }
      break;
    }

    // ✅ NEW: Updated point detection patterns
    if (
      action.includes("Service Ace") ||
      action.includes("Kill") ||
      action.includes("kill") // Handle both "Kill" and "kill"
    ) {
      if (lastPointIndex === -1) {
        lastPointIndex = i;
        
        // Determine who got the point
        if (action.match(/(.+?) \(#(\d+)\)/)) {
          // Pattern: "PlayerName (#Number) ..." = Our point
          lastPointTeam = "our";
        } else if (action.includes("Service Ace") || action.includes("Kill")) {
          // Pattern: "TeamName Service Ace" or "Opponent Kill" = Opponent point
          lastPointTeam = "opponent";
        } else {
          // Fallback
          lastPointTeam = "opponent";
        }
      }
    }

    // ✅ NEW: Updated error detection patterns
    if (action.includes("Error") || action.includes("error")) {
      if (lastPointIndex === -1) {
        lastPointIndex = i;
        
        // Determine who got the point from the error
        if (action.match(/(.+?) \(#(\d+)\).*Error/)) {
          // Pattern: "PlayerName (#Number) ... Error" = Our error, opponent gets point
          lastPointTeam = "opponent";
        } else if (action.includes("Service Error") || action.includes("Opponent")) {
          // Pattern: "TeamName Service Error" or "Opponent Error" = Opponent error, we get point
          lastPointTeam = "our";
        } else {
          // Fallback: assume it's our error
          lastPointTeam = "opponent";
        }
      }
    }
  }

  // Remove only the last awarded point
  if (lastPointIndex !== -1) {
    if (lastPointTeam === "opponent") {
      onRemovePoint("opponent", 1);
    } else {
      onRemovePoint("our", 1);
    }
  }

  // Strike-through all actions from the last serve onward
  const updatedLog = actionLog.map((entry, index) =>
    index >= lastServeIndex ? { ...entry, invalid: true } : entry
  );
  
  const invalidatedActions = actionLog.slice(lastServeIndex);

  // ✅ EXISTING: Undo stats for invalidated actions (unchanged)
  for (const entry of invalidatedActions) {
    const action = entry.action;

    const matchedPlayer = courtPlayers.find(p => action.includes(p.name));
    if (!matchedPlayer || !matchedPlayer._id) continue;

    const playerId = matchedPlayer._id;
    const teamId = match?.teamId || match?.teamName || "UNKNOWN";
    
    let statKeys = [];

    if (action.includes("serve received")) statKeys.push("receptions");
    if (action.includes("touched ball (Dig)")) statKeys.push("digs");
    if (action.includes("touched ball (Set)")) statKeys.push("sets");
    if (action.includes("touched ball (Attack)")) statKeys.push("attacks");
    if (action.includes("Zero Attack")) statKeys.push("zeroAttacks", "attacks");
    if (action.includes("Zero Set")) statKeys.push("zeroSets", "sets");
    if (action.includes("Assist credited")) statKeys.push("assists");
    if (action.includes("free ball kill")) statKeys.push("freeballKills", "points");
    if (action.includes("free ball error")) statKeys.push("freeballErrors", "freeballs");
    if (action.includes("sent a free ball")) statKeys.push("freeballs");
    if (action.includes("Kill") && !action.includes("free ball")) statKeys.push("kills", "points");
    if (action.includes("Serve is an Ace")) statKeys.push("aces", "serveAttempts", "points");
    if (action.includes("Serve is an Error")) statKeys.push("serveErrors", "serveAttempts");
    if (action.includes("Serve is In Play")) statKeys.push("serves", "zeroServes");
    if (action.includes("Block error")) statKeys.push("blockErrors");
    if (action.includes("Block kill") || action.includes("block kill")) {
      if (action.includes("Double") || action.includes("Triple")) {
        statKeys.push("blockAssist", "points");
      } else {
        statKeys.push("blockSolo", "points");
      }
    }
    if (action.includes("Block In Play")) statKeys.push("zeroBlocks");
    if (action.includes("Receiving Error")) statKeys.push("receiveErrors", "receptions");
    if (action.includes("Setting Error")) statKeys.push("setErrors", "sets");
    if (action.includes("Attacking Error")) statKeys.push("attackErrors", "attacks");
    if (action.includes("Ball Handling Error")) statKeys.push("bhes");

    if (statKeys.length > 0) {
      undoStatChange({
        playerId: matchedPlayer._id,
        playerName: matchedPlayer.name,
        statKeys,
        teamId,
        currentMatchId,
      });
    }
  }

  // Add "Referee Declared Replay" action
  updatedLog.push({ action: "Referee Declared Replay", timestamp: new Date().toISOString() });

  // Reset ball state and return serve to the last server
  setActionLog(updatedLog);
  setBallState("serve");
  setTouches([]);
  setFreeBallModifier(null);
  setBlockInfo(null);
  setBlockCirclesVisible(false);

  // ✅ UPDATED: Use the determined lastServer
  if (lastServerAction && lastServer) {
    setCurrentServeSide(lastServer);
    setBallPosition(lastServer === "our" ? serverSlotPosition : opponentServePosition);
    
    // Show/hide serve zone overlay appropriately
    setShowServeZoneOverlay?.(lastServer === "our");
    
    console.log(`🔄 Replay: Restored serve to ${lastServer} team`);
  } else {
    // Fallback if we couldn't determine the server
    console.warn("⚠️ Could not determine last server, defaulting to opponent");
    setCurrentServeSide("opponent");
    setBallPosition(opponentServePosition);
    setShowServeZoneOverlay?.(false);
  }
};


useEffect(() => {
  if (ballState === "serve") {
    const correctServeSide = currentServeSide || serveSide;
    const correctBallPosition = correctServeSide === "our" 
      ? serverSlotPosition 
      : opponentServePosition;
    
    setBallPosition(correctBallPosition);
    setBallSide(correctServeSide);
    
    console.log(`🏐 Ball position restored for ${correctServeSide} serve`);
  }
}, [ballState, currentServeSide, serveSide]); // Run when serve state changes

// Also update the existing sync effect to be more aggressive about restoring position:
useEffect(() => {
  // Sync serve state when there's a mismatch
  if (ballState === "serve" && serveSide !== currentServeSide) {
    console.log(`🔄 Syncing serve state: ${currentServeSide} → ${serveSide}`);
    setCurrentServeSide(serveSide);
    
    const newPosition = serveSide === "our" 
      ? serverSlotPosition 
      : opponentServePosition;
    setBallPosition(newPosition);
    setBallSide(serveSide);
  }
}, [serveSide, currentServeSide, ballState]);


const hasAutoSyncedRef = useRef(false);



// Reset the auto-sync flag when a point is scored (no longer a new set)
useEffect(() => {
  if (ourScore > 0 || opponentScore > 0) {
    hasAutoSyncedRef.current = false;
  }
}, [ourScore, opponentScore]);

// ALSO UPDATE handleSwitchServe to prevent auto-sync interference:



const isRealMongoId = (id) => typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

const clearCourt = async () => {
  try {
    const playersOnCourt = courtPlayers.filter(
      (p) => p.name !== "?" && isRealMongoId(p._id)
    );

    const updates = [];

    for (const player of playersOnCourt) {
      updates.push(axios.put(`${API_URL}/api/players/${player._id}`, { isOnCourt: false }));

      if (player.replacedPlayer?._id && isRealMongoId(player.replacedPlayer._id)) {
        updates.push(
          axios.put(`${API_URL}/api/players/${player.replacedPlayer._id}`, { isOnCourt: false })
        );
      }
    }

    await Promise.all(updates);
    console.log("✅ Court cleared and players updated");
  } catch (error) {
    console.error("❌ Error clearing court:", error);
  }

  // Local state reset
  const clearedCourt = Array.from({ length: 6 }, () => ({
    name: "?",
    number: "?",
    isOnCourt: false,
  }));

  updatePlayersOnCourt(clearedCourt);
  refreshBenchPlayers();

  setBallState("serve");
  setSlot5TargetId(null);
  setAllowedLiberoSubTarget(null);
  setBallSide("opponent");
  setBallPosition(opponentServePosition);
  setTouches([]);
  setFreeBallModifier(null);
  setBlockInfo(null);
  setBlockCirclesVisible(false);
  
  clearRotationHistory();

  console.log("ClearCourt: new courtPlayers:", clearedCourt);
};

const handleSwitchServe = () => {
  const nextServeSide = currentServeSide === "our" ? "opponent" : "our";
  
  // Update both local state AND parent state
  setCurrentServeSide(nextServeSide);
  if (setServeSide) {
    setServeSide(nextServeSide); // Update parent App.js state too
  }
  
  // Mark that user has manually switched (prevent auto-sync)
  hasAutoSyncedRef.current = true;
  
  setBallPosition(
    currentServeSide === "our" ? opponentServePosition : serverSlotPosition
  );
  setBallState("serve");

  setFreeBallModifier(null);
  setBlockInfo(null);
  setBlockCirclesVisible(false);

  // Show serve zone overlay if we're now serving
  if (nextServeSide === "our") {
    setSelectedServeZone(null);
    setShowServeZoneOverlay(true);
  }
  if (nextServeSide === "opponent") {
    setSelectedServeZone(null);	
    setShowServeZoneOverlay(false);
  }
  
  console.log(`🔄 Manual serve switch: ${currentServeSide} → ${nextServeSide}`);
}
  
const resetBall = (newServeSide, position, shouldRotate = false) => {
  console.log(`🔄 resetBall called: ${newServeSide} serve`);
  
  setBallState("serve");
  setCurrentServeSide(newServeSide);
  
  // FIX: Also update the App.js serve state (source of truth)
  if (setServeSide) {
    setServeSide(newServeSide);
  }
  
  setBallPosition(position);
  setTouches([]);
  setFreeBallModifier(null);
  setBlockCirclesVisible(false);
  setBlockInfo(null);
  
  if (shouldRotate && newServeSide === "our") {
    rotatePlayers();
  }
};



const StatBox = ({ label, value, color = "#111" }) => (
  <div
    style={{
      border: `2px solid ${color}`,
      borderRadius: "16px",
      padding: "8px 12px",
	  width: "105px",
      minWidth: "105px",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
      textAlign: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      color: "#111",
    }}
  >
    <div
      style={{
        fontSize: "0.7rem",
        fontWeight: "500",
        marginBottom: "4px",
        opacity: 0.9,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: "1.4rem",
        fontWeight: "700",
      }}
    >
      {value}
    </div>
  </div>
);



const CompactStatBox = ({ label, value, color = "#111" }) => (
  <div style={{ border: `2px solid ${color}`, borderRadius: "12px", padding: "5px 8px", flex: "1 1 0", minWidth: "0", textAlign: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", color: "#111" }}>
    <div style={{ fontSize: "0.6rem", fontWeight: "500", opacity: 0.85, lineHeight: 1.2 }}>{label}</div>
    <div style={{ fontSize: "1.1rem", fontWeight: "700" }}>{value}</div>
  </div>
);

const ActionZone = ({ label, zoneAction, ballSide, color }) => {
  // Logic to determine default colors if no specific color is passed
  const isOpponentBall = ballSide === "opponent" || currentServeSide === "opponent";
  
  const dynamicStyle = {
    ...buttonStyle, // Uses your existing buttonStyle object
    backgroundColor: color || (isOpponentBall ? "#007AFF" : "#34C759"),
    margin: "4px",
    // Enhanced visibility when video is active
    ...(showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl) ? {
      boxShadow: "0px 4px 12px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.3)",
      fontWeight: "700",
      border: "2px solid rgba(255, 255, 255, 0.5)"
    } : {})
  };

  return (
    <button 
      onClick={() => handleActionDrop(zoneAction)} 
      style={dynamicStyle}
    >
      {label}
    </button>
  );
};

// Clickable box overlaid on video for each player position
const VideoPlayerBox = ({ position, player, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  if (!player || player.name === "?") return null;
  
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        flex: 1,
        height: "100%",
        border: isHovered ? "3px solid #FFD700" : "2px solid rgba(255, 255, 255, 0.3)",
        borderRadius: "12px",
        backgroundColor: isHovered 
          ? "rgba(255, 215, 0, 0.2)" 
          : "rgba(255, 255, 255, 0.05)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        transition: "all 0.2s ease",
        backdropFilter: isHovered ? "blur(2px)" : "none",
        boxShadow: isHovered 
          ? "0 4px 20px rgba(255, 215, 0, 0.4)" 
          : "0 2px 8px rgba(0, 0, 0, 0.2)",
        transform: isHovered ? "scale(1.05)" : "scale(1)",
        maxWidth: "30%",
        minHeight: "80%"
      }}
    >
      {isHovered && (
        <>
          <div style={{
            color: "#FFD700",
            fontWeight: "bold",
            fontSize: "1.2rem",
            textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            marginBottom: "4px"
          }}>
            #{player.number}
          </div>
          <div style={{
            color: "#FFF",
            fontSize: "0.9rem",
            textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            textAlign: "center",
            maxWidth: "90%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {player.name}
          </div>
        </>
      )}
    </div>
  );
};



function renderActionZones() {
  const zoneButtons = [];


  const commonActions = (actions) =>
    actions.map(({ label, zoneAction, color }) => (
      <ActionZone
        key={zoneAction}
        label={label}
        zoneAction={zoneAction}
        ballSide={ballSide}
        color={color} 
      />
    ));

  // Action logic
  if (blockInfo) {
    zoneButtons.push(
      ...commonActions([
        { color: "green", label: "Block Kill", zoneAction: "Kill" },
        { color: "red", label: "Block Error", zoneAction: "Error" },
        { color: "blue", label: "Block In Play", zoneAction: "InPlay" },
      ])
    );
  } else if (ballState === "serve") {
    if (currentServeSide === "our") {
      zoneButtons.push(
        ...commonActions([
          { color: "green", label: "Service Ace", zoneAction: "Ace" },
          { color: "red", label: "Service Error", zoneAction: "Error" },
          { color: "blue", label: "In Play", zoneAction: "InPlay" }, // Added yellow here
        ])
      );
    } else if (currentServeSide === "opponent") {
      zoneButtons.push(
        ...commonActions([
          { color: "green", label: "Opp Serve Error", zoneAction: "Error" },
          { color: "red", label: "Opponent Ace", zoneAction: "Ace" },
        ])
      );
    }
  } else if (ballState === "inplay" && ballSide === "opponent") {
    zoneButtons.push(
      ...commonActions([
        { color: "red", label: "Opponent Kill", zoneAction: "Kill" },
        { color: "green", label: "Opponent Error", zoneAction: "Error" },
      ])
    );
  } else if (ballState === "inplay" && ballSide === "our") {
    const ourTouches = touches.filter(t => t.side === "our").length;

    if (ourTouches === 1) {
      zoneButtons.push(
        ...commonActions([
          { color: "red", label: "Receive Error", zoneAction: "Error" },
          { color: "green", label: "Kill", zoneAction: "Kill" },
          { color: "blue", label: "In Play", zoneAction: "InPlay" },
        ])
      );
    } else if (ourTouches === 2) {
      zoneButtons.push(
        ...commonActions([
          { color: "red", label: "Set Error", zoneAction: "Error" },
          { color: "green", label: "Kill", zoneAction: "Kill" },
          { color: "blue", label: "In Play", zoneAction: "InPlay" },
        ])
      );
    } else if (ourTouches === 3) {
      zoneButtons.push(
        ...commonActions([
          { color: "red", label: "Attack Error", zoneAction: "Error" },
          { color: "green", label: "Kill", zoneAction: "Kill" },
          { color: "blue", label: "In Play", zoneAction: "InPlay" },
        ])
      );
    }
  }

  if (zoneButtons.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: isMobile ? "nowrap" : "nowrap",
        gap: isMobile ? "7px" : "10px",
        justifyContent: "center",
        marginTop: isMobile ? "0px" : "0px",
		opacity: showServeZoneOverlay ? 0.5 : 1,
        cursor: showServeZoneOverlay ? 'not-allowed' : 'pointer',
      }}
    >
      {zoneButtons}
    </div>
  );
}


  const getJerseyNumber = (name) => {
  const match = courtPlayers.find(p => p.name === name);
  return match?.number ?? "?";
};

  const flashSlot = (slotIndex) => {
    setFlashSlots((prev) => {
      const newFlash = [...prev];
      newFlash[slotIndex] = true;
      return newFlash;
    });
    setTimeout(() => {
      setFlashSlots((prev) => {
        const newFlash = [...prev];
        newFlash[slotIndex] = false;
        return newFlash;
      });
    }, 300);
  };

  // When a player slot is touched, always clear block circles.
const registerBallTouchOnSlot = (slotIndex) => {
	 if (hasEmptyCourtSlots) {
    console.warn("Tap ignored: empty court slot exists");
    return;
  }
  
  
 
  const now = Date.now();
  const timeSinceLastTouch = now - lastTouchTimeRef.current;
  const isSameSlot = lastTouchSlotRef?.current === slotIndex;
  
  if (isSameSlot && timeSinceLastTouch < 500) {
    console.log(`⛔ Blocked duplicate touch on slot ${slotIndex} (${timeSinceLastTouch}ms ago)`);
    return;
  }
  
  lastTouchTimeRef.current = now;
  lastTouchSlotRef.current = slotIndex;   
    setBlockCirclesVisible(false);
    setBlockInfo(null);

if (
  ballState === "inplay" &&
  ballSide === "our" &&
  freeBallModifier === "sent"
) {
  console.log("⛔ Ignoring player touch — free ball has already been sent.");
  return;
}
    if (ballState === "serve") {
  if (currentServeSide === "opponent") {
    const newTouch = { slotIndex, role: serveReceiveRole, side: "our" };
    setTouches([newTouch]);
    setBallSide("our");

const player = courtPlayers[slotIndex];

    logAndSyncStat({
      playerId: player._id,
      playerName: player.name,
      label: "Reception",
      statKeys: ["receptions"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });

    setActionLog((prev) => [
      ...prev,
      {
        action: `${player?.name || "Unknown"} serve received (attempt)`,
        timestamp: new Date().toISOString(),
      },
    ]);

    setBallState("inplay");
	setBallSide("our");
    flashSlot(slotIndex);
    return;
      } else {
        const dummyTouch = { slotIndex: 5, role: "Serve", side: "our" };
        setTouches([dummyTouch]);
        setBallSide("our");
        const player = courtPlayers[5];
        setActionLog((prev) => [
          ...prev,
          {
            action: `${player?.name || "Unknown"} (server) need to serve. PLEASE SELECT Error, Ace or In Play or swap the serve.`,
            timestamp: new Date().toISOString(),
          },
        ]);
		setTouches([]);
        return;
      }
    }
    if (ballState !== "inplay" || touches.length >= 3) return;
    if (freeBallModifier === "received") {
	  const player = courtPlayers[slotIndex];	
      const newSide = slotIndex >= 0 ? "our" : "opponent";
      const newTouch = { slotIndex, role: "Dig", side: newSide };
      setTouches((prev) => [...prev, newTouch]);
      setBallSide(newSide);
      
      setActionLog((prev) => [
        ...prev,
        {
          action: `${player?.name || "Unknown"} free ball received`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setFreeBallModifier(null);
      flashSlot(slotIndex);
      return;
    } else if (freeBallModifier === "sent") {
      setFreeBallModifier(null);
    }
    if (touches.length > 0 && touches[touches.length - 1].slotIndex === slotIndex)
      return;
    const newSide = slotIndex >= 0 ? "our" : "opponent";
	const role = touchRoles[touches.length];
const newTouch = { slotIndex, role, side: newSide };
setTouches((prev) => [...prev, newTouch]);

const player = courtPlayers[slotIndex];

if (newSide === "our" && player && role) {
  const justBlocked = actionLog.length > 0 && 
    actionLog[actionLog.length - 1].action.toLowerCase().includes("block");

  // Log stats immediately based on role
  if (role === "Dig" && !justBlocked) {
    logAndSyncStat({
      playerId: player._id,
      playerName: player.name,
      label: "Dig",
      statKeys: ["digs"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });
  } else if (role === "Set") {
    logAndSyncStat({
      playerId: player._id,
      playerName: player.name,
      label: "Set",
      statKeys: ["sets"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });
  } else if (role === "Attack") {
    logAndSyncStat({
      playerId: player._id,
      playerName: player.name,
      label: "Attack",
      statKeys: ["attacks"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });
  }
    
	setBallSide(newSide);
    
    setActionLog((prev) => [
      ...prev,
      {
        action: formatPlayerAction(player, `touched ball (${newTouch.role})`),
        timestamp: new Date().toISOString(),
		touchInfo: newTouch,
      },
    ]);
    flashSlot(slotIndex);
  };
  }

  const registerTouch = (slotIndex) => {
    registerBallTouchOnSlot(slotIndex);
  };




const handlePlayerDrop = async (benchPlayer, slotIndex) => {
  if (ballState !== "serve") {
    alert("Substitutions are only allowed before the rally begins.");
    return;
  }

  if (courtPlayers.some(p => p._id === benchPlayer._id)) {
    alert("This player is already on the court.");
    return;
  }


  const targetPlayer = courtPlayers[slotIndex];
  const newCourtPlayers = [...courtPlayers];

const cleanedBenchPlayer = {
  _id: benchPlayer._id,
  id: benchPlayer.id || benchPlayer._id,
  name: benchPlayer.name || "?",
  number: benchPlayer.number === 0 ? 0 : (benchPlayer.number || "?"),
  isLibero: benchPlayer.isLibero || false,
  replacedPlayer: null,
  careerStats: benchPlayer.careerStats || {},
  seasonStats: benchPlayer.seasonStats || {},
};

  let newBenchPlayers = benchPlayers.filter(p => p._id !== benchPlayer._id);

  const isLiberoSub = benchPlayer.isLibero;
  const replacingLibero = targetPlayer?.isLibero;
  const isBeforeSetStart = ourScore === 0 && opponentScore === 0;

  // =============================
  // 🔥 Libero Substitution Logic (unchanged)
  // =============================
  if (isLiberoSub) {
    if (slotIndex < 3) return; // ⛔ Never allow libero in front row

    if (!targetPlayer || targetPlayer.name === "?") return; // ⛔ Must replace someone

    const currentLibero = courtPlayers.find(p => p.isLibero);
    const isTargetLibero = targetPlayer.isLibero;
    const validPartners = [slot5TargetId?._id, allowedLiberoSubTarget?._id].filter(Boolean);
    const isValidPartner = targetPlayer && validPartners.includes(targetPlayer._id);

    // ✅ Libero-for-libero swap
    if (isTargetLibero && benchPlayer.isLibero) {
      const outgoingLibero = targetPlayer;

      newCourtPlayers[slotIndex] = {
        ...cleanedBenchPlayer,
        isLibero: true,
        replacedPlayer: outgoingLibero.replacedPlayer || null,
        isOnCourt: true,
      };

      const benchWithoutOutgoingLibero = newBenchPlayers.filter(p => p._id !== outgoingLibero._id);
      newBenchPlayers = [
        ...benchWithoutOutgoingLibero,
        { ...outgoingLibero, isLibero: true, isOnCourt: false }
      ];

      try {
        await axios.put(`${API_URL}/api/players/${outgoingLibero._id}`, { isOnCourt: false },{headers: {Authorization: `Bearer ${token}`}});
        await axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true },{headers: {Authorization: `Bearer ${token}`}});
      } catch (err) {
        console.error("Failed to update libero states in DB:", err);
        return;
      }

      setCourtPlayers(newCourtPlayers);
      setBenchPlayers(
        [...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0))
      );
      
      // 🎯 CREDIT INCOMING LIBERO ON SWAP
      // Check if this libero has already been credited this set
      if (!creditedPlayersThisSetRef.current.has(benchPlayer._id)) {
        await maybeCreditGamesPlayed(benchPlayer._id, false, "libero_swap");
        creditedPlayersThisSetRef.current.add(benchPlayer._id);
        console.log(`✅ Credited incoming libero ${benchPlayer.name} on swap`);
      } else {
        console.log(`⏭️ Libero ${benchPlayer.name} already credited this set - skipping`);
      }
      
      return;
    }
    
    // ✅ Allow first-time libero substitution (no libero yet + no partner set)
    if (!currentLibero && !allowedLiberoSubTarget) {
      newCourtPlayers[slotIndex] = {
        ...cleanedBenchPlayer,
        replacedPlayer: targetPlayer,
        isOnCourt: true,
      };

      newBenchPlayers.push({ ...targetPlayer, isLibero: false, isOnCourt: false });

      try {
        await axios.put(`${API_URL}/api/players/${targetPlayer._id}`, { isOnCourt: false },{headers: {Authorization: `Bearer ${token}`}});
        await axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true },{headers: {Authorization: `Bearer ${token}`}});
      } catch (err) {
        console.error("Failed to update players in DB:", err);
        return;
      }

      setCourtPlayers(newCourtPlayers);
      setBenchPlayers(
        [...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0))
      );
      setAllowedLiberoSubTarget(targetPlayer);
      
      // 🎯 CREDIT FIRST-TIME LIBERO SUB
      // Check if this libero has already been credited this set
      if (!creditedPlayersThisSetRef.current.has(benchPlayer._id)) {
        await maybeCreditGamesPlayed(benchPlayer._id, false, "first_libero_sub");
        creditedPlayersThisSetRef.current.add(benchPlayer._id);
        console.log(`✅ Credited first-time libero ${benchPlayer.name}`);
      } else {
        console.log(`⏭️ Libero ${benchPlayer.name} already credited this set - skipping`);
      }
      
      return;
    }
    
    // ✅ Standard libero sub — only if replacing valid partner
    const validTargetIds = [
      allowedLiberoSubTarget?._id,
      slot5TargetId?._id,
    ].filter(Boolean);

    if (!isValidPartner) {
      const confirmOverride = window.confirm(
        `⚠️ This substitution seems illegal based on earlier libero entries.\n\n` +
        `Libero is trying to sub in for ${targetPlayer.name}, who is not a registered partner.\n\n` +
        `Do you want to proceed anyway and update the slot5 partner to ${targetPlayer.name}?`
      );
      if (!confirmOverride) return;

      setSlot5TargetId(targetPlayer);
    }

    if (currentLibero && currentLibero._id !== benchPlayer._id) {
      newBenchPlayers.push({ ...currentLibero, isLibero: true, isOnCourt: false });
      await axios.put(`${API_URL}/api/players/${currentLibero._id}`, { isOnCourt: false });
    }

    newCourtPlayers[slotIndex] = {
      ...cleanedBenchPlayer,
      replacedPlayer: targetPlayer,
      isOnCourt: true,
    };

    if (!allowedLiberoSubTarget) setAllowedLiberoSubTarget(targetPlayer);
	if (!newBenchPlayers.some(p => p._id === targetPlayer._id)) {
  newBenchPlayers.push({ ...targetPlayer, isLibero: false, isOnCourt: false });
}

try {
  await axios.put(`${API_URL}/api/players/${targetPlayer._id}`, { isOnCourt: false },{headers: {Authorization: `Bearer ${token}`}});
  await axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true },{headers: {Authorization: `Bearer ${token}`}});
} catch (err) {
  console.error("Failed to update players in DB:", err);
  return;
}

setCourtPlayers(newCourtPlayers);
setBenchPlayers(
  [...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0))
);
	
// 🎯 CREDIT LIBERO PARTNER SUB
// Check if this libero has already been credited this set
if (!creditedPlayersThisSetRef.current.has(benchPlayer._id)) {
  await maybeCreditGamesPlayed(benchPlayer._id, false, "libero_partner_sub");
  creditedPlayersThisSetRef.current.add(benchPlayer._id);
  console.log(`✅ Credited libero partner ${benchPlayer.name}`);
} else {
  console.log(`⏭️ Libero ${benchPlayer.name} already credited this set - skipping`);
}

// ADD RETURN TO PREVENT FALL-THROUGH
return;
  }
  // =============================
  // 🟩 Regular Substitution Logic
  // =============================
  else {
    if (targetPlayer && targetPlayer.name !== "?") {
      newBenchPlayers.push({
        _id: targetPlayer._id,
        id: targetPlayer.id || targetPlayer._id,
        name: targetPlayer.name || "?",
        number: targetPlayer.number === 0 ? 0 : (targetPlayer.number || "?"),
        isLibero: targetPlayer.isLibero || false,
        careerStats: targetPlayer.careerStats || {},
        seasonStats: targetPlayer.seasonStats || {},
        isOnCourt: false,
      });

      // ✅ Only log if the match or set has started
      if (ourScore > 0 || opponentScore > 0) {
        setSubstitutionCount(prev => prev + 1);
        setSubstitutionLog(prev => [
          ...prev,
          {
            in: benchPlayer,
            out: targetPlayer,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    }

    newCourtPlayers[slotIndex] = {
      ...cleanedBenchPlayer,
      replacedPlayer: replacingLibero ? null : targetPlayer,
      isOnCourt: true,
    };

    // 🎯 GAMES PLAYED LOGIC FOR REGULAR SUB BEFORE SET START
    // If subbing BEFORE set starts (0-0 score), remove credit from replaced player
    // UNLESS they were replaced by a libero (which is normal rotation, not a real sub)
    if (isBeforeSetStart && !benchPlayer.isLibero) {
      if (targetPlayer && targetPlayer._id && targetPlayer.name !== "?") {
        console.log(`🔄 Removing credit from ${targetPlayer.name} - subbed out before set started (not by libero)`);
        await removeGamesPlayedCredit(targetPlayer._id);
        creditedPlayersThisSetRef.current.delete(targetPlayer._id);
      }
    }
  }

  // =============================
  // ✅ Final state + sync (unchanged)
  // =============================
  setCourtPlayers(newCourtPlayers);

  // Credit games played for substituted player if match has started
// 🎯 ALWAYS credit games played when a player is placed on court via drag & drop
// Credit games played for substituted player (only once per set)
if (benchPlayer && benchPlayer._id && typeof maybeCreditGamesPlayed === 'function') {
  console.log(`🔄 Crediting games played for placed player: ${benchPlayer.name} (#${benchPlayer.number})`);
  
  // Check if player is already credited to avoid duplicates
  if (!creditedPlayersThisSetRef.current.has(benchPlayer._id)) {
    // Use longer timeout and pass current court state context
    setTimeout(async () => {
      try {
        await maybeCreditGamesPlayed(benchPlayer._id, false, "substitution");
        console.log(`✅ Successfully credited games played for ${benchPlayer.name}`);
        creditedPlayersThisSetRef.current.add(benchPlayer._id);
		console.log(`${benchPlayer._id} added to GamePlay Cursor`);
      } catch (error) {
        console.error(`❌ Failed to credit games played for ${benchPlayer.name}:`, error);
      }
    }, 300); // Increased timeout
  } else {
    console.log(`ℹ️ Player ${benchPlayer.name} already credited this set - skipping`);
  }
}



  // Build set first
  const courtPlayerIds = new Set(
    newCourtPlayers.map(p => p._id).filter(Boolean)
  );
  
  // Then filter out replaced players who are already on court
  newCourtPlayers.forEach(p => {
    const rep = p.replacedPlayer;
    const isRealPlayer = rep && rep._id && rep.name !== "?" && rep.number !== "?";
    if (isRealPlayer && !courtPlayerIds.has(rep._id)) {
      newBenchPlayers.push({ ...rep, isOnCourt: false });
    }
  });

  // ✅ Remove bench players who are now on the court OR duplicated
  const uniqueBenchPlayersMap = new Map();

  for (const player of newBenchPlayers) {
    if (!courtPlayerIds.has(player._id)) {
      uniqueBenchPlayersMap.set(player._id, player);
    }
  }

  const cleanedBenchPlayers = Array.from(uniqueBenchPlayersMap.values());
  setBenchPlayers(
    [...cleanedBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0))
  );

  try {
    if (targetPlayer && targetPlayer._id && targetPlayer.name !== "?") {
      await axios.put(`${API_URL}/api/players/${targetPlayer._id}`, { isOnCourt: false },{headers: {Authorization: `Bearer ${token}`}});
    }
    await axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true },{headers: {Authorization: `Bearer ${token}`}});
  } catch (error) {
    console.error("Substitution DB sync failed:", error);
  }

  syncCourtAndBench(newCourtPlayers, cleanedBenchPlayers);
};



// Top-level utility function
const wasLastActionASub = () => {
  if (substitutionLog.length === 0) return false;
  const lastSub = substitutionLog[substitutionLog.length - 1];
  return lastSub?.in && lastSub?.out; // Confirm it was a real substitution
};


const handleUndoLastSubstitution = async () => {
  if (substitutionLog.length === 0) {
    alert("No substitution to undo.");
    return;
  }

  const lastSub = substitutionLog[substitutionLog.length - 1];
  if (!lastSub.in || !lastSub.out) {
    alert("Invalid substitution record.");
    return;
  }

  const updatedCourtPlayers = [...courtPlayers];
  const updatedBenchPlayers = [...benchPlayers];

  // 1. Find subbed-in player on court
  const subbedInIndex = updatedCourtPlayers.findIndex(p => p._id === lastSub.in._id);
  if (subbedInIndex === -1) {
    alert("Subbed player not found on court.");
    return;
  }

  // 2. Replace on court with subbed-out player
  updatedCourtPlayers[subbedInIndex] = {
    ...lastSub.out,
    isOnCourt: true,
  };

  // 3. Remove subbed-in player from bench if already there
  const benchWithoutIn = updatedBenchPlayers.filter(p => p._id !== lastSub.in._id);

  // 4. Add subbed-in player back to bench
  const cleanedBenchPlayers = [
    ...benchWithoutIn,
    { ...lastSub.in, isOnCourt: false }
  ];

  // 5. Update state
  setCourtPlayers(updatedCourtPlayers);
        setBenchPlayers(
  [...cleanedBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0))
);


  // 6. Sync to server (best effort)
  try {
    await axios.put(`${API_URL}/api/players/${lastSub.in._id}`, { isOnCourt: false });
    await axios.put(
  `${API_URL}/api/players/${lastSub.out._id}`, 
  { isOnCourt: true },{headers: {Authorization: `Bearer ${token}`}});
  } catch (error) {
    console.error("Undo substitution DB sync failed:", error);
  }

  // 7. Trim the substitution log
  setSubstitutionLog(prev => prev.slice(0, prev.length - 1));
  setSubstitutionCount(prev => Math.max(0, prev - 1));

  console.log("✅ Substitution undone successfully.");
};
const handleTwoPlayerBlock = (clickedSlotIndex) => {
  const frontRowSlots = [0, 1, 2];
  const frontPlayers = frontRowSlots
    .map((i) => ({ slot: i, player: courtPlayers[i] }))
    .filter((p) => p.player && p.player.name !== "?");

  const mb = frontPlayers.find((p) => p.player.position === "MB");
  const clickedPlayer = courtPlayers[clickedSlotIndex];

  if (mb && clickedPlayer) {
    const name1 = mb.player?.name || "?";
    const name2 = clickedPlayer?.name || "?";

    setActionLog((prev) => [
      ...prev,
      {
        action: `Double block attempt by ${name1} & ${name2}`,
        timestamp: new Date().toISOString(),
      },
    ]);

    setBlockInfo({ slots: [mb.slot, clickedSlotIndex] });
    setBlockCirclesVisible(true);
  }
};

const CourtSlot = React.forwardRef(({ player, index, flash }, ref) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: "PLAYER",
    drop: (item) => {
  (async () => {
    await handlePlayerDrop(item, index);
  })();
},
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

const isEmptySlot =
  !player ||
  player.name === "?" ||
  player.number === "?" ||
  player.number === undefined ||
  player.number === null;
const { line1, line2 } = splitPlayerName(isEmptySlot ? "" : (player.name || ""), 10);

return (
  <div
    ref={(el) => {
      drop(el);
      if (ref) ref.current = el;
    }}
    data-slot-index={index}
    onClick={() => registerTouch(index)}
    style={slotStyle(index, player, flash)}
  >
    {/* Name + number hidden when empty */}
    {!isEmptySlot && (
      <>
        <div
          style={{
            ...slotNameStyle,
            color:
              ((slot5TargetId && player._id === slot5TargetId._id) ||
                (allowedLiberoSubTarget && player._id === allowedLiberoSubTarget._id))
                ? "#FF3B30"
                : (showVideoBackground && !isMobile && (youtubeUrl || localVideoUrl))
                  ? "#FFFFFF"  // White when video is active
                  : "#333",     // Dark when no video
            lineHeight: line2 ? "1.1" : "1.2",
            textAlign: "center",
          }}
        >
          <div>{line1}</div>
          {line2 && <div>{line2}</div>}
        </div>
{!isEmptySlot && (
        <div style={slotNumberStyle}>
    #{String(player.number)}
  </div>
  )}
      </>
    )}

    {/* Always show position */}
    <div style={slotPosStyle}>Pos {positionLabels[index]}</div>

    {/* Badges only make sense when filled */}
    {!isEmptySlot && positionLabels[index] === "1" && !player.isLibero && (
      <div style={serverBadgeStyle}>Server</div>
    )}
    {!isEmptySlot && player.isLibero && <div style={liberoBadgeStyle}>Libero</div>}
  </div>
);
});
  
const resetRally = (wonBy) => {
  // wonBy must be "our" or "opponent"
  setBallState("serve");

  // Clear rally state
  setTouches([]);
  setFreeBallModifier(null);
  setBlockCirclesVisible(false);
  setBlockInfo(null);

  // Next serve belongs to the team who won the rally
  setCurrentServeSide(wonBy);
  setBallSide(wonBy);

  // Award the point to the team who won the rally
  if (wonBy === "our") {
    onOurPoint?.();
  } else {
    onOpponentPoint?.();
  }

  // Put the ball where the next server is (use your existing constants)
  setBallPosition(wonBy === "our" ? serverSlotPosition : opponentServePosition);
};

  // Define block spots – these are shown only when blockCirclesVisible is true.


const handleBlockClick = (slots, e) => {
  e.stopPropagation();
  const validSlots = slots.filter((s) => s < 6);
  if (!validSlots.length) return;

  const players = validSlots.map((i) => courtPlayers[i]);
  const names = players.map((p) => p?.name || "?").join(" & ");

  const action =
    validSlots.length === 1
      ? `${names} block attempt`
      : validSlots.length === 2
      ? `Double block attempt by ${names}`
      : `Triple block attempt by ${names}`;

  setBlockInfo({ slots: validSlots });
  setBlockCirclesVisible(true);
  setBallSide("our");

  // Replace last block-type log entry if present
setActionLog((prev) => {
  const newEntry = { action, timestamp: new Date().toISOString() };

  // 🕵️‍♂️ Log malformed entries
  prev.forEach((entry, index) => {
    if (typeof entry.action !== "string") {
      console.warn(`⚠️ Malformed action at index ${index}:`, entry);
    }
  });

  const filtered = prev.filter(
    (entry) =>
      typeof entry.action !== "string" ||
      (!entry.action.includes("block attempt") &&
       !entry.action.includes("Double block") &&
       !entry.action.includes("Triple block"))
  );
  return [...filtered, newEntry];
});
};

const getBlockButtonStyle = (isSelected, topPercent, leftPercent) => ({
  position: "absolute",
  top: `${topPercent}%`,
  left: `${leftPercent}%`,
  width: "70px",
  height: "28px",
  padding: "2px 6px",
  borderRadius: "14px",
  backgroundColor: isSelected ? "#34C759" : "rgba(255,255,255,0.95)",
  border: isSelected ? "1px solid #34C759" : "1px solid #ccc",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: isSelected
    ? "0px 2px 6px rgba(0, 0, 0, 0.2)"
    : "0px 1px 3px rgba(0, 0, 0, 0.08)",
  transition: "background-color 0.2s ease",
  zIndex: 10,
});

const [freeBallStyle, setFreeBallStyle] = useState(null);

useEffect(() => {
  const updateFreeBallPosition = () => {
    if (!slot2Ref.current || !containerRef.current) return;

    const slotEl = slot2Ref.current;
    const containerEl = containerRef.current;

    const top = slotEl.offsetTop;
    const left = slotEl.offsetLeft + slotEl.offsetWidth + 8; // 8px right offset

    setFreeBallStyle({
      position: "absolute",
      top: `${top}px`,
      left: `${left}px`,
    });
  }; 

  updateFreeBallPosition();
  window.addEventListener("resize", updateFreeBallPosition);
  return () => window.removeEventListener("resize", updateFreeBallPosition);
}, [courtPlayers]);


useEffect(() => {
  if (ballState !== "inplay") return;

  const lastOurTouch = [...touches].reverse().find(t => t.side === "our");
  if (!lastOurTouch || typeof lastOurTouch.slotIndex !== "number") return;

  const slotElement = document.querySelector(`[data-slot-index="${lastOurTouch.slotIndex}"]`);
  const containerElement = containerRef.current;
  if (!slotElement || !containerElement) return;

  const slotRect = slotElement.getBoundingClientRect();
  const containerRect = containerElement.getBoundingClientRect();

  const top = slotRect.top - containerRect.top + slotRect.height / 2 - 15;
  const left = slotRect.left - containerRect.left + slotRect.width / 2 - 15;

  setBallPosition({
    top: `${top}px`,
    left: `${left}px`,
    position: "absolute"
  });
}, [touches, ballState]);




const renderBlockAreas = () => {
  if (ballState !== "inplay" || !blockCirclesVisible) return null;

  const frontRowSlots = [0, 1, 2];
  const frontPlayers = frontRowSlots
    .map((slot) => ({ slot, player: courtPlayers[slot] }))
    .filter((p) => p.player && p.player.name !== "?");

  const buttons = [];

 const renderBlockIcons = (slots, isSelected) => {
  const icon = (i) =>
    slots.includes(i) ? "🙌" : "X";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "60px",
      position: "relative"
    }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            fontSize: isPortrait ? "20px" : "1rem",
            lineHeight: 1,
            color: slots.includes(i)
              ? (isSelected ? "#34C759" : "#666")
              : "#ccc",
            opacity: 1,
            transition: "color 0.2s ease"
          }}
        >
          {icon(i)}
        </span>
      ))}
      <div style={{
        position: "absolute",
        top: "-6px",
        right: "-10px",
        fontSize: "0.55rem",
        color: "#999",
        backgroundColor: "rgba(255,255,255,0.8)",
        padding: "1px 4px",
        borderRadius: "6px",
        fontWeight: 600
      }}>
        {slots.length}P
      </div>
    </div>
  );
};


// === 1P Buttons ===
frontPlayers.forEach(({ slot }, idx) => {
  const isSelected =
    blockInfo?.slots?.length === 1 && blockInfo.slots.includes(slot);

  const top = isPortrait ? 11 : isMobile ? 18 : 18;
  const left = isMobile ? 22 + idx * 21 : 22 + idx * 21;

  buttons.push(
    <div
      key={`1p-block-${slot}`}
      onClick={(e) => handleBlockClick([slot], e)}
      style={getBlockButtonStyle(isSelected, top, left)}
      title="1P Block"
    >
      {renderBlockIcons([slot], isSelected)}
    </div>
  );
});

// === 2P Block Buttons ===
const twoPCombos = [
  {
    slots: [0, 1],
    top: isPortrait? 7 : isMobile ? 11 : 11,
    left: isMobile ? 22 : 22,
  },
  {
    slots: [0, 2],
    top: isPortrait? 7 : isMobile ? 11 : 11,
    left: isMobile ? 43 : 43,
  },
  {
    slots: [1, 2],
    top: isPortrait? 7 : isMobile ? 11 : 11,
    left: isMobile ? 64 : 64,
  },
];

twoPCombos.forEach(({ slots, top, left }) => {
  const isSelected =
    blockInfo?.slots?.length === 2 &&
    blockInfo.slots.includes(slots[0]) &&
    blockInfo.slots.includes(slots[1]);

  buttons.push(
    <div
      key={`2p-block-${slots[0]}-${slots[1]}`}
      onClick={(e) => handleBlockClick(slots, e)}
      style={getBlockButtonStyle(isSelected, top, left)}
      title="2P Block"
    >
      {renderBlockIcons(slots, isSelected)}
    </div>
  );
});

// === 3P Block ===
if (frontPlayers.length === 3) {
  const slots = frontPlayers.map((p) => p.slot);
  const isSelected =
    blockInfo?.slots?.length === 3 &&
    slots.every((s) => blockInfo.slots.includes(s));

  const top = isPortrait ? 2 : isMobile ? 4 : 4;
  const left = isMobile ? 43: 43;

  buttons.push(
    <div
      key="3p-block"
      onClick={(e) => handleBlockClick(slots, e)}
      style={getBlockButtonStyle(isSelected, top, left)}
      title="3P Block"
    >
      {renderBlockIcons(slots, isSelected)}
    </div>
  );
}

  return buttons;
};

const undoZeroSequence = ({ actionLog, courtPlayers, undoPlayerStats }) => {
  console.log("🛠 Undoing Zero Set + Zero Attack + Attack touch sequence");
  
  // Remove the Zero Set entry (already removed from actionLog)
  const updatedLog = [...actionLog];
  let digTouch = null;
  let setterTouch = null;
  
  // Step 1: Remove Zero Attack entry and undo zeroAttacks stats
  if (updatedLog.length > 0 && updatedLog[updatedLog.length - 1].action.includes("Zero Attack")) {
    const zeroAttackEntry = updatedLog.pop();
    console.log("🗑️ Removed Zero Attack entry:", zeroAttackEntry.action);
    
    // Find the attacker to undo Zero Attack stats
    const zeroAttackMatches = [...zeroAttackEntry.action.matchAll(/(.+?) \(#(\d+)\)/g)];
    if (zeroAttackMatches.length > 0) {
      const [_, name, number] = zeroAttackMatches[0];
      const attacker = courtPlayers.find(
        p => p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
             String(p.number) === number
      );
      
      if (attacker) {
        // Undo Zero Attack stats
        undoPlayerStats({
          playerId: attacker._id,
          playerName: attacker.name,
          statKeys: ["zeroAttacks"]
        });
        console.log("↩️ Undid Zero Attack stats for", attacker.name);
      }
    }
  }
  
  // Step 2: Remove Attack touch entry and undo attacks stats
  if (updatedLog.length > 0 && updatedLog[updatedLog.length - 1].action.includes("touched ball (Attack)")) {
    const attackTouchEntry = updatedLog.pop();
    console.log("🗑️ Removed Attack touch entry:", attackTouchEntry.action);
    
    // Find the attacker to undo attack stats
    const attackTouchMatches = [...attackTouchEntry.action.matchAll(/(.+?) \(#(\d+)\)/g)];
    if (attackTouchMatches.length > 0) {
      const [_, name, number] = attackTouchMatches[0];
      const attacker = courtPlayers.find(
        p => p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
             String(p.number) === number
      );
      
      if (attacker) {
        // Undo Attack stats
        undoPlayerStats({
          playerId: attacker._id,
          playerName: attacker.name,
          statKeys: ["attacks"]
        });
        console.log("↩️ Undid Attack stats for", attacker.name);
      }
    }
  }
  
  // Step 3: Find the setter touch (should be the last remaining touch)
  if (updatedLog.length > 0 && updatedLog[updatedLog.length - 1].action.includes("touched ball (Set)")) {
    const setTouchEntry = updatedLog[updatedLog.length - 1];
    if (setTouchEntry.touchInfo) {
      setterTouch = setTouchEntry.touchInfo;
      console.log("🎯 Found setter touch (touch #2):", setterTouch);
    }
  }
  
  // Step 4: Find the dig touch (should be second to last remaining touch)
  if (updatedLog.length > 1 && updatedLog[updatedLog.length - 2].action.includes("touched ball (Dig)")) {
    const digTouchEntry = updatedLog[updatedLog.length - 2];
    if (digTouchEntry.touchInfo) {
      digTouch = digTouchEntry.touchInfo;
      console.log("🎯 Found dig touch (touch #1):", digTouch);
    }
  }
  
  return {
    updatedLog,
    digTouch,
    setterTouch
  };
};

const undoBlockSequence = ({ actionLog, courtPlayers, undoPlayerStats }) => {
  console.log("🛠 Undoing Block sequence - removing attempt and result");
  
  let newActionLog = [...actionLog];
  let blockAttemptEntry = null;
  let blockResultEntry = null;
  
  // The last entry should be the block result
  if (newActionLog.length > 0) {
    const lastEntry = newActionLog[newActionLog.length - 1];
    if (lastEntry.action.toLowerCase().includes("block kill") || 
        lastEntry.action.toLowerCase().includes("block error") || 
        lastEntry.action.toLowerCase().includes("block is in play")) {
      blockResultEntry = newActionLog.pop();
      console.log("🗑️ Removed block result entry:", blockResultEntry.action);
    }
  }
  
  // Look for and remove the block attempt entry
  if (newActionLog.length > 0) {
    const secondLastEntry = newActionLog[newActionLog.length - 1];
    if (secondLastEntry.action.toLowerCase().includes("block attempt")) {
      blockAttemptEntry = newActionLog.pop();
      console.log("🗑️ Removed block attempt entry:", blockAttemptEntry.action);
    }
  }
  
  // Undo stats for all players involved in the block
  if (blockResultEntry) {
    const playerMatches = [...blockResultEntry.action.matchAll(/(.+?) \(#(\d+)\)/g)];
    
    for (const [_, name, number] of playerMatches) {
      const player = courtPlayers.find(
        p => p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
             String(p.number) === number
      );
      
      if (player) {
        let statKeys = [];
        
        if (blockResultEntry.action.toLowerCase().includes("block kill")) {
          // Determine if it was solo or assist based on number of players
          statKeys = playerMatches.length === 1 ? ["blockSolo", "points"] : ["blockAssist", "points"];
        } else if (blockResultEntry.action.toLowerCase().includes("block error")) {
          statKeys = ["blockErrors"];
        } else if (blockResultEntry.action.toLowerCase().includes("block is in play")) {
          // Handle zeroBlocks stat for "block in play"
          statKeys = ["zeroBlocks"];
        }
        
        if (statKeys.length > 0) {
          undoPlayerStats({
            playerId: player._id,
            playerName: player.name,
            statKeys
          });
          console.log("↩️ Undid block stats for", player.name, statKeys);
        }
      }
    }
  }
  
  return {
    updatedLog: newActionLog,
    blockAttemptEntry,
    blockResultEntry
  };
};

const getNetBanner = (eventName) => {
  const maxCenterLength = 30;
  const label = (eventName || (hasPremium ? "LOGGERHEAD PRO" : "LOGGERHEAD FREE")).toUpperCase().trim();

  // Trim if too long
  const trimmed = label.length > maxCenterLength
    ? label.slice(0, maxCenterLength)
    : label;

  const totalDashes = maxCenterLength - trimmed.length;
  const dashLeft = Math.floor(totalDashes / 2);
  const dashRight = totalDashes - dashLeft;
  


  const centeredLabel = '-'.repeat(dashLeft) + trimmed + '-'.repeat(dashRight);

  return `|--${centeredLabel}--|`; // total 47 characters
};

const handleUndoLastAction = async () => {
  const last = actionLog[actionLog.length - 1];
  const teamId = match?.teamId || match?.teamName;
 
  if (!last || !last.action || last.invalid) return;
  
  // Create a copy of the action log that we'll modify
  let newActionLog = [...actionLog]; 
  const removedAction = newActionLog.pop();
  const action = removedAction?.action?.toLowerCase() || "";

  
    if (action.includes("zero set")) {
    // Check if previous action was Zero Attack
    const prevAction = newActionLog.length > 0 ? newActionLog[newActionLog.length - 1] : null;
    if (prevAction && prevAction.action.toLowerCase().includes("zero attack")) {
      console.log("🔄 Undoing Zero Set with preceding Zero Attack - rolling back both");
      
      const result = undoZeroSequence({
        actionLog: newActionLog,
        courtPlayers,
        undoPlayerStats: (data) =>
          undoStatChange({
            ...data,
            setPlayerStats,
            currentMatchId,
            teamId,
          })
      });
      
      newActionLog = result.updatedLog;
      
      // First undo the Zero Set stats for the setter
      const setMatches = [...removedAction.action.matchAll(/(.+?) \(#(\d+)\)/g)];
      if (setMatches.length > 0) {
        const [_, name, number] = setMatches[0];
        const setter = courtPlayers.find(
          p => p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
               String(p.number) === number
        );
        
        if (setter) {
          undoStatChange({
            playerId: setter._id,
            playerName: setter.name,
            statKeys: ["zeroSets"],
            teamId,
            currentMatchId,
            setPlayerStats,
          });
          console.log("↩️ Undid Zero Set stats for", setter.name);
        }
      }
      
      if (result.setterTouch) {
        console.log("🎯 Restoring touches array with dig + set");
        
        // Restore proper touches array: [dig, set]
        const restoredTouches = [];
        
        if (result.digTouch) {
          restoredTouches.push(result.digTouch);
          console.log("✅ Added dig touch:", result.digTouch);
        }
        
        restoredTouches.push(result.setterTouch);
        console.log("✅ Added setter touch:", result.setterTouch);
        
        setTouches(restoredTouches);
        setBallState("inplay");
        setBallSide("our");
        setBallPosition(`slot-${result.setterTouch.slotIndex}`);
        setBlockCirclesVisible(false);
        setShowServeZoneOverlay(false);
		const touchCount = restoredTouches.length;
        
        console.log(`🏐 Ball restored to setter at slot ${result.setterTouch.slotIndex} with ${restoredTouches.length} touches`);
      
      
      setActionLog(newActionLog);
      
      setTimeout(() => {
        
        setUndoMessage(`Undid Zero Set + Zero Attack + Attack → Ball returned to setter with ${touchCount} touches`);
      }, 100);
      setTimeout(() => setUndoMessage(null), 5100);
      
      return; // Exit early, sequence handled
    }}
  }
  
if (action.includes("touched ball (attack)")) {
  console.log("🔄 Undoing Attack touch - restoring to setter with 2 touches");
  
  // Find the attacker from the removed action
  const attackMatches = [...removedAction.action.matchAll(/(.+?) \(#(\d+)\)/g)];
  if (attackMatches.length > 0) {
    const [_, name, number] = attackMatches[0];
    const attacker = courtPlayers.find(
      p =>
        p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
        String(p.number) === number
    );
    
    if (attacker) {
      // Undo the attack stats
      undoStatChange({
        playerId: attacker._id,
        playerName: attacker.name,
        statKeys: ["attacks"],
        teamId,
        currentMatchId,
        setPlayerStats,
      });
      console.log("↩️ Undid Attack stats for", attacker.name);
    }
  }
  
  // Find the previous touches (dig/reception and set) to restore
  let digTouch = null;
  let setTouch = null;
  
  // Look through recent action log entries to find dig and set touches
  for (let i = newActionLog.length - 1; i >= 0; i--) {
    const entry = newActionLog[i];
    
    // Find set touch
    if (!setTouch && entry.action.includes("touched ball (Set)")) {
      if (entry.touchInfo) {
        setTouch = entry.touchInfo;
      } else {
        // Extract from action text
        const touchMatches = [...entry.action.matchAll(/(.+?) \(#(\d+)\)/g)];
        if (touchMatches.length > 0) {
          const [_, playerName, playerNumber] = touchMatches[0];
          const player = courtPlayers.find(
            p => p.name?.trim().toLowerCase() === playerName.trim().toLowerCase() &&
                 String(p.number) === playerNumber
          );
          
          if (player) {
            const slotIndex = courtPlayers.findIndex(p => p._id === player._id);
            if (slotIndex !== -1) {
              setTouch = {
                slotIndex,
                role: "Set",
                side: "our"
              };
            }
          }
        }
      }
    }
    
    // Find dig/reception touch
    if (!digTouch && (entry.action.includes("touched ball (Dig)") || entry.action.includes("serve received"))) {
      if (entry.touchInfo) {
        digTouch = entry.touchInfo;
      } else {
        // Extract from action text
        const touchMatches = [...entry.action.matchAll(/(.+?) \(#(\d+)\)/g)];
        if (touchMatches.length > 0) {
          const [_, playerName, playerNumber] = touchMatches[0];
          const player = courtPlayers.find(
            p => p.name?.trim().toLowerCase() === playerName.trim().toLowerCase() &&
                 String(p.number) === playerNumber
          );
          
          if (player) {
            const slotIndex = courtPlayers.findIndex(p => p._id === player._id);
            if (slotIndex !== -1) {
              digTouch = {
                slotIndex,
                role: entry.action.includes("Dig") ? "Dig" : "ServeReceive",
                side: "our"
              };
            }
          }
        }
      }
    }
    
    // Stop if we found both touches
    if (digTouch && setTouch) break;
  }
  
  // Restore ball state with both touches
  if (setTouch) {
    const restoredTouches = digTouch ? [digTouch, setTouch] : [setTouch];
    
    setTouches(restoredTouches);
    setBallState("inplay");
    setBallSide("our");
    setBallPosition(`slot-${setTouch.slotIndex}`);
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay(false);
    
    console.log(`🏐 Ball restored to setter at slot ${setTouch.slotIndex} with ${restoredTouches.length} touches`);
    
    setActionLog(newActionLog);
    
    setTimeout(() => {
      setUndoMessage(`Undid Attack → Ball returned to setter with ${restoredTouches.length} touches`);
    }, 100);
    setTimeout(() => setUndoMessage(null), 5100);
    
    return; // Exit early
  } else {
    // Fallback if we can't find setter
    console.warn("Could not find setter touch for attack undo");
    setTouches([]);
    setBallState("inplay");
    setBallSide("our");
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay(false);
    
    setActionLog(newActionLog);
    
    setTimeout(() => {
      setUndoMessage("Undid Attack → Ball state reset");
    }, 100);
    setTimeout(() => setUndoMessage(null), 5100);
    
    return; // Exit early
  }
}  
  
if (action.includes("touched ball (set)")) {
  console.log("🔄 Undoing Set touch - restoring to previous player");
  
  // Find the setter from the removed action
  const setMatches = [...removedAction.action.matchAll(/(.+?) \(#(\d+)\)/g)];
  if (setMatches.length > 0) {
    const [_, name, number] = setMatches[0];
    const setter = courtPlayers.find(
      p => p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
           String(p.number) === number
    );
    
    if (setter) {
      // Undo the set stats
      undoStatChange({
        playerId: setter._id,
        playerName: setter.name,
        statKeys: ["sets"],
        teamId,
        currentMatchId,
        setPlayerStats,
      });
      console.log("↩️ Undid Set stats for", setter.name);
    }
  }
  
  // Find the previous touch (dig/reception) to restore ball position
  let previousTouch = null;
  let restoredTouches = [];
  
  // Look through recent action log entries to find the dig/reception
  for (let i = newActionLog.length - 1; i >= 0; i--) {
    const entry = newActionLog[i];
    if (entry.action.includes("touched ball (Dig)") || entry.action.includes("serve received")) {
      // Found the previous touch - extract the slot info
      if (entry.touchInfo) {
        previousTouch = entry.touchInfo;
        restoredTouches = [previousTouch];
        break;
      }
      
      // If no touchInfo, try to extract from action text
      const touchMatches = [...entry.action.matchAll(/(.+?) \(#(\d+)\)/g)];
      if (touchMatches.length > 0) {
        const [_, playerName, playerNumber] = touchMatches[0];
        const player = courtPlayers.find(
          p => p.name?.trim().toLowerCase() === playerName.trim().toLowerCase() &&
               String(p.number) === playerNumber
        );
        
        if (player) {
          const slotIndex = courtPlayers.findIndex(p => p._id === player._id);
          if (slotIndex !== -1) {
            previousTouch = {
              slotIndex,
              role: entry.action.includes("Dig") ? "Dig" : "ServeReceive",
              side: "our"
            };
            restoredTouches = [previousTouch];
            break;
          }
        }
      }
    }
  }
  
  // Restore ball state
  if (previousTouch) {
    setTouches(restoredTouches);
    setBallState("inplay");
    setBallSide("our");
    setBallPosition(`slot-${previousTouch.slotIndex}`);
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay(false);
    
    console.log(`🏐 Ball restored to previous player at slot ${previousTouch.slotIndex} with ${restoredTouches.length} touch(es)`);
    
    setActionLog(newActionLog);
    
    setTimeout(() => {
      setUndoMessage(`Undid Set → Ball returned to previous player with ${restoredTouches.length} touch(es)`);
    }, 100);
    setTimeout(() => setUndoMessage(null), 5100);
    
    return; // Exit early
  } else {
    // Fallback if we can't find previous touch
    console.warn("Could not find previous touch for set undo");
    setTouches([]);
    setBallState("inplay");
    setBallSide("our");
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay(false);
    
    setActionLog(newActionLog);
    
    setTimeout(() => {
      setUndoMessage("Undid Set → Ball state reset");
    }, 100);
    setTimeout(() => setUndoMessage(null), 5100);
    
    return; // Exit early
  }
}

  
  if (action.includes("block kill") || action.includes("block error") || action.includes("block is in play")) {
  console.log("🔄 Undoing block sequence - removing attempt and result");
  
  const result = undoBlockSequence({
    actionLog: newActionLog,
    courtPlayers,
    undoPlayerStats: (data) =>
      undoStatChange({
        ...data,
        setPlayerStats,
        currentMatchId,
        teamId,
      })
  });
  
  newActionLog = result.updatedLog;
  
  // Always put ball back in play on opponent's side after undoing a block
  setBallState("inplay");
  setBallSide("opponent");
  setBallPosition(inPlayPosition);
  setTouches([]); // Clear any existing touches
  setBlockCirclesVisible(true); // Hide block circles
  setBlockInfo(null); // Clear block info
  setShowServeZoneOverlay(false);
  
  console.log("🏐 Ball restored to opponent side (inplay) after block undo");
  
  setActionLog(newActionLog);
  
  setTimeout(() => {
    setUndoMessage(`Undid Block sequence → Ball returned to opponent (in play)`);
  }, 100);
  setTimeout(() => setUndoMessage(null), 5100);
  
  return; // Exit early, block sequence handled
}
  



  
  // ✅ FIXED: Handle kill sequences with undoKillSequence function
  // Only do special sequence handling for our team's kills, not opponent kills
  if (
    removedAction?.action?.toLowerCase().includes("kill") &&
    !removedAction.action.toLowerCase().includes("opponent kill")
  ) {
    console.log("🛠 Undoing our kill sequence — removing assist and attack");

    const result = undoKillSequence({
      actionLog: newActionLog,
      courtPlayers,
      undoPlayerStats: (data) =>
        undoStatChange({
          ...data,
          setPlayerStats,
          currentMatchId,
          teamId,
        }),
      setPlayerStats,
      currentMatchId
    });

    newActionLog = result.updatedLog;

    if (result.setterTouch) {
      console.log("🎯 Returning ball to setter at slot", result.setterTouch.slotIndex);
      setTouches([result.setterTouch]);
      setBallState("inplay");
      setBallSide("our");
      setBallPosition(`slot-${result.setterTouch.slotIndex}`);
      setBlockCirclesVisible(false);
      setShowServeZoneOverlay(false);
    }
  }
  
  // Update the action log with filtered entries
  setActionLog(newActionLog);
  

  
  const matches = [...last.action.matchAll(/(.+?) \(#(\d+)\)/g)];
  const players = matches.map(([_, name, number]) =>
    courtPlayers.find(
      p =>
        p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
        String(p.number) === number
    )
  ).filter(Boolean);

  let statKeys = [];
  let scoreChange = null;

  // === STAT KEYS & SCORING ===
  // First handle the known scoring actions in exclusive order
  if (action.includes("free ball kill")) {
    statKeys.push("freeballs", "freeballKills", "kills", "points");
    scoreChange = "our";
  } else if (action.includes("kill") && !action.includes("block kill")) {
    statKeys.push("kills", "attacks", "points");
    scoreChange = "our";
  } else if (action.includes("serve is an ace")) {
    statKeys.push("aces", "serveAttempts", "points");
    scoreChange = "our";
  } else if (action.includes("serve is an error")) {
    statKeys.push("serveErrors", "serveAttempts");
    scoreChange = "opponent";
  } else if (action.includes("service error")) {
    scoreChange = "our";
  } else if (action.includes("service ace")) {
    scoreChange = "opponent";
  } else if (action.includes("opponent kill")) {
    scoreChange = "opponent";
  } else if (action.includes("opponent error")) {
    scoreChange = "our";
  } else if (action.includes("block kill")) {
    statKeys.push(players.length > 1 ? "blockAssist" : "blockSolo", "points");
    scoreChange = "our";
  } else if (action.includes("block error")) {
    statKeys.push("blockErrors");
    scoreChange = "opponent";
  }

  // Then handle statKeys-only events (no score change)
  if (action.includes("dig")) statKeys.push("digs");
  if (action.includes("set")) statKeys.push("sets");
  if (action.includes("attack")) statKeys.push("attacks");
  if (action.includes("free ball error")) statKeys.push("freeballs", "freeballErrors");
  if (action.includes("sent a free ball")) statKeys.push("freeballs");
  if (action.includes("received")) statKeys.push("receptions");
  if (action.includes("zero set")) statKeys.push("zeroSets", "sets");
  if (action.includes("zero attack")) statKeys.push("zeroAttacks", "attacks");
  if (action.includes("receiving error")) statKeys.push("receiveErrors", "receptions");
  if (action.includes("setting error")) statKeys.push("setErrors", "sets");
  if (action.includes("attacking error")) statKeys.push("attackErrors", "attacks");
  if (action.includes("targeted")) statKeys.push("receiveErrors", "receptions");
 
const isOurPoint =
  (action.includes("kill") && !action.includes("opponent kill")) ||
  action.includes("opponent error") ||
  action.includes("service error") ||
  action.includes("block kill") || 
  action.includes("an ace"); 




  // ✅ NEW: Special handling for service errors
if (action.includes("serve is an error") || action.includes("service error")) {
  console.log("🔄 Undoing service error - restoring serve to original server");
  
  // Our service error: "John (#5) Serve is an Error" (from formatPlayerAction)
  // Opponent service error: "Opponent Service Error" or "TeamName Service Error"
  
const isOurServiceError = action.includes("serve is an error");
const isOpponentServiceError = action.includes("service error") && !isOurServiceError;
    
    if (isOurServiceError) {
      // Our player made the error, restore serve to our team
      setBallState("serve");
      setCurrentServeSide("our");
      if (setServeSide) setServeSide("our");
      setBallPosition(serverSlotPosition);
      setBallSide("our");
      setShowServeZoneOverlay(true);
      console.log("✅ Restored serve to our team (slot 5)");
    } else if (isOpponentServiceError) {
      // Opponent made the error, restore serve to opponent
      setBallState("serve");
      setCurrentServeSide("opponent");
      if (setServeSide) setServeSide("opponent");
      setBallPosition(opponentServePosition);
      setBallSide("opponent");
      setShowServeZoneOverlay(false);
	  console.log("Rotation Undo Pending");
      console.log("✅ Restored serve to opponent");
    }
    
    // Clear other states
    setTouches([]);
    setFreeBallModifier(null);
    setBlockCirclesVisible(false);
    setBlockInfo(null);
    setSelectedServeZone(null);
  }
  // ✅ Handle opponent errors differently  
  else if (action.includes("opponent error")) { 
    console.log("🔄 Undoing opponent error");
    setBallState("inplay");
    setBallSide("opponent");
    setShowServeZoneOverlay(false);
    setBallPosition(inPlayPosition);
  }
  
const lastServeSide = serveSideHistory[serveSideHistory.length - 1];
const shouldUndoRotation = isOurPoint && lastServeSide === "opponent";
  
  if (shouldUndoRotation) {
    console.log("🔄 Detected that undone action caused rotation - will undo rotation");
  }
  
  
 if (shouldUndoRotation) {
    const rotationUndone = undoRotation();
    if (rotationUndone) {
      console.log("✅ Rotation successfully undone as part of action undo");
    }
  }
  
  setTimeout(() => {
  const baseMessage = `Undid: "${removedAction?.action}"`;
  const rotationMessage = shouldUndoRotation ? " (and undid rotation)" : "";
  setUndoMessage(baseMessage + rotationMessage);
}, 100);
  setTimeout(() => setUndoMessage(null), 5100);

  // === REVERSE SCORE AND TEAM STATS IF NEEDED ===
  const normalizedAction = action.toLowerCase();
  const isError = normalizedAction.includes("error");
  const isKillOrAce = normalizedAction.includes("kill") || normalizedAction.includes("ace");
  const isAce = action.includes("service ace");
  
   if (scoreChange === "our") {
    console.log("🟡 Undoing OUR point");
    setTeamStats(prev => {
      const updated = {
        ...prev,
        ourEarned: isKillOrAce ? Math.max(0, prev.ourEarned - 1) : prev.ourEarned,
        oppError: isError && !isKillOrAce ? Math.max(0, prev.oppError - 1) : prev.oppError, 
      };
      console.log("🔁 Updated OUR teamStats:", updated);
      return updated;
    });
  }

  if (scoreChange === "opponent") {
    console.log("🟡 Undoing OPPONENT point");
    setTeamStats(prev => {
      const updated = {
        ...prev,
        oppEarned: (isKillOrAce || isAce) ? Math.max(0, prev.oppEarned - 1) : prev.oppEarned,
        ourError: (!isKillOrAce && !isAce && isError) ? Math.max(0, prev.ourError - 1) : prev.ourError,
      };
      console.log("🔁 Updated OPP teamStats:", updated);
      return updated;
    });
  }

if (scoreChange === "our") {
  console.log("🟡 Removing OUR point from scoreboard");
  onRemovePoint && onRemovePoint("our", 1);
}

if (scoreChange === "opponent") {
  console.log("🟡 Removing OPPONENT point from scoreboard");
  onRemovePoint && onRemovePoint("opponent", 1);
}

  if (shouldUndoRotation && courtHistory.length > 0) {
    const previousCourt = courtHistory[courtHistory.length - 1];
    setCourtPlayers(previousCourt);
    setCourtHistory(prev => prev.slice(0, -1));
    setServeSideHistory(prev => prev.slice(0, -1));
    setShowServeZoneOverlay(false);
  }
  

  setActionLog(newActionLog);
  
if (shouldUndoRotation) {
  console.log("🔄 Undoing rotation because we scored while opponent was serving");
  const rotationUndone = undoRotation();
  if (rotationUndone) {
    console.log("✅ Rotation successfully undone");
    // Also clean up serve side history
    setServeSideHistory(prev => prev.slice(0, -1));
  }
}


  if (!action.includes("serve is an error") && !action.includes("service error")) {
    restoreStateAfterUndo(
      {
        removedAction,
        actionLog: newActionLog,
        setBallState,
        setBallSide,
        setBallPosition,
        setTouches,
        serverSlotPosition,
        setBlockCirclesVisible,
        opponentServePosition,
        setShowServeZoneOverlay,
        inPlayPosition,
        onRemovePoint,
        setPlayerStats,
        currentMatchId,
        ourScore, 
        opponentScore,
        undoPlayerStats: data => undoStatChange({
          ...data,
          setPlayerStats,
          currentMatchId, 
          teamId: match?.teamName,
        }),
        setCurrentServeSide,
      },
      courtPlayers
    );
  }
};

const validateTeamStats = (stats, ourScore, opponentScore) => {
  const totalOurPoints = stats.ourEarned + stats.oppError;
  const totalOppPoints = stats.oppEarned + stats.ourError;
  
  if (totalOurPoints !== ourScore) {
    console.warn(`Team stats mismatch: Our stats total ${totalOurPoints} but score is ${ourScore}`);
  }
  
  if (totalOppPoints !== opponentScore) {
    console.warn(`Team stats mismatch: Opponent stats total ${totalOppPoints} but score is ${opponentScore}`);
  }
  
  return {
    isValid: totalOurPoints === ourScore && totalOppPoints === opponentScore,
    ourDifference: totalOurPoints - ourScore,
    oppDifference: totalOppPoints - opponentScore
  };
};

const updateTeamStats = (actionType, isOurPoint) => {
  setTeamStats(prev => {
    let updates = {};
    
    if (isOurPoint) {
      if (actionType === 'earned') {
        updates.ourEarned = prev.ourEarned + 1;
      } else if (actionType === 'error') {
        updates.oppError = prev.oppError + 1;
      }
    } else {
      if (actionType === 'earned') {
        updates.oppEarned = prev.oppEarned + 1;
      } else if (actionType === 'error') {
        updates.ourError = prev.ourError + 1;
      }
    }
    
    const newStats = { ...prev, ...updates };
    
    // Optional: Add validation
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => validateTeamStats(newStats, ourScore, opponentScore), 0);
    }
    
    return newStats;
  });
};
 
const classifyError = (type, context = errorContext) => {
  if (!context) return; // safety check

  const { playerId, playerName } = context;
const statKeys = ["errors"];
if (
  type === "Attack Error" &&
  freeBallModifier !== "sent"
) {
  statKeys.push("attacks", "attackErrors");
}
	logAndSyncStat({
		playerId,
		playerName,
		label: type,
		statKeys,
		setActionLog,
		setPlayerStats,
		playerStats,
		currentMatchId,
		teamId: match?.teamName,
	});

setActionLog((prev) => [
  ...prev,
  {
    action: formatPlayerAction({ name: playerName, number: getJerseyNumber(playerName) }, `${type}`),
    timestamp: new Date().toISOString(),
  },
]);

  onOpponentPoint && onOpponentPoint();
  resetBall("opponent", opponentServePosition);
  setErrorContext(null);
};




const handleActionDrop = (zoneAction, isOurServeOverride = null, voiceBlockInfo = null) => {
  if (awaitingRefBlownDecision) return;
  if (window.__dropLock) return;
  window.__dropLock = true;
  setTimeout(() => (window.__dropLock = false), 150);
  if (blockCirclesVisible && !blockInfo) setBlockCirclesVisible(false);
  
  // Fix: Use a different variable name to avoid the naming conflict
  const currentBlockInfo = voiceBlockInfo || blockInfo;
  
  let actionText = "";
  console.trace("📌 handleActionDrop triggered:", zoneAction);
  const serveSide = isOurServeOverride !== null
    ? (isOurServeOverride ? "our" : "opponent")
    : currentServeSide;

  const isOurServe = ballState === "serve" && serveSide === "our";
  const isTheirServe = ballState === "serve" && serveSide === "opponent";

  const server = serveSide === "our" ? courtPlayers[5] : null;
  

  // Serve State
if (ballState === "serve") {
  if (isOurServe) {
if (zoneAction === "Error") {
  if (advancedLoggingEnabled) {
    // Show error type modal (existing behavior)
    setPendingErrorCallback(() => (reason) => {
      const reasonFormatted = reason ? ` (${reason})` : "";
      const server = courtPlayers[5];

      logAndSyncStat({
        playerId: server._id,
        playerName: server.name,
        label: "Service Error",
        statKeys: ["serveErrors", "serveAttempts"],
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });

      let actionText = formatPlayerAction(server, `Serve is an Error${reasonFormatted}`);
      if (selectedServeZone !== null) {
        actionText += ` (Zone ${selectedServeZone})`;
      }

      setActionLog(prev => [
        ...prev,
        { action: actionText, timestamp: new Date().toISOString(), meta: {
          awardedPointTo: "opponent"
        }},
      ]);

      onOpponentPoint && onOpponentPoint();
      
      if (setServeSide) {
        setServeSide("opponent");
      }
      
      resetBall("opponent", opponentServePosition);
      setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
      setSelectedServeZone(null);
    });

    setShowErrorTypeModal(true);
  } else {
    // Fast mode - just log generic service error
    const server = courtPlayers[5];

    logAndSyncStat({
      playerId: server._id,
      playerName: server.name,
      label: "Service Error",
      statKeys: ["serveErrors", "serveAttempts"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });

    let actionText = formatPlayerAction(server, "Serve is an Error");
    if (selectedServeZone !== null) {
      actionText += ` (Zone ${selectedServeZone})`;
    }

    setActionLog(prev => [
      ...prev,
      { action: actionText, timestamp: new Date().toISOString(), meta: {
        awardedPointTo: "opponent"
      }},
    ]);

    onOpponentPoint && onOpponentPoint();
    
    if (setServeSide) {
      setServeSide("opponent");
    }
    
    resetBall("opponent", opponentServePosition);
    setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
    setSelectedServeZone(null);
  }
  return;
}

  if (zoneAction === "Ace") {
  logAndSyncStat({
    playerId: server._id,
    playerName: server.name,
    label: "Service Ace",
    statKeys: ["aces", "serveAttempts", "points"],
    setActionLog,
    setPlayerStats,
    playerStats,
    currentMatchId,
    teamId: match?.teamName,
  });

  onOurPoint && onOurPoint();
  resetBall("our", serverSlotPosition);
  setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));

  let actionText = formatPlayerAction(server, "Serve is an Ace");
  if (selectedServeZone !== null) {
    actionText += ` (Zone ${selectedServeZone})`;
  }

  setActionLog(prev => [
    ...prev,
    { action: actionText, timestamp: new Date().toISOString(), meta: {
      awardedPointTo: "our"
    }},
  ]);

  setSelectedServeZone(null);
  // Only show serve zone overlay in advanced mode
  if (advancedLoggingEnabled) {
    setShowServeZoneOverlay(true);
  }
  return;
}

if (zoneAction === "InPlay") {
  if (!server || server.name === "?" || !server._id) return;

  logAndSyncStat({
    playerId: server._id,
    playerName: server.name,
    label: "Serve Attempt",
    statKeys: ["serves", "zeroServes"],
    setActionLog,
    setPlayerStats,
    playerStats,
    currentMatchId,
    teamId: match?.teamName,
  });

  let actionText = formatPlayerAction(server, "Serve is in Play");
  if (selectedServeZone !== null) {
    actionText += ` (Zone ${selectedServeZone})`;
  }

  setActionLog(prev => [
    ...prev,
    { action: actionText, timestamp: new Date().toISOString() },
  ]);

  setBallState("inplay");
  setBallPosition(inPlayPosition);
  setBallSide("opponent");
  setBlockCirclesVisible(true);
  setSelectedServeZone(null);
  return;
  }}

  // THEIR SERVE
  else if (isTheirServe) {
  if (zoneAction === "Error") {
  if (advancedLoggingEnabled) {
    // Show error type modal (existing behavior)
    setPendingErrorCallback(() => (reason) => {
      const reasonFormatted = reason ? ` (${reason})` : "";
      const actionText = `${opponentName || "Opponent"} Service Error${reasonFormatted}`;

      setActionLog(prev => [
        ...prev,
        { action: actionText, timestamp: new Date().toISOString(), meta: {
          awardedPointTo: "our"
        }},
      ]);
      
      setServeSideHistory(prev => [...prev, currentServeSide]);
      onOurPoint && onOurPoint();
      
      if (setServeSide) {
        setServeSide("our");
      }
      setShowServeZoneOverlay(true);
      resetBall("our", serverSlotPosition, true);
      setTeamStats(prev => ({ ...prev, oppError: prev.oppError + 1 }));
    });

    setShowErrorTypeModal(true);
	setServeZoneMode(true);
  } else {
    // Fast mode - just log generic opponent error
    const actionText = `${opponentName || "Opponent"} Service Error`;

    setActionLog(prev => [
      ...prev,
      { action: actionText, timestamp: new Date().toISOString(), meta: {
        awardedPointTo: "our"
      }},
    ]);
    
    setServeSideHistory(prev => [...prev, currentServeSide]);
    onOurPoint && onOurPoint();
    
    if (setServeSide) {
      setServeSide("our");
    }
    
    resetBall("our", serverSlotPosition, true);
    setTeamStats(prev => ({ ...prev, oppError: prev.oppError + 1 }));
  }
  return;
  }
// Modified opponent ace handling
  if (zoneAction === "Ace") {
  if (advancedLoggingEnabled) {
    // Show ace target modal (existing behavior)
    setPendingAceCallback(() => (targetSlotIndex) => {
      let actionText = `${opponentName || "Opponent"} Service Ace`;
      
      if (targetSlotIndex !== null) {
        const targetPlayer = courtPlayers[targetSlotIndex];
        if (targetPlayer && targetPlayer.name !== "?") {
          actionText += ` (targeted ${targetPlayer.name} #${targetPlayer.number})`;
          
          logAndSyncStat({
            playerId: targetPlayer._id,
            playerName: targetPlayer.name,
            label: "Targeted",
            statKeys: ["receiveErrors", "receptions"],
            setActionLog,
            setPlayerStats,
            playerStats,
            currentMatchId,
            teamId: match?.teamName,
          });
        }
      }

      setActionLog(prev => [
        ...prev,
        { 
          action: actionText, 
          timestamp: new Date().toISOString(),
          meta: {
            awardedPointTo: "opponent"
          }
        },
      ]);

      onOpponentPoint && onOpponentPoint();
      resetBall("opponent", opponentServePosition);
      setTeamStats(prev => ({ ...prev, oppEarned: prev.oppEarned + 1 }));
    });

    setShowAceTargetModal(true);
  } else {
    // Fast mode - just log generic opponent ace
    const actionText = `${opponentName || "Opponent"} Service Ace`;

    setActionLog(prev => [
      ...prev,
      { 
        action: actionText, 
        timestamp: new Date().toISOString(),
        meta: {
          awardedPointTo: "opponent"
        }
      },
    ]);

    onOpponentPoint && onOpponentPoint();
    resetBall("opponent", opponentServePosition);
    setTeamStats(prev => ({ ...prev, oppEarned: prev.oppEarned + 1 }));
  }
  return;
}}}


  // In Play State
else if (ballState === "inplay") {
const lastTouch = touches.length > 0 ? touches[touches.length - 1] : null;
const slotIndex = lastTouch?.slotIndex;
const lastPlayer = typeof slotIndex === "number" ? courtPlayers[slotIndex] : null;
const isFreeBall = freeBallModifier === "sent";
const secondLastTouch = touches.length > 1 ? touches[touches.length - 2] : null;
const setter = secondLastTouch ? courtPlayers[secondLastTouch.slotIndex] : null;

if (currentBlockInfo) {  // Changed from blockInfo to currentBlockInfo
  const slots = currentBlockInfo.slots;

  // ===== BLOCK ERROR =====
  if (zoneAction === "Error") {
    const involvedPlayers = [];

    slots.forEach(i => {
      const p = courtPlayers[i];
      if (!p) return;
      involvedPlayers.push(p);

      logAndSyncStat({
        playerId: p._id,
        playerName: p.name,
        label: "Block Error",
        statKeys: ["blockErrors"],
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });
    });

    const playerList = involvedPlayers.map(p => `${p.name} (#${p.number})`).join(" & ");
    const actionText = `Block error by ${playerList}`;

    onOpponentPoint && onOpponentPoint();
    resetBall("opponent", opponentServePosition);
	setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));

    return setActionLog(prev => [
      ...prev,
      { action: actionText, timestamp: new Date().toISOString() ,
    meta: {
      awardedPointTo: "opponent"
    }}
    ]);
  }

  // ===== BLOCK KILL =====
  if (zoneAction === "Kill") {
    const involvedPlayers = [];

    slots.forEach(i => {
      const p = courtPlayers[i];
      if (!p) return;
      involvedPlayers.push(p);

      logAndSyncStat({
        playerId: p._id,
        playerName: p.name,
        label: "Block Kill",
        statKeys: slots.length === 1 ? ["blockSolo", "points"] : ["blockAssist", "points"],
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });
    });

    const blockType = ["Single", "Double", "Triple"][slots.length - 1];
    const playerList = involvedPlayers.map(p => `${p.name} (#${p.number})`).join(" & ");
    const actionText = `${blockType} block kill by ${playerList}`;

    onOurPoint && onOurPoint();
    resetBall("our", serverSlotPosition, currentServeSide !== "our");
	setSelectedServeZone(null);
	setShowServeZoneOverlay(true);
	setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));
    setServeSideHistory(prev => [...prev, currentServeSide]);

    return setActionLog(prev => [
      ...prev,
      { action: actionText, timestamp: new Date().toISOString() ,
    meta: {
      awardedPointTo: "our"
    }}
    ]);
  }

  // ===== BLOCK IN PLAY =====
if (zoneAction === "InPlay") {
  const involvedPlayers = [];
  
  slots.forEach(i => {
    const p = courtPlayers[i];
    if (!p) return;
    involvedPlayers.push(p);
    
    logAndSyncStat({
      playerId: p._id,
      playerName: p.name,
      label: "Zero Block",
      statKeys: ["zeroBlocks"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });
  });

  // Create the action log entry
  const blockType = ["Single", "Double", "Triple"][slots.length - 1];
  const playerList = involvedPlayers.map(p => `${p.name} (#${p.number})`).join(" & ");
  const actionText = `${blockType} block is In Play by ${playerList}`;

  // Add to action log
  setActionLog(prev => [
    ...prev,
    { action: actionText, timestamp: new Date().toISOString() }
  ]);

  setBallSide("opponent");
  setBlockInfo(null);
  setBlockCirclesVisible(true); // Hide the block circles since block is complete
}

  return;
}

	
if (zoneAction === "InPlay") {
  const lastTouch = touches[touches.length - 1];
  const secondLastTouch = touches[touches.length - 2];

  // Handle Zero Attack and Zero Set logging with separate action entries
  if (lastTouch?.role === "Attack") {
    const attacker = courtPlayers[lastTouch.slotIndex];
    if (attacker) {
      logAndSyncStat({
        playerId: attacker._id,
        playerName: attacker.name,
        label: "Zero Attack",
        statKeys: ["zeroAttacks"], // Only zero stat, not base attack stat
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });

      // Create separate action log entry for zero attack
      setActionLog(prev => [
        ...prev,
        { 
          action: formatPlayerAction(attacker, "Zero Attack (In Play)"), 
          timestamp: new Date().toISOString() 
        }
      ]);
    }

    // Log Zero Set for setter with separate action entry
    if (secondLastTouch?.role === "Set") {
      const setter = courtPlayers[secondLastTouch.slotIndex];
      if (setter) {
        logAndSyncStat({
          playerId: setter._id,
          playerName: setter.name,
          label: "Zero Set",
          statKeys: ["zeroSets"], // Only zero stat, not base set stat
          setActionLog,
          setPlayerStats,
          playerStats,
          currentMatchId,
          teamId: match?.teamName,
        });

        // Create separate action log entry for zero set
        setActionLog(prev => [
          ...prev,
          { 
            action: formatPlayerAction(setter, "Zero Set"), 
            timestamp: new Date().toISOString() 
          }
        ]);
      }
    }
  } else {
    // If not an attack, just log generic in play
    const lastPlayer = courtPlayers[lastTouch?.slotIndex];
    setActionLog(prev => [
      ...prev,
      { 
        action: formatPlayerAction(lastPlayer, "Ball In Play"), 
        timestamp: new Date().toISOString() 
      }
    ]);
  }

  // Move ball to opponent side
  setBallState("inplay");
  setBallSide("opponent");
  setTouches([]);
  flashActionZone();
  setBlockCirclesVisible(true);
  setBallPosition(inPlayPosition);
  setFreeBallModifier(null);

  return;
}

    if (touches.length === 0) {
      if (zoneAction === "Error") {
        actionText = `Opponent Error`;
		setShowServeZoneOverlay(true);
		setServeSideHistory(prev => [...prev, currentServeSide]); 
        onOurPoint && onOurPoint();
        resetBall("our", serverSlotPosition, currentServeSide !== "our");
		setTeamStats(prev => ({ ...prev, oppError: prev.oppError + 1 }));
        return setActionLog(prev => [...prev, { action: actionText, timestamp: new Date().toISOString() ,
    meta: {
      awardedPointTo: "our"
    }}]);
		setServeSideHistory(prev => [...prev, currentServeSide]); 
		setSelectedServeZone(null);
      } else if (zoneAction === "Kill") {
        actionText = `Opponent Kill`;
        onOpponentPoint && onOpponentPoint();
        resetBall("opponent", opponentServePosition);
		setTeamStats(prev => ({ ...prev, oppEarned: prev.oppEarned + 1 }));
        return setActionLog(prev => [...prev, { action: actionText, timestamp: new Date().toISOString() ,
    meta: {
      awardedPointTo: "opponent"
    }}]);
		setServeSideHistory(prev => [...prev, currentServeSide]); 
      }
    }

if (zoneAction === "Error") {
  if (!lastTouch || !lastPlayer) return;

  if (touches.length < 3) {
    setErrorContext({
      playerId: lastPlayer._id,
      playerName: lastPlayer.name,
      slotIndex,
      touchCount: touches.length,
      ballStateAtError: prevBallStateRef.current,
    });
if (isFreeBall) {
  logFreeBallOutcome({ outcome: "error", sender: lastPlayer, setter });
  setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
}
    return;
  }

  // Third touch: call with context explicitly
  classifyError("Attack Error", {
    playerId: lastPlayer._id,
    playerName: lastPlayer.name,
  });
  setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
  return;
}

if (zoneAction === "Kill") {
  if (!lastTouch || !lastPlayer) return;

  const isFreeBall = freeBallModifier === "sent";

  if (isFreeBall) {
    logFreeBallOutcome({ outcome: "kill", sender: lastPlayer, setter });
  } else {
    // Log the kill
    logAndSyncStat({
      playerId: lastPlayer._id,
      playerName: lastPlayer.name,
      label: "Kill",
      statKeys: ["kills", "attacks", "points"],
      setActionLog,
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });

    // Log assist if one touch before
    if (touches.length >= 2) {
      const assistTouch = touches[touches.length - 2];
      const assistPlayer = courtPlayers[assistTouch.slotIndex];

      logAndSyncStat({
        playerId: assistPlayer._id,
        playerName: assistPlayer.name,
        label: "Assist",
        statKeys: ["assists"],
        setActionLog,
        setPlayerStats,
        playerStats,
        currentMatchId,
        teamId: match?.teamName,
      });

      setActionLog((prev) => [
        ...prev,
        {
          action: `Assist credited to ${formatPlayerAction(assistPlayer)}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }

  const killType = isFreeBall ? "free ball kill" : "Kill";
  const actionText = formatPlayerAction(lastPlayer, killType);

  onOurPoint && onOurPoint();
  resetBall("our", serverSlotPosition, currentServeSide !== "our");
  setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));

  setActionLog((prev) => [
    ...prev,
    { action: actionText, timestamp: new Date().toISOString(),
    meta: {
      awardedPointTo: "our"
    } }
  ]);
  setServeSideHistory(prev => [...prev, currentServeSide]); 
  setSelectedServeZone(null);
  setShowServeZoneOverlay(true);
}

    else if (zoneAction === "InPlay") {
      actionText = formatPlayerAction(lastPlayer, "Continued InPlay");

if (
  ballState === "inPlay" &&
  lastTouch?.role === "Dig" &&
  !freeBallModifier
) {
  logAndSyncStat({
    playerId: lastPlayer._id,
    playerName: lastPlayer.name,
    label: "Dig",
    statKeys: ["digs"],
    setActionLog,
    setPlayerStats,
    playerStats,
    currentMatchId,
    teamId: match?.teamName,
  });

    }
if (isFreeBall) {
    logFreeBallOutcome({ outcome: "inplay", sender: lastPlayer, setter });
  }
  
      setBallPosition(inPlayPosition);
      setBlockCirclesVisible(true);
      setTouches([]);
	 
    }
  }

  // Only add manual action log if not already handled
  if (actionText) {
    setActionLog(prev => [
      ...prev,
      { action: actionText, timestamp: new Date().toISOString() }
    ]);
  }
 
  setFreeBallModifier(null);
}

const modalStates = useMemo(() => ({
  showErrorTypeModal,
  showAceTargetModal, 
  showServeZoneOverlay,
  errorContext,
  awaitingRefBlownDecision,
  showVoiceHelp,
  pendingErrorCallback,
  pendingAceCallback,
  pendingErrorType,
  setShowErrorTypeModal,
  setShowAceTargetModal,
  setShowServeZoneOverlay,
  setErrorContext,
  setAwaitingRefBlownDecision,
  setShowVoiceHelp,
  setPendingErrorCallback,
  setPendingAceCallback,
  setSelectedServeZone,
  setPendingErrorType,
  setActionLog,
  setTeamStats,
  resetRally,
  logError,
  handleActionDrop
}), [
  showErrorTypeModal,
  showAceTargetModal,
  showServeZoneOverlay, 
  errorContext,
  awaitingRefBlownDecision,
  showVoiceHelp,
  pendingErrorCallback,
  pendingAceCallback,
  pendingErrorType
]);

const VoiceSubscriptionModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.7)",
      zIndex: 9999,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    }}>
      <div style={{
        background: "#fff",
        padding: "32px",
        borderRadius: "16px",
        maxWidth: "400px",
        width: "90%",
        textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
      }}>
        <div style={{
          fontSize: "48px",
          marginBottom: "16px"
        }}>
          🎙️
        </div>
        
        <h2 style={{
          margin: "0 0 16px 0",
          color: "#333",
          fontSize: "24px",
          fontWeight: "600"
        }}>
          Voice Commands
        </h2>
        
        <p style={{
          margin: "0 0 24px 0",
          color: "#666",
          fontSize: "16px",
          lineHeight: "1.5"
        }}>
          Voice commands are a premium feature that allows you to control the scoreboard hands-free. 
          Upgrade your subscription to unlock this powerful tool.
        </p>

        <div style={{
          backgroundColor: "#f8f9fa",
          padding: "16px",
          borderRadius: "12px",
          marginBottom: "24px",
          textAlign: "left"
        }}>
          <h4 style={{
            margin: "0 0 8px 0",
            color: "#333",
            fontSize: "14px",
            fontWeight: "600"
          }}>
            Voice Features Include:
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: "20px",
            fontSize: "14px",
            color: "#666"
          }}>
            <li>Player touch logging by jersey number</li>
            <li>Rally outcome commands (kill, error, ace)</li>
            <li>Court management (rotate, switch serve, undo)</li>
            <li>Advanced serve zone selection</li>
            <li>Block sequence logging</li>
          </ul>
        </div>

        <div style={{
          display: "flex",
          gap: "12px",
          justifyContent: "center"
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "12px 24px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              backgroundColor: "#fff",
              color: "#666",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={() => {
              // Navigate to profile page - adjust this path as needed for your routing
              window.location.href = '/profile';
            }}
            style={{
              padding: "12px 24px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#007AFF",
              color: "#fff",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,122,255,0.3)"
            }}
          >
            Upgrade Subscription
          </button>
        </div>
      </div>
    </div>
  );
};



const playersOnCourtIds = new Set(
    courtPlayers.map((p) => p._id).filter(Boolean)
  );

const logContentStyle = {
  height: isMobile ? "140px" : "200px",
  overflowY: "auto",
};




function renderBench() {
  return (
    <div style={benchPanelStyle}>
      <h3 style={benchTitleStyle}>Bench</h3>
      <div style={benchGridStyle}>
        {benchPlayers &&
          benchPlayers
            .filter((player) => !player.isOnCourt)
            .map((player, i) => (
              <DraggableBenchCard
                key={`bench-${player._id || i}`}
                player={player}
                benchCardStyle={benchCardStyle}
                canSub={ballState === "serve" && !playersOnCourtIds.has(player._id)}
                slot5TargetId={slot5TargetId}
                allowedLiberoSubTarget={allowedLiberoSubTarget}
                currentServeSide={currentServeSide}
                setShowServeZoneOverlay={setShowServeZoneOverlay}
                setShowFillCourtOverlay={setShowFillCourtOverlay}
              />
            ))}
      </div>
    </div>
  );
}

function renderScoreboardAboveBench() {
  if (isMobile && isPortrait) {
    return (
      <div style={leftColumnStyle}>
        {/* Scoreboard + compact 2x2 team stats side by side */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "8px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ flex: "0 0 auto" }}>
            <Scoreboard
              match={match}
              ourScore={ourScore}
              opponentScore={opponentScore}
              onAddPoint={onAddPoint}
              onRemovePoint={onRemovePoint}
              ourSets={ourSets}
              opponentSets={opponentSets}
              totalSets={match?.totalSets || 3}
            />
          </div>
          {!enableAITracking && hasPremium && (
            <div style={{ flex: "1 1 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", alignContent: "center" }}>
              <CompactStatBox label="Us Earned" value={teamStats.ourEarned} color="#53d769" />
              <CompactStatBox label="Us Unearned" value={teamStats.oppError} color="#53d769" />
              <CompactStatBox label="Them Earned" value={teamStats.oppEarned} color="#fc3158" />
              <CompactStatBox label="Them Unearned" value={teamStats.ourError} color="#fc3158" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={leftColumnStyle}>
      {/* Scoreboard */}
      <div style={{ flex: "0 0 auto" }}>
        <Scoreboard
          match={match}
          ourScore={ourScore}
          opponentScore={opponentScore}
          onAddPoint={onAddPoint}
          onRemovePoint={onRemovePoint}
          ourSets={ourSets}
          opponentSets={opponentSets}
          totalSets={match?.totalSets || 3}
        />
      </div>

      {/* Bench Panel */}
      {renderBench()}
    </div>
  );
}







function renderCourtArea() {
  return (
    <div ref={containerRef} style={courtAreaStyle}>
      {/* Video background - contained within court */}
      {!isMobile && showVideoBackground && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          overflow: "hidden",
          borderRadius: "inherit"
        }}>
          {/* Show local video if available, otherwise YouTube iframe */}
          {localVideoUrl ? (
            <>
              <video
                ref={videoElementRef}
                src={localVideoUrl}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }}
                controls
                autoPlay
                muted
                loop
                crossOrigin="anonymous"
              />
              
              {/* AI Tracking Overlay */}
              {enableAITracking && (
                <VideoPlayerTracking
                  videoRef={videoElementRef}
                  onPlayerClick={(slotIndex) => registerTouch(slotIndex)}
                  courtPlayers={courtPlayers}
                  isActive={enableAITracking}
                  match={match}
                  onAddPoint={onAddPoint}
                  ballState={ballState}
                  currentServeSide={currentServeSide}
                  touches={touches}
                  setActionLog={setActionLog}
                  setPlayerStats={setPlayerStats}
                  playerStats={playerStats}
                  currentMatchId={currentMatchId}
                  benchPlayers={benchPlayers}
                  handlePlayerDrop={handlePlayerDrop}
                />
              )}
            </>
          ) : youtubeUrl ? (
            <iframe
              src={getYouTubeEmbedUrl(youtubeUrl)}
              title="Match Video"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: "none",
                objectFit: "cover",
                pointerEvents: "none"
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : null}
        </div>
      )}
      
      <h2 style={courtTitleStyle}>
        {match?.location?.trim() ? match.location : "Court"}
      </h2>



      <div style={getNetLabelStyle()}>
        {getNetBanner(match?.eventName)}
      </div>

      {/* Player Cards - Hidden when AI tracking is on */}
      {!enableAITracking && (
        <>
          {/* FIRST ROW - Players 0, 1, 2 */}
          <div style={rowStyle}>
            {courtPlayers.slice(0, 3).map((player, idx) => (
              <CourtSlot
               key={idx}
               player={player}
               index={idx}
               flash={flashSlots[idx]}
               ref={idx === 2 ? slot2Ref : null}
               />
            ))}
          </div>
          
          {/* SECOND ROW - Players 3, 4, 5 */}
          <div style={rowStyle}>
            {courtPlayers.slice(3, 6).map((player, idx) => (
              <CourtSlot
                key={idx + 3}
                player={player}
                index={idx + 3}
                flash={flashSlots[idx + 3]}
              />
            ))}
          </div>
        </>
      )}

      
      {ballState === "inplay" && freeBallStyle && (
        <button
          onClick={handleFreeBallClick}
          style={{
            ...freeBallStyle,
            width: (isMobile && isPortrait) ? "35px" : (isMobile ? "40px" : "65px"),
            height: (isMobile && isPortrait) ? "130px" : (isMobile ? "160px" : "200px"),
            borderRadius: "12px",
            backgroundColor: freeBallModifier ? "#34C759" : "#fff",
            border: "2px solid gray",
            color: freeBallModifier ? "#fff" : "#34C759",
            cursor: "pointer",
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: (isMobile && isPortrait) ? "0.85rem" : "1rem",
            fontWeight: "600",
            boxShadow: freeBallModifier
              ? "0px 4px 6px rgba(52,199,89,0.3)"
              : "0px 2px 4px rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            position: "absolute",
            zIndex: 10,
          }}
          onMouseDown={(e) => (e.target.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.target.style.transform = "scale(1.0)")}
        >
          Free Ball
        </button>
      )}

      {actionZoneFlash && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(255,165,0,0.2)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Action zones + stat boxes — hidden in portrait (rendered as separate flow sections) */}
      {!(isMobile && isPortrait) && (
        <>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "5px", position: "relative", zIndex: 1 }}>
            {!enableAITracking && renderActionZones()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px', paddingBottom: '8px', flexWrap: 'wrap', width: '100%' }}>
            {!enableAITracking && hasPremium ? (
              <>
                <StatBox label="Us: Earned" value={teamStats.ourEarned} color="#53d769" />
                <StatBox label="Unearned" value={teamStats.oppError} color="#53d769" />
                <StatBox label="Them: Earned" value={teamStats.oppEarned} color="#fc3158" />
                <StatBox label="Unearned" value={teamStats.ourError} color="#fc3158" />
              </>
            ) : (
              <div style={{ width: "300px", maxHeight: "100px", minHeight: "80px", borderRadius: "16px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <AdCourtBottom />
              </div>
            )}
            <VoiceInterface />
          </div>
        </>
      )}




<VoiceHelpModal />
 
      {renderBlockAreas()}
    </div>
  );
}




    function renderLogsPanel() {



    return (
      <div style={logsPanelStyle}>
        {substitutionLog.length >= 0 && (
          <div style={logCardStyle}>
            <h3 style={logTitleStyle}>Substitution Log</h3>
            <div style={logContentStyle} ref={subLogRef}>
              <ul style={logListStyle}>
                {substitutionLog.map((sub, i) => (
                  <li key={i} style={logItemStyle}>
                    {sub.message
                      ? sub.message
                      : `${sub.in.name} subbed in for ${sub.out.name}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {actionLog.length >= 0 && (
          <div style={logCardStyle}>
		  <h3 style={logTitleStyle}>Action Log</h3>
           
            <div style={logContentStyle} ref={actionLogRef}>
              <ul style={logListStyle}>
                {actionLog.map((act, i) => (
                  <li
                    key={i}
                    style={{
                      ...logItemStyle,
                      textDecoration: act.invalid ? "line-through" : "none",
                      opacity: act.invalid ? 0.5 : 1,
                    }}
                  >
                    {act.action} at{" "}
                    {new Date(act.timestamp).toLocaleTimeString()}
                  </li>
                ))}
              </ul>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  
  {actionLog.length > 0  &&  shouldShowUndoButton(actionLog) && (
    <button
      onClick={handleUndoLastAction}
      title="Undo Last Action"
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        marginRight: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={`${process.env.PUBLIC_URL}/undo.png`}
        alt="Undo"
        style={{
          width: "40px",
          height: "40px",
          transition: "opacity 0.2s ease",
        }}
        onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseOut={(e) => (e.currentTarget.style.opacity = "0.7")}
      />
    </button>
  )}
            </div>
 <AdvancedLoggingToggle /> 
</div>
          </div>
        )}
      </div>
    );
  }



return (
  <>
    {/* ===== VIDEO CONTROLS (dev only) ===== */}
    {!isMobile && process.env.NODE_ENV === 'development' && (
      <div style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        padding: "16px",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        pointerEvents: "auto",
        minWidth: "300px",
        maxWidth: "350px"
      }}>
        <div>
          <label style={{ 
            fontSize: "12px", 
            color: "#666", 
            fontWeight: "600",
            display: "block",
            marginBottom: "6px"
          }}>
            YouTube URL
          </label>
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://youtu.be/gXDvkPfL9PQ"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #ddd",
              fontSize: "13px",
              boxSizing: "border-box",
              fontFamily: "monospace"
            }}
          />
        </div>
        
        <div style={{
          textAlign: "center",
          fontSize: "12px",
          color: "#999",
          fontWeight: "600"
        }}>
          — OR —
        </div>
        
        <div>
          <label style={{ 
            fontSize: "12px", 
            color: "#666", 
            fontWeight: "600",
            display: "block",
            marginBottom: "6px"
          }}>
            Local Video (.mp4) <span style={{color: "#34C759"}}>✨ AI Tracking</span>
          </label>
          <input
            type="file"
            accept="video/mp4"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const url = URL.createObjectURL(file);
                setLocalVideoUrl(url);
                setYoutubeUrl(""); // Clear YouTube URL
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #ddd",
              fontSize: "12px",
              boxSizing: "border-box"
            }}
          />
          {localVideoUrl && (
            <div style={{
              marginTop: "6px",
              fontSize: "11px",
              color: "#34C759",
              fontWeight: "600"
            }}>
              ✓ Video loaded
            </div>
          )}
        </div>
 
        <button
          onClick={toggleVideoBackground}
          disabled={!youtubeUrl && !localVideoUrl}
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: showVideoBackground ? "#007AFF" : ((youtubeUrl || localVideoUrl) ? "#34C759" : "#ccc"),
            color: "#fff",
            fontSize: "14px",
            fontWeight: "600",
            cursor: (youtubeUrl || localVideoUrl) ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s"
          }}
        >
          <span style={{ fontSize: "18px" }}>
            {showVideoBackground ? "📹" : "🎬"}
          </span>
          <span>{showVideoBackground ? "Hide Video" : "Show Video"}</span>
        </button>
        
        {/* AI Tracking Toggle - only show for local videos */}
        {showVideoBackground && localVideoUrl && (
          <button
            onClick={toggleAITracking}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "2px solid " + (enableAITracking ? "#34C759" : "#007AFF"),
              backgroundColor: enableAITracking ? "#34C759" : "#fff",
              color: enableAITracking ? "#fff" : "#007AFF",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s"
            }}
          >
            <span style={{ fontSize: "18px" }}>
              {enableAITracking ? "🤖" : "👁️"}
            </span>
            <span>{enableAITracking ? "AI Tracking ON" : "Enable AI Tracking"}</span>
          </button>
        )}
 
        <div style={{
          fontSize: "11px",
          color: "#999",
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid #eee",
          lineHeight: "1.4"
        }}>
          💡 {localVideoUrl 
            ? "AI tracking automatically detects and follows players as they move!" 
            : "Tip: Upload a .mp4 video file to enable AI player tracking."}
        </div>
      </div>
    )}
    
    {/* Main court interface */}
    <div style={{
      position: "relative",
      zIndex: 2,
      width: "100%",
      overflowX: "hidden",
      boxSizing: "border-box",
      paddingBottom: isMobile ? "90px" : 0,
    }}>
      <div style={mainContainerStyle}>
      {renderScoreboardAboveBench()}
      {renderCourtArea()}

      {/* Portrait-only: action zones (order 1) */}
      {(isMobile && isPortrait) && (
        <div style={{ order: 1, width: "100%", display: "flex", gap: "8px", justifyContent: "center", padding: "4px 0" }}>
          {!enableAITracking && renderActionZones()}
        </div>
      )}

      {/* Portrait-only: bench (order 2) */}
      {(isMobile && isPortrait) && (
        <div style={{ order: 2, width: "100%" }}>
          {renderBench()}
        </div>
      )}

      {/* Portrait-only: voice (order 3) */}
      {(isMobile && isPortrait) && (
        <div style={{ order: 3, width: "100%", display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <VoiceInterface />
        </div>
      )}

      {renderLogsPanel()}

      {ballState === "serve" && !enableAITracking && (
        (isMobile && isPortrait) ? (
          <div style={{ order: 4, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "4px 0" }}>
            <button
              onClick={() => setShowPortraitServeControls(p => !p)}
              style={{
                background: "none",
                border: "1px solid #ccc",
                borderRadius: "20px",
                padding: "6px 16px",
                fontSize: "12px",
                color: "#666",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {showPortraitServeControls ? "▲ Hide Controls" : "▼ Rotate / Clear / Serve"}
            </button>
            {showPortraitServeControls && (
              <div style={{ display: "flex", flexDirection: "row", gap: "8px", justifyContent: "center", width: "100%" }}>
                <button onClick={rotatePlayers} style={buttonStyle2}>Rotate</button>
                {wasLastActionASub() ? (
                  <button onClick={handleUndoLastSubstitution} style={buttonStyle2}>Undo Sub</button>
                ) : (
                  <button onClick={clearCourt} style={buttonStyle2}>Clear</button>
                )}
                <button onClick={handleSwitchServe} style={buttonStyle2}>Switch Serve</button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              top: "120px",
              right: isMobile && deviceInfo.isLandscape ? "25%" : "200px",
              transform: isMobile && deviceInfo.isLandscape ? "none" : "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
              alignItems: "center",
              zIndex: 10,
              maxWidth: "100px",
            }}
          >
            <button onClick={rotatePlayers} style={buttonStyle2}>
              {isMobile && deviceInfo.isLandscape ? "Rotate" : "Rotate Players"}
            </button>
            {wasLastActionASub() ? (
              <button onClick={handleUndoLastSubstitution} style={buttonStyle2}>Undo Sub</button>
            ) : (
              <button onClick={clearCourt} style={buttonStyle2}>
                {isMobile && deviceInfo.isLandscape ? "Clear Court" : "Clear Court"}
              </button>
            )}
            <button onClick={handleSwitchServe} style={buttonStyle2}>
              {isMobile && deviceInfo.isLandscape ? "Switch Serve" : "Switch Serve"}
            </button>
          </div>
        )
      )}
    </div>


    {advancedLoggingEnabled && showServeZoneOverlay && (
<div
  style={{
    position: "fixed",
    left: (isMobile && isPortrait) ? "50%" : "calc(50% - 240px)",
    top: (isMobile && isPortrait) ? "30%" : (isMobile && deviceInfo.isLandscape ? "40%" : (showHeader ? "102px" : "19px")),
    width: (isMobile && isPortrait) ? "90vw" : (isMobile && deviceInfo.isLandscape ? "480px" : "500px"),
    maxWidth: "90vw",
    height: (isMobile && isPortrait) ? "auto" : (isMobile && deviceInfo.isLandscape ? "80dvh" : (mobileHeader ? "90dvh" : "450px")),
    transform: (isMobile && isPortrait) ? "translate(-50%, -50%)" : (isMobile && deviceInfo.isLandscape ? "translateY(-50%)" : "none"),
    backgroundColor: "white",
    border: "solid",
    borderRadius: "10px",
    borderColor: "#111",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    pointerEvents: "auto",
    fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
    overflow: (isMobile && deviceInfo.isLandscape) ? "auto" : "visible",
    padding: (isMobile && isPortrait) ? "16px" : "20px",
  }}
      >
        <h3 style={{ marginBottom: "16px" }}>
          Where did {courtPlayers[5]?.name || "this player"} #{courtPlayers[5]?.number || "?"} serve to?
        </h3>
        
        <div
          onClick={() => {
            setSelectedServeZone(null);
            setShowServeZoneOverlay(false);
            setShowErrorTypeModal(false);

            if (typeof pendingErrorCallback === "function") {
              pendingErrorCallback("Out");
              setPendingErrorCallback(null);
            } else {
              setPendingErrorCallback(() => (reason) => {
                const reasonFormatted = reason ? ` (${reason})` : "";
                const server = courtPlayers[5];
                
                let actionText = formatPlayerAction(server, `Serve is an Error${reasonFormatted}`);
                if (selectedServeZone !== null) {
                  actionText += ` (Zone ${selectedServeZone})`;
                }

                setActionLog(prev => [
                  ...prev,
                  { action: actionText, timestamp: new Date().toISOString() },
                ]);

                onOpponentPoint && onOpponentPoint();
                resetBall("opponent", opponentServePosition);
                setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
                setSelectedServeZone(null);
              });

              setTimeout(() => handleActionDrop("Error", true), 0);
            }
          }}
          style={{
            width: (isMobile && isPortrait) ? "90%" : "350px",
            maxWidth: "350px",
            padding: (isMobile && isPortrait) ? "10px" : "12px",
            marginBottom: (isMobile && isPortrait) ? "12px" : "16px",
            backgroundColor: "#FF3B30",
            color: "#fff",
            fontWeight: "600",
            fontSize: (isMobile && isPortrait) ? "1.1rem" : "1.2rem",
            borderRadius: "10px",
            textAlign: "center",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          Service Error
        </div>
        
        {/* Serve Zone Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 70px)",
            gap: "10px",
            marginBottom: "20px",
            justifyContent: "center"
          }}
        >
          {/* Row 1 */}
          <button key="1" onClick={() => { setSelectedServeZone("1"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "2rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>
            1
          </button>
          <button key="1-6" onClick={() => { setSelectedServeZone("1-6"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "0.7rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#34C759", color: "#fff", border: "none", cursor: "pointer" }}>
            1-6
          </button>
          <button key="6" onClick={() => { setSelectedServeZone("6"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "2rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>
            6
          </button>
          <button key="6-5" onClick={() => { setSelectedServeZone("6-5"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "0.7rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#34C759", color: "#fff", border: "none", cursor: "pointer" }}>
            6-5
          </button>
          <button key="5" onClick={() => { setSelectedServeZone("5"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "2rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>
            5
          </button>

          {/* Row 2 */}
          <button key="2" onClick={() => { setSelectedServeZone("2"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "2rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>
            2
          </button>
          <button key="2-3" onClick={() => { setSelectedServeZone("2-3"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "0.7rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#34C759", color: "#fff", border: "none", cursor: "pointer" }}>
            2-3
          </button>
          <button key="3" onClick={() => { setSelectedServeZone("3"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "2rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>
            3
          </button>
          <button key="3-4" onClick={() => { setSelectedServeZone("3-4"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "0.7rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#34C759", color: "#fff", border: "none", cursor: "pointer" }}>
            3-4
          </button>
          <button key="4" onClick={() => { setSelectedServeZone("4"); setShowServeZoneOverlay(false); }} 
            style={{ width: "70px", height: "80px", fontSize: "2rem", fontWeight: "bold", borderRadius: "12px", backgroundColor: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>
            4
          </button>
        </div>
        
        <div
          style={{
            width: "390px",
            padding: "12px",
            marginTop: "16px",
            backgroundColor: "#FFF",
            color: "#111",
            fontWeight: isMobile ? "300" : "600",
            textAlign: "center",
            fontSize: isMobile ? "1.0 rem" : "2.0rem",
            ...noSelect,
          }}
        >
          |-----------Net------------|
        </div>

        <div style={{
          display: "flex",
          gap: "10px",
          marginTop: "12px"
        }}>
          <button
            onClick={() => {
              setSelectedServeZone(null);
              setShowServeZoneOverlay(false);
            }}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: "600",
              backgroundColor: "#8E8E93",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Unsure
          </button>
		  <button onClick={rotatePlayers} style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: "600",
              backgroundColor: "#FF9500",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
            }}>
            {isMobile && deviceInfo.isLandscape ? "Rotate" : "Rotate Players"}
          </button>
          {wasLastActionASub() ? (
            <button onClick={handleUndoLastSubstitution} style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: "600",
              backgroundColor: "#FF9500",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
            }}>
              {isMobile && deviceInfo.isLandscape ? "Undo Sub" : "Undo Sub"}
            </button>
          ) : (
            <button onClick={clearCourt} style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: "600",
              backgroundColor: "#FF9500",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
            }}>
              {isMobile && !isPortrait ? "Clear Court" : "Clear Court"}
            </button>
          )}
          <button
            onClick={handleSwitchServe}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: "600",
              backgroundColor: "#FF9500",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Switch Serve
          </button>
        </div>
<VoiceSubscriptionModal 
  isOpen={showVoiceSubscriptionModal}
  onClose={() => setShowVoiceSubscriptionModal(false)}
/>
      </div>
    )}

    {undoMessage && (
      <div style={{
        position: "fixed",
        bottom: "40px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#333",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "12px",
        fontSize: "1rem",
        fontWeight: "600",
        zIndex: 9999,
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      }}>
        {undoMessage}
      </div>
    )}

    {advancedLoggingEnabled && showErrorTypeModal && (
      <div style={{
        position: "fixed",
        top: (isMobile && isPortrait) ? 20 : 0, 
		left: 0, 
		right: 0,
		bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
      }}>
        <div style={{
          background: "#fff",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
          textAlign: "center",
          width: "280px"
        }}>
          <p style={{ fontWeight: "bold", marginBottom: "12px" }}>Select Service Error Type:</p>
          <button
            onClick={() => {
              setShowErrorTypeModal(false);

              if (currentServeSide === "opponent") {
                setTimeout(() => setShowServeZoneOverlay(true), 300);
              }

              if (typeof pendingErrorCallback === "function") {
                pendingErrorCallback("Out");
                setPendingErrorCallback(null);
              } else {
                console.warn("No pending error callback set when selecting Out");
              }
            }}
            style={modalBtnStyle}
          >
            Out
          </button>
          <button
            onClick={() => {
              setShowErrorTypeModal(false);

              if (currentServeSide === "opponent") {
                setTimeout(() => setShowServeZoneOverlay(true), 300);
              }

              if (typeof pendingErrorCallback === "function") {
                pendingErrorCallback("In Net");
                setPendingErrorCallback(null);
              } else {
                console.warn("No pending error callback set when selecting In Net");
              }
            }}
            style={modalBtnStyle}
          >
            In Net
          </button>
          <button
            onClick={() => {
              setShowErrorTypeModal(false);

              if (currentServeSide === "opponent") {
                setTimeout(() => setShowServeZoneOverlay(true), 300);
              }

              if (typeof pendingErrorCallback === "function") {
                pendingErrorCallback("Foot Fault");
                setPendingErrorCallback(null);
              } else {
                console.warn("No pending error callback set when selecting Foot Fault");
              }
            }}
            style={modalBtnStyle}
          >
            Foot Fault
          </button>
        </div>
      </div>
    )}

    {advancedLoggingEnabled && showAceTargetModal && (
      <div style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999
      }}>
        <div style={{
          backgroundColor: "white",
          padding: (isMobile && isPortrait) ? "16px" : "20px",
          borderRadius: "14px",
          width: (isMobile && isPortrait) ? "90vw" : "350px",
          maxWidth: "350px",
          textAlign: "center",
          boxShadow: "0 6px 20px rgba(0,0,0,0.3)"
        }}>
          <h3 style={{ marginBottom: "16px" }}>Who was targeted by the ace?</h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(2, 1fr)",
            gap: (isMobile && isPortrait) ? "8px" : "10px",
            marginBottom: (isMobile && isPortrait) ? "12px" : "16px"
          }}>
            {courtPlayers.map((player, idx) => (
              <button key={idx}
                onClick={() => {
                  setShowAceTargetModal(false);
                  pendingAceCallback(idx);
                }}
                style={{
                  height: (isMobile && isPortrait) ? "70px" : "80px",
                  width: (isMobile && isPortrait) ? "70px" : "80px",
                  padding: (isMobile && isPortrait) ? "8px" : "10px",
                  borderRadius: "10px",
                  fontWeight: "600",
                  backgroundColor: "#FFF",
                  borderColor: "#111",
                  color: "#007AFF",
                  border: "none",
                  fontSize: (isMobile && isPortrait) ? "13px" : "14px",
                  cursor: "pointer",
                  alignItems: "center"
                }}
              >
                <div><strong>{(player?.name?.slice(0, 10)) || "Player"}</strong></div>
                <div>#{player?.number || "?"}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setShowAceTargetModal(false);
              pendingAceCallback(null);
            }}
            style={{
              marginTop: "8px",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: "600",
              backgroundColor: "#8E8E93",
              color: "#fff",
              border: "none",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            Unsure
          </button>
        </div>
      </div>
    )}

 {errorContext && (
  <div
    style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#FFFFFF",
      padding: (isMobile && isPortrait) ? "20px" : "24px",
      borderRadius: "16px",
      zIndex: 9999,
      boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
      textAlign: "center",
      fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
      minWidth: (isMobile && isPortrait) ? "260px" : "280px",
      maxWidth: (isMobile && isPortrait) ? "90vw" : "320px",
    }}
  >
    <p style={{ fontSize: "1rem", marginBottom: "16px" }}>
      <strong>{errorContext.playerName}</strong> made an error. What type?
    </p>

    {/* ERROR SELECTION ROW */}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
      {["Receive/Pass", "Setting", "Attacking"].map((type) => (
        <button
          key={type}
          style={{
            ...iosButtonStyle,
            flex: "1 1 45%", // Allows two buttons per row
            backgroundColor: pendingErrorType === type ? "#007AFF" : "#f2f2f7",
            color: pendingErrorType === type ? "#ffffff" : "#000000",
            border: pendingErrorType === type ? "1px solid #0056b3" : "1px solid #d1d1d6",
            fontWeight: pendingErrorType === type ? "bold" : "normal",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setPendingErrorType(type);
            setAwaitingRefBlownDecision(true);
          }}
        >
          {type}
        </button>
      ))}
    </div>

    {awaitingRefBlownDecision && (
      <div style={{ 
        marginTop: 20, 
        paddingTop: 15, 
        borderTop: "1px solid #eee",
        animation: "fadeIn 0.3s ease-in" 
      }}>
        {/* Visual feedback of what is selected */}
        <p style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
          Selected: <strong>{pendingErrorType} Error</strong>
        </p>
        
        <p style={{ fontWeight: "bold", fontSize: 16 }}>
          Referee blown error?
        </p>


<button
  style={{ ...iosButtonStyle, backgroundColor: "#FF3B30" }}
  onClick={(e) => {
    e.stopPropagation();
    
    // Log the error stat first
    logError("bhes");
    
    setActionLog(prev => [
      ...prev,
      {
        action: `${errorContext.playerName} referee blown error`,
        timestamp: new Date().toISOString(),
      },
    ]);

    // Manually handle the rally reset to ensure proper serve transition
    onOpponentPoint && onOpponentPoint();
    
    // Force serve to opponent
    setBallState("serve");
    setCurrentServeSide("opponent");
    if (setServeSide) setServeSide("opponent");
    setBallPosition(opponentServePosition);
    setBallSide("opponent");
    
    // Clear rally state
    setTouches([]);
    setFreeBallModifier(null);
    setBlockCirclesVisible(false);
    setBlockInfo(null);
    
    setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
    
    // Reset modal state
    setPendingErrorType(null);
    setAwaitingRefBlownDecision(false);
    setErrorContext(null);
  }}
>
  Yes (Referee Error)
</button>


<button
  style={{
    ...iosButtonStyle,
    backgroundColor: "#ff3b30",
  }}
  onClick={(e) => {
    e.stopPropagation();
    
    // AFTER
let label, keys;

if (pendingErrorType === "Serving") {
  label = "Service Error";
  keys = ["serveErrors", "serves"];
} else  if (pendingErrorType === "Receive/Pass") {
  // Check action log: if last action was a serve receive attempt, it's a receive error
  // Otherwise it's a dig error
  const lastAction = actionLog.length > 0 ? actionLog[actionLog.length - 1]?.action || "" : "";
  const wasServeReceiveAttempt = lastAction.toLowerCase().includes("serve received");

  if (wasServeReceiveAttempt) {
    label = "Receive Error";
    keys = ["receiveErrors", "receptions"];
  } else {
    label = "Dig Error";
    keys = ["digErrors", "digs"];
  }
} else if (pendingErrorType === "Setting") {
  label = "Setting Error";
  keys = ["setErrors", "sets"];
} else {
  label = "Attacking Error";
  keys = ["attackErrors", "attacks"];
}


    // Log the error stat
    logError(keys[0], [keys[1]]);

    setActionLog(prev => [
      ...prev,
      {
        action: `${errorContext.playerName} ${label}`,
        timestamp: new Date().toISOString(),
      },
    ]);

    // Manually handle the rally reset to ensure proper serve transition
    onOpponentPoint && onOpponentPoint();
    
    // Force serve to opponent
    setBallState("serve");
    setCurrentServeSide("opponent");
    if (setServeSide) setServeSide("opponent");
    setBallPosition(opponentServePosition);
    setBallSide("opponent");
    
    // Clear rally state
    setTouches([]);
    setFreeBallModifier(null);
    setBlockCirclesVisible(false);
    setBlockInfo(null);

    setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));

    // Reset modal state
    setTimeout(() => {
      setPendingErrorType(null);
      setAwaitingRefBlownDecision(false);
      setErrorContext(null);
    }, 50);
  }}
>
  No (Player Error)
</button>
          </div>
        )}


        <button
          style={{
            ...iosButtonStyle,
            marginTop: 12,
            backgroundColor: "#ccc",
            color: "#000",
          }}
          onClick={() => {
            setPendingErrorType(null);
            setAwaitingRefBlownDecision(false);
            setErrorContext(null);
          }}
        >
          Dismiss
        </button>
      </div>
    )}
  </div>
  </>
);
}

export default VolleyballCourt;