import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import logAndSyncStat from './logAndSyncStat';
import { useDrag, useDrop } from "react-dnd";
import { useCollaborative} from './collaborative/CollaborativeProvider';
import {PlayerTrackingIndicator} from './collaborative/PlayerTrackingIndicator';
import {PlayerAssignmentModal} from './collaborative/PlayerAssignmentModal';
import {CollaborativeStatusBar} from './collaborative/CollaborativeStatusBar';
import { useActionManager } from './collaborative/useActionManager';
import { useAuth } from './AuthContext';
 

const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

// ============================================================================
// NEW COMPONENT: PlayerSlotCard
// Displays a single roster player with ON/OFF toggle
// ============================================================================
const PlayerSlotCard = ({
  player,
  isOn,
  onToggle,
  collaborativeMode,
  trackingStatus
}) => {
  
  return (
    <div
      style={{
        padding: '14px',
        borderRadius: '10px',
        border  
          : isOn 
            ? '2px solid #4caf50' 
            : '1px solid #ddd',
        backgroundColor: (collaborativeMode && trackingStatus?.isMe) 
          ? '#fff9c4' 
          : isOn
            ? '#f5f5f5'
            : '#fafafa',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        opacity: (collaborativeMode && trackingStatus?.isAssigned && !trackingStatus?.isMe) ? 0.6 : 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {collaborativeMode && player._id && (
        <PlayerTrackingIndicator
          playerId={player._id}
          playerName={player.name}
        />
      )}

      {collaborativeMode && trackingStatus?.isAssigned && !trackingStatus?.isMe && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,122,255,0.9)',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: '600',
          zIndex: 10,
          pointerEvents: 'none',
          textAlign: 'center',
          lineHeight: '1.2'
        }}>
          Tracked by {trackingStatus.trackedBy}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '15px',
            fontWeight: '700',
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            #{player.number}
            <span>{player.name}</span>
          </div>
          {player.isLibero && (
            <div style={{
              fontSize: '10px',
              color: '#666',
              marginTop: '2px',
              fontWeight: '500'
            }}>
              (Libero)
            </div>
          )}
        </div>
      </div>


      {/* Toggle Button - Only show if not assigned to someone else */}
      {!(collaborativeMode && trackingStatus?.isAssigned && !trackingStatus?.isMe) && (
        <button
          onClick={onToggle}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: isOn ? '#4caf50' : '#ccc',
            color: '#fff',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.03)';
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
        >
          {isOn ? '✓ PLAYING' : '○ BENCHED'}
        </button>
      )}

      <div style={{
        fontSize: '11px',
        fontWeight: '500',
        color: isOn ? '#2e7d32' : '#999',
        textAlign: 'center'
      }}>
        {isOn ? 'On Court' : 'On Bench'}
      </div>
    </div>
  );
};

const ExpressStatLogger = ({
  courtPlayers = [],  
  deactivatedPlayers = [],
  setDeactivatedPlayers,
  swapCourtPlayers,
  setCourtPlayers,
  positionMapping = {},
  rotateCourtArray,  
  currentMatchId,
  match,
  actionLog = [],
  setActionLog,
  collabActionLog = [], 
  passGradingEnabled = false,
  setPassGradingEnabled,
  setDistributionTrackingEnabled = false,
  setSetDistributionTrackingEnabled,
  attackTypeTrackingEnabled = false,
  setAttackTypeTrackingEnabled,
  scoringEnabled = true,
  setScoringEnabled,
  processSetEnding,
  setEndingInProgressRef,
  scoreCooldownActive,
  scoreCooldownRemaining,
  teamStats,
  setTeamStats,
  saveMatchData,
  isMobile,
  isPortrait,
  isTouch,
  maybeCreditGamesPlayed,
  token,
  allowedLiberoSubTarget,
  setAllowedLiberoSubTarget,
  slot5TargetId,
  setSlot5TargetId,
  benchPlayers = [],
  setBenchPlayers,
  substitutionLog = [],
  setSubstitutionLog,
  setMatchSettings,
  autoJoinMatchIfPossible,
  isMatchOwner,
  ourScore,
  opponentScore,
  setOurScore,
  setOpponentScore,
}) => {
  // ========================================================================
  // NEW STATE: Roster-based player selection with ON/OFF toggles
  // ========================================================================
   const { user } = useAuth();
  const [allRosterPlayers, setAllRosterPlayers] = useState([]);
  const [playerOnOffStatus, setPlayerOnOffStatus] = useState({});


  // ========================================================================
  // KEEP EXISTING STATE: All original state variables below
  // ========================================================================
  const [selectedSlot, setSelectedSlot] = useState(null); // Still needed by stat handlers
  const [playerStats, setPlayerStats] = useState({});
  const [activePlayerIds, setActivePlayerIds] = useState(new Set());
  const [selectedBlockPlayers, setSelectedBlockPlayers] = useState(new Set());
  const [positionLabels, setPositionLabels] = useState(['4', '3', '2', '5', '6', '1']);
  const [pendingPassGrade, setPendingPassGrade] = useState(null);
const [pendingSetDistribution, setPendingSetDistribution] = useState(null);
  
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [lastScoreUpdate, setLastScoreUpdate] = useState(null);
  const [assignmentDeclinedPlayers, setAssignmentDeclinedPlayers] = useState(new Set());
  const [scoringInProgress, setScoringInProgress] = useState(false);
const [lastScoreAttempt, setLastScoreAttempt] = useState(0);
const scoringTimeoutRef = useRef(null);
const [assignmentInProgress, setAssignmentInProgress] = useState(false);
const [connecting, setConnecting] = useState(false);
const [pendingAssistDistribution, setPendingAssistDistribution] = useState(null);
const [pendingAttackType, setPendingAttackType] = useState(null);
const globalActionLimiterRef = useRef({
  lastActionTime: 0,
  actionCount: 0,
  windowStart: Date.now()
});

const [selectedAssistDistribution, setSelectedAssistDistribution] = useState(null);
 const {
    isConnected,
    collaborativeMode,
    isCollaborativeReady,
    joinMatch,
    leaveMatch,
    logStat: logCollaborativeStat,
    updateScore: updateCollaborativeScore,
    isAssignedToPlayer,
    getTrackingStatus,
    activeSessions,
    setCollaborativeModeState,
    restoreCollaborativeModeFromMatch,
    syncedGameState,
    registerStateCallbacks,
	loadAssignmentsFromBackend,
	playerAssignments,
	addNotification,
	syncCourtPlayers,
	syncExpressSettings,
	socket
  } = useCollaborative();
  
const actionManager = useActionManager();
const hasAutoJoinedRef = useRef(false);
const lastMatchIdRef = useRef(null);
const [localStateOverride, setLocalStateOverride] = useState(null);
const localStateTimeoutRef = useRef(null);
  
  // NEW: Assist mode states
const [assistMode, setAssistMode] = useState(false);
const [selectedAssistPlayer, setSelectedAssistPlayer] = useState(null);
const assistPromptTimerRef = useRef(null);
const assistKillSelectedRef = useRef(null);
const DISPLAY_ORDER = ['4','3','2','5','6','1'];
const EMPTY_PLAYER = { _id: null, name: '?', number: '', isLibero: false };

const saveQueueRef = useRef([]);
const saveTimeoutRef = useRef(null);
const lastSaveTimeRef = useRef(0);
const DEBOUNCE_SAVE_MS = 1500; // Wait 1.5s after last save trigger

// Track what changed for smarter saving
const [lastSaveState, setLastSaveState] = useState({
  courtPlayers,
  teamStats,
  actionLog: actionLog?.slice(-5) // Just last 5 for comparison
});
  
  // NEW Collabrative Block mode states
const [collaborativeBlockWaiting, setCollaborativeBlockWaiting] = useState(false);
const [blockWaitingPlayers, setBlockWaitingPlayers] = useState([]); // Array of selected players
const [blockWaitingType, setBlockWaitingType] = useState(null); // 'assist' or 'error'
const [blockWaitingInitiator, setBlockWaitingInitiator] = useState(null);
const blockWaitingTimerRef = useRef(null);
const [blockWaitingTimer, setBlockWaitingTimer] = useState(0);
const [blockActionType, setBlockActionType] = useState(null); 
const [blockMode, setBlockMode] = useState(null); // 'assist' or 'error'
const [collaborativeBlockState, setCollaborativeBlockState] = useState({
  active: false,
  type: null,
  players: [],
  initiator: null,
  timer: 5,
  canParticipate: false
});
const [remoteAssistInProgress, setRemoteAssistInProgress] = useState(false);
const [remoteAssistPlayer, setRemoteAssistPlayer] = useState(null);
const [remoteAssistInitiator, setRemoteAssistInitiator] = useState(null);
const [undoInProgress, setUndoInProgress] = useState(false);

const addActionLogEntry = useCallback((action, options = {}) => {
  const actionEntry = {
    timestamp: Date.now(),
    action,
    userId: user?.id || user?._id,
    username: user?.displayName || user?.email?.split('@')[0] || 'A Former User',
    undoId: options.undoId || null,
    undone: options.undone || false,
    ...options
  };

  setActionLog(prev => [...prev, actionEntry]);
}, [setActionLog, user]);

const closeAssistPrompt = useCallback(() => {
  // Hide the prompt
  setShowAssistHelp(false);      // whatever your modal boolean is called
  setAwaitingKillForAssist(null);// if you store pending assist state

  // Clear any countdown
  if (assistPromptTimerRef.current) {
    clearTimeout(assistPromptTimerRef.current);
    assistPromptTimerRef.current = null;
  }
}, []);
  
  // NEW: Track credited players for games played
  const creditedPlayersThisSetRef = useRef(new Set());
  const inFlightCreditsRef = useRef(new Map()); // playerId -> Promise<Boolean>

// Small helpers (place above the function or in your utils)
const withTimeout = (p, ms, label = 'operation') =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const jitter = (base) => base + Math.floor(Math.random() * Math.min(200, base));
  
  
  

  // Get auth context


const getCurrentUserId = useCallback(() => {
  return user?.id || user?._id || null;  
}, [user]);

const currentUserId 
=getCurrentUserId();

const getCurrentUsername = useCallback(() => {
   return user?.displayName || user?.email?.split('@')[0] || 'A Former User';
}, [user]);
  
const [actionFeedback, setActionFeedback] = useState(new Map()); // Track button feedback states
const [recentActions, setRecentActions] = useState([]);
const [collaborativeAssistWaiting, setCollaborativeAssistWaiting] = useState(false);
const [assistWaitingPlayer, setAssistWaitingPlayer] = useState(null);
const [assistWaitingTimer, setAssistWaitingTimer] = useState(5);
const [lastTouchedPlayerId, setLastTouchedPlayerId] = useState(null);
const [showExpandedActionLog, setShowExpandedActionLog] = useState(false);

const [statUndoStack, setStatUndoStack] = useState([]);
const assistTimerRef = useRef(null);
const processingAssistKillRef = useRef(false);
// Track recent actions for toast display





// Haptic feedback function
const triggerHapticFeedback = useCallback((pattern = [50]) => {
  try {
    // Check if vibration is supported
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (error) {
    // Silently fail - haptic feedback is not critical
    console.log('Haptic feedback not available');
  }
}, []);

const triggerNonBlockingSave = useCallback((reason = 'action') => {
  console.log(`💾 Save triggered: ${reason}`);
  
  // Add to queue
  saveQueueRef.current.push({
    reason,
    timestamp: Date.now()
  });
  
  // Clear existing timeout
  if (saveTimeoutRef.current) {
    clearTimeout(saveTimeoutRef.current);
  }
  
  // Debounce the actual save
  saveTimeoutRef.current = setTimeout(async () => {
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    
    // Respect minimum interval between saves (5 seconds)
    if (timeSinceLastSave < 5000) {
      const waitMs = 5000 - timeSinceLastSave;
      console.log(`⏱️ Throttling save - waiting ${waitMs}ms`);
      saveTimeoutRef.current = setTimeout(() => performNonBlockingSave(), waitMs);
      return;
    }
    
    performNonBlockingSave();
  }, DEBOUNCE_SAVE_MS);
}, []);



const performNonBlockingSave = useCallback(async () => {
  if (!saveMatchData || saveQueueRef.current.length === 0) {
    return;
  }
  
  const reasons = saveQueueRef.current.map(r => r.reason).join(', ');
  console.log(`🔄 Executing non-blocking save for: ${reasons}`);
  
  lastSaveTimeRef.current = Date.now();
  saveQueueRef.current = [];
  
  // Fire and forget - don't await, don't block UI
  Promise.resolve().then(() => {
    try {
      // Use false for "don't show spinner" and let it save quietly
      saveMatchData(false);
    } catch (error) {
      console.error('Save error:', error);
    }
  });
  
}, [saveMatchData]);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  };
}, []);

// Visual feedback function
const triggerActionFeedback = useCallback((buttonId, actionType = 'success', duration = 800) => {
  // Set feedback state for the button
  setActionFeedback(prev => new Map(prev.set(buttonId, { type: actionType, timestamp: Date.now() })));
  
  // Clear feedback after duration
  setTimeout(() => {
    setActionFeedback(prev => {
      const newMap = new Map(prev);
      newMap.delete(buttonId);
      return newMap;
    });
  }, duration);
  
  // Trigger haptic feedback
  if (actionType === 'success') {
    triggerHapticFeedback([50, 30, 50]); // Success pattern: short-pause-short
  } else if (actionType === 'error') {
    triggerHapticFeedback([100]); // Error pattern: single long vibration
  } else {
    triggerHapticFeedback([30]); // Default: short vibration
  }
}, [triggerHapticFeedback]);  

useEffect(() => {
  // Auto-load assignments when collaborative mode becomes enabled for ANY user (not just owners)
  if (collaborativeMode && currentMatchId && isConnected) {
    console.log('Loading assignments for all collaborative users...');
    loadAssignmentsFromBackend().catch(error => {
      console.error('Failed to load assignments for non-owner:', error);
    });
  }
}, [collaborativeMode, currentMatchId, isConnected, loadAssignmentsFromBackend]);

/* const playersForUI = React.useMemo(() => {
  const byPos = new Map();
  (courtPlayers || []).forEach(p => {
    if (p) byPos.set(String(p.expressPosition || ''), p);
  });

  // Produce rows strictly in 1..6 order for the UI
  return DISPLAY_ORDER.map(pos => 
    byPos.get(pos) || { id: `empty-${pos}`, name: '?', number: '?', expressPosition: pos }
  );
}, [courtPlayers]); */

const getActionDisplayText = useCallback((entry) => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry.action === 'string') return entry.action;
  return 'Action recorded';
}, []);

const showActionToast = useCallback((message, type = 'success') => {
  const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const toast = {
    id: toastId,
    message,
    type,
    timestamp: Date.now()
  };

  setRecentActions(prev => [...prev.slice(-2), toast]);

  setTimeout(() => {
    setRecentActions(prev => prev.filter(t => t.id !== toastId));
  }, 1000);
}, []);

const handleUndoLastStatAction = useCallback(async () => {
  if (undoInProgress || statUndoStack.length === 0) return;

  const lastEntry = statUndoStack[statUndoStack.length - 1];
  setUndoInProgress(true);

  try {
    for (const op of lastEntry.operations) {
      const negativeStats = {};
      for (const key of op.statKeys) {
        negativeStats[key] = -1;
      }

      await axios.post(
        `${API_URL}/api/playerMatchStats/log`,
        {
          playerId: op.playerId,
          matchId: currentMatchId,
          teamId: match?.teamName,
          stats: negativeStats,
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        }
      );
    }

    setStatUndoStack(prev => prev.slice(0, -1));

    addActionLogEntry(`Undid stat action: ${lastEntry.label}`, {
      type: 'stat_undo',
      meta: { originalLabel: lastEntry.label }
    });

    showActionToast(`Undid: ${lastEntry.label}`, 'info');
  } catch (error) {
    console.error('Undo stat action failed:', error);
    showActionToast('Failed to undo stat action', 'error');
  } finally {
    setUndoInProgress(false);
  }
}, [
  undoInProgress,
  statUndoStack,
  currentMatchId,
  match?.teamName,
  token,
  addActionLogEntry,
  showActionToast
]);

  // Initialize active players based on courtPlayers
useEffect(() => {
  if (!Array.isArray(courtPlayers)) return;

  setActivePlayerIds(prev => {
    return new Set(
      [...prev].filter(playerId =>
        courtPlayers.some(p => p && p._id === playerId && p.name !== "?")
      )
    );
  });
}, [courtPlayers]);
      
  




const formatPlayerAction = useCallback((player, action) => {
  return `${player.name} (#${player.number}) ${action}`;
}, []);



const setCourtPlayersRef = useRef(setCourtPlayers);



// Keep refs updated with current values
useEffect(() => {
  setCourtPlayersRef.current = setCourtPlayers;
});

// Add this useEffect near the other useEffects in ExpressStatLogger.js
// Place it after the refs are defined and updated

useEffect(() => {
  if (!collaborativeMode || !registerStateCallbacks) return;
  
  console.log('🔧 ExpressStatLogger: Registering collaborative state callbacks');
  
  registerStateCallbacks({
    onGameStateChange: (gameState, data) => {
      console.log('🎯 ExpressStatLogger: Received game state change:', {
        gameState,
        fromUser: data.username
      });
      
      // Skip if this is our own change
      if (data.userId === getCurrentUserId()) {
        console.log('⏩ Skipping own game state change');
        return;
      }
      
      // This is a catch-all for any game state changes
      // Individual handlers above are more specific
    }
  });
  
  console.log('✅ ExpressStatLogger: Callbacks registered successfully');
  
}, [
  collaborativeMode, 
  registerStateCallbacks, 
  localStateOverride,
  getCurrentUserId
]);

useEffect(() => {
  if (!collaborativeMode || !socket) return;
  
  const handleAssistWaitingStarted = (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.assistPlayer) {
      console.log('🔵 Setting assist state from OTHER user');
      setCollaborativeAssistWaiting(true);
      setAssistWaitingPlayer(data.assistPlayer);
      setAssistWaitingTimer(10);
      
      showActionToast(`${data.initiatedBy?.username || 'Another user'} started assist timer for ${data.assistPlayer.name}`, 'info');
    }
  };
  
 

 const handleAssistKillCompleted = (data) => {
    const currentUserId = getCurrentUserId();
    
    console.log('🔴 CLEARING assist state from ANOTHER user via assist_kill_completed event');
    assistKillSelectedRef.current = true;
    setCollaborativeAssistWaiting(false);
    setAssistWaitingPlayer(null);
    setAssistWaitingTimer(0);
    
    setTimeout(() => {
      assistKillSelectedRef.current = false;
    }, 500);
  };
  
  socket.on('assist_selection_started', (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.initiatedBy?.userId === currentUserId) {
      return; // Skip own event
    }
    
    // Set state for prominent banner
    setRemoteAssistInProgress(true);
    setRemoteAssistPlayer(data.assistPlayer);
    setRemoteAssistInitiator(data.initiatedBy);
    
    // Auto-hide after 10 seconds as fallback
    setTimeout(() => {
      setRemoteAssistInProgress(false);
      setRemoteAssistPlayer(null);
      setRemoteAssistInitiator(null);
    }, 10000);
  });

  socket.on('assist_selection_completed', (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.initiatedBy?.userId === currentUserId) {
      return; // Skip own event
    }
    
    // Clear the banner
    setRemoteAssistInProgress(false);
    setRemoteAssistPlayer(null);
    setRemoteAssistInitiator(null);
    
    // Show completion notification
    showActionToast(
      `Assist by ${data.assistPlayer.name} → Kill by ${data.killPlayer.name}`,
      'success'
    );
  });
  
  // Cleanup function for this useEffect
  return () => {
    socket.off('assist_selection_started');
    socket.off('assist_selection_completed');
  };
}, [collaborativeMode, socket, showActionToast, getCurrentUserId]);

const syncExpressSettingsToMatch = useCallback((overrides = {}) => {
  if (!setMatchSettings) return;

  setMatchSettings(prev => ({
    ...prev,
    expressSettings: {
      ...(prev?.expressSettings || {}),
      passGradingEnabled,
      setDistributionTrackingEnabled,
      attackTypeTrackingEnabled,
      scoringEnabled,
      playerOnOffStatus,
      ...overrides,
    },
  }));
}, [
  setMatchSettings,
  passGradingEnabled,
  setDistributionTrackingEnabled,
  attackTypeTrackingEnabled,
  scoringEnabled,
  playerOnOffStatus,
]);

useEffect(() => {
  syncExpressSettingsToMatch();
}, [
  passGradingEnabled,
  setDistributionTrackingEnabled,
  attackTypeTrackingEnabled,
  scoringEnabled,
  playerOnOffStatus,
  syncExpressSettingsToMatch,
]);


useEffect(() => {
  if (!collaborativeMode || !socket) return;
  
  const handleCourtPlayersUpdated = (data) => {
    const currentUserId = getCurrentUserId();
    
    // Skip if this is our own update
    if (data.updatedBy?.userId === currentUserId) {
      console.log('📤 Skipping own court player update');
      return;
    }
    
    console.log('📥 Receiving court player update from another user:', {
      action: data.context?.action,
      updatedBy: data.updatedBy?.username,
      playerCount: data.courtPlayers?.length
    });
    
    // Apply the court player update from remote user
    if (data.courtPlayers && Array.isArray(data.courtPlayers)) {
      // Normalize the received players
      const normalizedPlayers = data.courtPlayers.map((p, idx) => {
        if (!p || p.name === '?') {
          return {
            id: `empty-${idx}`,
            name: '?',
            number: '?',
            isLibero: false,
            expressPosition: p?.expressPosition
          };
        }
        
        return {
          _id: p._id || p.id,
          id: p.id || p._id,
          name: p.name,
          number: p.number,
          isLibero: p.isLibero || false,
          expressPosition: p.expressPosition,
          replacedPlayer: p.replacedPlayer,
          careerStats: p.careerStats || {},
          seasonStats: p.seasonStats || {}
        };
      });
      
      // Update local court players
      setCourtPlayers(normalizedPlayers);
      
      // Show notification for rotations
      if (data.context?.action === 'position_rotation' || 
          data.context?.action === 'libero_substitution_with_rotation') {
        showActionToast(
          `${data.updatedBy?.username || 'Another user'} rotated positions`, 
          'info'
        );
      }
      
      console.log('✅ Applied court player update from remote user');
    }
  };
  
  socket.on('court_players_updated', handleCourtPlayersUpdated);
  
  return () => {
    socket.off('court_players_updated', handleCourtPlayersUpdated);
  };
}, [
  collaborativeMode, 
  socket, 
  getCurrentUserId, 
  showActionToast, 
  setCourtPlayers
]);

