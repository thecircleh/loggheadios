// Enhanced CollaborativeProvider with PERSISTENT player assignments
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import { useAuth } from "../AuthContext";
import axios from "axios";

const CollaborativeContext = createContext(null);

export const useCollaborative = () => {
  const ctx = useContext(CollaborativeContext);
  if (!ctx) throw new Error("useCollaborative must be used within CollaborativeProvider");
  return ctx;
};

export const CollaborativeProvider = ({ children, matchSettings }) => {
  const { token, user } = useAuth();

  // Get collaborative mode from matchSettings instead of local state
  const collaborativeMode = matchSettings?.collaborativeMode?.enabled || false;

  // connection + session
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);
const [lastScoreAttempt, setLastScoreAttempt] = useState(0);
const [setEndingLocked, setSetEndingLocked] = useState(false);
const [setEndingLockInfo, setSetEndingLockInfo] = useState(null);
const scoringTimeoutRef = useRef(null);
const [scoreCooldownActive, setScoreCooldownActive] = useState(false);
const [scoreCooldownRemaining, setScoreCooldownRemaining] = useState(0);
const scoreCooldownTimerRef = useRef(null);

  // presence + assignments
  const [activeSessions, setActiveSessions] = useState([]);
  const [playerAssignments, setPlayerAssignments] = useState([]);

  // Synchronized game state
  const [syncedGameState, setSyncedGameState] = useState({
    ballState: 'serve',
    ballSide: 'our',
    currentServeSide: 'our',
    lastUpdateBy: null,
    lastUpdateAt: null,
    version: 0
  });

  // UI feedback
  const [notifications, setNotifications] = useState([]);

  // refs
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectionStateRef = useRef('disconnected');
  const reconnectAttemptsRef = useRef(0);
  const joiningMatchRef = useRef(false);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;
  const getUserId = () => user?.id || user?._id;
const [recentActions, setRecentActions] = useState([]);
const [lastAssignmentUpdate, setLastAssignmentUpdate] = useState(Date.now());
const assignmentPollingRef = useRef(null);

// Add this function near other utility functions

  // State synchronization handlers
  const stateCallbacksRef = useRef({
    onBallStateChange: null,
    onServeSideChange: null,
    onGameStateChange: null,
	onScoreUpdate: null,
	onSetEndingDecision: null,
    onSetEndingCancelled: null
  });

  const getApiUrl = () => {
    const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
      return `http://${h}:3000`;
    }
    return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
  };

  const API_BASE = useMemo(() => getApiUrl(), []);

const getTeamOnlineStatus = useCallback(async (teamName) => {
  if (!teamName || !token) return null;
  
  try {
    const response = await axios.get(`${API_BASE}/api/users/teams/${encodeURIComponent(teamName)}/members`, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true
    });
    
    const members = response.data || [];
    return {
      total: members.length,
      online: members.filter(m => m.isOnline).length,
      inMatches: members.filter(m => m.isInMatch).length,
      available: members.filter(m => m.isOnline && !m.isInMatch).length
    };
  } catch (error) {
    console.error('Failed to get team status:', error);
    return null;
  }
}, [API_BASE, token]);

