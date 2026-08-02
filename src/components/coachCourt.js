// src/components/coachCourt.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import axios from "axios";
import { useDrag, useDrop } from "react-dnd";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

// Retry a PUT/POST on 5xx or network error, up to maxRetries times.
// Does NOT retry 4xx (client errors). Never writes to the offline queue —
// these saves are full-state overwrites, so queuing stale data would corrupt newer state.
async function withRetry(fn, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response && err.response.status < 500) throw err; // 4xx — don't retry
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500)); // 500ms, 1s
      } else {
        throw err;
      }
    }
  }
}

// Slot labels aligned to your existing convention
// Index 0..5 => positions: 4,3,2,5,6,1
const positionLabels = ["4", "3", "2", "5", "6", "1"];
const romanByIndex = ["IV", "III", "II", "V", "VI", "I"];


const rotateCourt = (oldCourt) => {
  const c = [...oldCourt];
  return [c[3], c[0], c[1], c[4], c[5], c[2]];
};

// Helper to determine LP2 slot based on LP1 slot
// LP1 Position 5 (slot 3) → LP2 Position 1 (slot 5)
// LP1 Position 6 (slot 4) → LP2 Position 3 (slot 1)  
// LP1 Position 4 (slot 0) → LP2 Position 2 (slot 2)
const getLP2Slot = (lp1Slot) => {
  const mapping = {
3:2,
4:1,
5:0,
  };
  return mapping[lp1Slot];
};

const getContrastColor = (hex) => {
  if (!hex) return "#FFFFFF";
  // Remove hash if present
  const color = hex.replace("#", "");
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  
  // Brightness formula (HSP)
  const brightness = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  
  // If brightness is > 127.5, it's a light color; return black text. 
  // Otherwise, return white text.
  return brightness > 127.5 ? "#000000" : "#FFFFFF";
};

const emptyPlayer = { name: "?", number: "?" };

const getApiUrl = () => {
  const h = window.location.hostname;
  if (typeof window !== 'undefined' && !window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const DraggableBenchCard = ({ player, canSub, slot5TargetId, allowedLiberoSubTarget, liberoPartners = {} }) => {
  if (!player) return <div style={{ height: 40 }} />;

  // Check if this player is a libero partner
  const isLiberoPartner =
    (slot5TargetId && player?._id === slot5TargetId._id) ||
    (allowedLiberoSubTarget && player?._id === allowedLiberoSubTarget._id);

  // Determine styling: libero gets lilac background, partners get lighter lilac background
  const bgColor = player?.isLibero ? "#E6D5F5" : isLiberoPartner ? "#fff" : "#fff";
  const textColor = "#333";
  
  const lpDesignation = liberoPartners[player?._id];

  if (!canSub) {
    return (
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          background: bgColor,
          opacity: 0.45,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          userSelect: "none",
          color: textColor,
        }}
        title={`${player.name} #${player.number}${player.isLibero ? " (Libero)" : ""}`}
      >
        {player.number}
      </div>
    );
  }

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: "COACH_PLAYER",
      item: player,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [player]
  );

  return (
    <div
      ref={drag}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.15)",
        background: bgColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        userSelect: "none",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        color: textColor,
        position: "relative",
      }}
      title={`${player.name} #${player.number}${player.isLibero ? " (Libero)" : ""}${lpDesignation ? ` (${lpDesignation})` : ""}`}
    >
      {player.number}
      {lpDesignation && (
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            fontSize: 7,
            fontWeight: 900,
            color: "#8B5CF6",
            background: "rgba(139, 92, 246, 0.2)",
            padding: "1px 3px",
            borderRadius: 3,
            lineHeight: 1,
          }}
        >
          {lpDesignation}
        </div>
      )}
    </div>
  );
};

// Droppable Bench Area for Regular Players
const DroppableBenchArea = ({ children, onDrop }) => {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: "COACH_PLAYER",
      drop: (item) => {
        if (onDrop) onDrop(item);
      },
      canDrop: () => true,
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDrop]
  );

  return (
    <div
      ref={drop}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        maxHeight: 200,
        overflowY: "auto",
        padding: 8,
        borderRadius: 12,
        border: `2px dashed ${isOver && canDrop ? "#007AFF" : "rgba(0,0,0,0.1)"}`,
        backgroundColor: isOver && canDrop ? "rgba(0, 122, 255, 0.05)" : "transparent",
        minHeight: 100,
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </div>
  );
};