// Listen for expressSettings updates (playerOnOffStatus changes)
useEffect(() => {
  if (!collaborativeMode || !socket) return;
  
  const handleExpressSettingsUpdate = (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.updatedBy?.userId === currentUserId) {
      console.log('📝 Skipping own express settings update');
      return;
    }
    
    console.log('📝 Express settings update from remote user:', data);
    
    if (data.expressSettings?.playerOnOffStatus) {
      setPlayerOnOffStatus(data.expressSettings.playerOnOffStatus);
      
      // Show notification for player toggles
      if (data.action === 'player_toggle_on') {
        showActionToast(
          `${data.updatedBy?.username || 'Another user'} turned ON ${data.playerName}`, 
          'info'
        );
      } else if (data.action === 'player_toggle_off') {
        showActionToast(
          `${data.updatedBy?.username || 'Another user'} turned OFF ${data.playerName}`, 
          'info'
        );
      }
    }
    
    console.log('✅ Applied express settings update from remote user');
  };
  
  socket.on('express_settings_update', handleExpressSettingsUpdate);
  
  return () => {
    socket.off('express_settings_update', handleExpressSettingsUpdate);
  };
}, [
  collaborativeMode, 
  socket, 
  getCurrentUserId, 
  showActionToast,
  setPlayerOnOffStatus
]);


useEffect(() => {
  if (!collaborativeMode || !socket) return;
  
  const handleBlockSelectionStarted = (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.initiatedBy?.userId === currentUserId) {
      console.log('🔵 Skipping own block selection start event');
      return;
    }
    
    console.log('🔵 Block selection started by another user:', data.initiatedBy?.username);
    
    setCollaborativeBlockWaiting(true);
    setBlockWaitingPlayers(data.selectedPlayers || []);
    setBlockWaitingType(data.blockType);
    setBlockWaitingInitiator(data.initiatedBy);
    setBlockWaitingTimer(30);
    
    showActionToast(
      `${data.initiatedBy?.username || 'Another user'} is selecting block ${data.blockType === 'assist' ? 'assist' : 'error'} partners`, 
      'info'
    );
  };
 
  const handleBlockCompleted = (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.completedBy?.userId === currentUserId) {
      console.log('🔵 Skipping own block completion event');
      return;
    }
    
    console.log('🔴 Block completed by another user');
    
    setCollaborativeBlockWaiting(false);
    setBlockWaitingPlayers([]);
    setBlockWaitingType(null);
    setBlockWaitingInitiator(null);
    setBlockWaitingTimer(0);
    
    if (blockWaitingTimerRef.current) {
      clearTimeout(blockWaitingTimerRef.current);
      blockWaitingTimerRef.current = null;
    }
    
    const playerNames = data.players?.map(p => p.name).join(', ') || 'players';
    showActionToast(`Block ${data.blockType} recorded for ${playerNames}`, 'success');
  };
  
  const handleBlockCancelled = (data) => {
    const currentUserId = getCurrentUserId();
    
    if (data.cancelledBy?.userId === currentUserId) {
      return;
    }
    
    console.log('❌ Block selection cancelled by another user');
    
    setCollaborativeBlockWaiting(false);
    setBlockWaitingPlayers([]);
    setBlockWaitingType(null);
    setBlockWaitingInitiator(null);
    setBlockWaitingTimer(0);
    
    if (blockWaitingTimerRef.current) {
      clearTimeout(blockWaitingTimerRef.current);
      blockWaitingTimerRef.current = null;
    }
  };
  
  socket.on('block_selection_started', handleBlockSelectionStarted);
  socket.on('block_completed', handleBlockCompleted);
  socket.on('block_cancelled', handleBlockCancelled);
  
  return () => {
    socket.off('block_selection_started', handleBlockSelectionStarted);
    socket.off('block_completed', handleBlockCompleted);
    socket.off('block_cancelled', handleBlockCancelled);
  };
}, [collaborativeMode, socket, showActionToast, getCurrentUserId]);

const RemoteAssistBanner = () => {
  if (!remoteAssistInProgress || !remoteAssistPlayer) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 200,
      left: 0,
      right: 0,
      backgroundColor: '#FFA500', // Orange for attention
      color: '#000',
      padding: '16px',
      zIndex: 9990,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      borderBottom: '3px solid #FF8C00',
      animation: 'pulseGlow 2s infinite'
    }}>
      <style>
        {`
          @keyframes pulseGlow {
            0% { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            50% { box-shadow: 0 4px 20px rgba(255,165,0,0.6); }
            100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
          }
          
          @keyframes slideDown {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
          }
        `}
      </style>
      
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        animation: 'slideDown 0.3s ease-out'
      }}>
        {/* Main message */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Animated icon */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            animation: 'spin 2s linear infinite'
          }}>
            <style>
              {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
            </style>
            ⚡
          </div>
          
          {/* Text content */}
          <div>
            <div style={{
              fontSize: '18px',
              fontWeight: '700',
              marginBottom: '2px'
            }}>
              Assist Selection in Progress
            </div>
            <div style={{
              fontSize: '14px',
              fontWeight: '500',
              opacity: 0.9
            }}>
              {remoteAssistInitiator?.username || 'Another user'} is selecting a kill partner for {remoteAssistPlayer?.name}'s assist
            </div>
          </div>
        </div>
        
        {/* Status indicator */}
        <div style={{
          padding: '8px 16px',
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#FF4500',
            animation: 'pulse 1s infinite'
          }}>
            <style>
              {`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}
            </style>
          </div>
          SELECTING...
        </div>
      </div>
    </div>
  );
};

// Register callbacks ONCE on mount
const addNotificationRef = useRef(addNotification);
const addActionLogEntryRef = useRef(addActionLogEntry);
const setActivePlayerIdsRef = useRef(setActivePlayerIds);
const processSetEndingRef = useRef(processSetEnding);
const deactivatedPlayersRef = useRef(deactivatedPlayers);
const userRef = useRef(user);
const collaborativeModeRef = useRef(collaborativeMode);
const registerStateCallbacksRef = useRef(registerStateCallbacks);
const getCurrentUserIdRef = useRef(getCurrentUserId);
const processingAssistKill = useRef(false);

// Add these callback functions


// Keep ALL refs updated with current values
useEffect(() => {
  setCourtPlayersRef.current = setCourtPlayers;
  addNotificationRef.current = addNotification;
  addActionLogEntryRef.current = addActionLogEntry;
  setActivePlayerIdsRef.current = setActivePlayerIds;
  processSetEndingRef.current = processSetEnding;
  deactivatedPlayersRef.current = deactivatedPlayers;
  userRef.current = user;
  collaborativeModeRef.current = collaborativeMode;
  registerStateCallbacksRef.current = registerStateCallbacks;
  getCurrentUserIdRef.current = getCurrentUserId;
});



useEffect(() => {
  if (!collaborativeMode || !socket) return;
  
  const handleBlockSelectionStarted = (data) => {
    const currentUserId = getCurrentUserId();
    if (data.initiatedBy?.userId === currentUserId) return;
    
    const canParticipate = courtPlayers
      .filter((p) => {
        return !p?.isLibero && p?._id;
      })
      .some(p => isAssignedToPlayer(p._id));
    
    setCollaborativeBlockState({
      active: true,
      type: data.blockType,
      players: data.selectedPlayers || [],
      initiator: data.initiatedBy,
      timer: 30,
      canParticipate
    });
  };
  
  const handleBlockCompleted = (data) => {
    if (data.completedBy?.userId === getCurrentUserId()) return;
    
    setCollaborativeBlockState({
      active: false,
      type: null,
      players: [],
      initiator: null,
      timer: 30,
      canParticipate: false
    });
    
    if (blockMode) {
      setBlockMode(null);
      setSelectedBlockPlayers(new Set());
    }
  };
  
  socket.on('block_selection_started', handleBlockSelectionStarted);
  socket.on('block_completed', handleBlockCompleted);
  socket.on('block_cancelled', handleBlockCompleted); // reuse cleanup
  socket.on('block_timeout', handleBlockCompleted); // reuse cleanup
  
  return () => {
    socket.off('block_selection_started', handleBlockSelectionStarted);
    socket.off('block_completed', handleBlockCompleted);
    socket.off('block_cancelled', handleBlockCompleted);
    socket.off('block_timeout', handleBlockCompleted);
  };
}, [collaborativeMode, socket, courtPlayers, blockMode]);


useEffect(() => {
  if (collaborativeBlockState.active && collaborativeBlockState.timer > 0) {
    const timerId = setTimeout(() => {
      setCollaborativeBlockState(prev => ({
        ...prev,
        timer: prev.timer - 1
      }));
    }, 1000);
    
    return () => clearTimeout(timerId);
  } else if (collaborativeBlockState.active && collaborativeBlockState.timer === 0) {
    // Auto-timeout
    if (socket && currentMatchId) {
      socket.emit('block_timeout', {
        matchId: currentMatchId,
        timestamp: new Date().toISOString()
      });
    }
    
    setCollaborativeBlockState({
      active: false,
      type: null,
      players: [],
      initiator: null,
      timer: 15,
      canParticipate: false
    });
  }
}, [collaborativeBlockState.active, collaborativeBlockState.timer, socket, currentMatchId]);

const logStat = useCallback(async (player, label, statKeys, actionText, options = {}) => {
  if (!player || !currentMatchId) {
    console.error('❌ Missing player or matchId');
    return false;
  }

  const resolvedActionText = actionText || formatPlayerAction(player, label);
  const undoId = options.skipUndo
    ? null
    : `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const undoEntry = options.skipUndo
    ? null
    : {
        undoId,
        timestamp: Date.now(),
        label,
        actionText: resolvedActionText,
        operations: [
          {
            playerId: player._id,
            playerName: player.name,
            statKeys: [...statKeys],
          }
        ]
      };

  console.log('🎯 logStat wrapper called:', {
    player: player.name,
    label,
    statKeys,
    collaborativeMode,
    undoId
  });

  // Always update visible action log immediately
  addActionLogEntry(resolvedActionText, {
    type: 'stat_log',
    undoId,
    meta: { playerId: player._id, label, statKeys }
  });

  // Try collaborative first
  if (collaborativeMode && isCollaborativeReady()) {
    try {
      console.log('📤 Attempting collaborative stat logging...');

      const collaborativeSuccess = await logCollaborativeStat(player._id, label, 1, {
        statKeys,
        actionText: resolvedActionText,
        playerName: player.name,
        playerNumber: player.number
      });

      if (collaborativeSuccess) {
        if (undoEntry) {
          setStatUndoStack(prev => [...prev, undoEntry]);
        }

        console.log('✅ Collaborative logging succeeded');
        showActionToast(`${player.name}: ${label} recorded`, 'success');
        return true;
      }

      console.warn('⚠️ Collaborative logging returned false, trying local fallback');
    } catch (collabError) {
      console.error('❌ Collaborative logging error:', collabError);
    }
  }

  // Fallback: local logging
  console.log('📝 Using local stat logging');

  try {
    await logAndSyncStat({
      playerId: player._id,
      playerName: player.name,
      label,
      statKeys,
      setActionLog: () => {}, // prevent duplicate log rows
      setPlayerStats,
      playerStats,
      currentMatchId,
      teamId: match?.teamName,
    });

    if (undoEntry) {
      setStatUndoStack(prev => [...prev, undoEntry]);
    }

    console.log('✅ Local stat logging succeeded');
    showActionToast(`${player.name}: ${label} recorded`, 'success');
    return true;
  } catch (localError) {
    console.error('❌ Even local logging failed:', localError);
    showActionToast(`${player.name}: ${label} recorded (pending sync)`, 'warning');
    return false;
  }
}, [
  currentMatchId,
  collaborativeMode,
  isCollaborativeReady,
  logCollaborativeStat,
  addActionLogEntry,
  setPlayerStats,
  playerStats,
  match?.teamName,
  formatPlayerAction,
  showActionToast
]);


const handleUndoStatById = useCallback(async (undoId) => {
  if (undoInProgress) return;

  const entry = statUndoStack.find(item => item.undoId === undoId);
  if (!entry) {
    showActionToast('No undo data found for that action', 'error');
    return;
  }

  setUndoInProgress(true);

  try {
    for (const op of entry.operations) {
      const negativeStats = {};
      for (const key of op.statKeys) {
        negativeStats[key] = -1;
      }

      await axios.post(
        `${API_URL}/api/playerMatchStats/log`,
        {
          playerId: op.playerId,
          matchId: currentMatchId,
          teamId: match?.teamName,
          stats: negativeStats,
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        }
      );
    }

    setStatUndoStack(prev => prev.filter(item => item.undoId !== undoId));

    setActionLog(prev =>
      prev.map(logEntry =>
        logEntry.undoId === undoId
          ? { ...logEntry, undone: true }
          : logEntry
      )
    );

    addActionLogEntry(`Undid stat action: ${entry.label}`, {
      type: 'stat_undo',
      meta: { originalLabel: entry.label, undoId }
    });

    showActionToast(`Undid: ${entry.label}`, 'info');
  } catch (error) {
    console.error('Undo stat action failed:', error);
    showActionToast('Failed to undo stat action', 'error');
  } finally {
    setUndoInProgress(false);
  }
}, [
  undoInProgress,
  statUndoStack,
  currentMatchId,
  match?.teamName,
  token,
  setActionLog,
  addActionLogEntry,
  showActionToast
]);

useEffect(() => {
  if (collaborativeBlockWaiting && blockWaitingTimer > 0) {
    blockWaitingTimerRef.current = setTimeout(() => {
      setBlockWaitingTimer(prev => prev - 1);
    }, 1000);
  } else if (collaborativeBlockWaiting && blockWaitingTimer === 0) {
    // Timeout - auto-cancel
    handleBlockTimeout();
  }
  
  return () => {
    if (blockWaitingTimerRef.current) {
      clearTimeout(blockWaitingTimerRef.current);
      blockWaitingTimerRef.current = null;
    }
  };
}, [collaborativeBlockWaiting, blockWaitingTimer]);


const checkGlobalRateLimit = useCallback(() => {
  const now = Date.now();
  const limiter = globalActionLimiterRef.current;
  
  // Reset window every 10 seconds
  if (now - limiter.windowStart > 10000) {
    limiter.actionCount = 0;
    limiter.windowStart = now;
  }
  
  // Allow max 30 actions per 10 second window
  if (limiter.actionCount >= 30) {
    console.warn('⚠️ Global rate limit exceeded');
    showActionToast('Too many actions - please slow down', 'warning');
    return false;
  }
  
  // Minimum 100ms between any actions
  if (now - limiter.lastActionTime < 100) {
    console.warn('⚠️ Actions too rapid');
    return false;
  }
  
  limiter.actionCount++;
  limiter.lastActionTime = now;
  return true;
}, [showActionToast]);

  // When courtPlayers changes, ensure each player has a position label
  useEffect(() => {
    // When courtPlayers changes, ensure each player has a position label
    const updatedPlayers = courtPlayers.map((player, index) => {
      if (player && !player.expressPosition) {
        // Default position assignment: slot 0=Pos1, slot 1=Pos2, slot 2=Pos3, etc.
        const defaultPositions = ['4', '3', '2', '5', '6', '1'];
        return {
          ...player,
          expressPosition: defaultPositions[index] || '?'
        };
      }
      return player;
    });
    
    if (JSON.stringify(updatedPlayers) !== JSON.stringify(courtPlayers)) {
      setCourtPlayers(updatedPlayers);
    }
  }, [courtPlayers, setCourtPlayers]);
  


useEffect(() => {
  // Auto-join when collaborative mode becomes enabled
  if (collaborativeMode && currentMatchId && !isConnected && !connecting) {
    console.log('Collaborative mode enabled, auto-joining match...');
    joinMatch(currentMatchId);
  }
}, [collaborativeMode, currentMatchId, isConnected, connecting, joinMatch]);

// FIXED: Helper function to add action log entries with collaborative support






  
  // Helper function to get current volleyball position for any UI slot
  const getVolleyballPosition = useCallback((slotIndex) => {
    if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex > 5) {
      return '?';
    }
    // Get position from the player object itself first
    const player = courtPlayers[slotIndex];
    if (player?.expressPosition) {
      return player.expressPosition;
    }
    // Fallback to positionMapping if available
    return positionMapping[slotIndex] || '?';
  }, [courtPlayers, positionMapping]);
  
  
const moveByUiIndex = useCallback((dragUiIndex, targetUiIndex) => {
  if (dragUiIndex === targetUiIndex) return;

  // Get the player being dragged
  const draggedPlayer = courtPlayers[dragUiIndex];
  
  // Create a new array without the dragged player
  const withoutDragged = courtPlayers.filter((_, idx) => idx !== dragUiIndex);
  
  // Insert the dragged player at the target position
  const reordered = [
    ...withoutDragged.slice(0, targetUiIndex),
    draggedPlayer,
    ...withoutDragged.slice(targetUiIndex)
  ];

  setCourtPlayers(reordered);
  
}, [courtPlayers, setCourtPlayers, syncCourtPlayers]);

  // Helper to check if a slot is currently the server position;

  // NEW: Games played credit function
const creditGamesPlayed = useCallback(async (rawPlayerId, context = 'express', { force = false } = {}) => {
  // Normalize + guard
  const playerId = typeof rawPlayerId === 'string' ? rawPlayerId.trim() : rawPlayerId?._id || rawPlayerId;
  if (!playerId || !currentMatchId || typeof maybeCreditGamesPlayed !== 'function') {
    console.warn('creditGamesPlayed: missing required data', { playerId, currentMatchId, hasFn: !!maybeCreditGamesPlayed });
    return false;
  }

  // Fast idempotency unless force=true
  if (!force && creditedPlayersThisSetRef.current.has(playerId)) {
    // Already credited this set
    return true;
  }

  // Single-flight: reuse the same in-flight promise per player
  if (inFlightCreditsRef.current.has(playerId)) {
    try {
      return await inFlightCreditsRef.current.get(playerId);
    } catch (e) {
      // If a shared call failed, fall through to attempt again with retries
      inFlightCreditsRef.current.delete(playerId);
    }
  }

  // Define the actual attempt with retries + timeout
  const run = (async () => {
    const maxAttempts = 3;
    const baseBackoff = 300; // ms

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 2.5s hard timeout per attempt
        const ok = await withTimeout(
          maybeCreditGamesPlayed(playerId, /*alreadyCredited*/ false, context),
          2500,
          'maybeCreditGamesPlayed'
        );

        if (ok) {
          // Mark idempotency only after success
          creditedPlayersThisSetRef.current.add(playerId);
          return true;
        }

        // Backend returned falsy: treat as retryable once, then give up
        if (attempt === maxAttempts) return false;
      } catch (err) {
        // Network/timeout/etc. Retry unless last attempt
        if (attempt === maxAttempts) {
          console.error(`creditGamesPlayed: failed for ${playerId} after ${attempt} attempts`, err);
          return false;
        }
      }

      // Exponential backoff with jitter
      const wait = jitter(baseBackoff * Math.pow(2, attempt - 1));
      await sleep(wait);
    }

    return false; // should not reach here
  })();

  // Register single-flight promise
  inFlightCreditsRef.current.set(playerId, run);

  try {
    const result = await run;
    return result;
  } finally {
    // Clean up entry so future calls can try again if needed
    inFlightCreditsRef.current.delete(playerId);
  }
}, [currentMatchId, maybeCreditGamesPlayed]);

  
  // UPDATED: Auto-join collaborative mode with ownership check
  useEffect(() => {
    const matchId = match?._id;
    const isCollaborative = match?.collaborativeMode;
    
    // Only proceed if match exists and has collaborative mode enabled
    if (!isCollaborative || !matchId) {
      hasAutoJoinedRef.current = false;
      lastMatchIdRef.current = null;
      return;
    }

    // If this is a different match, reset the auto-join flag
    if (lastMatchIdRef.current !== matchId) {
      hasAutoJoinedRef.current = false;
      lastMatchIdRef.current = matchId;
    }

    // Only auto-join once per match
    if (hasAutoJoinedRef.current) {
      return;
    }

    // ENHANCED: Check if collaborative mode is already enabled from restoration
    if (isCollaborative.enabled && !collaborativeMode) {
      console.log('🔄 Restoring collaborative mode from match settings');
      restoreCollaborativeModeFromMatch(isCollaborative);
    }

    // Auto-join if collaborative mode is now enabled AND user has access
    if (collaborativeMode && currentMatchId === matchId) {
      console.log('🔗 Auto-joining collaborative match:', matchId);
      hasAutoJoinedRef.current = true;
      
      joinMatch(matchId).catch((error) => {
        console.error("Auto-join failed:", error);
        hasAutoJoinedRef.current = false;
      });
    }
  }, [
    match?._id,
    match?.collaborativeMode,
    currentMatchId,
    collaborativeMode,
    restoreCollaborativeModeFromMatch,
    joinMatch
  ]);

 

 // Handle player drag and drop - now calls parent function
    const handlePlayerDrop = useCallback(async (draggedPlayerIndex, targetSlotIndex) => {
    if (draggedPlayerIndex === targetSlotIndex) return;
    
    // Swap players AND their position labels
    const newCourtPlayers = [...courtPlayers];
    const newPositionLabels = [...positionLabels];
    
    // Get the position labels that should swap
    const draggedPosition = newPositionLabels[draggedPlayerIndex];
    const targetPosition = newPositionLabels[targetSlotIndex];
    
    // Swap the players and update their expressPosition properties
    const draggedPlayer = newCourtPlayers[draggedPlayerIndex];
    const targetPlayer = newCourtPlayers[targetSlotIndex];
    
    // Update expressPosition on the players themselves so it persists
    if (draggedPlayer && draggedPlayer._id) {
      draggedPlayer.expressPosition = targetPosition;
    }
    if (targetPlayer && targetPlayer._id) {
      targetPlayer.expressPosition = draggedPosition;
    }
    
    newCourtPlayers[draggedPlayerIndex] = targetPlayer;
    newCourtPlayers[targetSlotIndex] = draggedPlayer;
    
    // Swap the position labels
    newPositionLabels[draggedPlayerIndex] = targetPosition;
    newPositionLabels[targetSlotIndex] = draggedPosition;
    
    // Update state
    setCourtPlayers(newCourtPlayers);
    setPositionLabels(newPositionLabels);
    
  // 🔥 NEW: Save on lineup change with non-blocking save
  addActionLogEntry('Express: Lineup changed (player swap)', {
    type: 'lineup_change',
    players: [draggedPlayerIndex, targetSlotIndex]
  });
  triggerNonBlockingSave('lineup_change');
  
}, [courtPlayers, positionLabels, setCourtPlayers, addActionLogEntry, triggerNonBlockingSave]);

  // Handle multi-player block assist selection
  const handleBlockAssistSelection = useCallback((playerIndex) => {
    const player = courtPlayers[playerIndex];
    if (!player) return;
    
    setSelectedBlockPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerIndex)) {
        newSet.delete(playerIndex);
      } else {
        newSet.add(playerIndex);
      }
      return newSet;
    });
  }, [courtPlayers]);

  // Express-specific position rotation function
 // 🔥 FIXED: Express-specific position rotation function with collaborative sync
  const rotateExpressPositions = useCallback(() => {
    const positionRotationMap = {
      '1': '6', '6': '5', '5': '4', '4': '3', '3': '2', '2': '1'
    };
    
    // Rotate position labels attached to each player
    const updatedPlayers = courtPlayers.map(player => {
      if (player && player.expressPosition) {
        return {
          ...player,
          expressPosition: positionRotationMap[player.expressPosition] || player.expressPosition
        };
      }
      return player;
    });
    
    setCourtPlayers(updatedPlayers);
  
  // 🔥 NEW: Sync the rotation to other collaborative users
  if (collaborativeMode && isConnected) {
    syncCourtPlayers(updatedPlayers, {
      action: 'position_rotation',
      rotationType: 'clockwise',
      timestamp: new Date().toISOString()
    });
  }
  
  // FIXED: Use collaborative action log
  addActionLogEntry("Express: Position labels rotated", {
    type: 'rotation',
    meta: { source: 'express', type: 'position_rotation' }
  });
   triggerNonBlockingSave('rotation');
}, [courtPlayers, setCourtPlayers, addActionLogEntry, collaborativeMode, isConnected, syncCourtPlayers, triggerNonBlockingSave]);
  


 
 // ============================================================================