useEffect(() => {
  if (scoreCooldownActive && scoreCooldownRemaining > 0) {
    scoreCooldownTimerRef.current = setTimeout(() => {
      setScoreCooldownRemaining(prev => prev - 1);
    }, 1000);
  } else if (scoreCooldownActive && scoreCooldownRemaining === 0) {
    setScoreCooldownActive(false);
  }
  
  return () => {
    if (scoreCooldownTimerRef.current) {
      clearTimeout(scoreCooldownTimerRef.current);
    }
  };
}, [scoreCooldownActive, scoreCooldownRemaining]);

  // Backend API functions for persistent assignments
  const saveAssignmentToBackend = useCallback(async (playerId, playerName, assignToUserId, assignToUsername) => {
  try {
    const response = await axios.post(`${API_BASE}/api/matches/${currentMatchId}/assign-player`, {
      playerId,
      playerName,
      assignedToUserId: assignToUserId,
      assignedToUsername: assignToUsername,
      sessionId: sessionId 
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      withCredentials: true
    });

    return response.data;
  } catch (error) {
    console.error('Failed to save assignment to backend:', error);
    throw error;
  }
}, [API_BASE, currentMatchId, token, sessionId]); 

  const loadAssignmentsFromBackend = useCallback(async () => {
  if (!currentMatchId || !token) return;

  try {
    console.log(`🔄 Loading assignments from backend for match: ${currentMatchId}`);
    
    const response = await axios.get(`${API_BASE}/api/matches/${currentMatchId}/assignments`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      withCredentials: true
    });

    const assignments = response.data.assignments || [];
    console.log(`✅ Loaded ${assignments.length} assignments from backend:`, assignments);
    
    // Update local state with backend assignments
    setPlayerAssignments(assignments.map(assignment => ({
      playerId: assignment.playerId,
      playerName: assignment.playerName,
      assignedTo: {
        userId: assignment.assignedTo.userId,
        username: assignment.assignedTo.username
      },
      assignedBy: assignment.assignedBy,
      assignedAt: assignment.assignedAt,
      isActive: assignment.isActive !== false
    })));
    
    // ✅ NEW: Update timestamp to trigger UI refresh
    setLastAssignmentUpdate(Date.now());

    return assignments;
  } catch (error) {
    console.error('Failed to load assignments from backend:', error);
    return [];
  }
}, [API_BASE, currentMatchId, token]);

  const removeAssignmentFromBackend = useCallback(async (playerId) => {
    try {
      console.log(`Removing assignment from backend for player: ${playerId}`);
      
      await axios.delete(`${API_BASE}/api/matches/${currentMatchId}/assignments/${playerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        withCredentials: true
      });

      console.log('Assignment removed from backend');
    } catch (error) {
      console.error('Failed to remove assignment from backend:', error);
      throw error;
    }
  }, [API_BASE, currentMatchId, token]);
  
  

  const deduplicateSessions = useCallback((sessions) => {
  if (!Array.isArray(sessions)) {
    console.warn('deduplicateSessions received non-array:', sessions);
    return [];
  }
  
  const seen = new Set();
  return sessions.filter(session => {
    if (!session?.userId) {
      console.warn('Invalid session data - missing userId:', session);
      return false;
    }
    
    const key = session.userId;
    if (seen.has(key)) {
      console.warn('Duplicate user session detected and removed:', session);
      return false;
    }
    seen.add(key);
    return true;
  });
}, []);
  
  const addNotification = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, message, type, timestamp: new Date() }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  const removeNotification = useCallback((id) => setNotifications((p) => p.filter((n) => n.id !== id)), []);

const registerStateCallbacks = useCallback((callbacks) => {
  console.log("🔥 CollaborativeProvider: Registering state callbacks:", callbacks);
    stateCallbacksRef.current = { 
    ...stateCallbacksRef.current, 
    ...callbacks 
  };
  console.log("🔥 CollaborativeProvider: Updated callbacks ref:", stateCallbacksRef.current);
}, []);

const handleIncomingStateChange = useCallback((data, stateType) => {
  console.log("🔥 handleIncomingStateChange called:", { stateType, data, userId: data.userId, currentUser: getUserId() });

  // Ignore self-emitted events
  if (data.userId === getUserId()) {
    console.log("🔥 Skipping own state change");
    return;
  }

  // Ignore stale versions (same logic you had inside setState)
  const currVersion = syncedGameState?.version || 0;
  if (data.version && data.version <= currVersion) {
    console.log('🔥 Ignoring older state change');
    return;
  }

  // Compute a projected "next" state in local scope so we can use it below
  const base = {
    ...syncedGameState,
    lastUpdateBy: data.username || 'Another user',
    lastUpdateAt: data.timestamp,
    version: data.version || (currVersion + 1),
  };

  const projected =
    stateType === 'ball_state'
      ? {
          ...base,
          ballState: data.ballState,
          ballSide: data.ballSide !== undefined ? data.ballSide : base.ballSide,
          currentServeSide:
            data.currentServeSide !== undefined ? data.currentServeSide : base.currentServeSide,
        }
      : stateType === 'serve_side'
      ? {
          ...base,
          currentServeSide: data.serveSide,
          ballSide: data.serveSide,
        }
      : base;

  // Commit state
  setSyncedGameState(projected);
  console.log("🔥 Updated synced game state:", projected);

  // Call registered callbacks using the projected state (no undefined newState)
  if (stateType === 'ball_state' && stateCallbacksRef.current.onBallStateChange) {
    console.log("🔥 Calling onBallStateChange callback");
    stateCallbacksRef.current.onBallStateChange(projected.ballState, data);
  }
  if (stateType === 'serve_side' && stateCallbacksRef.current.onServeSideChange) {
    console.log("🔥 Calling onServeSideChange callback");
    stateCallbacksRef.current.onServeSideChange(projected.currentServeSide, data);
  }
  if (stateCallbacksRef.current.onGameStateChange) {
    console.log("🔥 Calling onGameStateChange callback");
    stateCallbacksRef.current.onGameStateChange(
      {
        ballState: projected.ballState,
        serveSide: projected.currentServeSide,
        ballSide: projected.ballSide,
      },
      data
    );
  }
  
  

  // UX notification
  const username = data.username || 'Another user';
  if (stateType === 'ball_state') {
    addNotification(`${username} changed game state to ${data.ballState}`, "info");
  } else if (stateType === 'serve_side') {
    addNotification(
      `${username} changed serve to ${data.serveSide === 'our' ? 'Our team' : 'Opponent'}`,
      "info"
    );
  }
}, [addNotification, getUserId, syncedGameState]);

  const generateSessionId = useCallback(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const userId = getUserId()?.substr(-4) || 'anon';
    return `session_${userId}_${random}_${timestamp}`;
  }, [getUserId]);

  const cleanup = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connectionStateRef.current = 'disconnected';
    reconnectAttemptsRef.current = 0;
  };

  const getReconnectDelay = (attemptNumber) => {
    return Math.min(baseReconnectDelay * Math.pow(2, attemptNumber), 30000);
  };

  const scheduleReconnect = () => {
    if (!collaborativeMode) {
      console.log("Not scheduling reconnect - collaborative mode is OFF");
      return;
    }
    
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log("Max reconnection attempts reached, giving up");
      addNotification("Connection failed after multiple attempts. Please refresh the page.", "error");
      return;
    }

    if (connectionStateRef.current === 'connecting') {
      console.log("Already connecting, skipping reconnect");
      return;
    }

    const delay = getReconnectDelay(reconnectAttemptsRef.current);
    console.log(`Scheduling reconnect attempt ${reconnectAttemptsRef.current + 1} in ${delay}ms`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!collaborativeMode || !token || !user) {
        console.log("Aborting reconnect - collaborative mode OFF or no auth");
        return;
      }
      
      reconnectAttemptsRef.current++;
      console.log(`Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
      
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
      
      createSocket();
    }, delay);
  };

const createSocket = () => {
  if (!collaborativeMode) {
    console.log("Not creating socket - collaborative mode is OFF");
    return;
  }
  
  console.log("🔌 Creating socket connection to:", API_BASE);
  
  const s = io(API_BASE, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    withCredentials: true,
    auth: token ? { token, userId: user?.id } : undefined,
    autoConnect: false,
    reconnection: false,
    timeout: 10000,
    forceNew: true,
  });

  socketRef.current = s;
  setSocket(s);

  s.on("connect", () => {
    console.log("🔌 Collaborative socket connected:", s.id);
    console.log("🔌 Socket auth data:", { userId: user?.id, username: user?.username });
    connectionStateRef.current = 'connected';
    setIsConnected(true);
    reconnectAttemptsRef.current = 0;
  });;

    s.on("disconnect", (reason) => {
      console.log("Collaborative socket disconnected:", reason);
      connectionStateRef.current = 'disconnected';
      setIsConnected(false);
      setActiveSessions([]);

      if (reason === "io server disconnect" || reason === "transport close") {
        console.log("Server initiated disconnect, attempting reconnection");
        scheduleReconnect();
      } else if (reason === "ping timeout" || reason === "transport error") {
        console.log("Network issue detected, attempting reconnection");
        scheduleReconnect();
      } else {
        console.log("Client initiated disconnect, not reconnecting");
      }
    });

    s.on("connect_error", (err) => {
      console.error("Socket connect_error:", err?.message || err);
      connectionStateRef.current = 'disconnected';
      setIsConnected(false);
      
      if (reconnectAttemptsRef.current === 0) {
        addNotification(`Connection error: ${err?.message || err}`, "error");
      }
      
      scheduleReconnect();
    });

s.on("score_cooldown_started", (data) => {
  console.log("⏱️ Score cooldown started by another user:", data.startedBy);
  
  // Start cooldown for ALL users
  setScoreCooldownActive(true);
  setScoreCooldownRemaining(5);
  
  // Show notification
  const username = data.startedBy?.username || 'Another user';
  addNotification(`${username} scored - 5 second cooldown`, "info");
});

	
s.on("player_assigned", async (data) => {
  console.log("🎯 Real-time assignment update received:", data);
  
  // Immediately reload all assignments
  await loadAssignmentsFromBackend();
  
  const currentUserId = getUserId();
  
  if (data?.assignedTo?.userId === currentUserId) {
    addNotification(`You've been assigned to track ${data.playerName}`, "success");
  } else {
    addNotification(`${data.playerName} assigned to ${data.assignedTo?.username}`, "info");
  }
});

s.on("assignments_updated", async (data) => {
  console.log("📋 Bulk assignment update received:", data);
  
  // Update assignments directly from the broadcast
  if (data.assignments) {
    setPlayerAssignments(data.assignments.map(assignment => ({
      playerId: assignment.playerId,
      playerName: assignment.playerName,
      assignedTo: {
        userId: assignment.assignedTo?.userId,
        username: assignment.assignedTo?.username
      },
      assignedBy: assignment.assignedBy,
      assignedAt: assignment.assignedAt,
      isActive: assignment.isActive !== false
    })));
    
    setLastAssignmentUpdate(Date.now());
  }
});

s.on("player_unassigned", async (data) => {
  console.log("🚫 Player unassigned:", data);
  
  // Immediately reload all assignments
  await loadAssignmentsFromBackend();
  addNotification(`Player assignment removed`, "info");
});

	/* ------------------------------ Block Flow Events ----------------------- */

s.on("block_selection_started", (data) => {
  console.log('🏐 CollaborativeProvider: Block selection started:', {
    blockType: data.blockType,
    selectedPlayers: data.selectedPlayers?.length,
    initiatedBy: data.initiatedBy?.username
  });
  
  // Call registered callback if exists
  if (stateCallbacksRef.current.onBlockSelectionStarted) {
    stateCallbacksRef.current.onBlockSelectionStarted(data);
  }
  
  // Show notification to user
  const playerNames = data.selectedPlayers?.map(p => p.name).join(', ') || 'players';
  const actionType = data.blockType === 'assist' ? 'block assist' : 'block error';
  addNotification(
    `${data.initiatedBy?.username} selecting ${actionType} for ${playerNames}`,
    'info'
  );
});

s.on("block_completed", (data) => {
  console.log('✅ CollaborativeProvider: Block completed:', {
    blockType: data.blockType,
    players: data.players?.length,
    completedBy: data.completedBy?.username
  });
  
  // Call registered callback if exists
  if (stateCallbacksRef.current.onBlockCompleted) {
    stateCallbacksRef.current.onBlockCompleted(data);
  }
  
  // Show success notification
  const playerNames = data.players?.map(p => `${p.name} (#${p.number})`).join(', ') || 'players';
  const actionText = data.blockType === 'assist' ? 'Block Assist' : 'Block Error';
  addNotification(
    `${actionText} recorded for ${playerNames}`,
    data.blockType === 'assist' ? 'success' : 'warning'
  );
});

s.on("block_cancelled", (data) => {
  console.log('❌ CollaborativeProvider: Block cancelled:', {
    cancelledBy: data.cancelledBy?.username
  });
  
  // Call registered callback if exists
  if (stateCallbacksRef.current.onBlockCancelled) {
    stateCallbacksRef.current.onBlockCancelled(data);
  }
  
  addNotification('Block selection cancelled', 'info');
});

s.on("block_error", (data) => {
  console.error('Block operation error:', data);
  
  if (data.message) {
    addNotification(`Block error: ${data.message}`, 'error');
  }
  
  // Call error callback if registered
  if (stateCallbacksRef.current.onBlockError) {
    stateCallbacksRef.current.onBlockError(data);
  }
});
	
	s.on("set_ending_locked", (data) => {
	  console.log("🔒 Set ending locked:", data);
	  setSetEndingLocked(true);
	  setSetEndingLockInfo(data);
	  
	  const isMe = data.lockedBy?.userId === getUserId();
	  if (!isMe) {
	 	 addNotification(
	 	 `Set ending - waiting for ${data.lockedBy?.username || 'match owner'} to decide`,
	 	 "warning"
	 	 );
	  }
	  });
	  
	s.on("set_ending_unlocked", (data) => {
	  console.log("🔓 Set ending unlocked:", data.reason);
	  setSetEndingLocked(false);
	  setSetEndingLockInfo(null);
	  
	  if (data.reason === 'decision_made') {
	 	 addNotification("Proceeding to next set", "success");
	  } else if (data.reason === 'cancelled') {
	 	 addNotification("Set ending cancelled", "info");
	  }
	  });
	  
	s.on("score_blocked", (data) => {
	  console.warn("⛔ Score update blocked:", data.reason);
	  setScoringInProgress(false);
	  
	  if (data.reason === 'set_ending_in_progress') {
	 	 showActionToast('Set is ending - wait for owner decision', 'warning');
	  }
	  });
	
    s.on("set_ending_decision", (data) => {
      console.log("🏆 CollaborativeProvider: Set ending decision received:", {
        winner: data.winner,
        isMatchOver: data.isMatchOver,
        decidedBy: data.decidedBy?.username,
        currentUserId: getUserId()
      });
      
      // Only process if this decision is from someone else
      if (data.decidedBy?.userId !== getUserId()) {
        // Call the registered callback to handle set ending
        if (stateCallbacksRef.current.onSetEndingDecision) {
          console.log("🏆 Calling onSetEndingDecision callback");
          stateCallbacksRef.current.onSetEndingDecision(data);
        } else {
          console.warn("🏆 No onSetEndingDecision callback registered");
        }
      } else {
        console.log("🏆 Skipping own set ending decision");
      }
    });
    
    s.on("set_ending_cancelled", (data) => {
      console.log("❌ CollaborativeProvider: Set ending cancelled:", {
        cancelledBy: data.cancelledBy?.username,
        currentUserId: getUserId()
      });
      
      // Only process if this cancellation is from someone else
      if (data.cancelledBy?.userId !== getUserId()) {
        // Call the registered callback to handle cancellation
        if (stateCallbacksRef.current.onSetEndingCancelled) {
          console.log("❌ Calling onSetEndingCancelled callback");
          stateCallbacksRef.current.onSetEndingCancelled(data);
        } else {
          console.warn("❌ No onSetEndingCancelled callback registered");
        }
      } else {
        console.log("❌ Skipping own set ending cancellation");
      }
    });
	
s.on("match_joined", async (data) => {
  console.log("🔥 DEBUG: match_joined event received");
  console.log("🔥 DEBUG: data.activeSessions:", data?.activeSessions);
  console.log("🔥 DEBUG: user object:", user);
  console.log("🔥 DEBUG: getUserId():", getUserId());
  console.log("🔥 DEBUG: data.sessionId:", data?.sessionId);
  
  setSessionId(data?.sessionId);
  setCurrentMatchId(data?.matchId);
  
  const cleanSessions = deduplicateSessions(data?.activeSessions || []);
  console.log("🔥 DEBUG: cleanSessions after deduplication:", cleanSessions);
  
  // Create current user object
  const currentUserId = getUserId();
  const currentUser = {
    userId: currentUserId,
    username: user?.username || user?.name || user?.displayName || `User-${currentUserId?.slice(-4)}` || 'You',
    sessionId: data?.sessionId,
    isOnline: true,
    lastActivity: new Date().toISOString(),
  };
  
  console.log("🔥 DEBUG: currentUser object:", currentUser);
  
  // Check if current user is already in the sessions
  const userAlreadyExists = cleanSessions.some(session => {
    console.log("🔥 DEBUG: Comparing session.userId:", session.userId, "with currentUserId:", currentUserId);
    return session.userId === currentUserId;
  });
  
  console.log("🔥 DEBUG: userAlreadyExists:", userAlreadyExists);
  
  if (!userAlreadyExists && currentUserId) {
    cleanSessions.push(currentUser);
    console.log("🔥 DEBUG: Added current user to activeSessions");
  }
  
  console.log("🔥 DEBUG: Final activeSessions:", cleanSessions);
  setActiveSessions(cleanSessions);

  // Load assignments from backend to ensure persistence
  await loadAssignmentsFromBackend();

  if (data?.gameState) {
    setSyncedGameState(prev => ({
      ...prev,
      ...data.gameState,
      lastUpdateAt: data.timestamp,
      version: data.gameState.version || prev.version
    }));
  }
});

    s.on("user_joined", (data) => {
      console.log("User joined event:", data);
      
      setActiveSessions((prev) => {
        const filtered = prev.filter((s) => s.userId !== data.userId);
        
        const newSessions = [
          ...filtered,
          {
            userId: data.userId,
            username: data.username,
            sessionId: data.sessionId,
            isOnline: true,
            lastActivity: data.timestamp,
          }
        ];
        
        return deduplicateSessions(newSessions);
      });
      
      addNotification(`${data.username} joined the match`, "info");
    });

    s.on("user_left", (data) => {
      setActiveSessions((prev) =>
        prev.map((sess) =>
          sess.userId === data.userId
            ? { ...sess, isOnline: false, lastActivity: data.timestamp }
            : sess
        )
      );
      addNotification(`${data.username} left the match`, "warning");
    });

    s.on("player_assigned", async (data) => {
      // Refresh assignments from backend to ensure consistency
      await loadAssignmentsFromBackend();

      if (data?.assignedTo?.userId === user.id) {
        addNotification(`You've been assigned to track ${data.playerName}`, "success");
      } else {
        addNotification(`${data.playerName} assigned to ${data.assignedTo?.username}`, "info");
      }
    });

    s.on("player_unassigned", async (data) => {
      // Refresh assignments from backend to ensure consistency
      await loadAssignmentsFromBackend();
      addNotification(`Player assignment removed`, "info");
    });

  s.on("ball_state_changed", (data) => {
    console.log("🔥 SOCKET EVENT: Ball state changed received:", data);
    handleIncomingStateChange(data, 'ball_state');
  });

  s.on("serve_side_changed", (data) => {
    console.log("🔥 SOCKET EVENT: Serve side changed received:", data);
    handleIncomingStateChange(data, 'serve_side');
  });
  
s.on("court_players_updated", (data) => {
  console.log("🔥 CollaborativeProvider: Court players updated by another user:", {
    courtPlayersCount: data.courtPlayers?.length,
    updatedBy: data.updatedBy?.username,
    userId: data.updatedBy?.userId,
    currentUserId: getUserId(),
    timestamp: data.timestamp
  });
  
  // Call the registered callback from ExpressStatLogger if it exists
  if (stateCallbacksRef.current.onCourtPlayersUpdate) {
    console.log("🔥 Calling onCourtPlayersUpdate callback");
    stateCallbacksRef.current.onCourtPlayersUpdate(data.courtPlayers, data);
  } else {
    console.warn("🔥 No onCourtPlayersUpdate callback registered");
  }
});



s.on("position_mapping_updated", (data) => {
  console.log("🔥 CollaborativeProvider: Position mapping updated by another user:", data);
  
  if (stateCallbacksRef.current.onPositionMappingUpdate) {
    stateCallbacksRef.current.onPositionMappingUpdate(data.positionMapping, data);
  }
});
  

s.on("score_updated", (data) => {
s.emit('score_updated_ack');
  console.log("CollaborativeProvider: Score updated by another user:", data);
  
  // FIXED: Add timestamp validation to prevent stale updates
  const updateAge = Date.now() - new Date(data.timestamp).getTime();
  if (updateAge > 600000) { // 10minutes
    console.warn("COLLAB: Ignoring stale score update:", { updateAge, data });
    return;
  }
  
  // FIXED: Log for debugging
  console.log("COLLAB SCORE UPDATE:", {
    team: data.team,
    newScore: data.newScore,
    reason: data.reason,
    updateAge,
    timestamp: data.timestamp
  });
  
  // ✅ FIXED: Check the correct nested field for userId

  
  if (stateCallbacksRef.current.onScoreUpdate) {
    console.log("CollaborativeProvider: Calling onScoreUpdate callback");
    
    const normalizedData = {
      ...data,
      scoreChange: data.change || data.scoreChange || 1,
      newScore: data.newScore,
      team: data.team,
      reason: data.reason,
      updatedBy: data.updatedBy,
      userId: data.updatedBy?.userId, // ✅ FIXED: Extract from correct location
      username: data.updatedBy?.username || data.username,
      timestamp: data.timestamp
    };
    
    stateCallbacksRef.current.onScoreUpdate(normalizedData);
  }
});

    s.on("stat_updated", (data) => {
      console.log("Stat updated by another user:", data);
      if (stateCallbacksRef.current.onStatUpdate) {
        stateCallbacksRef.current.onStatUpdate(data);
      }
    });

    s.on("assignment_error", (data) => {
      console.error("Assignment error from server:", data);
      addNotification("Assignment validation failed. Please reassign players.", "error");
      s.emit("get_assignments", { matchId: currentMatchId });
    });

    s.on("stat_log_error", (data) => {
      console.error("Stat logging error:", data);
      addNotification(`Stat logging failed: ${data.reason}`, "error");
    });

    s.on("action_superseded", (data) => {
      addNotification(`Your action was superseded by ${data?.supersededBy?.username}`, "warning");
    });
	
	s.on("compare_court_state", (data) => {
  console.log("📊 Comparing court states with other user");
  
  // Send back our current state for comparison
  socket.emit("court_state_comparison", {
    matchId: data.matchId,
    myCourtPlayers: courtPlayers,
    theirCourtPlayers: data.myCourtPlayers,
    myUserId: getUserId(),
    theirUserId: data.myUserId,
    timestamp: new Date().toISOString()
  });
});

/* ------------------------------ Assist Flow Events ----------------------- */

s.on("assist_waiting_started", (data) => {
  console.log("⏳ CollaborativeProvider: Assist waiting started:", {
    assistPlayer: data.assistPlayer?.name,
    initiatedBy: data.initiatedBy?.username
  });
  
  // Call registered callback if exists
  if (stateCallbacksRef.current.onAssistWaitingStarted) {
    stateCallbacksRef.current.onAssistWaitingStarted(data);
  }
});

s.on("assist_kill_completed", (data) => {
  console.log("✅ CollaborativeProvider: Assist-kill completed:", {
    assistPlayer: data.assistPlayer?.name,
    killPlayer: data.killPlayer?.name,
    completedBy: data.completedBy?.username
  });
  
  // Call registered callback if exists
  if (stateCallbacksRef.current.onAssistKillCompleted) {
    stateCallbacksRef.current.onAssistKillCompleted(data);
  }
});

s.on("assist_timeout", (data) => {
  console.log("⏰ CollaborativeProvider: Assist timeout:", {
    assistPlayer: data.assistPlayer?.name
  });
  
  // Call registered callback if exists
  if (stateCallbacksRef.current.onAssistTimeout) {
    stateCallbacksRef.current.onAssistTimeout(data);
  }
});

s.on("court_state_comparison", (data) => {
  console.log("📋 Received court state comparison");
  
  // If they have different players than us, use the most recent update
  const hasConflict = JSON.stringify(data.myCourtPlayers) !== JSON.stringify(data.theirCourtPlayers);
  
  if (hasConflict && stateCallbacksRef.current.onCourtPlayersUpdate) {
    console.log("⚠️ Court player conflict detected - using other user's state");
    stateCallbacksRef.current.onCourtPlayersUpdate(data.myCourtPlayers, {
      source: 'conflict_resolution',
      updatedBy: { userId: data.myUserId, username: 'Another user' }
    });
  }
});

    s.on("action_ignored", (data) => {
      if (data?.reason === "duplicate_score_change") {
        addNotification("Duplicate score change prevented", "info");
      }
    });
  // Add a test event listener
  s.on("test_event", (data) => {
    console.log("🔥 TEST EVENT received:", data);
  });
    s.connect();
  };

  useEffect(() => {
    if (!token || !user || !collaborativeMode) {
      cleanup();
      if (socketRef.current) {
        console.log("Disconnecting socket - collaborative mode OFF or no auth");
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setIsConnected(false);
      setActiveSessions([]);
      setPlayerAssignments([]);
      setSessionId(null);
      return;
    }

    console.log("Creating socket - collaborative mode ON from matchSettings");
    createSocket();

    return () => {
      cleanup();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
    };
  }, [API_BASE, token, user, collaborativeMode]);

  useEffect(() => {
    if (!collaborativeMode && socketRef.current) {
      console.log("EMERGENCY DISCONNECT - Collaborative mode turned OFF in matchSettings");
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      cleanup();
    }
  }, [collaborativeMode]);

const showActionToast = useCallback((message, type = 'success') => {
  const toastId = `toast-${Date.now()}`;
  const toast = {
    id: toastId,
    message,
    type,
    timestamp: Date.now()
  };
  
  setRecentActions(prev => [...prev.slice(-2), toast]); // Keep only last 3 toasts
  
  // Auto-remove toast after 1 second
  setTimeout(() => {
    setRecentActions(prev => prev.filter(t => t.id !== toastId));
  }, 1000)
}, []);

  const joinMatch = useCallback(async (matchId) => {
    console.log('Starting joinMatch process:', {
      matchId,
      collaborativeMode,
      hasToken: !!token,
      hasUser: !!user,
      joiningInProgress: joiningMatchRef.current
    });

    if (joiningMatchRef.current) {
      console.log("Already joining match, skipping duplicate request");
      return false;
    }

    if (!matchId) {
      console.log("No match ID provided");
      addNotification("No match selected.", "error");
      return false;
    }

    if (!token || !user) {
      console.log("Missing authentication");
      addNotification("Authentication required to join collaborative match.", "error");
      return false;
    }

    if (!collaborativeMode) {
      console.log("Collaborative mode not enabled in match settings");
      addNotification("Collaborative mode must be enabled in match settings.", "error");
      return false;
    }

    joiningMatchRef.current = true;

   try {
    const currentSessionId = sessionId || generateSessionId();
    console.log('🔥 Generated session ID:', currentSessionId);
    setSessionId(currentSessionId);

    const connectedSocket = await ensureSocketConnection();
    if (!connectedSocket) {
      throw new Error("Failed to establish socket connection");
    }

    console.log('🔥 Socket is connected, emitting join_match event');
    setCurrentMatchId(matchId);

    connectedSocket.emit("join_match", {
      matchId,
      sessionId: currentSessionId,
      userId: getUserId(),
    });

    console.log('🔥 join_match event emitted');
    setupHeartbeat(matchId);
    return true;

  } catch (error) {
    console.log('🔥 Join match failed:', error.message);
    return false;
  }
},  [sessionId, token, user, collaborativeMode, addNotification, getUserId]);

  const ensureSocketConnection = useCallback(async () => {
    console.log('Ensuring socket connection...');
    
    let socket = socketRef.current;

    if (!socket) {
      console.log('Creating new socket');
      createSocket();
      await waitForSocketCreation();
      socket = socketRef.current;
    }

    if (!socket) {
      throw new Error("Socket creation failed");
    }

    if (!socket.connected) {
      console.log('Waiting for socket connection...');
      await waitForConnection(socket);
    }

    console.log('Socket connection established:', socket.id);
    return socket;
  }, []);

  const waitForSocketCreation = useCallback(async () => {
    const maxAttempts = 10;
    const delay = 100;

    for (let i = 0; i < maxAttempts; i++) {
      if (socketRef.current) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    throw new Error("Socket creation timeout");
  }, []);

  const waitForConnection = useCallback(async (socket) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Connection timeout after 10 seconds"));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
      };

      const onConnect = () => {
        console.log('Socket connected during wait');
        cleanup();
        resolve();
      };

      const onError = (err) => {
        console.log('Socket connection error:', err.message);
        cleanup();
        reject(err);
      };

      if (socket.connected) {
        cleanup();
        resolve();
        return;
      }

      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
    });
  }, []);

  const setupHeartbeat = useCallback((matchId) => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }

    heartbeatRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (socket?.connected && connectionStateRef.current === 'connected') {
        socket.emit("heartbeat", { 
          matchId,
          userId: getUserId(),
          sessionId: sessionId
        });
      }
    }, 30000);

    console.log('Heartbeat configured for match:', matchId);
  }, [getUserId, sessionId]);

  const requestSetEndingLock = useCallback((winner, finalScore) => {
  if (!socket || !currentMatchId) return false;
  
  socket.emit('set_ending_lock_requested', {
    matchId: currentMatchId,
    winner,
    finalScore,
    requestedBy: {
      userId: getUserId(),
      username: user?.username || user?.name || 'User'
    },
    timestamp: new Date().toISOString()
  });
  
  return true;
}, [socket, currentMatchId, user]);