// Droppable Libero Area (max 2 liberos total across court and bench)
const DroppableLiberoArea = ({ children, onDrop, liberoCount, totalLiberoCount }) => {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: "COACH_PLAYER",
      drop: (item) => {
        if (onDrop) onDrop(item);
      },
      canDrop: (item) => {
        // If player is already a libero, allow (just moving them around)
        if (item.isLibero) return true;
        // If adding a new libero, check TOTAL count (court + bench)
        return totalLiberoCount < 2;
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDrop, totalLiberoCount]
  );

  const isFull = totalLiberoCount >= 2;

  return (
    <div
      ref={drop}
      style={{
        display: "flex",
        gap: 8,
        padding: 8,
        borderRadius: 12,
        border: `2px dashed ${
          isOver && canDrop 
            ? "#8B5CF6" 
            : isFull 
            ? "rgba(139, 92, 246, 0.3)" 
            : "rgba(139, 92, 246, 0.2)"
        }`,
        backgroundColor: isOver && canDrop ? "rgba(139, 92, 246, 0.05)" : "#F5F0FF",
        minHeight: 60,
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </div>
  );
};

export default function CoachCourt({
  matchSettings,
  setMatchSettings,
  courtPlayers,
  benchPlayers,
  updatePlayersOnCourt,
  refreshBench,
  ourScore,
  opponentScore,
  setOurScore,
  setOpponentScore,
  onAddPoint,
  teamName = "Our Team",
  opponentName = "Opponent",
  ourSetsWon = 0,
  opponentSetsWon = 0,
  slot5TargetId = null,
  allowedLiberoSubTarget = null,
  setSlot5TargetId = () => {},
  setAllowedLiberoSubTarget = () => {},
  currentMatchId = null,
  saveMatchData = null,
  isSetComplete,
  setIsSetComplete,
  // ✅ NEW PROPS FOR SET ENDING DECISION
  setEndingDecision,
  onSetEndingConfirm,
  onSetEndingCancel,
  setEndingInProgressRef,
  isSetEndingInProgress = false,
  showAlert,
  ensureMatchIsFinalAndNavigate,
  matchFinalizedRef,
  isMobile = false,
  isPortrait = false,
}) {
  // Get auth token directly from useAuth hook
  const { token } = useAuth();
  const navigate = useNavigate();
  // Local-only analytics (no DB, no action log)
  const [servingSide, setServingSide] = useState("our"); // "our" | "their"
  const [rotationIndex, setRotationIndex] = useState(0); // 0..5
  // Initialize subCount from localStorage for this match
  const [subLog, setSubLog] = useState([]);
  const [isSetLive, setIsSetLive] = useState(false);
  const [setNumber, setSetNumber] = useState(1);
  // ✅ REWRITTEN: Removed - using props from App.js instead
  // const [setEndingInProgress, setSetEndingInProgress] = useState(false);
  const [pendingWinner, setPendingWinner] = useState(null);
  // ✅ REWRITTEN: Removed - using props from App.js instead
  // const [pendingSetWinner, setPendingSetWinner] = useState(null);
  const [maxSubs, setMaxSubs] = useState(15);
  // Track libero partners: { playerId: 'LP1' or 'LP2' }
  const [liberoPartners, setLiberoPartners] = useState({});
  // ✅ REWRITTEN: Removed - no longer needed
  // const setFinalizingRef = useRef(false);
  const isTransitioningRef = useRef(false);

  const circles = Array.from({ length: maxSubs }, (_, i) => i + 1);
  const isFilled = (index) => index < subCount; 

const prevSetRef = useRef(matchSettings?.currentSet);  
  
  // Initialize team colors from localStorage, falling back to defaults
const [ourTeamColor, setOurTeamColor] = useState("#34C759");
const [opponentTeamColor, setOpponentTeamColor] = useState("#FF3B30");

// Breakdown counters
const [ourPointsEarned, setOurPointsEarned] = useState(0);
const [ourPointsByTheirErrors, setOurPointsByTheirErrors] = useState(0);
const [theirPointsEarned, setTheirPointsEarned] = useState(0);
const [theirPointsByOurErrors, setTheirPointsByOurErrors] = useState(0);

  // rotation +/- (index 0..5)
  const [rotationPM, setRotationPM] = useState(() => 
  Array(6).fill(null).map((_, i) => ({ rotationIndex: i, plusMinus: 0, players: [] }))
);



  // player +/- keyed by playerId
  const [playerPM, setPlayerPM] = useState({}); 
  const lastSavedSetRef = useRef(setNumber);// { [id]: number }

  // Ensure court has 6 slots
  const safeCourt = useMemo(() => {
    const c = Array.isArray(courtPlayers) ? [...courtPlayers] : [];
    while (c.length < 6) c.push({ ...emptyPlayer });
    return c.slice(0, 6);
  }, [courtPlayers]);

const subCount = useMemo(() => {
  // Only count entries where neither the player coming IN nor OUT is a libero
  return subLog.filter(entry => 
    entry.type === "substitution" && 
    !entry.inLibero && 
    !entry.outLibero
  ).length;
}, [subLog]);

  const serverSlotIndex = 5; // position "1" is index 5 in your labels array

  // Helpers
  const applyDeltaToOnCourtPlayers = (delta) => {
    setPlayerPM((prev) => {
      const next = { ...prev };
      safeCourt.forEach((p) => {
        if (p && p._id && p.name !== "?") {
          next[p._id] = (next[p._id] || 0) + delta;
        }
      });
      return next;
    });
  };
 

  const toggleServe = () => {
    setServingSide((prev) => (prev === "our" ? "their" : "our"));
  };
  
  const adjustOurScore = (delta) => {
  //const next = Math.max(0, ourScore + delta);
  onAddPoint(our, delta);
};

const adjustOpponentScore = (delta) => {
// const next = Math.max(0, opponentScore + delta);
//  setOpponentScore(next);
  onAddPoint(opponent, delta);
};

const applyDeltaToRotation = (delta) => {
  setRotationPM((prev) => {
    const next = [...prev];
    const current = next[rotationIndex];
    
    // ✅ Ensure current rotation exists with default structure
    if (!current) {
      next[rotationIndex] = {
        rotationIndex,
        plusMinus: delta,
        players: []
      };
      return next;
    }
    
    // Capture current court snapshot
    const currentLineup = courtPlayers
      .filter(p => p && p.name && p.name !== "?")
      .map(p => ({ playerId: p._id, name: p.name, number: p.number }));

    next[rotationIndex] = {
      ...current,
      plusMinus: (current.plusMinus || 0) + delta,
      players: currentLineup 
    };
    return next;
  });
};

  const doRotateIfSideout = async (winner) => {
    // Only rotate when WE win a point while THEY were serving (we gain serve)
    const weGainedServe = winner === "our" && servingSide === "their";

    if (weGainedServe) {
      // Check for libero rotation off court
      const oldCourt = safeCourt;
      const liberoAtIndex3 = oldCourt[3]?.isLibero;
      const hasReplacedPlayer = oldCourt[3]?.replacedPlayer;

      // If libero is at position 3 and needs to rotate off
      if (liberoAtIndex3 && hasReplacedPlayer) {
        const libero = oldCourt[3];
        const replacedPlayer = libero.replacedPlayer;

        try {
          // Update database
          await Promise.all([
            axios.put(`${API_URL}/api/players/${libero._id}`, { isOnCourt: false }, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            axios.put(`${API_URL}/api/players/${replacedPlayer._id}`, { isOnCourt: true }, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          // Build new court with libero off, replaced player coming back
          const newCourt = [replacedPlayer, oldCourt[0], oldCourt[1], oldCourt[4], oldCourt[5], oldCourt[2]];
          
          // Update slot5TargetId to whoever is rotating into position 5
          const playerRotatingIntoSlot5 = oldCourt[2];
          if (playerRotatingIntoSlot5 && playerRotatingIntoSlot5.name !== "?" && !playerRotatingIntoSlot5.isLibero) {
            setSlot5TargetId(playerRotatingIntoSlot5);
          }

          updatePlayersOnCourt(newCourt);
          setRotationIndex((prev) => (prev + 1) % 6);
          
          // Add libero back to bench
          refreshBench();
        } catch (error) {
          console.error("❌ Libero rotation failed:", error);
          return;
        }
      } else {
        // Normal rotation (no libero special handling)
        const rotated = rotateCourt(safeCourt);
        updatePlayersOnCourt(rotated);
        setRotationIndex((prev) => (prev + 1) % 6);
      }
    }

    // serving side becomes whoever won the rally
    setServingSide(winner);
  };

  // ========== SAVE FUNCTIONS ==========
  // Debounce ref for auto-save
 const scoreSaveTimeoutRef = useRef(null);
const positionSaveTimeoutRef = useRef(null);
const analyticsSaveTimeoutRef = useRef(null);
  

  // Save team colors to localStorage whenever they change





  useEffect(() => {
    if (!currentMatchId || typeof window === "undefined") return;

    const savedOurColor = localStorage.getItem(`match_${currentMatchId}_ourTeamColor`);
    const savedOpponentColor = localStorage.getItem(`match_${currentMatchId}_opponentTeamColor`);

    if (savedOurColor) {
      setOurTeamColor(savedOurColor);
    }
    if (savedOpponentColor) {
      setOpponentTeamColor(savedOpponentColor);
    }
  }, [currentMatchId]);


const processedSetRef = useRef(null);

useEffect(() => {
  const currentSet = matchSettings?.currentSet;
  
  console.log(`🔍 Reset effect triggered:`, {
    currentSet,
    prevSetRef: prevSetRef.current,
    processedSetRef: processedSetRef.current,
    isSetEndingInProgress
  });
  
  if (!currentSet) {
    console.log("⚠️ No currentSet - skipping reset");
    return;
  }
  
  // If we're still processing a set ending, wait
  if (isSetEndingInProgress) {
    console.log("⏸️ Set transition in progress - will retry when complete");
    return;
  }
  
  const previousSet = prevSetRef.current;
  
  // Check if this is a genuine set change we haven't processed yet
  const isNewSetChange = previousSet !== undefined && 
                         currentSet !== previousSet && 
                         processedSetRef.current !== currentSet;
  
  if (isNewSetChange) {
    console.log(`🔄 SET CHANGE DETECTED: Set ${previousSet} → Set ${currentSet}`);
    console.log("🧹 Resetting all analytics for new set...");
    
    // Mark as processed FIRST to prevent duplicate resets
    processedSetRef.current = currentSet;
    
    // Reset local set number
    setSetNumber(currentSet);
    
    // Reset all point breakdown counters
    setOurPointsEarned(0);
    setOurPointsByTheirErrors(0);
    setTheirPointsEarned(0);
    setTheirPointsByOurErrors(0);
    
    // Reset player +/-
    setPlayerPM({});
    
    // Reset rotation +/- (maintain structure with 6 rotations)
    setRotationPM(Array(6).fill(null).map((_, i) => ({
      rotationIndex: i,
      plusMinus: 0,
      players: []
    })));
    
    // Clear substitution log
    setSubLog([]);
    setRotationIndex(0);
    setServingSide("our");
    setIsSetLive(true);
    
    console.log("✅ Analytics reset complete for Set", currentSet);
  } else {
    console.log(`ℹ️ No reset needed - currentSet: ${currentSet}, previousSet: ${previousSet}, alreadyProcessed: ${processedSetRef.current === currentSet}`);
  }
  
  // Always update the ref
  prevSetRef.current = currentSet;
  
}, [matchSettings?.currentSet, isSetEndingInProgress]);

  useEffect(() => {
    if (!currentMatchId) return;
    
    console.log(`🔄 Refreshing bench players for new match: ${currentMatchId}`);
    if (refreshBench && typeof refreshBench === 'function') {
      refreshBench();
    }
  }, [currentMatchId, refreshBench]);


  // Load coach analytics from database when currentMatchId changes
  // This restores all saved analytics, substitutions, +/-, and point breakdowns
  useEffect(() => {
    if (!currentMatchId || !token) return;

    const loadCoachAnalytics = async () => {
      if (matchFinalizedRef?.current) {
  console.log("🛑 Skipping analytics restore — match finalized");
  return;
}
	  
	  try {
        console.log(`📥 Loading coach analytics for match ${currentMatchId}`);
        
        const response = await axios.get(
          `${API_URL}/api/coach-match-analytics/${currentMatchId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );

        if (response.data?.data) {
          const analytics = response.data.data;
          console.log(`✅ Coach analytics loaded for match ${currentMatchId}`, analytics);

          // Restore substitution log from currentSet
          if (Array.isArray(analytics.currentSet?.substitutionLog)) {
            setSubLog(analytics.currentSet.substitutionLog);
            // Count non-libero substitutions to verify subCount will compute correctly
            const expectedSubCount = analytics.currentSet.substitutionLog.filter(entry => 
              entry.type === "substitution" && 
              !entry.inLibero && 
              !entry.outLibero
            ).length;
            console.log(`📊 Restored substitutionLog with ${analytics.currentSet.substitutionLog.length} entries (${expectedSubCount} non-libero subs)`);
          }

          // Restore analytics breakdown (earned points, errors)
          if (analytics.currentSet?.analytics) {
            setOurPointsEarned(analytics.currentSet.analytics.ourPointsEarned || 0);
            setOurPointsByTheirErrors(analytics.currentSet.analytics.ourPointsByTheirErrors || 0);
            setTheirPointsEarned(analytics.currentSet.analytics.theirPointsEarned || 0);
            setTheirPointsByOurErrors(analytics.currentSet.analytics.theirPointsByOurErrors || 0);
          }

          // Restore rotation +/-
          if (Array.isArray(analytics.currentSet?.rotationPlusMinus)) {
            setRotationPM(analytics.currentSet.rotationPlusMinus);
          }

          // Restore player +/-
          if (Array.isArray(analytics.currentSet?.playerPlusMinus)) {
            const playerPMObj = {};
            analytics.currentSet.playerPlusMinus.forEach((player) => {
              if (player.playerId) {
                playerPMObj[player.playerId] = player.plusMinus || 0;
              }
            });
            setPlayerPM(playerPMObj);
          }

          // ✅ NEW: Restore libero partner assignments
          if (analytics.currentSet?.liberoPartners) {
            console.log("🔵 Restored liberoPartners from database:", analytics.currentSet.liberoPartners);
            setLiberoPartners(analytics.currentSet.liberoPartners);
          }

          // Restore other match state from currentSet
          if (analytics.currentSet !== undefined) {
            // ✅ Restore setNumber
            if (analytics.currentSet.setNumber !== undefined) {
              setSetNumber(analytics.currentSet.setNumber);
            }
            // ✅ Restore servingSide from currentSet
            if (analytics.currentSet.servingSide !== undefined) {
              setServingSide(analytics.currentSet.servingSide);
              console.log(`🏐 Restored servingSide: ${analytics.currentSet.servingSide}`);
            }
            // ✅ Restore isSetLive from currentSet
            if (analytics.currentSet.isSetLive !== undefined) {
              setIsSetLive(analytics.currentSet.isSetLive);
              console.log(`🔴 Restored isSetLive: ${analytics.currentSet.isSetLive}`);
            }
            // ✅ Restore rotationIndex from currentSet
            if (analytics.currentSet.rotationIndex !== undefined) {
              setRotationIndex(analytics.currentSet.rotationIndex);
              console.log(`🔄 Restored rotationIndex: ${analytics.currentSet.rotationIndex}`);
            }
            // ✅ Restore ourScore from currentSet
            if (analytics.currentSet.ourScore !== undefined) {
              setOurScore(analytics.currentSet.ourScore);
              console.log(`⚪ Restored ourScore: ${analytics.currentSet.ourScore}`);
            }
            // ✅ Restore opponentScore from currentSet
            if (analytics.currentSet.opponentScore !== undefined) {
              setOpponentScore(analytics.currentSet.opponentScore);
              console.log(`⚫ Restored opponentScore: ${analytics.currentSet.opponentScore}`);
            }
          }

          // ✅ Restore libero partners (LP1/LP2)
          if (analytics.currentSet?.liberoPartners && typeof analytics.currentSet.liberoPartners === 'object') {
            setLiberoPartners(analytics.currentSet.liberoPartners);
            console.log(`👥 Restored libero partners:`, analytics.currentSet.liberoPartners);
          }

          // Restore team colors
          if (analytics.ourTeamColor) {
            setOurTeamColor(analytics.ourTeamColor);
          }
          if (analytics.opponentTeamColor) {
            setOpponentTeamColor(analytics.opponentTeamColor);
          }

          // Note: subCount is computed from subLog via useMemo, no need to restore separately
          console.log(`✅ All coach analytics restored for set ${analytics.currentSet?.setNumber}`);
        }
      } catch (err) {
        // 404 is expected for new matches, don't treat as error
        if (err.response?.status === 404) {
          console.log(`ℹ️ No existing coach analytics for match ${currentMatchId} (new match)`);
        } else {
          console.error("❌ Error loading coach analytics:", err.message);
        }
      }
    };

    loadCoachAnalytics();
  }, [currentMatchId, token]);

  // Verify subCount is recomputing correctly from subLog
  useEffect(() => {
    console.log(`✅ subCount recomputed: ${subCount} (from ${subLog.length} total entries)`);
  }, [subCount, subLog]);

  // Save score to database
  const saveScore = useCallback(async (newOurScore, newOpponentScore) => {
    if (!currentMatchId || !token) {
      console.warn("Cannot save score - missing currentMatchId or token");
      return;
    }

    try {
      await withRetry(() => axios.put(
        `${API_URL}/api/matches/${currentMatchId}/score`,
        { ourScore: newOurScore, opponentScore: newOpponentScore },
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      ));
      console.log("✅ Score saved:", { ourScore: newOurScore, opponentScore: newOpponentScore });
    } catch (error) {
      console.error("❌ Failed to save score after retries:", error);
    }
  }, [currentMatchId, token]);

  // Save player positions to database
  const savePlayerPositions = useCallback(async (playersToSave) => {
    if (!currentMatchId || !token) {
      console.warn("Cannot save positions - missing currentMatchId or token");
      return;
    }

    try {
      await axios.put(
        `${API_URL}/api/matches/${currentMatchId}`,
        {
          courtPlayers: playersToSave.map((p) => ({
            _id: p._id,
            name: p.name,
            number: p.number,
            isLibero: p.isLibero,
            replacedPlayer: p.replacedPlayer,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      console.log("✅ Player positions saved");
    } catch (error) {
      console.error("❌ Failed to save positions:", error);
    }
  }, [currentMatchId, token]);
  
const saveCoachAnalytics = useCallback(async (isFinal = false) => {
  if (!currentMatchId) return;
  if (matchFinalizedRef?.current) {
  console.log("🛑 Coach analytics save blocked — match finalized");
  return;
}

  // If this is a background auto-save (isFinal=false) and we are transitioning, ABORT.
  // If this is the FINAL sync call (isFinal=true), ALLOW IT to bypass the blocker.
  if (!isFinal && (isSetEndingInProgress || setEndingInProgressRef?.current)) {
    return;
  }



  // 1. Create a snapshot of the players currently on the court
  // Using 'courtPlayers' (the state variable from your file)
  const currentLineup = courtPlayers
    .filter(p => p && p.name && p.name !== "?")
    .map(p => ({
      playerId: p._id,
      name: p.name,
      number: p.number
    }));

  try {
    // 2. Build the exact payload structure your backend expects
    const analyticsPayload = {
      matchId: currentMatchId,
      teamName: matchSettings?.teamName || "Our Team",
      opponentName: matchSettings?.opponentName || "Opponent",
      ourTeamColor,
      ourTeamColor,
      opponentTeamColor,
      currentSet: {
        setNumber: !isNaN(parseInt(setNumber)) ? parseInt(setNumber) : 1,
        isSetLive,
        subCount,
        servingSide,
        rotationIndex,  // ✅ ADDED: Which rotation we're on (0-5)
        ourScore,       // ✅ ADDED: Current set score
        opponentScore,  // ✅ ADDED: Opponent current set score
        analytics: {
          ourPointsEarned,
          ourPointsByTheirErrors,
          theirPointsEarned,
          theirPointsByOurErrors,
        },
        // 3. Update the rotation array: 
        // Only inject the lineup into the index that matches the current 'rotationIndex'
        rotationPlusMinus: rotationPM,
        // 4. Transform playerPM object into the array expected by schema
        playerPlusMinus: Object.entries(playerPM || {}).map(([playerId, pm]) => {
          const player = courtPlayers.find(p => p._id === playerId) || 
                         benchPlayers.find(p => p._id === playerId);
          return {
            playerId,
            name: player?.name || "Unknown",
            number: player?.number || 0,
            plusMinus: pm,
          };
        }),
        substitutionLog: subLog,
        liberoPartners: liberoPartners,
        courtPlayers: courtPlayers.map(p => ({
          _id: p._id,
          name: p.name,
          // If number is '?', convert to 0, otherwise ensure it's a Number
          number: (p.number === "?" || isNaN(p.number)) ? 0 : Number(p.number),
          isLibero: !!p.isLibero
        }))
      }
    };

    // 5. Send to server (retry up to 2x on 5xx / network errors)
    const response = await withRetry(() => axios.put(
      `${API_URL}/api/coach-match-analytics/${currentMatchId}`,
      analyticsPayload,
      { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
    ));

    console.log("✅ Coach analytics saved successfully:", response.data);
	console.log("pointsNonDeciding:", matchSettings?.pointsNonDeciding);
console.log("playAllSets:", matchSettings?.playAllSets);
    
    if (showAlert) {
      alert("Coach analytics saved successfully.");
    }
  } catch (error) {
    console.error("❌ CRITICAL: Failed to save coach analytics after retries:", error);
    if (showAlert) {
      alert("CRITICAL ERROR: Data was not saved after retries. Check network connection.");
    }
  }
}, [
  currentMatchId,
  token,
  matchSettings,
  ourPointsEarned,
  ourPointsByTheirErrors,
  theirPointsEarned,
  theirPointsByOurErrors,
  rotationPM,      // The array of +/- per rotation
  rotationIndex,   // The current court position (0-5)
  courtPlayers,    // The players on the court
  playerPM,
  isSetEndingInProgress,
  subLog,
  setNumber,
  servingSide,
  isSetLive,
  subCount,
  ourTeamColor,
  opponentTeamColor,
  benchPlayers,
]);


useEffect(() => {
  window.forceCoachAnalyticsSave = async () => {
    try {
      console.log("🔄 Force analytics save triggered");
      await saveCoachAnalytics(true); // true bypasses set-ending blocker
    } catch (e) {
      console.error("❌ Force analytics save failed:", e);
      throw e;
    }
  };

  return () => {
    try {
      delete window.forceCoachAnalyticsSave;
    } catch {}
  };
}, [saveCoachAnalytics]);


useEffect(() => {
  if (!currentMatchId) return;
  
  if (matchFinalizedRef?.current) {
  if (analyticsSaveTimeoutRef.current) {
    clearTimeout(analyticsSaveTimeoutRef.current);
  }
  return;
}

  // 1. PRIMARY BLOCKER: Use the Ref for synchronous blocking
  // If App.js is in the middle of a set transition, kill any pending auto-saves immediately.
  const isTransitioning = setEndingInProgressRef?.current || isSetEndingInProgress;
  
  if (isTransitioning) {
    if (analyticsSaveTimeoutRef.current) clearTimeout(analyticsSaveTimeoutRef.current);
    return;
  }

  // 2. STALE DATA GUARD:
  // If the set number just changed (e.g., to Set 2) but our local stats 
  // haven't finished resetting to 0 yet, do NOT start the save timer.
  // This prevents Set 1's final points from being saved into the Set 2 slot.
  if (setNumber !== lastSavedSetRef.current && ourPointsEarned !== 0) {
    console.log("⏳ Analytics reset pending... delaying auto-save timer.");
    return;
  }

  // Clear existing timer before starting a new one
  if (analyticsSaveTimeoutRef.current) {
    clearTimeout(analyticsSaveTimeoutRef.current);
  }

  // 3. START AUTO-SAVE TIMER
  analyticsSaveTimeoutRef.current = setTimeout(() => {
    // Final check: make sure a transition didn't start while we were waiting
    const stillSafe = !setEndingInProgressRef?.current && !isSetEndingInProgress;
    
    if (stillSafe) {
      console.log(`💾 Auto-saving analytics for Set ${setNumber}`);
      saveCoachAnalytics(false); // false means 'isFinal' = false
      lastSavedSetRef.current = setNumber;
    }
  }, 500);

  return () => {
    if (analyticsSaveTimeoutRef.current) {
      clearTimeout(analyticsSaveTimeoutRef.current);
    }
  };
}, [
  currentMatchId,
  saveCoachAnalytics,
  isSetEndingInProgress, 
  ourPointsEarned,
  ourPointsByTheirErrors,
  theirPointsEarned,
  theirPointsByOurErrors,
  rotationPM,
  playerPM,
  subLog,
  setNumber, 
  servingSide,
  isSetLive,
  subCount,
  safeCourt,
  ourTeamColor,
  opponentTeamColor,
  benchPlayers,
]);

useEffect(() => {
  if (!isSetComplete || !currentMatchId || !token) return;
  
  const finalizingRef = { current: false };
  
  const handleFinalizeSet = async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    
    try {
      console.log("📤 Finalizing set - saving analytics before set end");
      
      // Save all analytics before marking set complete
      await saveCoachAnalytics(true);
      
      console.log("✅ handleFinalizeSet completed successfully");
    } catch (err) {
      console.error("❌ handleFinalizeSet failed:", err);
    } finally {
      finalizingRef.current = false;
      setIsSetComplete(false); // Reset for next set
    }
  };
  
  handleFinalizeSet();
}, [isSetComplete, currentMatchId, token, saveCoachAnalytics]);


const handleSetEnd = async (winner) => {
  try {
    // 1. SAVE FINAL SNAPSHOT: Save current data one last time before ending
    await saveCoachAnalytics(true);

    console.log("📤 Preparing set completion...");

    // 2. RESET LOCAL STATE for the next set
    setSubLog([]);
    setRotationPM(Array(6).fill(0));
    setPlayerPM({});
    setRotationIndex(0);
    setOurPointsEarned(0);
    setOurPointsByTheirErrors(0);
    setTheirPointsEarned(0);
    setTheirPointsByOurErrors(0);
    setLiberoPartners({}); // Clear LP1/LP2 designations
    
    // App.js's processCoachSetEnding() will handle /end-set backend call
    // and will update setNumber when the response comes back
    
    return true;
  } catch (err) {
    console.error("❌ Set transition failed:", err);
    alert("Failed to save set data. Please check your connection.");
    return false;
  }
};
  // Save full coach match data (if saveMatchData not provided, fall back to direct save)
  const saveCoachData = useCallback(async (showAlert = false) => {
    if (!currentMatchId || !token) {
      console.warn("Cannot save coach data - missing currentMatchId or token");
      return;
    }

    try {
      // If saveMatchData function is provided from App.js, use it
      if (typeof saveMatchData === "function") {
        await saveMatchData(showAlert);
        return;
      }

      // Otherwise, save directly to the API
      const normalizePlayer = (p) => {
        if (!p) return { name: "?", number: "?" };
        return {
          _id: p._id,
          name: p.name || "?",
          number: p.number || "?",
          isLibero: p.isLibero || false,
        };
      };

      const payload = {
        ourScore: ourScore ?? 0,
        opponentScore: opponentScore ?? 0,
        ourSetsWon: ourSetsWon ?? 0,
        opponentSetsWon: opponentSetsWon ?? 0,
        courtPlayers: (safeCourt || []).map(normalizePlayer),
        benchPlayers: (benchPlayers || []).map(normalizePlayer),
        status: "In Progress",
        timestamp: new Date().toISOString(),
      };

      await axios.put(
        `${API_URL}/api/matches/${currentMatchId}`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      console.log("✅ Coach match data saved");
      if (showAlert) alert("Match data saved successfully.");
    } catch (error) {
      console.error("❌ Failed to save coach data:", error);
      if (showAlert) alert("Failed to save match data. See console for details.");
    }
  }, [currentMatchId, token, saveMatchData, ourScore, opponentScore, ourSetsWon, opponentSetsWon, safeCourt, benchPlayers]);

  // EXIT button handler - saves match data and navigates to settings
  const handleExitCourtMode = async () => {
    try {
      // Save analytics first
      await saveCoachAnalytics(true);
      
      // Save match data if available
      if (typeof saveMatchData === "function") {
        await saveMatchData(false);
      } else {
        await saveCoachData(false);
      }
      
      // Navigate to settings page
      navigate('/settings');
      
      // Optional: Scroll to matches section after navigation
      setTimeout(() => {
        const matchesSection = document.querySelector('h4');
        if (matchesSection && matchesSection.textContent.includes('Resume In Process Matches')) {
          matchesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error("❌ Failed to exit court mode:", error);
      // Still navigate even if save fails
      navigate('/settings');
    }
  };

  // Auto-save on score change (debounced)
useEffect(() => {
  if (!currentMatchId) return;

  if (scoreSaveTimeoutRef.current) {
    clearTimeout(scoreSaveTimeoutRef.current);
  }

  scoreSaveTimeoutRef.current = setTimeout(() => {
    saveScore(ourScore, opponentScore);
  }, 1000);

  return () => {
    if (scoreSaveTimeoutRef.current) {
      clearTimeout(scoreSaveTimeoutRef.current);
    }
  };
}, [ourScore, opponentScore, currentMatchId, saveScore]);

useEffect(() => {
  if (!currentMatchId) return;

  if (positionSaveTimeoutRef.current) {
    clearTimeout(positionSaveTimeoutRef.current);
  }

  positionSaveTimeoutRef.current = setTimeout(() => {
    savePlayerPositions(safeCourt);
  }, 1000);

  return () => {
    if (positionSaveTimeoutRef.current) {
      clearTimeout(positionSaveTimeoutRef.current);
    }
  };
}, [safeCourt, currentMatchId, savePlayerPositions]);

  // Buttons (four)
const awardPoint = async (winner, reason) => {
  const delta = winner === "our" ? +1 : -1;

  // 
  onAddPoint(winner === "our" ? "our" : "opponent", 1);

  // rotation +/-
  applyDeltaToRotation(delta);

  // player +/-
  applyDeltaToOnCourtPlayers(delta);

  // serve / rotation logic
  await doRotateIfSideout(winner);

  // breakdown counters
  if (winner === "our") {
    if (reason === "earned") {
      setOurPointsEarned((n) => n + 1);
    } else {
      setOurPointsByTheirErrors((n) => n + 1);
    }
  } else {
    if (reason === "earned") {
      setTheirPointsEarned((n) => n + 1);
    } else {
      setTheirPointsByOurErrors((n) => n + 1);
    }
  }
};
 

const hasEmptyCourtSlots = safeCourt.some(
  (p) => !p || p.name === "?" || !p._id
);

const getContrastColor = (hex) => {
  if (!hex) return "#FFFFFF";
  // Remove hash if present
  const color = hex.replace("#", "");
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  
  // Brightness formula (HSP)
  const brightness = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  
  // If brightness is > 127.5, it's a light color; return black text. 
  // Otherwise, return white text.
  return brightness > 127.5 ? "#000000" : "#FFFFFF";
};


const pointBtnDisabled = hasEmptyCourtSlots;

const errorLabel =
  pendingWinner === "our" ? "OPP. ERROR" : "OUR ERROR"; 
  
  useEffect(() => {
  // If either team has scored, the set is live
  if (!isSetLive && (ourScore > 0 || opponentScore > 0)) {
    setIsSetLive(true);
  }
}, [ourScore, opponentScore, isSetLive]);


const handleUndoSubstitution = async (subIndexToRemove) => {
  const subToUndo = subLog[subIndexToRemove];
  if (!subToUndo) return;

  // Use the correct keys (inNumber/outNumber) for the prompt
  const confirmed = window.confirm(
    `Undo: ${subToUndo.outName} #${subToUndo.outNumber || subToUndo.outNum} → ${subToUndo.inName} #${subToUndo.inNumber || subToUndo.inNum}?`
  );
  if (!confirmed) return;

  try {
    // 1. Find the player currently ON COURT (the one who came "IN")
    // We check both ID and number for maximum reliability
    const playerOnCourtIndex = safeCourt.findIndex(p => 
      p._id === subToUndo.inId || p.number === (subToUndo.inNumber || subToUndo.inNum)
    );

    if (playerOnCourtIndex === -1) {
      alert("Could not find the player to swap out on the court.");
      return;
    }

    // 2. Reconstruct the "OUT" player object
    // We don't rely on finding them in the bench list (which might be stale)
    const originalPlayer = {
      _id: subToUndo.outId,
      name: subToUndo.outName,
      number: subToUndo.outNumber || subToUndo.outNum,
      isLibero: subToUndo.outLibero || false
    };

    // 3. Perform the reversal
    const newCourt = [...safeCourt];
    newCourt[playerOnCourtIndex] = originalPlayer;

    // Update Court & DB
    await Promise.all([
      axios.put(`${API_URL}/api/players/${subToUndo.inId}`, { isOnCourt: false }, { headers: { Authorization: `Bearer ${token}` } }),
      axios.put(`${API_URL}/api/players/${subToUndo.outId}`, { isOnCourt: true }, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    updatePlayersOnCourt(newCourt);
    setSubLog((prev) => prev.filter((_, idx) => idx !== subIndexToRemove));
    
    // 4. Reset LP1/LP2 if undoing a first libero sub
    if (subToUndo.type === "first_libero_sub") {
      console.log("🔵 Undoing first libero sub - resetting LP1/LP2 designations");
      setLiberoPartners({});
      setAllowedLiberoSubTarget(null);
    }
    
    // Force a data sync
    refreshBench();
    setTimeout(() => saveCoachAnalytics(false), 200);

  } catch (error) {
    console.error("❌ Undo failed:", error);
    alert("Undo failed. The player record might be out of sync.");
  }
};




  useEffect(() => {
    setSetNumber(matchSettings?.currentSet || 1);
    setIsSetLive(false);
    setLiberoPartners({}); // Clear LP designations when set changes
    console.log("🔄 Set changed - cleared libero partner designations");
  }, [matchSettings?.currentSet]);

  // Subbing: bench -> slot. Track sub count + log. With libero support.
  const handlePlayerDrop = async (benchPlayer, slotIndex) => {
    if (!benchPlayer || !benchPlayer._id) return;

    const existing = safeCourt[slotIndex];
    const updated = [...safeCourt];
    const isLiberoSub = benchPlayer.isLibero;

    // =============================
    // 🔥 LIBERO VALIDATION
    // =============================
    if (isLiberoSub) {
      // ⛔ Never allow libero in front row
      if (slotIndex < 3) {
        alert("⚠️ Liberos can only substitute in back row (positions 4, 5, 6)");
        return;
      }

      const currentLibero = safeCourt.find((p) => p.isLibero);
      const isEmptySlot = !existing || existing.name === "?";
      const isTargetLibero = existing?.isLibero;
      
      // Check if this player is a libero partner (LP1 or LP2)
      const isLiberoPartner = existing && existing._id && Object.keys(liberoPartners).includes(existing._id);
      const hasEstablishedPartners = Object.keys(liberoPartners).length > 0;

      // ⛔ Liberos can ONLY substitute for a real player - never on empty slots
      if (isEmptySlot) {
        alert("⚠️ Libero must replace a player on the court. Place a regular player here first.");
        return;
      }
      
      // ⛔ If LP partners are established, libero can ONLY sub for LP1 or LP2
      if (hasEstablishedPartners && !isTargetLibero && !isLiberoPartner) {
        alert(`⚠️ Libero can only substitute for their designated partners (LP1 or LP2).\n\n${existing.name} is not a libero partner.`);
        return;
      }

      // ✅ SCENARIO A: Libero-for-libero swap
      if (isTargetLibero && benchPlayer.isLibero) {
        const outgoingLibero = existing;

        // Update court: incoming libero takes over
        updated[slotIndex] = {
          ...benchPlayer,
          isLibero: true,
          replacedPlayer: outgoingLibero.replacedPlayer || null,
          isOnCourt: true,
        };

        // Update bench
        const benchWithoutOutgoingLibero = benchPlayers.filter((p) => p._id !== outgoingLibero._id);
        const newBench = [
          ...benchWithoutOutgoingLibero,
          { ...outgoingLibero, isLibero: true, isOnCourt: false },
        ];

        try {
          await Promise.all([
            axios.put(`${API_URL}/api/players/${outgoingLibero._id}`, { isOnCourt: false }, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true }, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          updatePlayersOnCourt(updated);
          // Don't modify bench here - let refreshBench handle it
        } catch (err) {
          console.error("❌ Failed to swap liberos:", err.response?.status, err.response?.data);
          alert("Failed to update players. Check console for details.");
          return;
        }


        
        setSubLog((prev) => [
          {
            ts: new Date().toISOString(),
            inId: benchPlayer._id,
            inName: benchPlayer.name,
            inNumber: benchPlayer.number,
            outId: outgoingLibero._id,
            outName: outgoingLibero.name,
            outNumber: outgoingLibero.number,
            rotationIndex,
            setNumber,
            counted: false,
            type: "libero_swap",
          },
          ...prev,
        ].slice(0, 50));

        refreshBench();
        return;
      }

      // ✅ SCENARIO B: First-time libero sub (no libero on court + no partner set)
      if (!currentLibero && !allowedLiberoSubTarget) {
        updated[slotIndex] = {
          ...benchPlayer,
          isLibero: true,
          replacedPlayer: existing,
          isOnCourt: true,
        };

        // ✅ FIRST: Determine LP1 and LP2 BEFORE any state updates or DB calls
        const lp2Slot = getLP2Slot(slotIndex);
        const lp2Player = updated[lp2Slot];
        
        console.log("🔵 Assigning LP badges on first libero sub:");
        console.log("  LP1 (player being replaced):", existing.name, existing._id);
        console.log("  LP2 slot:", lp2Slot, "Player:", lp2Player?.name, lp2Player?._id);
        
        const newPartners = {
          [existing._id]: 'LP1',
        };
        
        if (lp2Player && lp2Player._id && lp2Player.name !== "?") {
          newPartners[lp2Player._id] = 'LP2';
        }
        
        console.log("  Final liberoPartners:", newPartners);

        try {
          // ✅ SECOND: Update database with libero sub + player on-court status
          await Promise.all([
            axios.put(`${API_URL}/api/players/${existing._id}`, { isOnCourt: false }, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true }, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);
          
          // ✅ NEW: Persist libero partner assignments via coachMatchAnalytics
          await axios.put(
            `${API_URL}/api/coach-match-analytics/${currentMatchId}`,
            { 
              teamName: matchSettings.teamName,
              currentSet: {
                ...matchSettings.currentSet,
                liberoPartners: newPartners,
              }
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          // ✅ THIRD: Update UI state in correct order
          setLiberoPartners(newPartners);  // Set partners FIRST
          setAllowedLiberoSubTarget(existing); // Then register the partnership
          updatePlayersOnCourt(updated);  // Finally update court
        } catch (err) {
          console.error("❌ Failed first libero sub:", err.response?.status, err.response?.data, err.message);
          console.log("Existing player:", existing);
          console.log("Bench player:", benchPlayer);
          console.log("Token:", token ? "Present" : "MISSING");
          alert(`Failed to update players: ${err.response?.status || err.message}`);
          return;
        }

  

        setSubLog((prev) => [
          {
            ts: new Date().toISOString(),
            inId: benchPlayer._id,
            inName: benchPlayer.name,
            inNumber: benchPlayer.number,
            outId: existing._id,
            outName: existing.name,
            outNumber: existing.number,
            rotationIndex,
            setNumber,
            counted: false,
            type: "first_libero_sub",
          },
          ...prev,
        ].slice(0, 50));

        refreshBench();
        return;
      }

      // ✅ SCENARIO C: Standard libero sub (partner already established)
      // Move any other libero to bench
      if (currentLibero && currentLibero._id !== benchPlayer._id) {
        const benchWithoutOtherLibero = benchPlayers.filter((p) => p._id !== currentLibero._id);
        // Will be handled by refreshBench below
      }

      updated[slotIndex] = {
        ...benchPlayer,
        isLibero: true,
        replacedPlayer: existing,
        isOnCourt: true,
      };

      try {
        await Promise.all([
          axios.put(`${API_URL}/api/players/${existing._id}`, { isOnCourt: false }, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true }, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!allowedLiberoSubTarget) setAllowedLiberoSubTarget(existing);
        updatePlayersOnCourt(updated);
      } catch (err) {
        console.error("❌ Failed standard libero sub:", err.response?.status, err.response?.data);
        console.log("Existing:", existing._id, "Bench:", benchPlayer._id, "Token present:", !!token);
        alert(`Failed to update players: ${err.response?.status || err.message}`);
        return;
      }

    

      setSubLog((prev) => [
        {
          ts: new Date().toISOString(),
          inId: benchPlayer._id,
          inName: benchPlayer.name,
          inNumber: benchPlayer.number,
          outId: existing._id,
          outName: existing.name,
          outNumber: existing.number,
          rotationIndex,
          setNumber,
          counted: false,
          type: "libero_partner_sub",
        },
        ...prev,
      ].slice(0, 50));

      refreshBench();
      return;
    }

    // =============================
    // NORMAL (NON-LIBERO) SUBSTITUTION
    // =============================
    // ✅ Anyone can substitute in for libero partners (LP1/LP2)
    // No restrictions on regular player substitutions
    if (isSetLive) {
    

setSubLog((prev) => [
  {
    ts: new Date().toISOString(),
    inId: benchPlayer._id,
    inName: benchPlayer.name,
    inNumber: benchPlayer.number,
    inLibero: benchPlayer.isLibero,
    outId: existing._id,
    outName: existing.name,
    outNumber: existing.number,
    outLibero: existing.isLibero,
    rotationIndex,
    setNumber,
    type: "substitution",
    reason: "",
    ourScore,
    opponentScore,
  },
  ...prev,
].slice(0, 50));
}
    try {
      if (existing && existing._id && existing.name !== "?") {
        await axios.put(`${API_URL}/api/players/${existing._id}`, { isOnCourt: false }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      await axios.put(`${API_URL}/api/players/${benchPlayer._id}`, { isOnCourt: true }, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("❌ Substitution update failed:", e.response?.status, e.response?.data);
      console.log("Token:", token ? "Present" : "MISSING");
    }

    updated[slotIndex] = { ...benchPlayer, isOnCourt: true };
    updatePlayersOnCourt(updated);
    refreshBench();
  };

  const CourtSlot = ({ index }) => {
    const player = safeCourt[index] || emptyPlayer;
    const isBackRow = index >= 3;
    
    // Debug LP badges
    if (player?._id && liberoPartners[player._id]) {
      console.log(`🎯 Slot ${index} (${player.name}): LP badge = ${liberoPartners[player._id]}`);
    } 

    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: "COACH_PLAYER",
        drop: (item) => handlePlayerDrop(item, index),
        canDrop: (item) => {
          // Allow liberos only in back row
          if (item.isLibero && !isBackRow) {
            return false;
          }
          return true;
        },
        collect: (monitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
      }),
      [handlePlayerDrop, index, isBackRow]
    );

    const isServerSlot = index === serverSlotIndex;
    const showServer = servingSide === "our" && isServerSlot && player?.name !== "?";
    const playerBgColor = player?.isLibero ? "#E6D5F5" : player?.name === "?" ? "#E5E5EA" : "#fff";
    const isEmpty = !player || player.name === "?" || !player._id;
    
	return (
      <div
        ref={drop}
        style={{
          width: isMobile ? 92 : 112,
          height: isMobile ? 92 : 112,
          borderRadius: 14,
          border: isServerSlot ? "2px solid rgba(255, 215, 0, 0.9)" : "1px solid rgba(0,0,0,0.2)",
          background: playerBgColor,
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: isOver && canDrop ? "scale(1.02)" : "none",
          transition: "transform 0.08s ease",
          opacity: isOver && !canDrop ? 0.5 : 1,
        }}
        title={`Slot ${index}: Position ${positionLabels[index]}${player?.isLibero ? " (Libero)" : ""}`}
      >

	  
	  

<div style={{
  fontWeight: isMobile ? 300 : 500,
  ...(isEmpty && { fontFamily: "Georgia", fontSize: isMobile ? 30: 50 })
}}>
  {isEmpty ? `${romanByIndex[index]}` : <strong> {player.name} </strong>}
</div>

<div style={{ fontSize: 18, color: "#666" }}>
  {isEmpty ? "Position": `#${player.number}`}
</div>
        {showServer && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "rgba(255, 215, 0, 0.8)",
              border: "1px solid rgba(255, 215, 0, 0.9)",
            }}
            title="Serving"
          />
        )}
        {player?.isLibero && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              fontSize: 10,
              fontWeight: 900,
              color: "#8B5CF6",
              background: "rgba(139, 92, 246, 0.1)",
              padding: "2px 4px",
              borderRadius: 4,
            }}
            title="This player is a libero"
          >
            L
          </div>
        )}
        {!player?.isLibero && player?._id && liberoPartners[player._id] && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              fontSize: 9,
              fontWeight: 900,
              color: "#8B5CF6",
              background: "rgba(139, 92, 246, 0.15)",
              padding: "2px 5px",
              borderRadius: 4,
            }}
            title={`Libero Partner ${liberoPartners[player._id]}`}
          >
            {liberoPartners[player._id]}
          </div>
        )}
      </div>
    );
  };
  
  const scoreBtnStyle = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "#F2F2F7",
  fontWeight: 900,
  fontSize: 18,
  lineHeight: "24px",
  cursor: "pointer",
};

const colorRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  marginTop: 4,
};

const colorInputStyle = {
  width: 16,
  height: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 6,
  cursor: "pointer",
  padding: 0,
};

const teamLabelStyle = { fontSize: 10, fontWeight: 700, color: "#999" };
const setsStyle = { fontSize: 9, fontWeight: 700, color: "#999", marginTop: 4 };

const TeamScoreBlock = ({
  name,
  score,
  setsWon,
  color,
  onColorChange,
  onMinus,
  onPlus,
  colorLabel,
}) => (
  <div style={{ textAlign: "center", Width: 120 }}>
    <div style={teamLabelStyle}>{name}</div>

<div
  style={colorRowStyle}
  onMouseDown={(e) => e.stopPropagation()}
  onPointerDown={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()}
>
  <span style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>
    {colorLabel}:
  </span>

  <input
    type="color"
    value={color}
    onChange={onColorChange}
    onMouseDown={(e) => e.stopPropagation()}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    style={colorInputStyle}
    aria-label={`${name} color`}
  />
</div>

 <div
  style={{
    display: "grid",
    gridTemplateColumns: "26px 1fr 26px",
    alignItems: "center",
    justifyItems: "center",
    marginTop: 6,
  }}
>
      <button onClick={onMinus} style={scoreBtnStyle} aria-label={`${name} minus`}>
        −
      </button>

     <div
  style={{
    fontSize: 56,
    fontWeight: 900,
    color,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum"',
    minWidth: 56,            // reserves space for 2 digits
    textAlign: "center",
  }}
>
  {score}
</div>

      <button onClick={onPlus} style={scoreBtnStyle} aria-label={`${name} plus`}>
        +
      </button>
    </div>

    <div style={setsStyle}>Sets {setsWon}</div>
  </div>
);

  // Players with +/- that are on court
  const playerRows = useMemo(() => {
    return safeCourt
      .filter((p) => p && p._id && p.name !== "?")
      .map((p) => ({
        id: p._id,
        name: p.name,
        number: p.number,
        pm: playerPM[p._id] || 0,
        isLibero: p.isLibero || false,
      }));
  }, [safeCourt, playerPM]);

  // Bench (exclude those already on court)
  const onCourtIds = useMemo(
    () => new Set(safeCourt.filter((p) => p?._id).map((p) => p._id)),
    [safeCourt]
  );
  const filteredBenchPlayers = useMemo(
    () => (Array.isArray(benchPlayers) ? benchPlayers.filter((p) => !onCourtIds.has(p._id)) : []),
    [benchPlayers, onCourtIds]
  );

  // Allow dragging anytime - both in lineup mode and during live set
  // This lets coaches build lineups before starting the set
  const canSub = true;

  // Separate bench players into liberos and regular players
  const liberoPlayers = useMemo(
    () => filteredBenchPlayers.filter(p => p.isLibero),
    [filteredBenchPlayers]
  );

  const regularBenchPlayers = useMemo(
    () => filteredBenchPlayers.filter(p => !p.isLibero),
    [filteredBenchPlayers]
  );

  // Count total liberos (on court + bench)
  const totalLiberoCount = useMemo(() => {
    const liberosOnCourt = safeCourt.filter(p => p?.isLibero && p?.name !== "?").length;
    const liberosOnBench = liberoPlayers.length;
    return liberosOnCourt + liberosOnBench;
  }, [safeCourt, liberoPlayers]);

  // Handler for dropping player to regular bench (removes libero status)
  const handleDropToBench = async (player) => {
    if (!player.isLibero) return; // Already not a libero

    try {
      await axios.put(
        `${API_URL}/api/players/${player._id}`,
        { isLibero: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Refresh bench to get updated data
      if (refreshBench) {
        refreshBench();
      }
    } catch (err) {
      console.error("Failed to update libero status:", err);
      alert("Failed to update player status. Please try again.");
    }
  };

  // Handler for dropping player to libero area (adds libero status)
  const handleDropToLibero = async (player) => {
    if (player.isLibero) return; // Already a libero

    // Check if we already have 2 liberos
    if (liberoPlayers.length >= 2) {
      alert("Maximum 2 liberos allowed. Remove a libero before adding another.");
      return;
    }

    try {
      await axios.put(
        `${API_URL}/api/players/${player._id}`,
        { isLibero: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Refresh bench to get updated data
      if (refreshBench) {
        refreshBench();
      }
    } catch (err) {
      console.error("Failed to update libero status:", err);
      alert("Failed to update player status. Please try again.");
    }
  };

// ====================================
// SCOREBOARD OVERLAY COMPONENT
// ====================================

const ScoreboardOverlay = ({
  ourScore,
  opponentScore,
  servingSide,
  toggleServe,
  ourTeamColor,
  opponentTeamColor,
  teamName,
  opponentName,
  ourSetsWon = 0,
  opponentSetsWon = 0,
  setNumber = 1,
  setOurTeamColor = () => {},
  setOpponentTeamColor = () => {},
  setOurScore = () => {},
  setOpponentScore = () => {},
}) => {
  const colorInputStyle = {
    width: 18,
    height: 18,
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 4,
    cursor: "pointer",
    padding: 0,
  };

  const scoreBtnStyle = {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#f5f5f5",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.97)",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        minWidth: 200,
        zIndex: 10,
		padding: 8,
      }}
    >
      {/* SET ENDING MODAL */}
      {setEndingDecision && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 30,
              maxWidth: 500,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 20 }}>
              🏐 {setEndingDecision?.isMatchOver ? "MATCH COMPLETE" : "SET COMPLETE"}
            </div>
            
            <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 10, color: ourTeamColor }}>
              {ourScore}
            </div>
            
            <div style={{ fontSize: 18, fontWeight: 700, color: "#666", marginBottom: 20 }}>
              {teamName}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: "#999", marginBottom: 30 }}>
              vs
            </div>

            <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 10, color: opponentTeamColor }}>
              {opponentScore}
            </div>
            
            <div style={{ fontSize: 18, fontWeight: 700, color: "#666", marginBottom: 30 }}>
              {opponentName}
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                marginBottom: 30,
                padding: 15,
                backgroundColor: "#f0f0f0",
                borderRadius: 10,
                color: ourScore > opponentScore ? ourTeamColor : opponentTeamColor,
              }}
            >
              🎯 {ourScore > opponentScore ? teamName : opponentName} wins!
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#999", marginBottom: 30 }}>
				Sets won — {teamName}: {setEndingDecision?.newOurSets ?? ourSetsWon} | {opponentName}: {setEndingDecision?.newOpponentSetsWon ?? opponentSetsWon}
			</div>

            <button
  onClick={async () => {
    // ✅ FIX: Do NOT save analytics here - let processCoachSetEnding handle it
    // Premature save causes incomplete set data to be archived
    console.log("🎯 Confirming set ending - analytics will be handled by processCoachSetEnding");
    
    // Reset local state for next set
    setLiberoPartners({}); // Clear LP1/LP2 designations
    console.log("🔄 Cleared libero partner designations");
    
    // ✅ COACH MODE: Always call onSetEndingConfirm (which calls processCoachSetEnding in App.js)
    // processCoachSetEnding will handle both set endings and match completion (via endMatch)
    // INCLUDING the final analytics save via /end-set endpoint
    if (setEndingDecision && typeof onSetEndingConfirm === 'function') {
      console.log("🏆 COACH: Calling onSetEndingConfirm with decision", { 
        isMatchOver: setEndingDecision?.isMatchOver,
        newOurSets: setEndingDecision?.newOurSets,
        newOpponentSets: setEndingDecision?.newOpponentSets
      });
      onSetEndingConfirm(setEndingDecision);
    }
    }
  }
  style={{
    width: "100%",
    padding: 15,
    fontSize: 16,
    fontWeight: 900,
    backgroundColor: "#007AFF",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  }}
  onMouseEnter={(e) => (e.target.style.backgroundColor = "#0051D5")}
  onMouseLeave={(e) => (e.target.style.backgroundColor = "#007AFF")}
>
  {setEndingDecision?.isMatchOver ? "Go to Match Summary" : "Continue to Next Set"}
</button>

            {/* ✅ REWRITTEN: Add Cancel button */}
            <button
              onClick={() => {
                console.log("🛑 User cancelled set ending");
                if (typeof onSetEndingCancel === 'function') {
                  onSetEndingCancel();
                }
              }}
              style={{
                width: "100%",
                padding: 12,
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: "transparent",
                color: "#007AFF",
                border: "1px solid #007AFF",
                borderRadius: 10,
                cursor: "pointer",
                marginTop: 10
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = "rgba(0, 122, 255, 0.1)")}
              onMouseLeave={(e) => (e.target.style.backgroundColor = "transparent")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Team Scores with Sets and Colors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
        {/* Our Team */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#666",
              lineHeight: "16px",
              height: "16px",
              marginBottom: 2,
              overflow: "hidden",
            }}
          >
            {teamName}
          </div>
          {/* Score with buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 3 }}>
            <button
              onClick={() => setOurScore(Math.max(0, ourScore - 1))}
              style={{ ...scoreBtnStyle, padding: "2px 4px" }}
              title="Decrease our score"
            >
              −
            </button>
            <div style={{ fontSize: 50, fontWeight: 900, color: ourTeamColor, minWidth: 30, lineHeight: 1 }}>
              {ourScore}
            </div>
            <button
              onClick={() => setOurScore(ourScore + 1)}
              style={{ ...scoreBtnStyle, padding: "2px 4px" }}
              title="Increase our score"
            >
              +
            </button>
          </div>

          {/* Color Picker Only */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#666" }}>Color:</span>
            <input
              type="color"
              value={ourTeamColor}
              onChange={(e) => setOurTeamColor(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={colorInputStyle}
              title="Choose team color"
            />
          </div>
        </div>

        {/* Opponent Team */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#666",
              lineHeight: "16px",
              height: "16px",
              marginBottom: 2,
              overflow: "hidden",
            }}
          >
            {opponentName}
          </div>

          {/* Score with buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 3 }}>
            <button
              onClick={() => setOpponentScore(Math.max(0, opponentScore - 1))}
              style={{ ...scoreBtnStyle, padding: "2px 4px" }}
              title="Decrease opponent score"
            >
              −
            </button>
            <div style={{ fontSize: 50, fontWeight: 900, color: opponentTeamColor, minWidth: 30, lineHeight: 1 }}>
              {opponentScore}
            </div>
            <button
              onClick={() => setOpponentScore(opponentScore + 1)}
              style={{ ...scoreBtnStyle, padding: "2px 4px" }}
              title="Increase opponent score"
            >
              +
            </button>
          </div>

          {/* Color Picker Only */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#666" }}>Color:</span>
            <input
              type="color"
              value={opponentTeamColor}
              onChange={(e) => setOpponentTeamColor(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={colorInputStyle}
              title="Choose team color"
            />
          </div>
        </div>
      </div>

      {/* Central Set Display */}
      <div style={{ 
        textAlign: "center", 
        fontSize: 13, 
        fontWeight: 800, 
        color: "#333",
        marginBottom: 2,
        lineHeight: "16px",
        height: "16px",
      }}>
        Set {setNumber}
      </div>
	  
	  <div style={{ 
        textAlign: "center", 
        fontSize: 13, 
        fontWeight: 800, 
        color: "#333",
        marginBottom: 4,
        lineHeight: "16px",
        height: "16px",
      }}>
        ({ourSetsWon} - {opponentSetsWon})
      </div>

      {/* Serve Side Toggle */}
<button
  onClick={toggleServe}
  style={{
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: servingSide === "our" ? ourTeamColor : opponentTeamColor,
    color: servingSide === "our" ? getContrastColor(ourTeamColor) : getContrastColor(opponentTeamColor),
    fontWeight: 700,
    fontSize: 11,

    lineHeight: "14px",
    minHeight: "44px",          // 2 lines (28px) + padding (16px)
    whiteSpace: "normal",       // ✅ allow wrap
    wordBreak: "break-word",    // ✅ prevent overflow

    cursor: "pointer",
    transition: "all 0.2s ease",
    textTransform: "uppercase",
    letterSpacing: 0.4,

    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  }}>
        {servingSide === "our" ? `${teamName} serving` : `${opponentName} serving`}
      </button>
	  
	  
    </div>
	
	
  );
};



// ====================================
// SUB TRACKER COMPACT COMPONENT
// ====================================

const SubTrackerCompact = ({ subCount, maxSubs, setMaxSubs }) => {
  const circles = Array.from({ length: maxSubs }, (_, i) => i + 1);
  const isFilled = (index) => index < subCount;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px",
        backgroundColor: "#FFF",
      //  borderRadius: "8px",
       // border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
  
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <h3
          style={{    fontFamily: "Tahoma",
                fontWeight: 800,
                textShadow: "1px 1px 0px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.1)",
                fontSize: 20,
                marginTop: 12,
                marginBottom: 8,
          }}
        >
          SUB TRACKER
        </h3>

        {/* Toggle Switch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <label
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#666",
            }}
          >
            Max:
          </label>
          <div
            style={{
              display: "flex",
              backgroundColor: "#e0e0e0",
              borderRadius: "16px",
              padding: "3px",
              gap: "3px",
            }}
          >
            <button
              onClick={() => setMaxSubs(15)}
              style={{
                padding: "4px 12px",
                border: "none",
                borderRadius: "14px",
                backgroundColor: maxSubs === 15 ? "#007bff" : "transparent",
                color: maxSubs === 15 ? "white" : "#666",
                fontWeight: 600,
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              15
            </button>
            <button
              onClick={() => setMaxSubs(18)}
              style={{
                padding: "4px 12px",
                border: "none",
                borderRadius: "14px",
                backgroundColor: maxSubs === 18 ? "#007bff" : "transparent",
                color: maxSubs === 18 ? "white" : "#666",
                fontWeight: 600,
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              18
            </button>
          </div>
        </div>
      </div>

      {/* Sub Count Display */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#666",
          textAlign: "center",
          marginTop: 8,
          marginBottom: 10,
        }}
      >
        {subCount} / {maxSubs}
      </div>

      {/* Circle Grid - Compact for sidebar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "2px",
          justifyItems: "center",
        }}
      >
        {circles.map((num) => {
          const filled = isFilled(num - 1);
          return (
            <div
              key={num}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: filled ? "#FF3B30" : "#e0e0e0",
                border: `2px solid ${filled ? "#D32F2F" : "#bbb"}`,
                fontSize: "12px",
                fontWeight: 700,
                color: filled ? "white" : "#999",
                transition: "all 0.3s ease",
                boxShadow: filled
                  ? "0 2px 6px rgba(255, 59, 48, 0.4)"
                  : "0 1px 2px rgba(0, 0, 0, 0.08)",
                position: "relative",
              }}
            >
              {num}
              {/* Slash overlay for used subs */}
              {filled && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "120%",
                    height: "2px",
                    backgroundColor: "white",
                    transform: "translate(-50%, -50%) rotate(-45deg)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};


  return (
    <div
      style={{
        padding: isMobile ? 12 : 16,
        paddingTop: isMobile ? `calc(env(safe-area-inset-top, 0px) + 12px)` : 16,
        background: "#F5F5F7",
        minHeight: "100vh",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
    >
      {/* Main layout: Left Sidebar | Center Court | Right Analytics */}
      <div style={{ display: "flex", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
        
        {/* LEFT SIDEBAR: Bench + Sub Tracker */}
        <div
          style={{
            flex: isMobile ? "none" : "0 0 300px",
            background: "#fff",
            borderRadius: 16,
            padding: 12,
            boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
            overflowY: "auto",
            maxHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Bench Section */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
              order: isMobile ? 2 : 0,
            }}
          >
            <div
              style={{
                fontFamily: "Tahoma",
                fontWeight: 800,
                textShadow: "1px 1px 0px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.1)",
                fontSize: 16,
                marginBottom: 10,
              }}
            >
              BENCH
            </div>
			
            {/* Regular Bench Players */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#007AFF",
                  marginBottom: 6,
                }}
              >
                PLAYERS
              </div>
              <DroppableBenchArea onDrop={handleDropToBench}>
                {regularBenchPlayers.length === 0 ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      textAlign: "center",
                      color: "#999",
                      fontSize: 11,
                      fontStyle: "italic",
                      padding: 10,
                    }}
                  >
                    All players are on court or designated as liberos
                  </div>
                ) : (
                  regularBenchPlayers.map((p) => (
                    <DraggableBenchCard
                      key={p._id}
                      player={p}
                      canSub={canSub}
                      slot5TargetId={slot5TargetId}
                      allowedLiberoSubTarget={allowedLiberoSubTarget}
                      liberoPartners={liberoPartners}
                    />
                  ))
                )}
              </DroppableBenchArea>
            </div>

            <div style={{ marginTop: 8, fontSize: 10, color: "#666", lineHeight: 1.4, fontStyle : "italic" }}>
              <div>Libero partners:</div>
              <div style={{ marginTop: 4,}}>LP1 = First partner • LP2 = Secondary partner</div>
            </div>			

            {/* Libero Section */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#8B5CF6",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>LIBEROS</span>
                <span style={{ fontSize: 11, color: "#999" }}>
                  {totalLiberoCount}/2
                </span>
              </div>
              <DroppableLiberoArea 
                onDrop={handleDropToLibero}
                liberoCount={liberoPlayers.length}
                totalLiberoCount={totalLiberoCount}
              >
                {liberoPlayers.length === 0 ? (
                  <div
                    style={{
                      width: "100%",
                      textAlign: "center",
                      color: "#999",
                      fontSize: 11,
                      fontStyle: "italic",
                      padding: 10,
                    }}
                  >
                    Drag players here to make them liberos
                  </div>
                ) : (
                  liberoPlayers.map((p) => (
                    <DraggableBenchCard
                      key={p._id}
                      player={p}
                      canSub={canSub}
                      slot5TargetId={slot5TargetId}
                      allowedLiberoSubTarget={allowedLiberoSubTarget}
                      liberoPartners={liberoPartners}
                    />
                  ))
                )}
              </DroppableLiberoArea>
            </div>
          </div>

          {/* Sub Tracker + Log */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
              order: isMobile ? 1 : 0,
            }}
          >
		<SubTrackerCompact
            subCount={subCount}
            maxSubs={maxSubs}
            setMaxSubs={setMaxSubs}
          />

            <div
              style={{
                fontFamily: "Tahoma",
                fontWeight: 800,
                textShadow: "1px 1px 0px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.1)",
                fontSize: 20,
                marginTop: 12,
                marginBottom: 8,
              }}
            >
              SUBSITUTION LOG
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(0,0,0,0.10)" }}>
              {subLog.length === 0 ? (
                <div style={{ padding: 10, color: "#666", fontSize: 13 }}>No subs yet.</div>
              ) : (
                subLog.map((s, idx) => (
                  <div
                    key={`${s.ts}-${idx}`}
                    style={{
                      padding: 10,
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontSize: 12,
                      color: "#333",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900 }}>
                        IN: {s.inName} #{s.inNumber}
                        {s.type?.includes("libero") && <span style={{ marginLeft: 4, color: "#8B5CF6" }}>L</span>}
                      </div>
                      <div style={{ color: "#666", fontWeight: 800 }}>
                        OUT: {s.outName} #{s.outNumber} • Rot {s.rotationIndex + 1}
                      </div>
                      <div style={{ color: "#007AFF", fontWeight: 700, fontSize: 11, marginTop: 4 }}>
                        Score: {s.ourScore}-{s.opponentScore} | Set {s.setNumber}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleUndoSubstitution(idx)}
                      onMouseEnter={(e) => e.target.style.background = "#cc2e1e"}
                      onMouseLeave={(e) => e.target.style.background = "#FF3B30"}
                      style={{
                        marginLeft: 10,
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "none",
                        background: "#FF3B30",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        whiteSpace: "nowrap",
                        transition: "background 0.2s",
                      }}
                      title="Undo this substitution"
                    >
                      ↶ 
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

         
     
        </div>

        {/* CENTER: Court */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
              position: "relative",
              minHeight: isMobile || isPortrait ? "auto" : "100vh",
            }}
          >


            {/* Court Title */}
            <div
              style={{
                fontFamily: "Tahoma",
                fontWeight: 800,
                textShadow: "1px 1px 0px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.1)",
                fontSize: 20,
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              COURT
            </div>

            {/* EXIT Button - Upper Right Corner */}
            <button
              onClick={handleExitCourtMode}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                padding: "10px 20px",
                borderRadius: 12,
                border: "none",
                background: "#FF3B30",
                color: "#FFFFFF",
                fontWeight: 900,
                fontSize: 16,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(255, 59, 48, 0.3)",
                zIndex: 10,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#FF2D20";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 4px 8px rgba(255, 59, 48, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#FF3B30";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 2px 6px rgba(255, 59, 48, 0.3)";
              }}
              title="Save and exit to settings"
            >
              EXIT
            </button>

            {/* NET */}
            <div style={{ textAlign: "center", color: "#007AFF", fontWeight: 900, marginBottom: 10 }}>
              =========== NET ===========
            </div>

            {/* Court Slots */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10 }}>
              <CourtSlot index={0} />
              <CourtSlot index={1} />
              <CourtSlot index={2} />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <CourtSlot index={3} />
              <CourtSlot index={4} />
              <CourtSlot index={5} />
            </div>

            {/* Point Buttons - Below Court */}
            <div style={{ marginTop: 14 }}>
              {pointBtnDisabled && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(255, 149, 0, 0.12)",
                    border: "1px solid rgba(255, 149, 0, 0.35)",
                    fontWeight: 800,
                    color: "#8A4B00",
                    textAlign: "center",
                  }}
                >
                  Fill all 6 court slots to enable scoring.
                </div>
              )}

              {/* Step 1: Point Winner */}
              {!pendingWinner && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <button
                    disabled={pointBtnDisabled}
                    onClick={() => setPendingWinner("our")}
                    style={{
                      ...bigBtn(ourTeamColor),
                      color: getContrastColor(ourTeamColor),
                      opacity: pointBtnDisabled ? 0.45 : 1,
                      cursor: pointBtnDisabled ? "not-allowed" : "pointer",
                    }}
                  >
                    OUR POINT
                  </button>

                  <button
                    disabled={pointBtnDisabled}
                    onClick={() => setPendingWinner("their")}
                    style={{
                      ...bigBtn(opponentTeamColor),
					  color: getContrastColor(opponentTeamColor),
                      opacity: pointBtnDisabled ? 0.45 : 1,
                      cursor: pointBtnDisabled ? "not-allowed" : "pointer",
                    }}
                  >
                    OPPONENT POINT
                  </button>
                </div>
              )}

              {/* Step 2: Point Type */}
              {pendingWinner && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <button
                    disabled={pointBtnDisabled}
                    onClick={() => {
                      awardPoint(pendingWinner, "earned");
                      setPendingWinner(null);
                    }}
                    style={{
                      ...bigBtn("#007AFF"),
                      opacity: pointBtnDisabled ? 0.45 : 1,
                      cursor: pointBtnDisabled ? "not-allowed" : "pointer",
                    }}
                  >
                    EARNED
                  </button>

                  <button
                    disabled={pointBtnDisabled}
                    onClick={() => {
                      awardPoint(pendingWinner, "error");
                      setPendingWinner(null);
                    }}
                    style={{
                      ...bigBtn("#8E8E93"),
                      opacity: pointBtnDisabled ? 0.45 : 1,
                      cursor: pointBtnDisabled ? "not-allowed" : "pointer",
                    }}
                  >
                    {errorLabel}
                  </button>

                  <button
                    onClick={() => setPendingWinner(null)}
                    style={{
                      gridColumn: isMobile ? "auto" : "1 / -1",
                      height: 44,
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Analytics */}
        <div
          style={{
            flex: isMobile ? "none" : "0 0 300px",
            background: "#fff",
            borderRadius: 16,
            padding: 12,
            boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
            overflowY: "auto",
            maxHeight: "100vh",
          }}
        >
		      <div>      {/* Scoreboard Overlay - Top Right */}
            <ScoreboardOverlay
              ourScore={ourScore}
              opponentScore={opponentScore}
              servingSide={servingSide}
              toggleServe={toggleServe}
              ourTeamColor={ourTeamColor}
              opponentTeamColor={opponentTeamColor}
              teamName={teamName}
              opponentName={opponentName}
              ourSetsWon={ourSetsWon}
              opponentSetsWon={opponentSetsWon}
              setNumber={setNumber}
              setOurTeamColor={setOurTeamColor}
              setOpponentTeamColor={setOpponentTeamColor}
              setOurScore={setOurScore}
              setOpponentScore={setOpponentScore}
            />
			</div>
          <div
            style={{
              fontFamily: "Tahoma",
              fontWeight: 800,
              textShadow: "1px 1px 0px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.1)",
              fontSize: 20,
			  marginTop: 28,
              marginBottom: 8,
            }}
          >
            MATCH ANALYTICS
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: "#666" }}>Rotation +/-</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
          {rotationPM?.map((v, i) => (
  <div
    key={i}
    style={{
      border: i === rotationIndex ? "2px solid #007AFF" : "1px solid rgba(0,0,0,0.12)",
      borderRadius: 12,
      padding: 10,
    }}
  >
    <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Rot {i + 1}</div>
    <div style={{ fontSize: 18, fontWeight: 900 }}>
      {/* ✅ Safe access with fallback for undefined v */}
      {v?.plusMinus != null && v.plusMinus > 0 ? `+${v.plusMinus}` : `${v?.plusMinus || 0}`}
    </div>
  </div>
))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#666", fontWeight: 800 }}>
            <div style={{ marginBottom: 6 }}>Point Breakdown</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 10, padding: 8 }}>
                <div style={{ fontWeight: 900, color: ourTeamColor }}>{teamName}</div>
                <div>Earned: {ourPointsEarned}</div>
                <div>By errors: {ourPointsByTheirErrors}</div>
              </div>

              <div style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 10, padding: 8 }}>
                <div style={{ fontWeight: 900, color: opponentTeamColor }}>{opponentName}</div>
                <div>Earned: {theirPointsEarned}</div>
                <div>By errors: {theirPointsByOurErrors}</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: "#666", marginTop: 12 }}>Player +/-</div>
          <div style={{ maxHeight: 220, overflowY: "auto", borderRadius: 12, border: "1px solid rgba(0,0,0,0.10)" }}>
            {playerRows.length === 0 ? (
              <div style={{ padding: 10, color: "#666", fontSize: 13 }}>No players tracked yet.</div>
            ) : (
              playerRows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {r.name} <span style={{ color: "#666", fontWeight: 700 }}>#{r.number}</span>
                    {r.isLibero && <span style={{ color: "#8B5CF6", fontWeight: 700, marginLeft: 4 }}>L</span>}
                  </div>
                  <div style={{ fontWeight: 900 }}>
                    {r.pm > 0 ? `+${r.pm}` : `${r.pm}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function smallBtn(bg, color) {
  return {
    padding: "8px 10px",
    borderRadius: 12,
    height: 30,
	width: 50,
	border: "1px solid rgba(0,0,0,0.12)",
    background: bg,
    color,
    fontWeight: 900,
    cursor: "pointer",
  };
}

function bigBtn(bg) {
  return {
    height: 56,
    borderRadius: 14,
    border: "none",
    background: bg,
    color: "#FFF",
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 0.2,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  };
}