// COLLABORATIVE MODE - Removed ability to toggle/start collaborative mode
// Collaborative mode must be enabled via match configuration/settings
// Existing collaborative matches still work with full functionality
// ============================================================================
 
const handleDirectScoreAdjustment = useCallback((team, delta) => {
  // Update local state optimistically
  const newOurScore = team === 'our' ? Math.max(0, ourScore + delta) : ourScore;
  const newOpponentScore = team === 'opponent' ? Math.max(0, opponentScore + delta) : opponentScore;
  
  setOurScore(newOurScore);
  setOpponentScore(newOpponentScore);
  
  const message = `Manual score adjustment: ${team === 'our' ? 'Our' : 'Opponent'} team ${delta > 0 ? '+' : ''}${delta} (no stats affected)`;
  
  showActionToast(message, 'info');
  addActionLogEntry(message, {
    type: 'manual_score_adjustment',
    meta: { team, delta, statsAffected: false }
  });

  // Use the collaborative scoring path for ALL modes
  if (collaborativeMode && isConnected) {
    // Collaborative: emit socket event (server broadcasts back)
    updateCollaborativeScore(team, delta, 'manual_adjustment');
  } else {
    // Non-collaborative: direct database save
    if (currentMatchId && token) {
      axios.put(
        `${API_URL}/api/matches/${currentMatchId}`,
        {
          ourScore: newOurScore,
          opponentScore: newOpponentScore,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      ).catch(error => {
        console.error('Failed to save score:', error);
        showActionToast('Failed to save score', 'error');
      });
    }
  }
}, [
  ourScore,
  opponentScore,
  setOurScore,
  setOpponentScore,
  collaborativeMode,
  isConnected,
  updateCollaborativeScore,
  currentMatchId,
  token,
  showActionToast,
  addActionLogEntry
]);
 
const handleExpressRotation = useCallback(async () => {
  console.log("Express: Starting rotation check...");
  console.log("Current courtPlayers:", courtPlayers.map((p, i) => ({ 
      index: i, 
      name: p?.name, 
      isLibero: p?.isLibero,
      expressPosition: p?.expressPosition
  })));
  
  // Find any libero in position 5 that needs substitution before rotation
  let liberoToSub = null;
  let liberoSlotIndex = null;

  for (let i = 0; i < courtPlayers.length; i++) {
    const player = courtPlayers[i];
    if (player && player.isLibero && player.expressPosition === '5') {
      liberoToSub = player;
      liberoSlotIndex = i;
      console.log(`Libero ${player.name} in position 5 needs substitution before rotating to position 4`);
      break;
    }
  }

  // Handle libero substitution if needed
  if (liberoToSub && liberoToSub.replacedPlayer) {
    console.log("Performing automatic libero substitution before rotation");
    
    const libero = liberoToSub;
    const replacedPlayer = libero.replacedPlayer;
    
    try {
      // Update database - libero off court, replacement on court
      await axios.put(`${API_URL}/api/players/${libero._id}`, 
        { isOnCourt: false }, 
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        }
      );
      
      await axios.put(`${API_URL}/api/players/${replacedPlayer._id}`, 
        { isOnCourt: true }, 
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        }
      );
      
      // Update bench - add libero back to bench
      setBenchPlayers(prev => {
        const filtered = prev.filter(p => p._id !== libero._id);
        const updated = [...filtered, { ...libero, isOnCourt: false }];
        return updated.sort((a, b) => (a.number || 0) - (b.number || 0));
      });
      
      // Create the substituted court lineup
      const courtAfterSubstitution = [...courtPlayers];
      courtAfterSubstitution[liberoSlotIndex] = {
        ...replacedPlayer,
        expressPosition: libero.expressPosition, // Keep same position (5)
        isOnCourt: true
      };
      
      // NOW rotate the positions on the substituted lineup
      const positionRotationMap = {
        '1': '6', '6': '5', '5': '4', '4': '3', '3': '2', '2': '1'
      };
      
      const rotatedPlayers = courtAfterSubstitution.map(player => {
        if (player && player.expressPosition) {
          return {
            ...player,
            expressPosition: positionRotationMap[player.expressPosition] || player.expressPosition
          };
        }
        return player;
      });
      
      // Apply both substitution AND rotation in one update
      
      
      // FIXED: Use collaborative action log
      
      console.log(`Auto-substitution + rotation completed: ${replacedPlayer.name} now in position 4 after rotation`);
      
    } catch (error) {
      console.error("Libero auto-substitution failed:", error);
      // Fall back to regular rotation if substitution fails
      
    }
    
    return; // Exit here - both substitution and rotation are complete
  } 
  
  if (liberoToSub && !liberoToSub.replacedPlayer) {
    console.error("Libero needs substitution but has no replacedPlayer:", liberoToSub);
    alert(`Libero ${liberoToSub.name} needs to rotate out but has no replacement player recorded. This may indicate a setup issue.`);
    return;
  }
  
  // No libero substitution needed - do regular rotation
  console.log("No libero auto-substitution needed, performing regular rotation");
  
  
}, [courtPlayers, positionMapping, setBenchPlayers, addActionLogEntry, token, collaborativeMode, isConnected, syncCourtPlayers]);