const releaseSetEndingLock = useCallback((reason) => {
  if (!socket || !currentMatchId) return false;
  
  socket.emit('set_ending_lock_released', {
    matchId: currentMatchId,
    reason, // 'decision_made', 'cancelled', or 'timeout'
    releasedBy: {
      userId: getUserId(),
      username: user?.username || user?.name || 'User'
    },
    timestamp: new Date().toISOString()
  });
  
  return true;
  }, [socket, currentMatchId, user]);
  
  const leaveMatch = useCallback(() => {
    const s = socketRef.current;
    if (s && currentMatchId && s.connected) {
      s.emit("leave_match", { 
        matchId: currentMatchId,
        userId: getUserId(),
		sessionId
      });
    }
    
    cleanup();
    setCurrentMatchId(null);
    setActiveSessions([]);
    setPlayerAssignments([]);
    setSessionId(null);
    joiningMatchRef.current = false;
  }, [currentMatchId, user]);

const logStat = useCallback(async (playerId, statType, value, additionalData = {}) => {
  console.log('🎯 logStat called:', { playerId, statType, value, collaborativeMode });
  
  if (!collaborativeMode) {
    console.log('📍 Non-collaborative mode - returning false to use local logging');
    return false;
  }
  
  const s = socketRef.current;
  const currentUserId = getUserId();
  
  // ============================================
  // FALLBACK LAYER 1: Check socket connection
  // ============================================
  if (!s || !currentMatchId || !s.connected) {
    console.warn('⚠️ Socket not connected, falling back to direct API');
    return await fallbackToDirectAPI(playerId, statType, value, additionalData);
  }
  
  // ============================================
  // ASSIGNMENT CHECK: Find existing assignment (but don't block)
  // ============================================
  const assignment = playerAssignments.find(
    (a) => a.playerId === playerId && a.isActive
  );
  
  // 🔥 FIXED: Just log who has the assignment, but don't block stat logging
  if (assignment) {
    const isMyAssignment = assignment.assignedTo?.userId === currentUserId;
    console.log(`📋 Player assignment status:`, {
      playerId,
      assignedTo: assignment.assignedTo?.username,
      isMyAssignment,
      loggingAsUser: user?.displayName || user?.email
    });
    
    if (!isMyAssignment) {
      console.log(`ℹ️ Logging stat for player assigned to ${assignment.assignedTo?.username}, but proceeding anyway`);
    }
  } else {
    console.log(`ℹ️ No assignment for player ${playerId}, proceeding with stat log`);
  }
  
  // ============================================
  // PRIMARY PATH: Collaborative socket emit (ALWAYS proceed)
  // ============================================
  try {
    const payload = {
      matchId: currentMatchId,
      playerId,
      statType,
      value,
      timestamp: new Date().toISOString(),
      userId: currentUserId,
      sessionId,
      statKeys: additionalData.statKeys,
      // Include assignment info if it exists (for audit trail)
      assignmentInfo: assignment ? {
        assignedTo: assignment.assignedTo,
        assignedAt: assignment.assignedAt,
        loggedByDifferentUser: assignment.assignedTo?.userId !== currentUserId
      } : null,
      ...additionalData,
    };
    
    console.log('📤 Emitting log_stat via socket:', payload);
    
    // Emit with acknowledgment timeout
    const emitPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket emit timeout'));
      }, 3000);
      
      s.emit("log_stat", payload, (response) => {
        clearTimeout(timeout);
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
      
      // If no acknowledgment callback, resolve after emit
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ sent: true });
      }, 100);
    });
    
    await emitPromise;
    console.log('✅ Stat logged via socket successfully');
    return true;
    
  } catch (socketError) {
    console.error('❌ Socket emit failed:', socketError);
    // Fall through to API fallback
  }
  
  // ============================================
  // FALLBACK LAYER 2: Direct API call
  // ============================================
  return await fallbackToDirectAPI(playerId, statType, value, additionalData);
  
}, [
  collaborativeMode, 
  currentMatchId, 
  playerAssignments, 
  sessionId, 
  user, 
  token, 
  API_BASE, 
  getUserId
]);