const handleStartBlockSelection = useCallback(async (playerIndex, blockType) => {
  const player = courtPlayers[playerIndex];
  if (!player) return;
  
  

  
  // Set block mode and track which player initiated
  setBlockMode(blockType);
  setBlockInitiatorIndex(playerIndex);
  setSelectedBlockPlayers(new Set([playerIndex]));
  
  // Emit collaborative event
  if (collaborativeMode && isConnected && socket) {
    const selectedPlayersData = [{
      _id: player._id,
      name: player.name,
      number: player.number,
      index: playerIndex
    }];
    
    socket.emit('block_selection_started', {
      matchId: currentMatchId,
      selectedPlayers: selectedPlayersData,
      blockType,
      initiatedBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }
  
  showActionToast(`Selecting players for block ${blockType}`, 'info');
}, [
  courtPlayers,  
  getVolleyballPosition, 
  collaborativeMode, 
  isCollaborativeReady, 
  getTrackingStatus,
  isConnected,
  socket,
  currentMatchId,
  getCurrentUserId,
  getCurrentUsername,
  showActionToast
]);

const handleBlockPlayerToggle = useCallback((playerIndex) => {
  if (!blockMode) return;
  
  const player = courtPlayers[playerIndex];
  if (!player) return;
  
  
  // ✅ NO POSITION CHECKS - Allow toggling any non-libero player for blocks
  
  setSelectedBlockPlayers(prev => {
    const newSet = new Set(prev);
    if (newSet.has(playerIndex)) {
      newSet.delete(playerIndex);
    } else {
      newSet.add(playerIndex);
    }
    return newSet;
  });
}, [
  blockMode,
  courtPlayers,
  getVolleyballPosition,
  showActionToast
]);


const submitBlock = useCallback(async () => {
  if (!blockMode || selectedBlockPlayers.size === 0) return;
  
  // ✅ CHECK COOLDOWN FIRST
  if (collaborativeMode && scoreCooldownActive) {
    console.warn('⏱️ Block action blocked - scoring cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before block actions`, 'warning');
    return;
  }
  
  console.log(`🎯 Processing block ${blockMode} for ${selectedBlockPlayers.size} players`);

  
  const processedPlayers = [];
  const statType = blockMode === 'assist' ? 'blockAssist' : 'blockErrors';
  const pointValue = blockMode === 'assist' ? 0.5 : 0;
  
  // Process each player
  for (const playerIndex of selectedBlockPlayers) {
    const player = courtPlayers[playerIndex];
    
    if (!player || !player._id || player.name === "?") {
      console.warn(`Skipping invalid player at index ${playerIndex}`);
      continue;
    }
    
    try {
      // Log block stat
      await logStat(
        player, 
        blockMode === 'assist' ? "Block Assist" : "Block Error",
        [statType],
        `${player.name} (#${player.number}) → Block ${blockMode === 'assist' ? 'Assist' : 'Error'}`
      );
      
      // Award points for block assist only
      if (blockMode === 'assist' && pointValue > 0) {
        if (collaborativeMode && isCollaborativeReady()) {
          await logCollaborativeStat(player._id, "Block Assist Points", pointValue, {
            statKeys: ["points"],
            actionText: `${player.name} (#${player.number}) → Block Assist Points (${pointValue})`,
            playerName: player.name,
            playerNumber: player.number,
            isPointsOnly: true
          });
        } else {
          await axios.post(`${API_URL}/api/players/${player._id}/stats`, {
            points: pointValue,
            matchId: currentMatchId,
          }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
        }
      }
      
      processedPlayers.push(player);
      
      if (collaborativeMode && selectedBlockPlayers.size > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`Failed to process block ${blockMode} for ${player.name}:`, error);
    }
  }
  
  if (processedPlayers.length === 0) {
    console.error('No players were successfully processed');
    showActionToast('Failed to record block', 'error');
    return;
  }
  
  // Update score
  if (blockMode === 'assist') {
    
    setTeamStats && setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));
    
    if (collaborativeMode && isConnected) {
      updateCollaborativeScore('our', 1, 'earned');
    }
  } else {
    
    setTeamStats && setTeamStats(prev => ({ ...prev, ourError: prev.ourError + 1 }));
    
    if (collaborativeMode && isConnected) {
      updateCollaborativeScore('opponent', 1, 'our_error');
    }
  }
  
  // Emit completion event
  if (collaborativeMode && isConnected && socket) {
    socket.emit('block_completed', {
      matchId: currentMatchId,
      players: processedPlayers.map(p => ({
        _id: p._id,
        name: p.name,
        number: p.number
      })),
      blockType: blockMode,
      completedBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }
  
  const playerNames = processedPlayers.map(p => `${p.name} (#${p.number})`).join(', ');
  addActionLogEntry(
    `Block ${blockMode === 'assist' ? 'Assist' : 'Error'} by: ${playerNames}`,
    {
      type: `block_${blockMode}`,
      meta: {
        type: `block_${blockMode}`,
        playerCount: processedPlayers.length,
        pointsPerPlayer: pointValue
      }
    }
  );
  
  setBlockMode(null);
  setBlockInitiatorIndex(null);
  setSelectedBlockPlayers(new Set());
  
  showActionToast(
    `Block ${blockMode} recorded for ${processedPlayers.length} player(s)`, 
    blockMode === 'assist' ? 'success' : 'warning'
  );
}, [
  blockMode,
  selectedBlockPlayers,
  courtPlayers,
  collaborativeMode,
  isConnected,
  isCollaborativeReady,
  logStat,
  logCollaborativeStat,
  setTeamStats,
  updateCollaborativeScore,
  handleExpressRotation,
  socket,
  scoreCooldownActive,
  scoreCooldownRemaining,
  currentMatchId,
  getCurrentUserId,
  getCurrentUsername,
  addActionLogEntry,
  showActionToast,
  token
]);

const cancelBlock = useCallback(() => {
  if (collaborativeMode && isConnected && socket && currentMatchId) {
    socket.emit('block_cancelled', {
      matchId: currentMatchId,
      cancelledBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }
  
  setBlockMode(null);
  setSelectedBlockPlayers(new Set());
  showActionToast('Block selection cancelled', 'info');
}, [collaborativeMode, isConnected, socket, currentMatchId, getCurrentUserId, getCurrentUsername, showActionToast]);


const handleAssistTimeout = useCallback(async () => {
  // ✅ Set flag FIRST
  assistKillSelectedRef.current = true;
  
  // ✅ Clear timer
  if (assistTimerRef.current) {
    clearTimeout(assistTimerRef.current);
    assistTimerRef.current = null;
  }
  
  if (!assistWaitingPlayer) {
    console.log('Timeout cancelled - no assist player');
    setCollaborativeAssistWaiting(false);
    setAssistWaitingPlayer(null);
    setAssistWaitingTimer(0);
    return;
  }
  
  // ✅ CHECK COOLDOWN FIRST
  if (collaborativeMode && scoreCooldownActive) {
    console.warn('⏱️ Assist timeout blocked - scoring cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before scoring`, 'warning');
    assistKillSelectedRef.current = false;
    return;
  }
  
  // ✅ Clear overlay state IMMEDIATELY
  setCollaborativeAssistWaiting(false);
  setAssistWaitingTimer(0);

  
  const player = assistWaitingPlayer;
  
  setAssistWaitingPlayer(null);
  
  const currentUserId = getCurrentUserId();
  const trackingStatus = getTrackingStatus(player._id);
  const isInitiator = trackingStatus?.isMe || trackingStatus?.trackedByUserId === currentUserId;
  
  if (!isInitiator) {
    console.log('Not the initiator - skipping timeout handling');
    setTimeout(() => {
      assistKillSelectedRef.current = false;
    }, 500);
    return;
  }
  
  console.log('Initiator handling assist timeout - assist already logged, just scoring point');
  
  // ✅ DON'T LOG ASSIST AGAIN - it was already logged when button was clicked
  // Just award the earned point
  
  
  setTeamStats && setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));
  
  if (collaborativeMode && isConnected) {
    updateCollaborativeScore('our', 1, 'earned');
  }
  
  addActionLogEntry(
    `Assist by ${player.name} (#${player.number}) → Earned point (10s timeout, no kill recorded)`,
    {
      type: 'assist_timeout',
      meta: {
        type: 'assist_timeout',
        assistPlayer: { id: player._id, name: player.name, number: player.number }
      }
    }
  );
  
  showActionToast('Point awarded - no kill within 10s', 'info');
  
  setTimeout(() => {
    assistKillSelectedRef.current = false;
  }, 1000);
}, 
 [
  assistWaitingPlayer,  
  logStat, 
  setTeamStats, 
  collaborativeMode, 
  isConnected, 
  updateCollaborativeScore, 
  handleExpressRotation, 
  addActionLogEntry, 
  showActionToast,
  getCurrentUserId,
  getTrackingStatus,
  scoreCooldownActive,
  scoreCooldownRemaining
]);

useEffect(() => {
  // ✅ Exit early if flag is set
  if (assistKillSelectedRef.current) {
    if (assistTimerRef.current) {
      clearTimeout(assistTimerRef.current);
      assistTimerRef.current = null;
    }
    return;
  }
  
  if (collaborativeAssistWaiting && assistWaitingTimer > 0) {
    assistTimerRef.current = setTimeout(() => {
      setAssistWaitingTimer(prev => prev - 1);
    }, 1000);
  } else if (collaborativeAssistWaiting && assistWaitingTimer === 0 && !assistKillSelectedRef.current) {
    // Only timeout if kill wasn't manually selected
    handleAssistTimeout();
  }
  
  return () => {
    if (assistTimerRef.current) {
      clearTimeout(assistTimerRef.current);
	  assistTimerRef.current = null; 
    }
  };
}, [collaborativeAssistWaiting, assistWaitingTimer, handleAssistTimeout]);


const handleBlockTimeout = useCallback(() => {
  console.log('⏰ Block selection timed out');
  
  // Clear all block waiting state
  setCollaborativeBlockWaiting(false);
  setBlockWaitingPlayers([]);
  setBlockWaitingType(null);
  setBlockWaitingInitiator(null);
  setBlockWaitingTimer(0);
  
  // Clear the timer ref
  if (blockWaitingTimerRef.current) {
    clearTimeout(blockWaitingTimerRef.current);
    blockWaitingTimerRef.current = null;
  }
  
  // Emit timeout event to notify other users
  if (collaborativeMode && isConnected && socket && currentMatchId) {
    socket.emit('block_timeout', {
      matchId: currentMatchId,
      timestamp: new Date().toISOString(),
      timedOutBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      }
    });
  }
  
  // Show notification
  showActionToast('Block selection timed out', 'warning');
  
  // If in local block mode, also clear that
  if (blockMode) {
    setBlockMode(null);
    setSelectedBlockPlayers(new Set());
  }
}, [
  collaborativeMode,
  isConnected,
  socket,
  currentMatchId,
  getCurrentUserId,
  getCurrentUsername,
  showActionToast,
  blockMode
]);

useEffect(() => {
  return () => {
    // Cleanup on unmount
    if (assistTimerRef.current) {
      clearTimeout(assistTimerRef.current);
      assistTimerRef.current = null;
    }
    assistKillSelectedRef.current = false;
  };
}, []);

  // Submit block assist for all selected players
  
const ignoreKill = useCallback(async (assistPlayerIndex = null) => {
  const playerIndex = assistPlayerIndex ?? selectedAssistPlayer;
  if (playerIndex === null) return;
  
  // ✅ CHECK COOLDOWN FIRST
  if (collaborativeMode && scoreCooldownActive) {
    console.warn('⏱️ Ignore kill blocked - scoring cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before scoring`, 'warning');
    return;
  }
  
  const assistPlayer = courtPlayers[playerIndex];
  
  if (!assistPlayer) return;
  
  // Build assist stat keys with zone tracking
  const assistStatKeys = ["sets", "assists"];
  
  if (selectedAssistDistribution === 'outside') {
    assistStatKeys.push('setOutside');
    assistStatKeys.push('assistOutside');
  } else if (selectedAssistDistribution === 'middle') {
    assistStatKeys.push('setMiddle');
    assistStatKeys.push('assistMiddle');
  } else if (selectedAssistDistribution === 'rightside') {
    assistStatKeys.push('setRightside');
    assistStatKeys.push('assistRightside');
  } else if (selectedAssistDistribution === 'backrow') {
    assistStatKeys.push('setBackrow');
    assistStatKeys.push('assistBackrow');
  }
  
  // Use logStat for collaborative sync
  await logStat(assistPlayer, "Assist", assistStatKeys, 
    `${assistPlayer.name} (#${assistPlayer.number}) → Assist (Kill ignored)`);
  
  // 🔥 FIXED: ALWAYS update local score immediately for responsive UX
  setTeamStats && setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));
  
  // 🔥 THEN send collaborative update to other users
  if (collaborativeMode && isConnected) {
    const collaborativeSuccess = updateCollaborativeScore('our', 1, 'earned');
    if (!collaborativeSuccess) {
      console.warn('Failed to send collaborative score update to other users');
    }
  }
  
  // Add action log entry for ignored kill
  addActionLogEntry(
    `Assist by ${assistPlayer.name} (#${assistPlayer.number}) → Kill ignored (inactive player or other reason)`,
    {
      type: 'assist_kill_ignored',
      meta: {
        type: 'assist_kill_ignored',
        assistPlayer: { id: assistPlayer._id, name: assistPlayer.name, number: assistPlayer.number },
        reason: 'kill_ignored'
      }
    }
  );
  
  // Exit assist mode
  setAssistMode(false);
  setSelectedAssistPlayer(null);
  setAssistInitiatorIndex(null);
  setSelectedActionFamily(null);
}, [
  selectedAssistPlayer,
  selectedAssistDistribution,
  courtPlayers,
  collaborativeMode,
  isConnected,
  updateCollaborativeScore,
  setTeamStats,
  addActionLogEntry,
  logStat,
  currentMatchId,
  match?.teamName,
  handleExpressRotation,
  scoreCooldownActive,
  scoreCooldownRemaining,
  showActionToast
]);

const submitBlockAssist = useCallback(async () => {
  if (selectedBlockPlayers.size === 0) return;
  
  // ✅ CHECK COOLDOWN FIRST
  if (collaborativeMode && scoreCooldownActive) {
    console.warn('⏱️ Block assist blocked - scoring cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before block actions`, 'warning');
    return;
  }
  
   if (collaborativeMode && isConnected && socket) {
    const selectedPlayersData = Array.from(selectedBlockPlayers).map(index => {
      const player = courtPlayers[index];
      return {
        _id: player._id,
        name: player.name,
        number: player.number,
        index: index
      };
    });
    
    socket.emit('block_selection_started', {
      matchId: currentMatchId,
      selectedPlayers: selectedPlayersData,
      blockType: 'assist',
      initiatedBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }
  
  console.log('🏐 Block Assist: Processing', selectedBlockPlayers.size, 'players');
  console.log('🏐 Selected player indices:', Array.from(selectedBlockPlayers));
  
  const playerNames = [];
  const processedPlayers = [];
  
  // Process each player individually with error handling
  for (const playerIndex of selectedBlockPlayers) {
    const player = courtPlayers[playerIndex];
    console.log(`🏐 Processing player ${playerIndex}:`, player?.name);
    
    if (!player || !player._id || !player.name || player.name === "?") {
      console.warn(`🏐 Skipping invalid player at index ${playerIndex}:`, player);
      continue;
    }
    
    try {
      // Log the block assist stat
      console.log(`🏐 Logging block assist for ${player.name}...`);
      await logStat(player, "Block Assist", ["blockAssist"], 
        `${player.name} (#${player.number}) → Block Assist`);
      
      // Award 0.5 points through collaborative system when available
      if (collaborativeMode && isCollaborativeReady()) {
        console.log(`🏐 Awarding collaborative 0.5 points to ${player.name}...`);
        try {
          const pointsSuccess = await logCollaborativeStat(player._id, "Block Assist Points", 0.5, {
            statKeys: ["points"],
            actionText: `${player.name} (#${player.number}) → Block Assist Points (0.5)`,
            playerName: player.name,
            playerNumber: player.number,
            isPointsOnly: true
          });
          
          if (!pointsSuccess) {
            console.warn(`🏐 Collaborative points failed for ${player.name}, using direct API`);
            await axios.post(`${API_URL}/api/players/${player._id}/stats`, {
              points: 0.5,
              matchId: currentMatchId,
            }, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              withCredentials: true,
            });
          }
        } catch (collaborativeError) {
          console.error(`🏐 Collaborative error for ${player.name}:`, collaborativeError);
          // Fallback to direct API
          await axios.post(`${API_URL}/api/players/${player._id}/stats`, {
            points: 0.5,
            matchId: currentMatchId,
          }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
        }
      } else {
        console.log(`🏐 Non-collaborative: Awarding 0.5 points to ${player.name}...`);
        await axios.post(`${API_URL}/api/players/${player._id}/stats`, {
          points: 0.5,
          matchId: currentMatchId,
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        });
      }
      
      console.log(`✅ Block assist complete for ${player.name}`);
      playerNames.push(`${player.name} (#${player.number})`);
      processedPlayers.push(player);
      
      // Small delay between players to avoid overwhelming the collaborative system
      if (collaborativeMode && selectedBlockPlayers.size > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`❌ Failed to process block assist for ${player.name}:`, error);
      // Continue with other players even if one fails
    }
  }
  
  console.log(`🏐 Block assist completed for ${processedPlayers.length}/${selectedBlockPlayers.size} players`);
  
  // Only proceed with scoring if at least one player was processed
  if (processedPlayers.length === 0) {
    console.error('🏐 No players were successfully processed for block assist');
    return;
  }
  
  // Update score and game state
  setTeamStats && setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));
  
  if (collaborativeMode && isConnected) {
    const collaborativeSuccess = updateCollaborativeScore('our', 1, 'earned');
    if (!collaborativeSuccess) {
      console.warn('Failed to send collaborative score update to other users');
    }
  }
  if (collaborativeMode && isConnected && socket) {
    socket.emit('block_completed', {
      matchId: currentMatchId,
      players: processedPlayers.map(p => ({
        _id: p._id,
        name: p.name,
        number: p.number
      })),
      blockType: 'assist',
      completedBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }  
  
  addActionLogEntry(
    `Block Assist (0.5 pts each) by: ${playerNames.join(', ')}`,
    {
      type: 'block_assist',
      meta: {
        type: 'block_assist',
        playerCount: processedPlayers.length,
        selectedCount: selectedBlockPlayers.size,
        pointsPerPlayer: 0.5
      }
    }
  );
  
  setBlockMode(null);
  setSelectedBlockPlayers(new Set());
}, [
  selectedBlockPlayers, 
  courtPlayers, 
  collaborativeMode,
  isConnected,
  isCollaborativeReady,
  logCollaborativeStat,
  updateCollaborativeScore, 
  setTeamStats, 
  addActionLogEntry,
  logStat,
  currentMatchId, 
  token,
  handleExpressRotation,
  scoreCooldownActive,
  scoreCooldownRemaining,
  showActionToast
]);

  // Cancel block assist mode
const cancelBlockAssist = useCallback(() => {
  // EMIT CANCEL EVENT for collaborative users
  if (collaborativeMode && isConnected && socket) {
    socket.emit('block_cancelled', {
      matchId: currentMatchId,
      cancelledBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }
  
  setBlockMode(null);
  setBlockInitiatorIndex(null);
  setSelectedBlockPlayers(new Set());
}
, []);

  // Kill/Assist selection helpers (same pattern as block)
  const DraggablePlayerCard = ({ player, index, children }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
      type: "EXPRESS_PLAYER",
      item: { playerIndex: index },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }), [index]);

    return (
      <div
        ref={drag}
        style={{
          opacity: isDragging ? 0.5 : 1,
          cursor: player ? (isDragging ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {children}
      </div>
    );
  };

  // Droppable Slot Component  
  const DroppableSlot = ({ index, children }) => {
    const [{ isOver }, drop] = useDrop(() => ({
      accept: "EXPRESS_PLAYER",
      drop: (item) => {
        moveByUiIndex(item.playerIndex, index)
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
      }),
    }), [index, handlePlayerDrop]);

    return (
      <div
        ref={drop}
        style={{
          backgroundColor: isOver ? 'rgba(0, 122, 255, 0.1)' : 'transparent',
          borderRadius: '8px',
          transition: 'background-color 0.2s ease',
          border: isOver ? '2px dashed #007AFF' : '2px solid transparent',
          position: 'relative',
        }}
      >
        {isOver && (
          <div style={{
            position: 'absolute',
            top: '-25px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#007AFF',
            color: 'white',
            padding: '2px 0px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '600',
            zIndex: 10,
            whiteSpace: 'nowrap'
          }}>
            Will bring dragged player here
          </div>
        )}
        {children}
      </div>
    );
  };

  // ========================================================================
  // NEW: Fetch all roster players and initialize on/off status
  // ========================================================================
  useEffect(() => {
  const fetchRoster = async () => {
    if (!match?.teamName) return;

    try {
      const response = await axios.get(`${API_URL}/api/players`, {
        params: { team: match.teamName },
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const roster = response.data || [];
      setAllRosterPlayers(roster);

      const savedStatus = match?.expressSettings?.playerOnOffStatus || null;

      if (savedStatus !== null) {
        const hydratedStatus = {};
        roster.forEach(player => {
          hydratedStatus[player._id] = !!savedStatus[player._id];
        });
        setPlayerOnOffStatus(hydratedStatus);

        const savedOnPlayers = roster.filter(player => hydratedStatus[player._id]);

        setCourtPlayers(prevCourtPlayers => {
          const existingRealPlayers = (prevCourtPlayers || []).filter(
            p => p && p._id && p.name !== "?"
          );

          const orderedPlayers = existingRealPlayers
            .filter(p => hydratedStatus[p._id])
            .concat(
              savedOnPlayers.filter(
                rp => !existingRealPlayers.some(cp => cp._id === rp._id)
              )
            )
            .slice(0, 6);

          return orderedPlayers;
        });
      } else {
        const inferredStatus = {};
        roster.forEach(player => {
          const isInCourt = courtPlayers.some(cp => cp?._id === player._id);
          inferredStatus[player._id] = isInCourt;
        });
        setPlayerOnOffStatus(inferredStatus);
      }
    } catch (error) {
      console.error('Failed to fetch roster:', error);
    }
  };

  fetchRoster();
}, [match?._id, match?.teamName, match?.currentSet, token]);
  // ========================================================================
  // NEW: Handle player ON/OFF toggle
  // ========================================================================
const handlePlayerToggle = useCallback(async (playerId) => {
  // In collaborative mode, prevent toggling players assigned to others
  if (collaborativeMode && user?.id) {
    const trackingStatus = getTrackingStatus(playerId);
    if (trackingStatus?.isAssigned && !trackingStatus?.isMe) {
      showActionToast(`This player is being tracked by ${trackingStatus.trackedBy}`, 'warning');
      return;
    }
  }

  const wasOn = !!playerOnOffStatus[playerId];
  const currentOnCount = Object.values(playerOnOffStatus).filter(Boolean).length;

  if (!wasOn && currentOnCount >= 6) {
    showActionToast('Maximum 6 players on court. Turn OFF a player first.', 'warning');
    return;
  }

  const rosterPlayer = allRosterPlayers.find(p => p._id === playerId);
  if (!rosterPlayer) return;

  const turningOn = !wasOn;
  const newStatus = { ...playerOnOffStatus, [playerId]: turningOn };

  setPlayerOnOffStatus(newStatus);

  let updatedCourtPlayers;
  
  if (turningOn) {
    setCourtPlayers(prevPlayers => {
      if (prevPlayers.some(p => p?._id === playerId)) {
        updatedCourtPlayers = prevPlayers;
        return prevPlayers;
      }
      updatedCourtPlayers = [...prevPlayers.filter(Boolean), rosterPlayer];
      return updatedCourtPlayers;
    });

    // Credit once per set
    if (typeof maybeCreditGamesPlayed === 'function') {
      await maybeCreditGamesPlayed(playerId, false, 'express_player_toggle_on');
    }
  } else {
    setCourtPlayers(prevPlayers => {
      updatedCourtPlayers = prevPlayers.filter(p => p?._id !== playerId);
      return updatedCourtPlayers;
    });
  }
  
  // Sync to collaborative users after state update
  if (collaborativeMode && isConnected && syncCourtPlayers && updatedCourtPlayers) {
    console.log(`🔄 Syncing player toggle: ${rosterPlayer.name} ${turningOn ? 'ON' : 'OFF'}`);
    syncCourtPlayers(updatedCourtPlayers, {
      action: turningOn ? 'player_toggle_on' : 'player_toggle_off',
      playerId: playerId,
      playerName: rosterPlayer.name,
      playerNumber: rosterPlayer.number,
      timestamp: new Date().toISOString()
    });
    
    // Sync the playerOnOffStatus via syncExpressSettings
    if (syncExpressSettings) {
      syncExpressSettings({
        playerOnOffStatus: newStatus,
        passGradingEnabled,
        setDistributionTrackingEnabled,
        attackTypeTrackingEnabled,
        scoringEnabled
      }, {
        action: turningOn ? 'player_toggle_on' : 'player_toggle_off',
        playerId: playerId,
        playerName: rosterPlayer.name
      });
      console.log(`📡 Synced express settings for player toggle`);
    }
  }

  if (setMatchSettings) {
    setMatchSettings(prevMatch => ({
      ...prevMatch,
      expressSettings: {
        ...(prevMatch?.expressSettings || {}),
        passGradingEnabled,
        setDistributionTrackingEnabled,
        attackTypeTrackingEnabled,
        scoringEnabled,
        playerOnOffStatus: newStatus,
      },
    }));
  }

  triggerNonBlockingSave('express_player_toggle');
}, [
  collaborativeMode,
  getTrackingStatus,
  playerOnOffStatus,
  allRosterPlayers,
  setCourtPlayers,
  maybeCreditGamesPlayed,
  setMatchSettings,
  passGradingEnabled,
  setDistributionTrackingEnabled,
  attackTypeTrackingEnabled,
  scoringEnabled,
  triggerNonBlockingSave,
  showActionToast,
  isConnected,
  syncCourtPlayers,
  syncExpressSettings
]);
// ========================================================================
  // HELPER: Get current server player info
  // ========================================================================



  useEffect(() => {
    if (!currentMatchId || !currentUserId) return;
    
    // Only save if we have actual players (not just empty slots)
    const hasPlayers = courtPlayers.some(p => p && p._id);
    if (!hasPlayers) return;
    
    const storageKey = `slotOrder_${currentUserId}_${currentMatchId}`;
    
    // Save the order of player IDs in their current slots
    const slotOrder = courtPlayers.map(p => p?._id || null);
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(slotOrder));
    } catch (error) {
      console.error('Failed to save slot order:', error);
    }
  }, [courtPlayers, currentMatchId, currentUserId]);

  // Track which match we've loaded slot order for
  const loadedSlotOrderForMatchRef = useRef(null);

  // Load saved slot order from localStorage when match changes
  useEffect(() => {
    if (!currentMatchId || !currentUserId) return;
    
    // Only load once per match
    if (loadedSlotOrderForMatchRef.current === currentMatchId) return;
    
    const storageKey = `slotOrder_${currentUserId}_${currentMatchId}`;
    
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        loadedSlotOrderForMatchRef.current = currentMatchId;
        return;
      }
      
      const savedOrder = JSON.parse(saved);
      if (!Array.isArray(savedOrder) || savedOrder.length !== 6) {
        loadedSlotOrderForMatchRef.current = currentMatchId;
        return;
      }
      
      // Small delay to ensure courtPlayers are populated
      setTimeout(() => {
        setCourtPlayers(current => {
          // Reorder courtPlayers to match the saved slot order
          const reordered = savedOrder.map(savedId => {
            if (!savedId) return EMPTY_PLAYER;
            return current.find(p => p?._id === savedId) || EMPTY_PLAYER;
          });
          
          // Only apply if it's actually different and we have players
          const hasPlayers = reordered.some(p => p && p._id);
          const isDifferent = reordered.some((p, i) => p?._id !== current[i]?._id);
          
          if (hasPlayers && isDifferent) {
            return reordered;
          }
          return current;
        });
        
        loadedSlotOrderForMatchRef.current = currentMatchId;
      }, 100);
      
    } catch (error) {
      console.error('Failed to load slot order:', error);
      loadedSlotOrderForMatchRef.current = currentMatchId;
    }
  }, [currentMatchId, currentUserId, setCourtPlayers]);

  // Format player action for logging 

 // Handle player actions - updated to use courtPlayers

const handlePlayerAction = useCallback(async (playerIndex, actionType, passGrade = null, setDistribution = null, attackType = null) => {
  const player = courtPlayers[playerIndex];
  if (!player) return;
  setLastTouchedPlayerId(player._id);
  // Don't require isPlayerActive check - roster players toggled ON should be able to log stats
  
    if (actionType === "OPEN_SERVE") {
    setSelectedActionFamily("SERVE");
    setSelectedPlayerForActions(playerIndex);
    return;
  }

  if (actionType === "OPEN_RECEIVE") {
    setSelectedActionFamily("RECEIVE");
    setSelectedPlayerForActions(playerIndex);
    return;
  }

  if (actionType === "OPEN_SET") {
    setSelectedActionFamily("SET");
    setSelectedPlayerForActions(playerIndex);
    return;
  }

  if (actionType === "OPEN_ATTACK") {
    setSelectedActionFamily("ATTACK");
    setSelectedPlayerForActions(playerIndex);
    return;
  }

  if (actionType === "OPEN_BLOCK") {
    setSelectedActionFamily("BLOCK");
    setSelectedPlayerForActions(playerIndex);
    return;
  }

  if (actionType === "BACK_TO_ACTIONS") {
    setSelectedActionFamily(null);
    setSelectedPlayerForActions(null);
    return;
  }

  // ✅ CHECK COOLDOWN FIRST - Block scoring actions during cooldown
const scoringActions = ['ACE', 'KILL', 'SOLO_BLOCK', 'SERVE_ERR', 'REC_ERR', 
                        'DIG_ERR', 'SET_ERR', 'ATTACK_ERR', 'BLOCK_ERR'];

// Allow KILL during assist flow (it's just selecting the kill player, not scoring yet)
const isKillDuringAssist = actionType === 'KILL' && collaborativeAssistWaiting && assistWaitingPlayer;

if (collaborativeMode && scoreCooldownActive && scoringActions.includes(actionType) && !isKillDuringAssist) {
  console.warn('⏱️ Action blocked - scoring cooldown active');
  showActionToast(`Wait ${scoreCooldownRemaining}s before scoring actions`, 'warning');
  triggerActionFeedback(`player-${playerIndex}-${actionType}`, 'error');
  return;
}

  if (assignmentInProgress) return;

  // Check collaborative permissions and handle auto-assignment
if (collaborativeMode) {
  const trackingStatus = getTrackingStatus(player._id);
    console.log(`📋 Tracking status for ${player.name}:`, trackingStatus);

  // ✅ CASE 1: Player is already assigned to ME - just continue with action
  if (trackingStatus?.isAssigned && trackingStatus?.isMe) {
    console.log(`✅ ${player.name} already assigned to me - continuing`);
    // Fall through to execute action
  }
  // ✅ CASE 2: Player is assigned to SOMEONE ELSE - block the action
  else if (trackingStatus?.isAssigned && !trackingStatus?.isMe) {
    console.log(`❌ ${player.name} assigned to ${trackingStatus.trackedBy} - blocking`);
    alert(`${player.name} is being tracked by ${trackingStatus.trackedBy}. You cannot perform actions for this player.`);
    return;
	
  }
  // ✅ CASE 3: Player is NOT assigned - auto-assign now
 else if (!trackingStatus?.isAssigned) {
  console.log(`🔄 ${player.name} unassigned - auto-assigning`);
  setAssignmentInProgress(true);
  
  try {
    const userId = getCurrentUserId();
    const username = getCurrentUsername();
    
    if (!userId) {
      showActionToast('User authentication required', 'error');
      setAssignmentInProgress(false);
      return;
    }

    const response = await axios.post(`${API_URL}/api/matches/${currentMatchId}/assign-player`, {
      playerId: player._id,
      playerName: player.name,
      assignedToUserId: userId,
      assignedToUsername: username
    }, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      withCredentials: true
    });
    
    // 🔥 NEW: Check for conflict response
    if (response.data.error === 'ASSIGNMENT_CONFLICT') {
      console.warn(`⚠️ ${player.name} already assigned to ${response.data.currentAssignment?.assignedTo?.username}`);
      showActionToast(
        `${player.name} is being tracked by ${response.data.currentAssignment?.assignedTo?.username}`, 
        'error'
      );
      
      // Reload assignments to get latest state
      if (loadAssignmentsFromBackend) {
        await loadAssignmentsFromBackend();
      }
      
      setAssignmentInProgress(false);
      return; // ABORT - don't continue with action
    }
    
    showActionToast(`Auto-assigned to track ${player.name}`, 'info');
    
    if (loadAssignmentsFromBackend) {
      await loadAssignmentsFromBackend();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } catch (error) {
    // 🔥 NEW: Handle 409 Conflict status
    if (error.response?.status === 409) {
      const conflictData = error.response.data;
      console.warn('⚠️ Assignment conflict:', conflictData.message);
      
      showActionToast(
        `${player.name} is being tracked by ${conflictData.currentAssignment?.assignedTo?.username}`, 
        'error'
      );
      
      // Reload assignments to sync state
      if (loadAssignmentsFromBackend) {
        await loadAssignmentsFromBackend();
      }
      
      setAssignmentInProgress(false);
      return; // ABORT - don't continue with action
    }
    
    console.error('❌ Auto-assignment failed:', error);
    showActionToast('Auto-assignment failed, continuing with action', 'warning');
  } finally {
    setAssignmentInProgress(false);
  }
}
}

// Now execute the actual action)
  
  // Special handling for starting block assist and assist mode

  if (actionType === 'ASSIST_BLOCK') {
    handleStartBlockSelection(playerIndex, 'assist');
    setSelectedActionFamily(null);
    return;
  }
  
  if (actionType === 'ERROR_BLOCK') {
    handleStartBlockSelection(playerIndex, 'error');
	 setSelectedActionFamily(null);
    return;
  }


if (actionType === 'ASSIST') {
  // Check if there are any other ON players besides the assist player
  const otherOnPlayers = courtPlayers.filter((p, idx) => {
    return (
      p && 
      p.name !== "?" && 
      p._id && 
      idx !== playerIndex && // Don't include the assisting player
      playerOnOffStatus[p._id] === true // Only ON players
    );
  });

  // If only one player is ON (the assist player), automatically ignore the kill
  if (otherOnPlayers.length === 0) {
    console.log('🎯 Only one player ON, auto-ignoring kill for assist');
    await ignoreKill(playerIndex);
    return;
  }

  // Otherwise, enter assist mode to select who got the kill
  setAssistMode(true);
  setSelectedAssistPlayer(playerIndex);
  setAssistInitiatorIndex(playerIndex);
  setSelectedActionFamily(null);

  if (collaborativeMode && isConnected && socket) {
    socket.emit('assist_selection_started', {
      matchId: currentMatchId,
      assistPlayer: {
        _id: player._id,
        name: player.name,
        number: player.number
      },
      initiatedBy: {
        userId: getCurrentUserId(),
        username: getCurrentUsername(),
        sessionId: socket.sessionId
      },
      timestamp: new Date().toISOString()
    });
  }

  return;
}

  let statKeys = [];
  let label = "";
  let shouldScore = null;
  let shouldRotate = false;

  switch (actionType) {
case 'SERVE':
  console.log('🎾 SERVE action triggered:', { player: player.name });
  label = "Serve Attempt";
  statKeys = ["serves", "zeroServes"];
  setSelectedActionFamily(null);
  break;
      
    case 'ACE':
      label = "Service Ace";
      statKeys = ["aces", "serves", "points"];
	   setSelectedActionFamily(null);
      break;
      
    case 'SERVE_ERR':
      label = "Service Error";
      statKeys = ["serveErrors", "serves"];
	  setSelectedActionFamily(null);
      break;
      
     case 'REC':
        label = "Reception";
        statKeys = ["receptions"];
        // NEW: map passGrade → receive_1/2/3
		if (passGrade === 0) statKeys.push('receive_0');
        else if (passGrade === 1) statKeys.push('receive_1');
        else if (passGrade === 2) statKeys.push('receive_2');
        else if (passGrade === 3) statKeys.push('receive_3');
		setSelectedActionFamily(null);
        break;
      
    case 'REC_ERR':
      label = "Reception Error";
      statKeys = ["receiveErrors", "receptions"];
	  statKeys.push('receive_0');
	  setSelectedActionFamily(null);
      break;
      
     

      case 'DIG':
        label = "Dig";
        statKeys = ["digs"];
        // NEW: map passGrade → dig_0/1/2/3
		if (passGrade === 0) statKeys.push('dig_0');
        else if (passGrade === 1) statKeys.push('dig_1');
        else if (passGrade === 2) statKeys.push('dig_2');
        else if (passGrade === 3) statKeys.push('dig_3');
		setSelectedActionFamily(null);
        break;
      
    case 'DIG_ERR':
      label = "Dig Error";
      statKeys = ["digErrors", "digs"];
	  statKeys.push('dig_0');
       setSelectedActionFamily(null);
      break;
      
case 'SET':
  label = "Set";
  statKeys = ["sets", "zeroSets"];
  if (setDistribution === 'outside') statKeys.push('setOutside');
  else if (setDistribution === 'middle') statKeys.push('setMiddle');
  else if (setDistribution === 'rightside') statKeys.push('setRightside');
  else if (setDistribution === 'backrow') statKeys.push('setBackrow');
  setSelectedActionFamily(null);
  break;

case 'SET_ERR':
  label = "Set Error";
  statKeys = ["setErrors", "sets"];

  if (setDistribution === 'outside') {
    statKeys.push('setOutsideErr');
    statKeys.push('setOutside');
  } else if (setDistribution === 'middle') {
    statKeys.push('setMiddleErr');
    statKeys.push('setMiddle');
  } else if (setDistribution === 'rightside') {
    statKeys.push('setRightsideErr');
    statKeys.push('setRightside');
  } else if (setDistribution === 'backrow') {
    statKeys.push('setBackrowErr');
    statKeys.push('setBackrow');
  }

  setSelectedActionFamily(null);
  break;
      
case 'ATTACK':
  if (attackType === 'freeball') {
    label = "Free Ball";
    statKeys = ["freeballs", "zeroAttacks"];
  } else {
    label = "Attack";
    statKeys = ["zeroAttacks", "attacks"];

    if (attackType === 'hit') statKeys.push('attackHit');
    else if (attackType === 'tip') statKeys.push('attackTip');
    else if (attackType === 'roll') statKeys.push('attackRoll');
    else if (attackType === 'dump') statKeys.push('attackDump');
  }
  setSelectedActionFamily(null);
  break;
      
case 'KILL':
  label = "Kill";
  statKeys = ["kills", "attacks", "points"];

  if (attackType === 'hit') {
    statKeys.push('killHit');
    statKeys.push('attackHit');
  } else if (attackType === 'tip') {
    statKeys.push('killTip');
    statKeys.push('attackTip');
  } else if (attackType === 'roll') {
    statKeys.push('killRoll');
    statKeys.push('attackRoll');
  } else if (attackType === 'freeball') {
    statKeys.push('freeballKills');
  } else if (attackType === 'dump') {
    statKeys.push('killDump');
    statKeys.push('attackDump');
  }

  setSelectedActionFamily(null);
  break;
      
case 'ATTACK_ERR':
  if (attackType === 'freeball') {
    label = "Free Ball Error";
    statKeys = ["freeballErrors", "freeballs"];
  } else {
    label = "Attack Error";
    statKeys = ["attackErrors", "attacks"];

    if (attackType === 'hit') {
      statKeys.push('attackErrorHit');
      statKeys.push('attackHit');
    } else if (attackType === 'tip') {
      statKeys.push('attackErrorTip');
      statKeys.push('attackTip');
    } else if (attackType === 'roll') {
      statKeys.push('attackErrorRoll');
      statKeys.push('attackRoll');
    } else if (attackType === 'dump') {
      statKeys.push('attackErrorDump');
      statKeys.push('attackDump');
    }
  }
  setSelectedActionFamily(null);
  break;
      
    case 'SOLO_BLOCK':
      label = "Solo Block";
      statKeys = ["blockSolo", "points"];
      shouldScore = "our";
       setSelectedActionFamily(null);
      break;
      
    case 'BLOCK_ERR':
      label = "Block Error";
      statKeys = ["blockErrors"];
       setSelectedActionFamily(null);
      break;
      
    default:
      return;
  }

  // Log the stat
  await logStat(player, label, statKeys);






}, [
  courtPlayers,  
  collaborativeMode, 
  scoreCooldownActive,
  scoreCooldownRemaining,
  triggerActionFeedback,
  isConnected,
  isAssignedToPlayer, 
  getTrackingStatus, 
  logStat, 
  updateCollaborativeScore,
  setTeamStats, 
  handleExpressRotation,
  assignmentInProgress,
  assignmentDeclinedPlayers,
  user,
  getCurrentUserId,
  getCurrentUsername,
  showActionToast,
  loadAssignmentsFromBackend,
  currentMatchId,
  token,
  collaborativeAssistWaiting,
  assistWaitingPlayer,
  handleStartBlockSelection
]);

const handleAssistDistributionSelect = useCallback(async (distribution) => {
  if (!pendingAssistDistribution) return;

  const { playerIndex, buttonId } = pendingAssistDistribution;
  const player = courtPlayers[playerIndex];

  setPendingAssistDistribution(null);
  if (!player) return;

  try {
    setSelectedAssistDistribution(distribution);
    await handlePlayerAction(playerIndex, 'ASSIST');

    if (buttonId) {
      triggerActionFeedback(buttonId, 'success');
    }

    showActionToast(
      `${player.name}: Assist (${distribution})`,
      'success'
    );
  } catch (error) {
    if (buttonId) {
      triggerActionFeedback(buttonId, 'error');
    }
    showActionToast(`Failed to record assist distribution`, 'error');
    console.error('Assist distribution action failed:', error);
  }
}, [
  pendingAssistDistribution,
  courtPlayers,
  handlePlayerAction,
  triggerActionFeedback,
  showActionToast
]);

const handleSetDistributionSelect = useCallback(async (distribution) => {
  if (!pendingSetDistribution) return;

  const { playerIndex, actionType, buttonId } = pendingSetDistribution;
  const player = courtPlayers[playerIndex];

  setPendingSetDistribution(null);
  if (!player) return;

  try {
    await handlePlayerAction(playerIndex, actionType, null, distribution);

    if (buttonId) {
      triggerActionFeedback(buttonId, 'success');
    }

    showActionToast(
      `${player.name}: ${actionType === 'SET_ERR' ? 'Set Error' : 'Set'} (${distribution})`,
      actionType === 'SET_ERR' ? 'error' : 'success'
    );
  } catch (error) {
    if (buttonId) {
      triggerActionFeedback(buttonId, 'error');
    }
    showActionToast(`Failed to record set distribution`, 'error');
    console.error('Set distribution action failed:', error);
  }
}, [pendingSetDistribution, courtPlayers, handlePlayerAction, triggerActionFeedback, showActionToast]);

const handleAttackTypeSelect = useCallback(async (attackType) => {
  if (!pendingAttackType) return;

  const { playerIndex, actionType, buttonId } = pendingAttackType;
  const player = courtPlayers[playerIndex];

  setPendingAttackType(null);
  if (!player) return;

  try {
    await handlePlayerAction(playerIndex, actionType, null, null, attackType);

    if (buttonId) {
      triggerActionFeedback(buttonId, 'success');
    }

    showActionToast(
      `${player.name}: ${actionType} (${attackType})`,
      actionType === 'ATTACK_ERR' ? 'error' : 'success'
    );
  } catch (error) {
    if (buttonId) {
      triggerActionFeedback(buttonId, 'error');
    }
    showActionToast(`Failed to record attack type`, 'error');
    console.error('Attack type action failed:', error);
  }
}, [
  pendingAttackType,
  courtPlayers,
  handlePlayerAction,
  triggerActionFeedback,
  showActionToast
]);


// Cooldown Overlay Component - ONLY IN COLLABORATIVE MODE
const CooldownOverlay = () => {
  // ✅ ONLY SHOW IN COLLABORATIVE MODE
  if (!collaborativeMode || !scoreCooldownActive) return null;
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '140px',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1001,
      borderTop: '3px solid #ffc107'
    }}>
      <div style={{
        fontSize: '48px',
        fontWeight: '800',
        color: '#ffc107',
        marginBottom: '8px',
        textShadow: '0 2px 8px rgba(255, 193, 7, 0.5)'
      }}>
        {scoreCooldownRemaining}
      </div>
      <div style={{
        fontSize: '16px',
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: '4px'
      }}>
        Collaborative Scoring Cooldown
      </div>
      <div style={{
        fontSize: '12px',
        color: '#cccccc',
        fontStyle: 'italic'
      }}>
        All point actions are momentarily locked.
      </div>
      
      {/* Progress bar */}
      <div style={{
        marginTop: '12px',
        width: '80%',
        maxWidth: '300px',
        height: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          width: `${((5 - scoreCooldownRemaining) / 5) * 100}%`,
          backgroundColor: '#ffc107',
          transition: 'width 1s linear',
          borderRadius: '2px'
        }} />
      </div>
    </div>
  );
};

// Remove the old assignment prompt functions since we're doing auto-assignment
// Keep these functions but make them no-ops or remove the modal entirely

const handleAssignmentPrompt = useCallback((player, playerIndex, actionType) => {
  // This function is no longer needed with auto-assignment
  return false;
}, []);

// Optional: Add a function to manually decline auto-assignment for a player
const declineAutoAssignmentForPlayer = useCallback((playerId) => {
  setAssignmentDeclinedPlayers(prev => new Set(prev).add(playerId));
  showActionToast('Auto-assignment disabled for this player', 'info');
}, [showActionToast]);

// Optional: Add a function to re-enable auto-assignment for a player
const enableAutoAssignmentForPlayer = useCallback((playerId) => {
  setAssignmentDeclinedPlayers(prev => {
    const newSet = new Set(prev);
    newSet.delete(playerId);
    return newSet;
  });
  showActionToast('Auto-assignment enabled for this player', 'info');
}, [showActionToast]);


// Add cleanup on unmount
useEffect(() => {
  return () => {
    // Clean up assignment state on unmount
    setAssignmentInProgress(false);
  };
}, []);

const handlePlayerActionWithFeedback = useCallback(
  async (playerIndex, actionType) => {
    if (!checkGlobalRateLimit()) {
      return;
    }

if (actionType === 'ATTACK_TYPE_HIT') {
  await handleAttackTypeSelect('hit');
  return;
}
if (actionType === 'ATTACK_TYPE_TIP') {
  await handleAttackTypeSelect('tip');
  return;
}
if (actionType === 'ATTACK_TYPE_ROLL') {
  await handleAttackTypeSelect('roll');
  return;
}
if (actionType === 'ATTACK_TYPE_DUMP') {
  await handleAttackTypeSelect('dump');
  return;
}
if (actionType === 'ATTACK_TYPE_FREEBALL') {
  await handleAttackTypeSelect('freeball');
  return;
}
if (actionType === 'ATTACK_TYPE_CANCEL') {
  setPendingAttackType(null);
  return;
}

if (actionType === 'SET_DIST_OUTSIDE') {
  await handleSetDistributionSelect('outside');
  return;
}
if (actionType === 'SET_DIST_MIDDLE') {
  await handleSetDistributionSelect('middle');
  return;
}
if (actionType === 'SET_DIST_RIGHTSIDE') {
  await handleSetDistributionSelect('rightside');
  return;
}
if (actionType === 'SET_DIST_BACKROW') {
  await handleSetDistributionSelect('backrow');
  return;
}
if (actionType === 'SET_DIST_CANCEL') {
  setPendingSetDistribution(null);
  return;
}

if (actionType === 'ASSIST_DIST_OUTSIDE') {
  await handleAssistDistributionSelect('outside');
  return;
}
if (actionType === 'ASSIST_DIST_MIDDLE') {
  await handleAssistDistributionSelect('middle');
  return;
}
if (actionType === 'ASSIST_DIST_RIGHTSIDE') {
  await handleAssistDistributionSelect('rightside');
  return;
}
if (actionType === 'ASSIST_DIST_BACKROW') {
  await handleAssistDistributionSelect('backrow');
  return;
}
if (actionType === 'ASSIST_DIST_CANCEL') {
  setPendingAssistDistribution(null);
  return;
}


    if (actionType === 'CANCEL_PASS_GRADE') {
      cancelPassGrade();
      return;
    }

    if (actionType === 'PASS_GRADE_0') {
      await handlePassGradeSelect(0);
	  cancelPassGrade();
      return;
    }

    if (actionType === 'PASS_GRADE_1') {
      await handlePassGradeSelect(1);
	  cancelPassGrade();
      return;
    }

    if (actionType === 'PASS_GRADE_2') {
      await handlePassGradeSelect(2);
	  cancelPassGrade();
      return;
    }

    if (actionType === 'PASS_GRADE_3') {
      await handlePassGradeSelect(3);
	  cancelPassGrade();
      return;
    }
    
    // Block selection actions
    if (actionType.startsWith('BLOCK_SELECT_')) {
      const selectedIndex = parseInt(actionType.split('_')[2]);
      handleBlockAssistSelection(selectedIndex);
      return;
    }

    if (actionType === 'BLOCK_SOLO') {
      // Solo block - only one player, so they're the only one
      // Just close the menu
      cancelBlockAssist();
      showActionToast('Need at least 2 players on court for block assist', 'warning');
      return;
    }

    if (actionType === 'BLOCK_SUBMIT') {
      await submitBlock();
      return;
    }

    if (actionType === 'BLOCK_CANCEL') {
      cancelBlockAssist();
      return;
    }

    // Assist/Kill selection actions
    if (actionType.startsWith('ASSIST_KILL_SELECT_')) {
      const parts = actionType.split('_');
      const assistPlayerIndex = parseInt(parts[3]);
      const killPlayerIndex = parseInt(parts[4]);
      console.log('🎯 Assist/Kill action triggered:', {
        actionType,
        assistPlayerIndex,
        killPlayerIndex,
        assistPlayer: courtPlayers[assistPlayerIndex],
        killPlayer: courtPlayers[killPlayerIndex]
      });
      await handleAssistSelection(assistPlayerIndex, killPlayerIndex);
      return;
    }

    if (actionType.startsWith('ASSIST_IGNORE_KILL_')) {
      const assistPlayerIndex = parseInt(actionType.split('_')[3]);
      console.log('⚠️ Ignore Kill triggered for player index:', assistPlayerIndex);
      await ignoreKill(assistPlayerIndex);
      return;
    }

    if (actionType === 'ASSIST_CANCEL') {
      cancelAssist();
      return;
    }

    // Kill/Assist selection actions (same pattern as block)

    const player = courtPlayers[playerIndex];
    if (!player) return;
    // Don't require isPlayerActive check - roster players toggled ON should be able to log stats

    const buttonId = `player-${playerIndex}-${actionType}`;

    // NEW: intercept for pass grading on REC/DIG
    if (passGradingEnabled && (actionType === 'REC' || actionType === 'DIG')) {
      // We still give a quick visual "pending" ping
      triggerActionFeedback(buttonId, 'pending');
      setPendingPassGrade({ playerIndex, actionType, buttonId });
      return;
    }
if (setDistributionTrackingEnabled && actionType === 'ASSIST') {
  triggerActionFeedback(buttonId, 'pending');
  setPendingAssistDistribution({ playerIndex, actionType, buttonId });
  return;
}	
	
if (setDistributionTrackingEnabled && (actionType === 'SET' || actionType === 'SET_ERR'  )) {
  triggerActionFeedback(buttonId, 'pending');
  setPendingSetDistribution({ playerIndex, actionType, buttonId });
  return;
}

if (
  attackTypeTrackingEnabled &&
  (actionType === 'ATTACK' || actionType === 'KILL' || actionType === 'ATTACK_ERR')
) {
  triggerActionFeedback(buttonId, 'pending');
  setPendingAttackType({ playerIndex, actionType, buttonId });
  return;
}
  
  // Trigger immediate visual feedback
  triggerActionFeedback(buttonId, 'pending');

  try {
    // Call the original action handler
    await handlePlayerAction(playerIndex, actionType);
    
    // Show success feedback
    triggerActionFeedback(buttonId, 'success');
    
    // Show action toast
    const actionLabels = {
      'SERVE': 'Serve',
      'ACE': 'Ace',
      'SERVE_ERR': 'Service Error',
      'REC': 'Reception',
      'REC_ERR': 'Reception Error',
      'DIG': 'Dig',
      'DIG_ERR': 'Dig Error',
      'SET': 'Set',
      'SET_ERR': 'Set Error',
      'ATTACK': 'Attack',
      'KILL': 'Kill',
      'ATTACK_ERR': 'Attack Error',
      'SOLO_BLOCK': 'Solo Block',
      'BLOCK_ERR': 'Block Error',
      'ASSIST': 'Assist',
      'FREE_BALL': 'Free Ball',
      'RALLY_START': 'Rally Started'
    };
    
    const actionLabel = actionLabels[actionType] || actionType;
    const toastType = actionType.includes('ERR') ? 'error' : 'success';
    showActionToast(`${player.name}: ${actionLabel}`, toastType);
    
  } catch (error) {
    // Show error feedback
    triggerActionFeedback(buttonId, 'error');
    showActionToast(`Failed to record ${actionType}`, 'error');
    console.error('Action failed:', error);
  }
}, [
  handlePlayerAction,
  courtPlayers,
  triggerActionFeedback,
  showActionToast,
  handleBlockAssistSelection,
  cancelBlockAssist,
  submitBlock,
  checkGlobalRateLimit,
  passGradingEnabled,
  pendingPassGrade,
  setDistributionTrackingEnabled,
  handleSetDistributionSelect,
  handleAssistDistributionSelect,
  handleAttackTypeSelect
]);


const handlePassGradeSelect = useCallback(
  async (grade) => {
    if (!pendingPassGrade) return;

    const { playerIndex, actionType, buttonId } = pendingPassGrade;
    const player = courtPlayers[playerIndex];

    setPendingPassGrade(null);

    if (!player) return;

    try {
      // call the same core handler but with passGrade set
      await handlePlayerAction(playerIndex, actionType, grade);

      if (buttonId) {
        triggerActionFeedback(buttonId, 'success');
      }

      const actionLabels = {
        REC: 'Reception',
        DIG: 'Dig',
      };
      const actionLabel = actionLabels[actionType] || actionType;
      showActionToast(
        `${player.name}: ${actionLabel} (grade ${grade})`,
        'success'
      );
    } catch (error) {
      if (buttonId) {
        triggerActionFeedback(buttonId, 'error');
      }
      showActionToast(`Failed to record ${actionType} grade`, 'error');
      console.error('Pass grade action failed:', error);
    }
  },
  [pendingPassGrade, courtPlayers, handlePlayerAction, triggerActionFeedback, showActionToast]
);

const cancelPassGrade = useCallback(() => {
  setPendingPassGrade(null);
}, []);



// Toast notification component
const ActionToasts = () => (
  <div style={{
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 10001,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none'
  }}>
    {recentActions.map((toast, index) => {
      const age = Date.now() - toast.timestamp;
      const opacity = Math.max(0, 1 - (age / 2000)); // Fade out over 2 seconds
      
      return (
        <div
          key={toast.id}
          style={{
            backgroundColor: toast.type === 'success' ? '#28a745' : 
                           toast.type === 'error' ? '#dc3545' : '#007AFF',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            opacity,
            transform: `translateY(${index * -60}px) scale(${opacity})`,
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            maxWidth: '250px',
            wordBreak: 'break-word'
          }}
        >
          {toast.message}
        </div>
      );
    })}
  </div>
);

// Enhanced bottom bar button style with feedback


  // Open roster modal
  const openRosterModal = useCallback((slotIndex) => {
    setSelectedSlot(slotIndex);
    setShowRosterModal(true);
  }, []);

  // NEW: Enhanced selectPlayer with full libero substitution logic
const selectPlayer = useCallback(async (player, isCollaborativeUpdate = false) => {
  if (selectedSlot !== null) {
    // NEW: Libero validation - prevent front row position placement
    const volleyballPosition = getVolleyballPosition(selectedSlot);
    if (player.isLibero && (volleyballPosition === '2' || volleyballPosition === '3' || volleyballPosition === '4')) {
      alert(`⚠️ Liberos cannot be placed in front row positions. This slot has volleyball position ${volleyballPosition}.`);
      setShowRosterModal(false);
      setSelectedSlot(null);
      return;
    }

    const newPlayers = [...courtPlayers];
    const targetPlayer = newPlayers[selectedSlot];
    const isLiberoSub = player.isLibero;

    if (player.isLibero && (!targetPlayer || targetPlayer.name === "?" || !targetPlayer._id)) {
      alert(`⚠️ Libero must replace an existing player. This slot is currently empty.`);
      setShowRosterModal(false);
      setSelectedSlot(null);
      return;
    }

    // Handle libero substitution logic
    if (isLiberoSub) {
      if (volleyballPosition === '2' || volleyballPosition === '3' || volleyballPosition === '4') {
        alert("⚠️ Liberos cannot be placed in front row positions.");
        setShowRosterModal(false);
        setSelectedSlot(null);
        return;
      }

      if (!targetPlayer || targetPlayer.name === "?") {
        alert("⚠️ Libero must replace an existing player.");
        setShowRosterModal(false);
        setSelectedSlot(null);
        return;
      }

      const currentLibero = courtPlayers.find(p => p.isLibero);
      const isTargetLibero = targetPlayer.isLibero;
      const validPartners = [slot5TargetId?._id, allowedLiberoSubTarget?._id].filter(Boolean);
      const isValidPartner = targetPlayer && validPartners.includes(targetPlayer._id);

      // Libero-for-libero swap
      if (isTargetLibero && player.isLibero) {
        const outgoingLibero = targetPlayer;

        newPlayers[selectedSlot] = {
          ...player,
          isLibero: true,
          expressPosition: outgoingLibero.expressPosition,
          replacedPlayer: outgoingLibero.replacedPlayer || null,
          isOnCourt: true,
        };

        // Update bench players
        const newBenchPlayers = benchPlayers.filter(p => p._id !== outgoingLibero._id);
        newBenchPlayers.push({ ...outgoingLibero, isLibero: true, isOnCourt: false });
        setBenchPlayers([...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0)));

        try {
          await axios.put(`${API_URL}/api/players/${outgoingLibero._id}`, { isOnCourt: false }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
          await axios.put(`${API_URL}/api/players/${player._id}`, { isOnCourt: true }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
        } catch (err) {
          console.error("Failed to update libero states in DB:", err);
        }

        
        // 🔥 SYNC: Libero-for-libero swap - only if this is a local action
        if (!isCollaborativeUpdate && collaborativeMode && isConnected) {
          syncCourtPlayers(newPlayers, {
            action: 'libero_swap',
            selectedPlayer: { id: player._id, name: player.name },
            replacedPlayer: { id: outgoingLibero._id, name: outgoingLibero.name },
            slot: selectedSlot,
            position: outgoingLibero.expressPosition
          });
        }
        
        // 🎯 FIX: Only credit games played if this is a LOCAL action, not a collaborative update
        if (!isCollaborativeUpdate) {
          await creditGamesPlayed(player._id, "express_libero_swap");
        }
        
        console.log(`Libero swap: ${player.name} in for ${outgoingLibero.name} at position ${outgoingLibero.expressPosition}`);
        
        setShowRosterModal(false);
        setSelectedSlot(null);
        return;
      }

      // First-time libero substitution
      if (!currentLibero && !allowedLiberoSubTarget) {
        newPlayers[selectedSlot] = {
          ...player,
          expressPosition: targetPlayer.expressPosition,
          replacedPlayer: targetPlayer,
          isOnCourt: true,
        };

        const newBenchPlayers = [...benchPlayers];
        newBenchPlayers.push({ ...targetPlayer, isLibero: false, isOnCourt: false });
        setBenchPlayers([...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0)));

        try {
          await axios.put(`${API_URL}/api/players/${targetPlayer._id}`, { isOnCourt: false }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
          await axios.put(`${API_URL}/api/players/${player._id}`, { isOnCourt: true }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
        } catch (err) {
          console.error("Failed to update players in DB:", err);
          setShowRosterModal(false);
          setSelectedSlot(null);
          return;
        }

        
        // 🔥 SYNC: First-time libero substitution - only if this is a local action
        if (!isCollaborativeUpdate && collaborativeMode && isConnected) {
          syncCourtPlayers(newPlayers, {
            action: 'first_libero_substitution',
            liberoIn: { id: player._id, name: player.name },
            playerOut: { id: targetPlayer._id, name: targetPlayer.name },
            slot: selectedSlot
          });
        }
        
        setAllowedLiberoSubTarget && setAllowedLiberoSubTarget(targetPlayer);
        
        // 🎯 FIX: Only credit games played if this is a LOCAL action, not a collaborative update
        if (!isCollaborativeUpdate) {
          await creditGamesPlayed(player._id, "express_first_libero_sub");
        }
        
        // FIXED: Use collaborative action log
        addActionLogEntry(
          `Express: ${player.name} (Libero) substituted in for ${targetPlayer.name} at position ${targetPlayer.expressPosition}`,
          {
            type: 'libero_substitution',
            meta: {
              type: 'first_libero_sub',
              liberoIn: { id: player._id, name: player.name },
              playerOut: { id: targetPlayer._id, name: targetPlayer.name },
              position: targetPlayer.expressPosition
            }
          }
        );

        setShowRosterModal(false);
        setSelectedSlot(null);
        return;
      }

      // Standard libero substitution with existing libero
      if (!isValidPartner) {
        const confirmOverride = window.confirm(
          `⚠️ This substitution seems illegal based on earlier libero entries.\n\n` +
          `Libero is trying to sub in for ${targetPlayer.name}, who is not a registered partner.\n\n` +
          `Do you want to proceed anyway and update the slot5 partner to ${targetPlayer.name}?`
        );
        if (!confirmOverride) {
          setShowRosterModal(false);
          setSelectedSlot(null);
          return;
        }

        setSlot5TargetId && setSlot5TargetId(targetPlayer);
      }

      if (currentLibero && currentLibero._id !== player._id) {
        const newBenchPlayers = [...benchPlayers];
        newBenchPlayers.push({ ...currentLibero, isLibero: true, isOnCourt: false });
        setBenchPlayers([...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0)));
        
        try {
          await axios.put(`${API_URL}/api/players/${currentLibero._id}`, { isOnCourt: false }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            withCredentials: true,
          });
        } catch (err) {
          console.error("Failed to update current libero in DB:", err);
        }
      }

      newPlayers[selectedSlot] = {
        ...player,
        expressPosition: targetPlayer.expressPosition,
        replacedPlayer: targetPlayer,
        isOnCourt: true,
      };

      if (!allowedLiberoSubTarget) setAllowedLiberoSubTarget && setAllowedLiberoSubTarget(targetPlayer);
      
      const newBenchPlayers = benchPlayers.filter(p => p._id !== targetPlayer._id);
      if (!newBenchPlayers.some(p => p._id === targetPlayer._id)) {
        newBenchPlayers.push({ ...targetPlayer, isLibero: false, isOnCourt: false });
      }
      setBenchPlayers([...newBenchPlayers].sort((a, b) => (a.number || 0) - (b.number || 0)));

      try {
        await axios.put(`${API_URL}/api/players/${targetPlayer._id}`, { isOnCourt: false }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        });
        await axios.put(`${API_URL}/api/players/${player._id}`, { isOnCourt: true }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        });
      } catch (err) {
        console.error("Failed to update players in DB:", err);
        setShowRosterModal(false);
        setSelectedSlot(null);
        return;
      }

      
      // 🔥 SYNC: Standard libero substitution - only if this is a local action
      if (!isCollaborativeUpdate && collaborativeMode && isConnected) {
        syncCourtPlayers(newPlayers, {
          action: 'libero_substitution',
          liberoIn: { id: player._id, name: player.name },
          playerOut: { id: targetPlayer._id, name: targetPlayer.name },
          slot: selectedSlot
        });
      }
      
      // 🎯 FIX: Only credit games played if this is a LOCAL action, not a collaborative update
      if (!isCollaborativeUpdate) {
        await creditGamesPlayed(player._id, "express_libero_partner_sub");
      }

      // FIXED: Use collaborative action log
      addActionLogEntry(
        `Express: ${player.name} (Libero) substituted in for ${targetPlayer.name} at position ${targetPlayer.expressPosition}`,
        {
          type: 'libero_substitution',
          meta: {
            type: 'libero_partner_sub',
            liberoIn: { id: player._id, name: player.name },
            playerOut: { id: targetPlayer._id, name: targetPlayer.name },
            position: targetPlayer.expressPosition
          }
        }
      );

      setShowRosterModal(false);
      setSelectedSlot(null);
      return;
    }

    // 🔧 FIXED: Regular (non-libero) player placement with position preservation
    if (targetPlayer && targetPlayer._id && targetPlayer.name !== "?") {
      // Log the substitution before making database changes
      const substitutionEntry = {
        in: {
          _id: player._id,
          name: player.name,
          number: player.number,
          isLibero: player.isLibero || false
        },
        out: {
          _id: targetPlayer._id,
          name: targetPlayer.name,
          number: targetPlayer.number,
          isLibero: targetPlayer.isLibero || false
        },
        timestamp: new Date().toISOString(),
        type: 'regular_substitution',
        source: 'express_logger',
        slotIndex: selectedSlot,
        volleyballPosition: targetPlayer.expressPosition
      };

      // Update substitution log
      if (setSubstitutionLog) {
        setSubstitutionLog(prev => [...prev, substitutionEntry]);
      }

      // FIXED: Log to action log as well
      addActionLogEntry(
        `Express: ${player.name} (#${player.number}) substituted in for ${targetPlayer.name} (#${targetPlayer.number}) at position ${targetPlayer.expressPosition}`,
        {
          type: 'substitution',
          meta: {
            source: 'express',
            subType: 'regular',
            slotIndex: selectedSlot,
            position: targetPlayer.expressPosition
          }
        }
      );

      try {
        await axios.put(`${API_URL}/api/players/${targetPlayer._id}`, { 
          isOnCourt: false 
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        });
      } catch (error) {
        console.error("Failed to update previous player in database:", error);
      }

      // 🔧 CRITICAL FIX: Preserve the volleyball position of the replaced player
      newPlayers[selectedSlot] = {
        ...player,
        expressPosition: targetPlayer.expressPosition, // Inherit position from replaced player
        isOnCourt: true
      };
    } else {
      // 🔧 FIXED: Empty slot - use position based on slot, but ensure it's set
      const slotPosition = getVolleyballPosition(selectedSlot);
      newPlayers[selectedSlot] = {
        ...player,
        expressPosition: slotPosition, // Use the slot's designated position
        isOnCourt: true
      };
    }
    
    // 🔥 SYNC: Regular player selection (both substitution and empty slot) - only if this is a local action
    if (!isCollaborativeUpdate && collaborativeMode && isConnected) {
      syncCourtPlayers(newPlayers, {
        action: 'regular_player_selection',
        selectedPlayer: { id: player._id, name: player.name },
        replacedPlayer: targetPlayer ? { id: targetPlayer._id, name: targetPlayer.name } : null,
        slot: selectedSlot,
        position: newPlayers[selectedSlot].expressPosition
      });
    }
    
    // 🎯 FIX: Only credit games played if this is a LOCAL action, not a collaborative update
    // Credit games played for non-libero players
    if (!isCollaborativeUpdate && !player.isLibero) {
      await creditGamesPlayed(player._id, "express_regular_sub");
    }
  }
  
  setShowRosterModal(false);
  setSelectedSlot(null);
}, [
  checkGlobalRateLimit,
  selectedSlot, 
  courtPlayers,  
  positionMapping, 
  token, 
  creditGamesPlayed, 
  getVolleyballPosition, 
  allowedLiberoSubTarget, 
  slot5TargetId, 
  benchPlayers, 
  setBenchPlayers, 
  setAllowedLiberoSubTarget, 
  setSlot5TargetId, 
  addActionLogEntry, 
  setSubstitutionLog,
  // 🔥 ADD THESE: Collaborative sync dependencies
  collaborativeMode,
  isConnected,
  syncCourtPlayers
]);

const handleCollaborativeIgnoreKill = useCallback(async () => {
  if (!assistWaitingPlayer) return;
  
  // Check cooldown first
  if (collaborativeMode && scoreCooldownActive) {
    console.warn('⏱️ Ignore kill blocked - scoring cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before scoring`, 'warning');
    return;
  }
  
  // Set flag to prevent timeout
  assistKillSelectedRef.current = true;
  
  // Clear timer
  if (assistTimerRef.current) {
    clearTimeout(assistTimerRef.current);
    assistTimerRef.current = null;
  }
  
  // Store assist player
  const player = assistWaitingPlayer;
  
  // Clear assist waiting state
  setCollaborativeAssistWaiting(false);
  setAssistWaitingPlayer(null);
  setAssistWaitingTimer(0);
  
  console.log('🎯 Ignoring kill - awarding point for assist only');
  
  // Award the point (assist was already logged when button was clicked)
  
  setTeamStats && setTeamStats(prev => ({ ...prev, ourEarned: prev.ourEarned + 1 }));
  
  if (collaborativeMode && isConnected) {
    updateCollaborativeScore('our', 1, 'earned');
  }
  
  
  // Add action log
  addActionLogEntry(
    `Assist by ${player.name} (#${player.number}) → Point awarded (kill ignored)`,
    {
      type: 'assist_kill_ignored',
      meta: {
        type: 'assist_kill_ignored',
        assistPlayer: { id: player._id, name: player.name, number: player.number },
        reason: 'manual_ignore'
      }
    }
  );
  
  // Emit completion event to notify other users
  if (socket) {
    socket.emit('assist_kill_completed', {
      matchId: currentMatchId,
      assistPlayer: {
        _id: player._id,
        name: player.name,
        number: player.number
      },
      killIgnored: true,
      timestamp: new Date().toISOString()
    });
  }
  
  showActionToast('Point awarded - kill ignored', 'success');
  
  // Reset flag after delay
  setTimeout(() => {
    assistKillSelectedRef.current = false;
  }, 1000);
}, [
  assistWaitingPlayer,
  collaborativeMode,
  scoreCooldownActive,
  scoreCooldownRemaining,
  isConnected,
  setTeamStats,
  updateCollaborativeScore,
  addActionLogEntry,
  socket,
  currentMatchId,
  showActionToast
]);

const renderActionLogBar = () => {
  const recent = (actionLog || [])
    .slice(-(showExpandedActionLog ? 7 : 1))
    .reverse();

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '12px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #e5e7eb',
        marginBottom: '14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: showExpandedActionLog ? 'flex-start' : 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: recent.length > 0 ? '8px' : 0,
              flexWrap: 'wrap',
            }}
          >
            {collaborativeMode && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(34,197,94,0.10)',
                  border: '1px solid #86efac',
                  color: '#15803d',
                  fontSize: '12px',
                  fontWeight: '700',
                }}
              >
                <span style={{ fontSize: '11px' }}>🟢</span>
                Synced
              </div>
            )}

            <div
              style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
              }}
            >
              {showExpandedActionLog ? 'Last 7 Actions' : 'Most Recent Action'}
            </div>
          </div>

          {recent.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {recent.map((entry, idx) => (
<div
  key={`${entry?.timestamp || 'action'}-${idx}`}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }}
>
  {entry?.undoId && !entry?.undone && (
    <button
      onClick={() => handleUndoStatById(entry.undoId)}
      disabled={undoInProgress}
      style={{
        padding: '5px 10px',
        borderRadius: '999px',
        border: 'none',
        backgroundColor: undoInProgress ? '#d1d5db' : '#FF3B30',
        color: '#fff',
        fontSize: '11px',
        fontWeight: '700',
        cursor: undoInProgress ? 'not-allowed' : 'pointer',
        opacity: undoInProgress ? 0.6 : 1,
        flexShrink: 0
      }}
    >
      Undo
    </button>
  )}

  <div
    style={{
      fontSize: '14px',
      fontWeight: idx === 0 ? '700' : '500',
      color: entry?.undone ? '#9ca3af' : (idx === 0 ? '#111827' : '#4b5563'),
      textDecoration: entry?.undone ? 'line-through' : 'none',
      lineHeight: 1.35,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      flex: 1
    }}
  >
    {getActionDisplayText(entry)}
  </div>
</div>
              ))}
            </div>
          ) : (
            <div
              style={{
                fontSize: '14px',
                color: '#9ca3af',
                fontStyle: 'italic',
              }}
            >
              No actions yet
            </div>
          )}
        </div>

        {actionLog?.length > 1 && (
          <button
            onClick={() => setShowExpandedActionLog(prev => !prev)}
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              border: 'none',
              backgroundColor: '#e5e7eb',
              color: '#374151',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              minHeight: '36px',
              flexShrink: 0
            }}
          >
            {showExpandedActionLog ? 'Show Less' : 'Show More'}
          </button>
        )}
      </div>
    </div>
  );
};
// UPDATED: Collaborative controls component with ownership check
const renderCollaborativeControls = () => {

  
  if (!isMatchOwner()) {
    // Non-owners need a user account and collaborative mode to be enabled
    if (!user || !collaborativeMode) return null;
    
    const myAssignments = playerAssignments.filter(a => 
      a.isActive && a.assignedTo?.userId === user.id
    );
    
    return (
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #ddd',
        marginTop: '8px'
      }}>
        <div style={{
          fontSize: '12px',
          fontWeight: '600',
          marginBottom: '8px',
          color: '#333',
          textAlign: 'center'
        }}>
          Player Assignment Management
        </div>
        
        {myAssignments.length > 0 ? (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            justifyContent: 'center',
            marginBottom: '8px'
          }}>
            {myAssignments.map(assignment => (
              <div
                key={assignment.playerId}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}
              >
                {assignment.playerName}
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            fontSize: '11px',
            color: '#999',
            textAlign: 'center',
            fontStyle: 'italic',
            marginBottom: '8px'
          }}>
            No players assigned to you
          </div>
        )}

        <button
          onClick={async () => {
            try {
              await loadAssignmentsFromBackend();
              console.log('Assignments refreshed');
            } catch (error) {
              console.error('Failed to refresh assignments:', error);
            }
          }}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#007AFF',
            color: '#fff',
            fontSize: '11px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          Refresh My Assignments
        </button>
      </div>
    );
  }

  // OWNERS: Show full collaborative mode management - ALWAYS VISIBLE regardless of user state
  const myAssignments = user && playerAssignments ? playerAssignments.filter(a => 
    a.isActive && a.assignedTo?.userId === user.id
  ) : [];

  return (
    <div style={{
      position: 'static',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      alignItems: 'center',
      marginTop: '8px'
    }}>

      {/* Collaborative Mode UI Removed - Mode must be set via match configuration */}
      {/* Connection and Assignment Controls - OWNERS ONLY, only when collaborative mode enabled AND user exists */}
      {collaborativeMode && user && (
        <>
          {/* Connection Controls */}
          <button
            onClick={async () => {
              if (connecting) return;
              if (!currentMatchId) {
                alert('Open or create a match first.');
                return;
              }
              try {
                setConnecting(true);
                const ok = isConnected
                  ? await leaveMatch()
                  : await joinMatch(currentMatchId);
                if (ok === false) {
                  alert('Could not connect. Check network/WebSocket.');
                }
              } finally {
                setConnecting(false);
              }
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isCollaborativeReady() ? '#28a745' : '#6c757d',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {isCollaborativeReady() ? 'Connected & Ready' : (connecting ? 'Connecting…' : 'Connect')}
          </button>

          {isCollaborativeReady() && activeSessions.length > 1 && (
            <div style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.9)',
              fontSize: '11px',
              textAlign: 'center',
              border: '1px solid #ddd'
            }}>
              {activeSessions.filter(s => s.isOnline).length} users online
            </div>
          )}

          {/* Assignment Management - OWNERS ONLY */}
          {isCollaborativeReady() && (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #ddd'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#333',
                textAlign: 'center'
              }}>
                Player Assignment Management
              </div>
              
              {myAssignments.length > 0 ? (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  justifyContent: 'center',
                  marginBottom: '8px'
                }}>
                  {myAssignments.map(assignment => (
                    <div
                      key={assignment.playerId}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#28a745',
                        color: '#fff',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}
                    >
                      {assignment.playerName}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  fontSize: '11px',
                  color: '#999',
                  textAlign: 'center',
                  fontStyle: 'italic',
                  marginBottom: '8px'
                }}>
                  No assignments set
                </div>
              )}

              <button
                onClick={async () => {
                  try {
                    await loadAssignmentsFromBackend();
                    console.log('Assignments refreshed');
                  } catch (error) {
                    console.error('Failed to refresh assignments:', error);
                  }
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#007AFF',
                  color: '#fff',
                  fontSize: '11px',
                  cursor: 'pointer',
                  width: '100%',
                  marginBottom: '8px'
                }}
              >
                Refresh My Assignments
              </button>
              
              <button
                onClick={() => setShowAssignmentModal(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Assign All Players
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const togglePlayerActivation = useCallback((playerIndex) => {
    const player = courtPlayers[playerIndex];
    if (!player || !player._id) return;
    
    const playerId = player._id;
    const isCurrentlyActive = activePlayerIds.has(playerId);
    
    if (isCurrentlyActive) {
      // Deactivating player - add to deactivated list and remove from active
      setActivePlayerIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(playerId);
        return newSet;
      });
      
      setDeactivatedPlayers(prev => {
        if (!prev.includes(playerId)) {
          return [...prev, playerId];
        }
        return prev;
      });
      
      // FIXED: Log the deactivation
      addActionLogEntry(
        `Express: ${player.name} (#${player.number}) deactivated from stat tracking`,
        {
          type: 'player_deactivated',
          meta: { type: 'player_deactivated', playerId }
        }
      );
    } else {
      // Activating player - remove from deactivated list and add to active
      setActivePlayerIds(prev => {
        const newSet = new Set(prev);
        newSet.add(playerId);
        return newSet;
      });
      
      setDeactivatedPlayers(prev => prev.filter(id => id !== playerId));
      
      // FIXED: Log the activation
      addActionLogEntry(
        `Express: ${player.name} (#${player.number}) activated for stat tracking`,
        {
          type: 'player_activated',
          meta: { type: 'player_activated', playerId }
        }
      );
    }
  }, [courtPlayers, activePlayerIds, setDeactivatedPlayers, addActionLogEntry]);


  const updateLocalScore = useCallback((team, pointType) => {
    try {
      if (team === 'our') {
        
        setTeamStats && setTeamStats(prev => ({ 
          ...prev, 
          [pointType === 'ourEarned' ? 'ourEarned' : 'oppError']: 
            prev[pointType === 'ourEarned' ? 'ourEarned' : 'oppError'] + 1 
        }));
      } else {
        
        setTeamStats && setTeamStats(prev => ({ 
          ...prev, 
          [pointType === 'opponentEarned' ? 'oppEarned' : 'ourError']: 
            prev[pointType === 'opponentEarned' ? 'oppEarned' : 'ourError'] + 1 
        }));
      }
      
    } catch (error) {
      console.error('Local scoring error:', error);
      showActionToast(`Failed to record point: ${error.message}`, 'error');
    }
  }, [
    showActionToast
  ]);