// Helper function for direct API fallback
const fallbackToDirectAPI = useCallback(async (playerId, statType, value, additionalData = {}) => {
  console.log('🔄 Attempting direct API fallback for stat logging');
  
  // 🔥 FIXED: No permission checks - always allow stat logging
  try {
    const statKeys = additionalData.statKeys || [statType];
    const updates = {};
    
    statKeys.forEach(key => {
      updates[key] = value;
    });
    
    const response = await axios.post(
      `${API_BASE}/api/players/${playerId}/stats`,
      {
        ...updates,
        matchId: currentMatchId,
        timestamp: new Date().toISOString(),
        source: 'collaborative_fallback'
      },
      {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        withCredentials: true,
        timeout: 5000
      }
    );
    
    console.log('✅ Stat logged via direct API successfully');
    addNotification('Stat recorded (direct save)', 'success');
    return true;
    
  } catch (apiError) {
    console.error('❌ Direct API fallback failed:', apiError);
    
    // ============================================
    // FALLBACK LAYER 3: Queue for later retry
    // ============================================
    try {
      const failedStat = {
        playerId,
        statType,
        value,
        statKeys: additionalData.statKeys,
        matchId: currentMatchId,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        maxRetries: 5
      };
      
      const queueKey = 'loggerhead_failed_stats';
      const existingQueue = JSON.parse(localStorage.getItem(queueKey) || '[]');
      existingQueue.push(failedStat);
      localStorage.setItem(queueKey, JSON.stringify(existingQueue));
      
      console.log('📦 Stat queued for retry:', failedStat);
      addNotification('Stat saved locally - will sync when connection restores', 'warning');
      
      setTimeout(() => retryFailedStats(), 5000);
      return true;
      
    } catch (queueError) {
      console.error('❌ Failed to queue stat:', queueError);
      addNotification('Warning: Stat may not have been saved', 'error');
      return false;
    }
  }
}, [API_BASE, currentMatchId, token, addNotification]);