const debugScoringState = useCallback(() => {
  console.log('🔍 ExpressStatLogger Scoring Debug:');
  console.log('  Collaborative Mode:', collaborativeMode);
  console.log('  Is Connected:', isConnected);
  console.log('  Is Ready:', isCollaborativeReady());
  console.log('  Last Score Update:', lastScoreUpdate);
  console.log('  Can Score?', !(collaborativeMode && !isConnected && !isCollaborativeReady()));
}, [collaborativeMode, isConnected, isCollaborativeReady, lastScoreUpdate]);

  // Enhanced point handlers with 4 different point types
 // Improved version with better collaborative fallback
const handlePointAwarded = useCallback((pointType) => {
  console.log('🎯 Point button clicked:', pointType);

  if (collaborativeMode && scoreCooldownActive) {
    console.log('🚫 Scoring blocked - cooldown active (collaborative mode)');
    showActionToast(`Wait ${scoreCooldownRemaining}s before scoring again`, 'warning');
    return;
  }

  if (scoringInProgress) {
    console.log('🚫 Scoring blocked - operation in progress');
    showActionToast('Score update in progress, please wait', 'info');
    return;
  }

  const now = Date.now();
  if (lastScoreUpdate && (now - lastScoreUpdate) < 800) {
    console.log('🚫 Rapid scoring prevented');
    showActionToast('Please wait between score updates', 'warning');
    return;
  }

  setLastScoreUpdate(now);

  let team = '';
  let reason = '';

  switch (pointType) {
    case 'ourEarned':
      team = 'our';
      reason = 'earned';
      break;
    case 'opponentError':
      team = 'our';
      reason = 'opponent_error';
      break;
    case 'ourError':
      team = 'opponent';
      reason = 'our_error';
      break;
    case 'opponentEarned':
      team = 'opponent';
      reason = 'opponent_earned';
      break;
    default:
      return;
  }

  const nextOurScore = team === 'our' ? (ourScore || 0) + 1 : (ourScore || 0);
  const nextOpponentScore = team === 'opponent' ? (opponentScore || 0) + 1 : (opponentScore || 0);

  setOurScore(nextOurScore);
  setOpponentScore(nextOpponentScore);
  

  if (collaborativeMode && isConnected) {
    const collaborativeSuccess = updateCollaborativeScore(team, 1, reason);

    if (!collaborativeSuccess) {
      console.warn('Failed to send collaborative score update');
      showActionToast('Score recorded locally', 'warning');
	  
    }
  } else if (currentMatchId && token) {
    axios.put(
      `${API_URL}/api/matches/${currentMatchId}`,
      {
        ourScore: nextOurScore,
        opponentScore: nextOpponentScore,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      }
    ).catch(error => {
      console.error('Failed to save score:', error);
      showActionToast('Failed to save score', 'error');
    });
  }



  triggerNonBlockingSave('point_scored');
  setLastTouchedPlayerId(null);
}, [
  collaborativeMode,
  isConnected,
  scoreCooldownActive,
  scoreCooldownRemaining,
  scoringInProgress,
  lastScoreUpdate,
  updateCollaborativeScore,
  ourScore,
  opponentScore,
  setOurScore,
  setOpponentScore,
  currentMatchId,
  token,
  addActionLogEntry,
  showActionToast,
  triggerNonBlockingSave
]);

// FIXED: Add cleanup for scoring timeout
useEffect(() => {
  return () => {
    if (scoringTimeoutRef.current) {
      clearTimeout(scoringTimeoutRef.current);
    }
  };
}, []);





// Enhanced point handling with feedback
const handlePointAwardedWithFeedback = useCallback(async (pointType) => {
  const buttonId = `point-${pointType}`;
  
  // ✅ Prevent rapid scoring
  const now = Date.now();
  if (scoringInProgress || (now - lastScoreAttempt) < 800) {
    console.warn('⏱️ Scoring attempt blocked - too rapid');
    showActionToast('Please wait between score updates', 'warning');
    triggerActionFeedback(buttonId, 'error');
    return;
  }
  
  // ✅ Check collaborative mode readiness
  if (collaborativeMode && !isConnected && !isCollaborativeReady()) {
    console.warn('Score blocked - not ready');
    showActionToast('Collaborative mode not ready', 'error');
    return;
  }
  
  triggerActionFeedback(buttonId, 'pending');
  
  try {
    await handlePointAwarded(pointType);
    triggerActionFeedback(buttonId, 'success');
    
    const pointLabels = {
      'ourEarned': 'Point: We Earned',
      'opponentError': 'Point: Opponent Error',
      'ourError': 'Point: Our Error',
      'opponentEarned': 'Point: They Earned'
    };
    
    const isOurPoint = pointType === 'ourEarned' || pointType === 'opponentError';
    showActionToast(pointLabels[pointType], isOurPoint ? 'success' : 'error');
    
  } catch (error) {
    triggerActionFeedback(buttonId, 'error');
    showActionToast('Failed to record point', 'error');
    console.error('Point recording failed:', error);
  }
}, [
  handlePointAwarded, 
  triggerActionFeedback, 
  showActionToast, 
  scoringInProgress, 
  lastScoreAttempt,
  collaborativeMode, 
  isConnected, 
  isCollaborativeReady
]);

  // Get available actions with block assist mode support
  

const [selectedActionFamily, setSelectedActionFamily] = useState(null);
const [selectedPlayerForActions, setSelectedPlayerForActions] = useState(null);
const [blockInitiatorIndex, setBlockInitiatorIndex] = useState(null);
const [assistInitiatorIndex, setAssistInitiatorIndex] = useState(null);

// Kill mode state - for selecting assist players when kill is made

const getAvailableActions = (playerIndex) => {
  const player = courtPlayers[playerIndex];
  if (!player) return [];

  if (pendingPassGrade?.playerIndex === playerIndex) {
    const isReceive = pendingPassGrade.actionType === "REC";

    return [
      {
        category: isReceive ? "Serve Rec Grade" : "Dig Grade",
        actions: [
          { key: "PASS_GRADE_0", label: "0", variant: "danger" },
          { key: "PASS_GRADE_1", label: "1", variant: "warn" },
          { key: "PASS_GRADE_2", label: "2", variant: "primary" },
          { key: "PASS_GRADE_3", label: "3", variant: "success" },
          { key: "CANCEL_PASS_GRADE", label: "CANCEL", variant: "secondary" },
        ],
      },
    ];
  }

if (pendingSetDistribution?.playerIndex === playerIndex) {
  return [
    {
      category: "Set Distribution",
      actions: [
        { key: "SET_DIST_OUTSIDE", label: "OUTSIDE", variant: "primary" },
        { key: "SET_DIST_MIDDLE", label: "MIDDLE", variant: "primary" },
        { key: "SET_DIST_RIGHTSIDE", label: "RIGHTSIDE", variant: "primary" },
        { key: "SET_DIST_BACKROW", label: "BACKROW", variant: "primary" },
        { key: "SET_DIST_CANCEL", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
      ],
    },
  ];
}

if (pendingAssistDistribution?.playerIndex === playerIndex) {
  return [
    {
      category: "Assist Distribution",
      actions: [
        { key: "ASSIST_DIST_OUTSIDE", label: "OUTSIDE", variant: "primary" },
        { key: "ASSIST_DIST_MIDDLE", label: "MIDDLE", variant: "primary" },
        { key: "ASSIST_DIST_RIGHTSIDE", label: "RIGHTSIDE", variant: "primary" },
        { key: "ASSIST_DIST_BACKROW", label: "BACKROW", variant: "primary" },
        { key: "ASSIST_DIST_CANCEL", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
      ],
    },
  ];
}

if (pendingAttackType?.playerIndex === playerIndex) {
  const attackTypeActions = [
    { key: "ATTACK_TYPE_HIT", label: "HIT", variant: "primary" },
    { key: "ATTACK_TYPE_TIP", label: "TIP", variant: "primary" },
    { key: "ATTACK_TYPE_ROLL", label: "ROLL", variant: "primary" },
  ];
  
  // Add DUMP option for setters
  if (player.position === 'S') {
    attackTypeActions.push({ key: "ATTACK_TYPE_DUMP", label: "DUMP", variant: "primary" });
  }
  
  attackTypeActions.push({ key: "ATTACK_TYPE_FREEBALL", label: "FREEBALL", variant: "primary" });
  attackTypeActions.push({ key: "ATTACK_TYPE_CANCEL", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" });
  
  return [
    {
      category: "Attack Type",
      actions: attackTypeActions,
    },
  ];
}

  // Assist/Kill selection mode - inline with initiating player
  if (assistMode && assistInitiatorIndex === playerIndex) {
    // Get the initiating player's ID to exclude them from selection
    const initiatingPlayer = courtPlayers[playerIndex];
    const initiatingPlayerId = initiatingPlayer?._id;
    
    // Get all other ON players who can receive the kill - use allRosterPlayers to get ALL players
    const otherPlayers = allRosterPlayers
      .map((p) => {
        // Find this player's index in courtPlayers for UI purposes
        const courtIndex = courtPlayers.findIndex(cp => cp?._id === p._id);
        return { player: p, index: courtIndex };
      })
      .filter(({ player }) => {
        return (
          player && 
          player.name !== "?" && 
          player._id && 
          player._id !== initiatingPlayerId && // Don't include the assisting player (compare by ID)
          playerOnOffStatus[player._id] === true // Only ON players
        );
      })
      .sort((a, b) => (a.player.number || 999) - (b.player.number || 999)); // Sort by number
    
    // If no other players available, show message
    if (otherPlayers.length === 0) {
      return [
        {
          category: 'Assist → Kill',
          actions: [
            { 
              key: `ASSIST_NO_PLAYERS`, 
              label: `Only #${player.number} on court`, 
              variant: 'secondary' 
            },
            { key: `ASSIST_CANCEL`, label: '✕ Cancel', variant: 'danger' }
          ]
        }
      ];
    }
    
    return [
      {
        category: 'Assist → Who got the kill?',
        actions: [
          ...otherPlayers.map(({ player, index }) => ({
            key: `ASSIST_KILL_SELECT_${playerIndex}_${index}`,
            label: `#${player.number} - ${player.name?.split(' ')[0]}`,
            variant: 'primary'
          })),
          {
            key: `ASSIST_IGNORE_KILL_${playerIndex}`,
            label: isMobile ? 'Ignore Kill' : '⚠️ Ignore Kill',
            variant: 'warning'
          },
          {
            key: `ASSIST_CANCEL`,
            label: isMobile ? 'X' : '✕ Cancel',
            variant: 'danger'
          }
        ]
      }
    ];
  }

  // Block selection mode - inline with initiating player
  if (blockMode && blockInitiatorIndex === playerIndex) {
    // Get the initiating player's ID to exclude them from selection
    const initiatingPlayer = courtPlayers[playerIndex];
    const initiatingPlayerId = initiatingPlayer?._id;
    
    // Get all other ON players who aren't liberos - use allRosterPlayers to get ALL players
    const otherPlayers = allRosterPlayers
      .map((p) => {
        // Find this player's index in courtPlayers for UI purposes
        const courtIndex = courtPlayers.findIndex(cp => cp?._id === p._id);
        return { player: p, index: courtIndex };
      })
      .filter(({ player }) => {
        return (
          player && 
          player.name !== "?" && 
          !player.isLibero &&
          player._id !== initiatingPlayerId && // Don't include the initiator (compare by ID)
          playerOnOffStatus[player._id] === true // Only ON players
        );
      });
    
    // If no other players available, show message
    if (otherPlayers.length === 0) {
      return [
        {
          category: `Block ${blockMode === 'assist' ? 'Assist' : 'Error'}`,
          actions: [
            { 
              key: `BLOCK_SOLO`, 
              label: `Only #${player.number} on court`, 
              variant: 'secondary' 
            },
            { key: `BLOCK_CANCEL`, label: '✕ Cancel', variant: 'danger' }
          ]
        }
      ];
    }
    
    return [
      {
        category: `${blockMode === 'assist' ? 'Assisted Block' : 'Block Error'} - Select Other Players:`,
        actions: [
          ...otherPlayers.map(({ player, index }) => ({
            key: `BLOCK_SELECT_${index}`,
            label: selectedBlockPlayers.has(index) ? `✓ #${player.number}` : `#${player.number} - ${player.name?.split(' ')[0]}`,
            variant: selectedBlockPlayers.has(index) ? 'success' : 'primary'
          })),
{
  key: `BLOCK_SUBMIT`,
  label: isMobile
    ? '✓'
    : `✓ Submit (${selectedBlockPlayers.size})`,
  variant: selectedBlockPlayers.size > 0 ? 'success' : 'secondary'
},
{
  key: `BLOCK_CANCEL`,
  label: isMobile
    ? 'X'
    : '✕ Cancel',
  variant: 'danger'
}
        ]
      }
    ];
  }


  const canBlock =  !player.isLibero && !blockMode;

  // Initial top-level menu for every active player
  if (!selectedActionFamily) {
    const starterGroups = [
      {
        category: "Actions",
        actions: [
          { key: "OPEN_SERVE", label: "SERVE", variant: "primary" },
          { key: "OPEN_RECEIVE", label: "PASS", variant: "primary" },
          { key: "OPEN_SET", label: "SET", variant: "primary" },
          { key: "OPEN_ATTACK", label: "ATTACK", variant: "primary" },
        ],
      },
    ];

    if (canBlock) {
      starterGroups[0].actions.push({
        key: "OPEN_BLOCK",
        label: "BLOCK",
        variant: "primary",
      });
    }

    return starterGroups;
  }

  // Submenus
  switch (selectedActionFamily) {
    case "SERVE":
      return [
        {
          category: "Serve",
          actions: [
            { key: "SERVE", label: "IN PLAY", variant: "primary" },
            { key: "ACE", label: "ACE", variant: "success" },
            { key: "SERVE_ERR", label: "ERR", variant: "danger" },
            { key: "BACK_TO_ACTIONS", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
          ],
        },
      ];

    case "RECEIVE":
      return [
        {
          category: "Receive/Dig",
          actions: [
            { key: "REC", label: "SERVE REC", variant: "primary" },
            { key: "REC_ERR", label: "SERVE REC ERR", variant: "danger" },
            { key: "DIG", label: "DIG", variant: "primary" },
            { key: "DIG_ERR", label: "DIG ERR", variant: "danger" },
            { key: "BACK_TO_ACTIONS", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
          ],
        },
      ];

    case "SET":
      return [
        {
          category: "Set",
          actions: [
            { key: "SET", label: "SET", variant: "primary" },
            { key: "ASSIST", label: "ASSIST", variant: "success" },
            { key: "SET_ERR", label: "ERR", variant: "danger" },
            { key: "BACK_TO_ACTIONS", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
          ],
        },
      ];

    case "ATTACK":
      return [
        {
          category: "Attack",
          actions: [
            { key: "ATTACK", label: "IN PLAY", variant: "primary" },
            { key: "KILL", label: "KILL", variant: "success" },
            { key: "ATTACK_ERR", label: "ERR", variant: "danger" },
            { key: "BACK_TO_ACTIONS", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
          ],
        },
      ];

    case "BLOCK":
      if (!canBlock) return [];
      return [
        {
          category: "Block",
          actions: [
            { key: "SOLO_BLOCK", label: "SOLO", variant: "success" },
            { key: "ASSIST_BLOCK", label: "ASSIST", variant: "success" },
            { key: "ERROR_BLOCK", label: "ERR", variant: "danger" },
            { key: "BACK_TO_ACTIONS", label: isMobile ? 'X' : '✕ Cancel', variant: "danger" },
          ],
        },
      ];

    default:
      return [];
  }
};

const completeAssistKillSequence = useCallback(async (assistPlayer, killPlayer) => {
  console.log('🎬 completeAssistKillSequence started:', {
    assistPlayer: assistPlayer ? { name: assistPlayer.name, _id: assistPlayer._id, number: assistPlayer.number } : null,
    killPlayer: killPlayer ? { name: killPlayer.name, _id: killPlayer._id, number: killPlayer.number } : null
  });

  processingAssistKillRef.current = true;

  if (collaborativeMode && scoreCooldownActive) {
    console.warn('⏱️ Assist-kill blocked - scoring cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before scoring`, 'warning');
    processingAssistKillRef.current = false;
    return;
  }

  try {
    const assistStatKeys = ["sets", "assists"];

    if (selectedAssistDistribution === 'outside') {
      assistStatKeys.push('setOutside');
      assistStatKeys.push('assistOutside');
    } else if (selectedAssistDistribution === 'middle') {
      assistStatKeys.push('setMiddle');
      assistStatKeys.push('assistMiddle');
    } else if (selectedAssistDistribution === 'rightside') {
      assistStatKeys.push('setRightside');
      assistStatKeys.push('assistRightside');
    } else if (selectedAssistDistribution === 'backrow') {
      assistStatKeys.push('setBackrow');
      assistStatKeys.push('assistBackrow');
    }

    const killStatKeys = ["kills", "attacks", "points"];

    const comboUndoId = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await logStat(
      assistPlayer,
      "Assist",
      assistStatKeys,
      `${assistPlayer.name} (#${assistPlayer.number}) → Assist${selectedAssistDistribution ? ` (${selectedAssistDistribution})` : ''}`,
      { skipUndo: true }
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    await logStat(
      killPlayer,
      "Kill",
      killStatKeys,
      `${killPlayer.name} (#${killPlayer.number}) → Kill`,
      { skipUndo: true }
    );

    setStatUndoStack(prev => [
      ...prev,
      {
        undoId: comboUndoId,
        timestamp: Date.now(),
        label: 'Assist → Kill',
        actionText: `${assistPlayer.name} (#${assistPlayer.number}) → Assist | ${killPlayer.name} (#${killPlayer.number}) → Kill`,
        operations: [
          {
            playerId: assistPlayer._id,
            playerName: assistPlayer.name,
            statKeys: [...assistStatKeys],
          },
          {
            playerId: killPlayer._id,
            playerName: killPlayer.name,
            statKeys: [...killStatKeys],
          }
        ]
      }
    ]);

    if (collaborativeMode && isConnected && socket) {
      socket.emit('assist_selection_completed', {
        matchId: currentMatchId,
        assistPlayer: {
          _id: assistPlayer._id,
          name: assistPlayer.name,
          number: assistPlayer.number
        },
        killPlayer: {
          _id: killPlayer._id,
          name: killPlayer.name,
          number: killPlayer.number
        },
        timestamp: new Date().toISOString()
      });
    }

    addActionLogEntry(
      `Assist by ${assistPlayer.name} (#${assistPlayer.number}) → Kill by ${killPlayer.name} (#${killPlayer.number})`,
      {
        type: 'assist_kill_combo',
        undoId: comboUndoId,
        meta: {
          type: 'assist_kill_combo',
          assistPlayer: { id: assistPlayer._id, name: assistPlayer.name, number: assistPlayer.number },
          killPlayer: { id: killPlayer._id, name: killPlayer.name, number: killPlayer.number }
        }
      }
    );

    setSelectedAssistDistribution(null);

    console.log('✅ Assist-kill sequence completed successfully');
  } catch (error) {
    console.error('❌ Error in completeAssistKillSequence:', error);
    showActionToast(`Failed to complete assist-kill: ${error.message}`, 'error');
  } finally {
    setTimeout(() => {
      processingAssistKillRef.current = false;
    }, 1000);
  }
}, [
  collaborativeMode,
  isConnected,
  socket,
  addActionLogEntry,
  logStat,
  showActionToast,
  currentMatchId,
  scoreCooldownActive,
  scoreCooldownRemaining,
  selectedAssistDistribution
]);
  


const cancelAssist = useCallback(() => {
  setAssistMode(false);
  setSelectedAssistPlayer(null);
  setAssistInitiatorIndex(null);
  setSelectedAssistDistribution(null);
  setSelectedActionFamily(null);
}, []);
  
  const handleAssistSelection = useCallback(async (assistPlayerIndex, killPlayerIndex) => {
  console.log('🔄 handleAssistSelection called:', {
    assistPlayerIndex,
    killPlayerIndex,
    courtPlayers: courtPlayers.map(p => ({ name: p?.name, _id: p?._id }))
  });
  
  const assistPlayer = courtPlayers[assistPlayerIndex];
  const killPlayer = courtPlayers[killPlayerIndex];
  
  console.log('👥 Players resolved:', {
    assistPlayer: assistPlayer ? { name: assistPlayer.name, _id: assistPlayer._id } : null,
    killPlayer: killPlayer ? { name: killPlayer.name, _id: killPlayer._id } : null
  });
  
  // Close inline selection FIRST
  setAssistMode(false);
  setSelectedAssistPlayer(null);
  setAssistInitiatorIndex(null);
  setSelectedActionFamily(null);
  
  if (!assistPlayer || !killPlayer ) {
    console.error('❌ Missing player data, cannot complete assist-kill');
    return;
  }
  
  console.log('✅ Calling completeAssistKillSequence...');
  // Process the assist-kill sequence
  await completeAssistKillSequence(assistPlayer, killPlayer);
}, [courtPlayers,  completeAssistKillSequence]);



  // Updated styles for mobile-friendly design
  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '8px',
    paddingTop: 'env(safe-area-inset-top, 8px)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    paddingBottom: '100px' // Add padding to prevent content from being hidden behind sticky bar
  };
  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    padding: '8px',
    backgroundColor: '#ffffff',
    borderRadius: '6px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    flexWrap: 'wrap',
    gap: '6px'
  };


const renderSyncNotifications = () => {
    if (!collaborativeMode || !syncedGameState.lastUpdateBy) return null;

    return (
      <div style={{
        position: 'fixed',
        top: '60px',
        right: '20px',
        zIndex: 1001,
        pointerEvents: 'none'
      }}>
        {syncedGameState.lastUpdateBy && syncedGameState.lastUpdateBy !== 'You' && (
          <div style={{
            backgroundColor: 'rgba(0, 122, 255, 0.9)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '600',
            marginBottom: '4px',
            opacity: 0.8
          }}>
            Last update by: {syncedGameState.lastUpdateBy}
          </div>
        )}
      </div>
    );
  };


// UPDATED: Connection status with ownership restrictions
const renderConnectionStatus = () => {
    if (!collaborativeMode) return null;

    let statusColor = '#6c757d';
    let statusText = 'Offline';
    let statusIcon = '⚫';

    if (isConnected && isCollaborativeReady()) {
      statusColor = '#28a745';
      statusText = 'Synced';
      statusIcon = '🟢';
    } else if (isConnected) {
      statusColor = '#ffc107';
      statusText = 'Connected';
      statusIcon = '🟡';
    } else {
      statusColor = '#dc3545';
      statusText = 'Offline';
      statusIcon = '🔴';
    }

    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        backgroundColor: `${statusColor}20`,
        border: `1px solid ${statusColor}`,
        fontSize: '11px',
        fontWeight: '600'
      }}>
        <span>{statusIcon}</span>
        <span style={{ color: statusColor }}>{statusText}</span>
        {/* Only show user count to match owners */}
        {isMatchOwner() && activeSessions.length > 1 && (
          <span style={{ color: statusColor, marginLeft: '4px' }}>
            ({activeSessions.filter(s => s.isOnline).length} users)
          </span>
        )}
      </div>
    );
  };

  const stateIndicatorStyle = (isActive) => ({
    padding: '4px 8px',
    borderRadius: '12px',
    fontWeight: '600',
    fontSize: '8px',
    backgroundColor: isActive ? '#007AFF' : '#e9ecef',
    color: isActive ? '#ffffff' : '#6c757d',
    marginLeft: '2px',
    minHeight: '30px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    transform: 'scale(1)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
  });

const playersGridStyle = {
  display: 'grid',
  gridTemplateColumns: isPortrait
    ? '1fr'
    :'repeat(2, minmax(0, 1fr))',
  gap: '8px',
  marginBottom: '12px',
  alignItems: 'start',
};

 const playerCardStyle = (isActive) => ({
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: isActive ? '8px' : '6px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
  opacity: isActive ? 1 : 0.6,
  border: isActive ? '2px solid #007AFF' : '2px solid transparent',
  transition: 'all 0.2s ease',
  display: 'grid',
  gridTemplateColumns: 'minmax(110px, 110px) 1fr auto',
  gap: '6px',
  alignItems: 'center',
  minHeight: isActive ? '56px' : '40px',
  width: '100%',
  minWidth: 0,
});

const playerHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: '100px',
  flexShrink: 0
};

  const playerNameStyle = {
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    flex: 1,
    minWidth: '80px'
  };
  
 const rowPointButtonStyle = (type) => ({
  padding: '6px 12px',
  borderRadius: '999px',
  border: type === 'our' ? '1px solid #2f9e44' : '1px solid #b0b7c3',
  backgroundColor: type === 'our' ? '#4caf50' : '#d1d5db',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: '700',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  minWidth: '92px',
  minHeight: '34px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
  letterSpacing: '0.1px',
});

  const playerControlsStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flexShrink: 0
  };

const splitNameForDisplay = (name, maxTotalLength = 18, maxLineLength = 14) => {
  if (!name) return { firstLine: '', secondLine: null };
  
  // First, cap the total name length
  let workingName = name.length > maxTotalLength ? name.substring(0, maxTotalLength) + '...' : name;
  
  // If it fits on one line, return as-is
  if (workingName.length <= maxLineLength) {
    return { firstLine: workingName, secondLine: null };
  }
  
  // Find the last space to split on
  const lastSpaceIndex = workingName.lastIndexOf(' ');
  
  // If no space found, just split at max line length
  if (lastSpaceIndex === -1) {
    return { 
      firstLine: workingName.substring(0, maxLineLength),
      secondLine: workingName.substring(maxLineLength)
    };
  }
  
  // Split on last space
  const firstPart = workingName.substring(0, lastSpaceIndex);
  const secondPart = workingName.substring(lastSpaceIndex + 1);
  
  // If first part is too long, truncate it
  const finalFirstPart = firstPart.length > maxLineLength ? 
    firstPart.substring(0, maxLineLength) : firstPart;
  
  return { 
    firstLine: finalFirstPart, 
    secondLine: secondPart 
  };
};

  const actionButtonsStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center'
  };

const actionButtonStyle = (variant = 'primary') => ({
  padding: '6px 12px',
  borderRadius: '999px', // full pill
  border: 'none',
  fontSize: isMobile ? '10px' : '12px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.12s ease',
  minWidth: isMobile ? '40px' : '80px',     // Apple touch target
  minHeight: '40px',
  backgroundColor:
    variant === 'danger' ? '#FF3B30' :
    variant === 'success' ? '#34C759' :
    variant === 'warn' ? '#FF9500' :
    '#007AFF',
  color: '#ffffff',
  whiteSpace: 'nowrap',
  transform: 'scale(1)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)', // softer shadow
});

  // NEW: Manual Position Control Section Style (Subdued)
  const manualControlStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  };

  // NEW: Sticky Bottom Bar Styles
  const stickyBottomBarStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    border: '3px solid #007AFF', // Blue border matching the app design
    borderRadius: '16px 16px 0 0',
    padding: '12px 16px 20px 16px', // Extra bottom padding for mobile safe area
    zIndex: 1000,
    boxShadow: '0 -4px 12px rgba(0,0,0,0.1)'
  };

  const bottomBarContentStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    maxWidth: '500px',
    margin: '0 auto'
  };

  const bottomBarSectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'center'
  };



 
 // Enhanced button style function with feedback states