// Retry failed stats from queue
const retryFailedStats = useCallback(async () => {
  const queueKey = 'loggerhead_failed_stats';
  
  try {
    const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    
    if (queue.length === 0) return;
    
    console.log(`🔄 Retrying ${queue.length} failed stats...`);
    
    const stillFailed = [];
    
    for (const stat of queue) {
      if (stat.retryCount >= stat.maxRetries) {
        console.warn('⚠️ Stat exceeded max retries, discarding:', stat);
        continue;
      }
      
      try {
        const success = await fallbackToDirectAPI(
          stat.playerId,
          stat.statType,
          stat.value,
          { statKeys: stat.statKeys }
        );
        
        if (success) {
          console.log('✅ Retry successful for stat:', stat);
        } else {
          stat.retryCount++;
          stillFailed.push(stat);
        }
      } catch (retryError) {
        stat.retryCount++;
        stillFailed.push(stat);
      }
    }
    
    // Update queue with remaining failed stats
    localStorage.setItem(queueKey, JSON.stringify(stillFailed));
    
    if (stillFailed.length === 0) {
      addNotification('All pending stats synced successfully!', 'success');
    } else if (stillFailed.length < queue.length) {
      addNotification(`Synced ${queue.length - stillFailed.length} stats, ${stillFailed.length} still pending`, 'info');
    }
    
  } catch (error) {
    console.error('❌ Retry failed stats error:', error);
  }
}, [fallbackToDirectAPI, addNotification]);