const getActionButtonStyleWithFeedback = useCallback((variant = 'primary', buttonId) => {
  const baseStyle = actionButtonStyle(variant);
  const feedback = actionFeedback.get(buttonId);
  
  if (feedback) {
    const age = Date.now() - feedback.timestamp;
    const progress = Math.min(age / 800, 1); // 800ms animation
    
    switch (feedback.type) {
      case 'pending':
        return {
          ...baseStyle,
          backgroundColor: '#ffc107',
          transform: 'scale(0.95)',
          boxShadow: '0 0 0 3px rgba(255, 193, 7, 0.3)',
        };
      case 'success':
        return {
          ...baseStyle,
          backgroundColor: '#28a745',
          transform: `scale(${1 + (0.1 * (1 - progress))})`,
          boxShadow: `0 0 0 ${3 * (1 - progress)}px rgba(40, 167, 69, ${0.5 * (1 - progress)})`,
        };
      case 'error':
        return {
          ...baseStyle,
          backgroundColor: '#dc3545',
          transform: `scale(${1 + (0.1 * (1 - progress))})`,
          boxShadow: `0 0 0 ${3 * (1 - progress)}px rgba(220, 53, 69, ${0.5 * (1 - progress)})`,
        };
    }
  }
  
  return baseStyle;
}, [actionButtonStyle, actionFeedback]);

  const bottomBarLabelStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: '#333',
    textAlign: 'center'
  };

  const bottomBarButtonRowStyle = {
    display: 'flex',
    gap: '6px'
  };

 const bottomBarButtonStyle = (backgroundColor, textColor = '#ffffff') => ({
  padding: '10px 12px',
  borderRadius: '8px',
  border: 'none',
  // Only disable if collaborative mode is on AND we explicitly can't score
  backgroundColor: (collaborativeMode && !isConnected && !isCollaborativeReady()) ? '#6c757d' : backgroundColor,
  color: textColor,
  fontWeight: '600',
  fontSize: '12px',
  cursor: (collaborativeMode && !isConnected && !isCollaborativeReady()) ? 'not-allowed' : 'pointer',
  transition: 'all 0.15s ease',
  transform: 'scale(1)',
  minWidth: '70px',
  minHeight: '44px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  opacity: (collaborativeMode && !isConnected && !isCollaborativeReady()) ? 0.6 : 1
});

const getBottomBarButtonStyleWithFeedback = useCallback((backgroundColor, textColor = '#ffffff', buttonId) => {
  const baseStyle = bottomBarButtonStyle(backgroundColor, textColor);
  const feedback = actionFeedback.get(buttonId);
  
  // ✅ DISABLE IF SCORING IS OFF
  if (!scoringEnabled && buttonId.startsWith('point-')) {
    return {
      ...baseStyle,
      backgroundColor: '#6c757d',
      cursor: 'not-allowed',
      opacity: 0.5,
      transform: 'scale(0.95)',
      position: 'relative'
    };
  }
  
  // ✅ ONLY APPLY COOLDOWN STYLING IN COLLABORATIVE MODE
  if (collaborativeMode && scoreCooldownActive && buttonId.startsWith('point-')) {
    return {
      ...baseStyle,
      backgroundColor: '#6c757d',
      cursor: 'not-allowed',
      opacity: 0.5,
      transform: 'scale(0.95)',
      position: 'relative'
    };
  }
  
  // Add loading state for scoring in progress
  if (scoringInProgress && buttonId.startsWith('point-')) {
    return {
      ...baseStyle,
      backgroundColor: '#6c757d',
      cursor: 'not-allowed',
      opacity: 0.7,
      transform: 'scale(0.98)'
    };
  }
  
  if (feedback) {
    const age = Date.now() - feedback.timestamp;
    const progress = Math.min(age / 800, 1);
    
    switch (feedback.type) {
      case 'pending':
        return {
          ...baseStyle,
          backgroundColor: '#ffc107',
          transform: 'scale(0.95)',
          boxShadow: '0 0 0 3px rgba(255, 193, 7, 0.4)',
        };
      case 'success':
        return {
          ...baseStyle,
          backgroundColor: '#28a745',
          transform: `scale(${1 + (0.05 * (1 - progress))})`,
          boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 0 ${2 * (1 - progress)}px rgba(40, 167, 69, ${0.4 * (1 - progress)})`,
        };
      case 'error':
        return {
          ...baseStyle,
          backgroundColor: '#dc3545',
          transform: `scale(${1 + (0.05 * (1 - progress))})`,
          boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 0 ${2 * (1 - progress)}px rgba(220, 53, 69, ${0.4 * (1 - progress)})`,
        };
    }
  }
  
  return baseStyle;
}, [bottomBarButtonStyle, actionFeedback, scoringInProgress, scoreCooldownActive, collaborativeMode, scoringEnabled]);


 return (
  <div style={containerStyle}>
    <RemoteAssistBanner />
    {/* Push content down when banner is showing */}
    {remoteAssistInProgress && <div style={{ height: '80%' }} />}
      {/* Only show collaborative status bar to match owners */}
      {collaborativeMode && isMatchOwner() && <CollaborativeStatusBar />}
      


      {renderSyncNotifications()}
	  {renderActionLogBar()}
 


	

      {/* Player Assignment Modal - only show to match owners */}
      {isMatchOwner() && (
        <PlayerAssignmentModal
          isOpen={showAssignmentModal}
          onClose={() => setShowAssignmentModal(false)}
          courtPlayers={courtPlayers}
          benchPlayers={benchPlayers}
          matchId={currentMatchId}
          teamName={match?.teamName}
        />
      )}

      {/* Players */}
      <div style={playersGridStyle}>
        {allRosterPlayers.length > 0 ? (
          // Sort so ON players appear first (first 3 rows = 6 slots)
          [...allRosterPlayers].sort((a, b) => {
            const aIsOn = playerOnOffStatus[a._id] || false;
            const bIsOn = playerOnOffStatus[b._id] || false;
            if (aIsOn && !bIsOn) return -1;
            if (!aIsOn && bIsOn) return 1;
            return 0; // Keep original order within ON or OFF groups
          }).map(player => {
            const isOn = playerOnOffStatus[player._id] || false;
       
            
            // Find this player's index in courtPlayers
            const playerIndex = courtPlayers.findIndex(cp => cp?._id === player._id);
            // If player is ON, they're active. Otherwise check game state.
            const isActive = isOn;
            
            // Get tracking status early so we can use it for action button visibility
            const trackingStatus = getTrackingStatus(player._id);
            
            // Build action groups for ON players
            let actionGroups = [];
            if (isOn && playerIndex >= 0) {
              const rosterPlayer = courtPlayers[playerIndex];
              
              // In collaborative mode, only show actions for:
              // 1. Match owner (can log for anyone)
              // 2. Players assigned to current user
              const canShowActions = !collaborativeMode || 
                                    isMatchOwner() || 
                                    trackingStatus?.isMe;
              
              if (canShowActions) {
                // Show full actions (including special menus) for:
                // 1. Player with submenu open (selectedPlayerForActions)
                // 2. Block mode initiator (blockMode && blockInitiatorIndex)
                // 3. Assist mode initiator (assistMode && assistInitiatorIndex)
                const shouldShowFullActions = 
                  playerIndex === selectedPlayerForActions ||
                  (blockMode && blockInitiatorIndex === playerIndex) ||
                  (assistMode && assistInitiatorIndex === playerIndex);
                
                if (shouldShowFullActions) {
                  // This player has submenu/special mode open - show full actions
                  actionGroups = getAvailableActions(playerIndex);
                } else {
                  // This player doesn't have submenu - show TOP LEVEL actions always
                  const canBlock = !rosterPlayer.isLibero && !blockMode;
                  actionGroups = [
                    {
                      category: "Actions",
                      actions: [
                        { key: "OPEN_SERVE", label: "SERVE", variant: "primary" },
                        { key: "OPEN_RECEIVE", label: "PASS", variant: "primary" },
                        { key: "OPEN_SET", label: "SET", variant: "primary" },
                        { key: "OPEN_ATTACK", label: "ATTACK", variant: "primary" },
                      ],
                    },
                  ];
                  
                  if (canBlock) {
                    actionGroups[0].actions.push({
                      key: "OPEN_BLOCK",
                      label: "BLOCK",
                      variant: "primary",
                    });
                  }
                }
              }
            }

            return (
              <div key={player._id} style={{ marginBottom: '8px' }}>
                {/* Player Row Header with Toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: collaborativeMode && trackingStatus?.isMe ? '#fff9c4' : '#ffffff',
                    borderRadius: isOn ? '6px 6px 0 0' : '6px',
                    border: isOn ? '2px solid #4caf50' : '1px solid #ddd',
                    borderBottom: isOn && actionGroups.length > 0 ? 'none' : undefined,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    transition: 'all 0.2s ease',
                    opacity: isOn ? 1 : 0.7,
                    position: 'relative'
                  }}
                >
                  {/* Collaborative tracking overlay */}
                  {collaborativeMode && trackingStatus?.isAssigned && !trackingStatus?.isMe && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: 'rgba(0,122,255,0.9)',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                      zIndex: 5,
                      pointerEvents: 'none'
                    }}>
                      Tracked by {trackingStatus.trackedBy}
                    </div>
                  )}

                  {/* Player Info: Number | Name (L) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flex: 1
                  }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '700',
                      color: '#007AFF',
                      minWidth: '30px'
                    }}>
                      {player.number}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#333',
                      flex: 1
                    }}>
                      {player.name}
                      {player.isLibero && (
                        <span style={{
                          fontSize: '11px',
                          color: '#999',
                          marginLeft: '6px',
                          fontWeight: '400'
                        }}>
                          (L)
                        </span>
                      )}
				
                    </div>
						 {scoringEnabled && isOn && lastTouchedPlayerId === player._id && (
  <span
    style={{
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      flexShrink: 0,
      marginRight: '10px'
    }}
  >
    <button
      onClick={() => handlePointAwardedWithFeedback('ourEarned')}
      style={rowPointButtonStyle('our')}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.96)';
        e.currentTarget.style.opacity = '0.9';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.opacity = '1';
      }}
    >
      Our Point
    </button>

    <button
      onClick={() => handlePointAwardedWithFeedback('opponentEarned')}
      style={rowPointButtonStyle('opp')}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.96)';
        e.currentTarget.style.opacity = '0.9';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.opacity = '1';
      }}
    >
      Opp Point
    </button>
  </span>
)}
                  </div>

                  {/* Toggle Button - Only show if not assigned to someone else */}
                  {!(collaborativeMode && trackingStatus?.isAssigned && !trackingStatus?.isMe) && (
                    <button
                      onClick={() => handlePlayerToggle(player._id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '999px',
                        border: 'none',
                        backgroundColor: isOn ? '#4caf50' : '#ccc',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minWidth: '60px'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {isOn ? '✓ ON' : '○ OFF'}
                    </button>
                  )}
                </div>

                {/* Action Buttons - Show if player is ON */}
                {isOn && actionGroups.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '0 0 6px 6px',
                      border: '2px solid #4caf50',
                      borderTop: 'none'
                    }}
                  >
                    {actionGroups.map((group, groupIndex) => (
                      <div key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        
                          <div style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            color: '#555',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {group.category}
                          </div>
                        

                        {/* Action buttons for this group */}
                        <div style={{
                          display: 'flex',
                          gap: '6px',
                          flexWrap: 'wrap',
                          alignItems: 'center'
                        }}>
                          {group.actions.map(action => (
<button
  key={action.key}
  onClick={() => handlePlayerActionWithFeedback(playerIndex, action.key)}
  onMouseDown={(e) => {
    e.target.style.transform = 'scale(0.95)';
    e.target.style.opacity = '0.8';
  }}
  onMouseUp={(e) => {
    e.target.style.transform = 'scale(1)';
    e.target.style.opacity = '1';
  }}
  onMouseLeave={(e) => {
    e.target.style.transform = 'scale(1)';
    e.target.style.opacity = '1';
  }}
  style={{
    ...getActionButtonStyleWithFeedback(
      action.variant,
      `player-${playerIndex}-${action.key}`
    ),
    ...(action.key === "BACK_TO_ACTIONS"
      ? {
          marginLeft: "12px",
        }
      : {})
  }}
  title={action.label}
>
  {action.label}
</button>

                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            );
          })
        ) : (
          <div style={{
            padding: '12px',
            textAlign: 'center',
            color: '#999',
            fontSize: '13px'
          }}>
            Loading roster...
          </div>
        )}
      </div>

{/* Collaborative Assist Waiting Banner - Bottom */}

{collaborativeAssistWaiting && assistWaitingPlayer && (
  <div style={{
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#007AFF',
    borderTop: '3px solid #0056b3',
    padding: '12px',
    zIndex: 1001,
    boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  }}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      maxWidth: '600px'
    }}>
      {/* Timer Circle */}
      <div style={{
        minWidth: '50px',
        height: '50px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        flexShrink: 0
      }}>
        <div style={{
          fontSize: '20px',
          fontWeight: '800',
          color: '#007AFF'
        }}>
          {assistWaitingTimer}s
        </div>
      </div>
      
      {/* Info Section */}
      <div style={{
        color: '#ffffff',
        textAlign: 'left',
        flex: 1
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '700',
          marginBottom: '2px'
        }}>
          ✔ Assist: {assistWaitingPlayer.name} (#{assistWaitingPlayer.number})
        </div>
        <div style={{
          fontSize: '11px',
          opacity: 0.9
        }}>
          Click KILL on any player or ignore
        </div>
      </div>
      
      {/* Ignore Kill Button */}
      <button
        onClick={handleCollaborativeIgnoreKill}
        style={{
          padding: '10px 20px',
          borderRadius: '6px',
          backgroundColor: '#ffc107',
          color: '#212529',
          border: 'none',
          fontWeight: '700',
          fontSize: '13px',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
          flexShrink: 0,
          whiteSpace: 'nowrap'
        }}
        onMouseDown={(e) => {
          e.target.style.transform = 'scale(0.95)';
          e.target.style.opacity = '0.9';
        }}
        onMouseUp={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.opacity = '1';
        }}
      >
        Ignore Kill
      </button>
    </div>
  </div>
)}



      {/* Only show collaborative controls to match owners */}
      {renderCollaborativeControls()}

      {/* Assist Mode Modal - REMOVED: Now using inline action buttons like Block Assist/Error */}
	  
	  <ActionToasts />
		<CooldownOverlay />
      
  


    </div>
  )
};

export default ExpressStatLogger;