// Periodic retry of failed stats
useEffect(() => {
  if (!collaborativeMode) return;
  
  const retryInterval = setInterval(() => {
    retryFailedStats();
  }, 30000); // Retry every 30 seconds
  
  return () => clearInterval(retryInterval);
}, [collaborativeMode, retryFailedStats]);

// Retry on reconnection
useEffect(() => {
  if (!socket || !collaborativeMode) return;
  
  const handleReconnect = () => {
    console.log('🔄 Socket reconnected, retrying failed stats...');
    setTimeout(() => retryFailedStats(), 1000);
  };
  
  socket.on('connect', handleReconnect);
  
  return () => {
    socket.off('connect', handleReconnect);
  };
}, [socket, collaborativeMode, retryFailedStats]);

 const broadcastSetEndingDecision = useCallback((decision) => {
  if (!collaborativeMode || !isConnected) return false;
  
  const s = socketRef.current;
  if (!s || !currentMatchId || !s.connected) return false;

  s.emit("set_ending_decision", {
    matchId: currentMatchId,
    ...decision,
    timestamp: new Date().toISOString(),
    decidedBy: {
      userId: getUserId(),
      username: user?.username || user?.name || 'User',
    }
  });
  return true;
}, [collaborativeMode, isConnected, currentMatchId, user]);

const broadcastSetEndingCancellation = useCallback(() => {
  if (!collaborativeMode || !isConnected) return false;
  
  const s = socketRef.current;
  if (!s || !currentMatchId || !s.connected) return false;

  s.emit("set_ending_cancelled", {
    matchId: currentMatchId,
    timestamp: new Date().toISOString(),
    cancelledBy: {
      userId: getUserId(),
      username: user?.username || user?.name || 'User',
    }
  });
  return true;
}, [collaborativeMode, isConnected, currentMatchId, user]);

  const isCollaborativeReady = useCallback(() => {
    return collaborativeMode && isConnected && currentMatchId;
  }, [collaborativeMode, isConnected, currentMatchId]);
 
const updateScore = useCallback((team, scoreChange, reason = "manual") => {
  console.log('🚀 updateCollaborativeScore called with:', {
    team, scoreChange, reason, collaborativeMode, isConnected,
    scoringInProgress, timeSinceLastAttempt: Date.now() - lastScoreAttempt
  });

  // ✅ CHECK COOLDOWN FIRST - block if cooldown is active
  if (scoreCooldownActive) {
    console.warn('⏱️ Scoring attempt blocked - cooldown active');
    showActionToast(`Wait ${scoreCooldownRemaining}s before scoring again`, 'warning');
    return false;
  }

  // Prevent rapid scoring (minimum 800ms between attempts)
  const now = Date.now();
  if (scoringInProgress || (now - lastScoreAttempt) < 800) {
    console.warn('⏱️ Scoring attempt blocked - too rapid or in progress');
    showActionToast('Please wait before scoring again', 'warning');
    return false;
  }

  if (!collaborativeMode) {
    console.log('❌ updateCollaborativeScore: collaborative mode disabled');
    return false;
  }
  
  if (!isConnected || !isCollaborativeReady()) {
    console.log('❌ updateCollaborativeScore: not connected or ready');
    showActionToast('Not connected to collaborative session', 'error');
    return false;
  }

  const s = socketRef.current;
  if (!s || !currentMatchId || !s.connected) {
    console.warn('❌ No socket connection for score update');
    return false;
  }

  try {
    setScoringInProgress(true);
    setLastScoreAttempt(now);

    
    setScoreCooldownActive(true);
    setScoreCooldownRemaining(10);

    
    s.emit("manual_score", {
      matchId: currentMatchId,
      team,
      scoreChange,
      reason,
      timestamp: new Date().toISOString(),
      updatedBy: {
        userId: getUserId(),
        username: user?.username || user?.name || 'User',
      },
      sessionId
    });
    
    
    s.emit("score_cooldown_start", {
      matchId: currentMatchId,
      startedBy: {
        userId: getUserId(),
        username: user?.username || user?.name || 'User',
      },
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Score update and cooldown broadcast sent successfully');
    
    // Clear the scoring lock after a short delay
    scoringTimeoutRef.current = setTimeout(() => {
      setScoringInProgress(false);
    }, 500);
    
    return true;
  } catch (error) {
    console.error('💥 Score update error:', error);
    setScoringInProgress(false);
    showActionToast(`Score update error: ${error.message}`, 'error');
    return false;
  }
}, [
  collaborativeMode, 
  isConnected, 
  isCollaborativeReady, 
  scoringInProgress, 
  lastScoreAttempt, 
  scoreCooldownActive,      
  scoreCooldownRemaining,   
  showActionToast, 
  currentMatchId, 
  user, 
  getUserId
]);

  const updateBallState = useCallback((newBallState, additionalData = {}) => {
    if (!collaborativeMode) return false;
    
    const s = socketRef.current;
    if (!s || !currentMatchId || !s.connected) {
      console.error("Cannot sync ball state - not connected:", {
        hasSocket: !!s,
        hasMatchId: !!currentMatchId,
        connected: s?.connected
      });
      return false;
    }

    console.log("Sending ball state change:", {
      ballState: newBallState,
      matchId: currentMatchId,
      userId: getUserId(),
      version: syncedGameState.version + 1
    });

    const payload = {
      matchId: currentMatchId,
      ballState: newBallState,
      timestamp: new Date().toISOString(),
      userId: getUserId(),
	  sessionId,
      username: user?.username || user?.name || 'User',
      version: syncedGameState.version + 1,
      ...additionalData,
    };

    s.emit("ball_state_change", payload);
    return true;
  }, [collaborativeMode, currentMatchId, user, syncedGameState]);

  const updateServeSide = useCallback((newServeSide, additionalData = {}) => {
    if (!collaborativeMode) return false;
    
    const s = socketRef.current;
    if (!s || !currentMatchId || !s.connected) return false;

    setSyncedGameState(prev => ({
      ...prev,
      currentServeSide: newServeSide,
      ballSide: newServeSide,
      lastUpdateBy: user?.username || 'You',
      lastUpdateAt: new Date().toISOString(),
      version: prev.version + 1
    }));

    s.emit("serve_side_change", {
      matchId: currentMatchId,
      serveSide: newServeSide,
      timestamp: new Date().toISOString(),
      userId: getUserId(),
	  sessionId,
      username: user?.username || user?.name || 'User',
      version: syncedGameState.version + 1,
      ...additionalData,
    });
    return true;
  }, [collaborativeMode, currentMatchId, user, syncedGameState]);

  // Enhanced assignPlayer with backend persistence as primary method
  const assignPlayer = useCallback(async (playerId, playerName, assignToUserId, assignToUsername, options = {}) => {
    if (!collaborativeMode) return false;
    
    if (!currentMatchId) {
      console.error('No current match ID for assignment');
      return false;
    }

    try {
      // PRIMARY: Always save to backend first (this makes assignments persistent)
      console.log(`Saving assignment to backend: ${playerName} -> ${assignToUsername}`);
      
      const backendResult = await saveAssignmentToBackend(playerId, playerName, assignToUserId, assignToUsername);
      
      if (backendResult.success) {
        console.log('Assignment saved to backend successfully');
        
        // Update local state immediately for responsive UI
        setPlayerAssignments(prev => [
          ...prev.filter(a => a.playerId !== playerId || !a.isActive),
          {
            playerId: playerId,
            playerName: playerName,
            assignedTo: {
              userId: assignToUserId,
              username: assignToUsername
            },
            assignedBy: getUserId(),
            assignedAt: new Date().toISOString(),
            isActive: true
          }
        ]);

        // SECONDARY: Try socket assignment for real-time updates (for online users only)
        const s = socketRef.current;
        if (s && s.connected) {
          const targetUser = activeSessions.find((as) => as.userId === assignToUserId);
          
          if (targetUser) {
            console.log(`Sending real-time update via socket for online user ${assignToUsername}`);
            s.emit("assign_player", {
              matchId: currentMatchId,
              playerId,
              playerName,
              assignToUserId,
              assignToUsername,
              assignedBy: getUserId(),
              assignedByUsername: user?.username || user?.displayName || user?.email || 'Unknown User',
              targetUser: {
                userId: targetUser.userId,
                username: targetUser.username,
                sessionId: targetUser.sessionId
              }
            });
          }
        }

        return true;
      } else {
        console.error('Backend assignment failed');
        addNotification('Failed to assign player. Please try again.', 'error');
        return false;
      }

    } catch (error) {
      console.error('Error in assignPlayer:', error);
      addNotification(`Assignment failed: ${error.message}`, 'error');
      return false;
    }
  }, [collaborativeMode, currentMatchId, activeSessions, addNotification, user, saveAssignmentToBackend, getUserId]);

  const getPlayerAssignment = useCallback((playerId) => {
    const assignment = playerAssignments.find((a) => a.playerId === playerId && a.isActive);
    return assignment;
  }, [playerAssignments]);

  const isAssignedToPlayer = useCallback((playerId) => {
    const a = getPlayerAssignment(playerId);
    const currentUserId = getUserId();
    const result = !!a && a.assignedTo?.userId === currentUserId;
    return result;
  }, [getPlayerAssignment, user]);

  const getTrackingStatus = useCallback((playerId) => {
    const a = getPlayerAssignment(playerId);
    if (!a) return null;
    const isMe = a.assignedTo?.userId === user?.id;
    return {
      isAssigned: true,
      isMe,
      trackedBy: isMe ? "You" : a.assignedTo?.username,
      trackedByUserId: a.assignedTo?.userId,
      assignedAt: a.assignedAt,
    };
  }, [getPlayerAssignment, user?.id]);

  const setCollaborativeModeState = useCallback((enabled) => {
    console.log(`CollaborativeProvider: Collaborative mode ${enabled ? 'enabled' : 'disabled'} in matchSettings`);
  });

const syncCourtPlayers = useCallback(async (courtPlayers, meta = {}) => {
  console.log("🔥 syncCourtPlayers called:", { 
    collaborativeMode, 
    isConnected, 
    hasSocket: !!socketRef.current,
    currentMatchId,
    courtPlayersCount: courtPlayers?.length 
  });
  
  if (!collaborativeMode || !isConnected) {
    console.warn("🔥 syncCourtPlayers: Not syncing - collaborative mode or connection issue");
    return false;
  }
  
  const socket = socketRef.current;
  if (!socket || !currentMatchId) {
    console.warn("🔥 syncCourtPlayers: No socket or match ID");
    return false;
  }

  const payload = {
    matchId: currentMatchId,
    courtPlayers,
    timestamp: new Date().toISOString(),
    userId: getUserId(),
    username: user?.displayName || user?.email?.split('@')[0] || 'Unknown',
    ...meta
  };
  
  console.log("🔥 syncCourtPlayers: Emitting court_players_update", payload);
  socket.emit("court_players_update", payload);
  
  return true;
}, [collaborativeMode, isConnected, currentMatchId, user]);

const syncPositionMapping = useCallback(async (positionMapping, meta = {}) => {
  if (!collaborativeMode || !isConnected) return false;
  
  const socket = socketRef.current;
  if (!socket || !currentMatchId) return false;

  socket.emit("position_mapping_update", {
    matchId: currentMatchId,
    positionMapping,
    timestamp: new Date().toISOString(),
    userId: getUserId(),
    ...meta
  });
  return true;
}, [collaborativeMode, isConnected, currentMatchId]);

// Sync express settings (playerOnOffStatus, etc.)
const syncExpressSettings = useCallback(async (expressSettings, meta = {}) => {
  console.log("🔥 syncExpressSettings called:", { 
    collaborativeMode, 
    isConnected, 
    hasSocket: !!socketRef.current,
    currentMatchId,
    action: meta.action
  });
  
  if (!collaborativeMode || !isConnected) {
    console.warn("🔥 syncExpressSettings: Not syncing - collaborative mode or connection issue");
    return false;
  }
  
  const socket = socketRef.current;
  if (!socket || !currentMatchId) {
    console.warn("🔥 syncExpressSettings: No socket or match ID");
    return false;
  }

  const payload = {
    matchId: currentMatchId,
    expressSettings,
    timestamp: new Date().toISOString(),
    updatedBy: {
      userId: getUserId(),
      username: user?.displayName || user?.email?.split('@')[0] || 'Unknown'
    },
    ...meta
  };
  
  console.log("🔥 syncExpressSettings: Emitting express_settings_update", payload);
  socket.emit("express_settings_update", payload);
  
  return true;
}, [collaborativeMode, isConnected, currentMatchId, user]);


  const setMatchId = useCallback(async (matchId) => {
    console.log(`Setting match ID: ${matchId}`);
    setCurrentMatchId(matchId);
    
    // Automatically load assignments for this match
    if (matchId && token && user) {
      console.log(`Loading assignments for match ${matchId}`);
      await loadAssignmentsFromBackend(matchId);
    }
  }, [token, user, loadAssignmentsFromBackend]);

  const restoreCollaborativeModeFromMatch = useCallback((matchCollaborativeMode) => {
    if (matchCollaborativeMode && matchCollaborativeMode.enabled) {
      console.log("Collaborative mode enabled from match settings");
      return true;
    }
    return false;
  }, []);

useEffect(() => {
  if (!socket || !collaborativeMode) return;

  const handleScoreUpdateError = (data) => {
    console.error('🎯 Score update error from server:', data);
    setScoringInProgress(false);
    
    if (data.finalAttempt) {
      showActionToast(`Score update failed: ${data.error}`, 'error');
      
      // Show a more detailed error modal for final failures
      if (data.error.includes('race condition') || data.error.includes('attempts')) {
        addNotification(
          'Score update failed due to network issues. Please try again in a moment.',
          'error'
        );
      }
    } else {
      showActionToast('Retrying score update...', 'info');
    }
  };

  const handleConnectionLost = () => {
    console.warn('🔌 Connection lost during scoring');
    setScoringInProgress(false);
    showActionToast('Connection lost - score may not have updated', 'warning');
  };

  socket.on('score_update_error', handleScoreUpdateError);
  socket.on('disconnect', handleConnectionLost);
  socket.on('connect_error', handleConnectionLost);

  return () => {
    socket.off('score_update_error', handleScoreUpdateError);
    socket.off('disconnect', handleConnectionLost);
    socket.off('connect_error', handleConnectionLost);
  };
}, [socket, collaborativeMode, showActionToast, addNotification]);  
  
useEffect(() => {
  if (!collaborativeMode || !currentMatchId || !isConnected) {
    if (assignmentPollingRef.current) {
      clearInterval(assignmentPollingRef.current);
      assignmentPollingRef.current = null;
    }
    return;
  }

  // Poll every 10 seconds as a fallback
  assignmentPollingRef.current = setInterval(() => {
    console.log('📊 Polling for assignment updates...');
    loadAssignmentsFromBackend();
  }, 10000);

  return () => {
    if (assignmentPollingRef.current) {
      clearInterval(assignmentPollingRef.current);
    }
  };
}, [collaborativeMode, currentMatchId, isConnected, loadAssignmentsFromBackend]);  


  const value = {
    // connection/session
    socket,
    isConnected,
    sessionId,
    currentMatchId,
    collaborativeMode,
    isCollaborativeReady,

    // presence/assignment
    activeSessions,
    playerAssignments,

    // synchronized game state
    syncedGameState,
    registerStateCallbacks,
	scoreCooldownActive,
    scoreCooldownRemaining,

    // general actions
    joinMatch,
    leaveMatch,
    setMatchId,
    logStat,
    updateScore,
    updateBallState,
    updateServeSide,
    assignPlayer,
    setCollaborativeModeState,
    restoreCollaborativeModeFromMatch,
	getTeamOnlineStatus,
	syncCourtPlayers,
    syncPositionMapping,
    syncExpressSettings,
	
	// NEW: Set ending coordination
	 setEndingLocked,
     setEndingLockInfo,
     requestSetEndingLock,
     releaseSetEndingLock,
    broadcastSetEndingDecision,
    broadcastSetEndingCancellation,

    // backend persistence functions
    loadAssignmentsFromBackend,
    saveAssignmentToBackend,
    removeAssignmentFromBackend,
	

    // notifications
    notifications,
	addNotification,
    removeNotification,

    // utils
    getPlayerAssignment,
    isAssignedToPlayer,
    getTrackingStatus,
  };

  return <CollaborativeContext.Provider value={value}>{children}</CollaborativeContext.Provider>;
};