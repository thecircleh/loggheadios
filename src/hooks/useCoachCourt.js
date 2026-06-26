// shared/hooks/useCoachCourt.js
import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { getSafeCourt, rotateCourt, isEmptyPlayer, isCourtFull } from "../utils/courtHelpers";
import {
  SERVE_SIDE,
  SUB_LIMITS,
  DEFAULT_TEAM_COLORS,
  POINT_TYPE,
  LIBERO,
  POSITION_LABELS,
} from "../constants/matchConstants";

const getApiUrl = () => {
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith("10.")) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

export const useCoachCourt = ({
  matchSettings,
  courtPlayers,
  benchPlayers,
  updatePlayersOnCourt,
  refreshBench,
  ourScore: initialOurScore,
  opponentScore: initialOpponentScore,
  setOurScore,
  setOpponentScore,
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
  token,
}) => {
  // ========== MATCH STATE ==========
  const [servingSide, setServingSide] = useState(SERVE_SIDE.OUR);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [isSetLive, setIsSetLive] = useState(false);
  const [setEndingInProgress, setSetEndingInProgress] = useState(false);
  const [pendingWinner, setPendingWinner] = useState(null);

  // ========== TEAM COLORS ==========
  const [ourTeamColor, setOurTeamColor] = useState(() => {
    if (typeof window !== "undefined" && currentMatchId) {
      return localStorage.getItem(`match_${currentMatchId}_ourTeamColor`) || DEFAULT_TEAM_COLORS.OUR;
    }
    return DEFAULT_TEAM_COLORS.OUR;
  });

  const [opponentTeamColor, setOpponentTeamColor] = useState(() => {
    if (typeof window !== "undefined" && currentMatchId) {
      return localStorage.getItem(`match_${currentMatchId}_opponentTeamColor`) || DEFAULT_TEAM_COLORS.OPPONENT;
    }
    return DEFAULT_TEAM_COLORS.OPPONENT;
  });

  // ========== SUB TRACKING ==========
  const [subCount, setSubCount] = useState(() => {
    if (typeof window !== "undefined" && currentMatchId) {
      const saved = localStorage.getItem(`match_${currentMatchId}_subCount`);
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });

  const [subLog, setSubLog] = useState([]);
  const [maxSubs, setMaxSubs] = useState(SUB_LIMITS.MIN);

  // ========== ANALYTICS ==========
  const [ourPointsEarned, setOurPointsEarned] = useState(0);
  const [ourPointsByTheirErrors, setOurPointsByTheirErrors] = useState(0);
  const [theirPointsEarned, setTheirPointsEarned] = useState(0);
  const [theirPointsByOurErrors, setTheirPointsByOurErrors] = useState(0);
  const [rotationPM, setRotationPM] = useState(() => Array(6).fill(0));
  const [playerPM, setPlayerPM] = useState({});

  const safeCourt = getSafeCourt(courtPlayers);

  // ========== PERSISTENCE ==========
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    if (currentMatchId && typeof window !== "undefined") {
      localStorage.setItem(`match_${currentMatchId}_ourTeamColor`, ourTeamColor);
      localStorage.setItem(`match_${currentMatchId}_opponentTeamColor`, opponentTeamColor);
    }
  }, [currentMatchId, ourTeamColor, opponentTeamColor]);

  useEffect(() => {
    if (currentMatchId && typeof window !== "undefined") {
      localStorage.setItem(`match_${currentMatchId}_subCount`, subCount.toString());
    }
  }, [currentMatchId, subCount]);

  useEffect(() => {
    if (!currentMatchId || typeof window === "undefined") return;
    const savedOurColor = localStorage.getItem(`match_${currentMatchId}_ourTeamColor`);
    const savedOpponentColor = localStorage.getItem(`match_${currentMatchId}_opponentTeamColor`);
    if (savedOurColor) setOurTeamColor(savedOurColor);
    if (savedOpponentColor) setOpponentTeamColor(savedOpponentColor);
  }, [currentMatchId]);

  // Load analytics from database
  useEffect(() => {
    if (!currentMatchId || !token) return;

    const loadCoachAnalytics = async () => {
      try {
        console.log(`📥 Loading coach analytics for match ${currentMatchId}`);
        const response = await axios.get(`${API_URL}/api/coach-match-analytics/${currentMatchId}`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });

        if (response.data?.data) {
          const analytics = response.data.data;
          console.log(`✅ Coach analytics loaded`, analytics);

          if (Array.isArray(analytics.substitutionLog)) {
            setSubLog(analytics.substitutionLog);
          }
          if (analytics.analytics) {
            setOurPointsEarned(analytics.analytics.ourPointsEarned || 0);
            setOurPointsByTheirErrors(analytics.analytics.ourPointsByTheirErrors || 0);
            setTheirPointsEarned(analytics.analytics.theirPointsEarned || 0);
            setTheirPointsByOurErrors(analytics.analytics.theirPointsByOurErrors || 0);
          }
          if (Array.isArray(analytics.rotationPlusMinus)) {
            const rotArray = Array(6).fill(0);
            analytics.rotationPlusMinus.forEach((rot) => {
              if (rot.rotationIndex !== undefined) {
                rotArray[rot.rotationIndex] = rot.plusMinus || 0;
              }
            });
            setRotationPM(rotArray);
          }
          if (Array.isArray(analytics.playerPlusMinus)) {
            const playerPMObj = {};
            analytics.playerPlusMinus.forEach((player) => {
              if (player.playerId) {
                playerPMObj[player.playerId] = player.plusMinus || 0;
              }
            });
            setPlayerPM(playerPMObj);
          }
          if (analytics.currentSet !== undefined) {
            setSetNumber(analytics.currentSet);
          }
          if (analytics.servingSide) {
            setServingSide(analytics.servingSide);
          }
          if (analytics.isSetLive !== undefined) {
            setIsSetLive(analytics.isSetLive);
          }
          if (analytics.subCount !== undefined && analytics.subCount > (subCount || 0)) {
            setSubCount(analytics.subCount);
          }
        }
      } catch (err) {
        if (err.response?.status !== 404) {
          console.error("❌ Error loading coach analytics:", err.message);
        }
      }
    };

    loadCoachAnalytics();
  }, [currentMatchId, token]);

  // ========== EVENT HANDLERS ==========

  const toggleServe = useCallback(() => {
    setServingSide((prev) => (prev === SERVE_SIDE.OUR ? SERVE_SIDE.THEIR : SERVE_SIDE.OUR));
  }, []);

  const adjustOurScore = useCallback((delta) => {
    const next = Math.max(0, initialOurScore + delta);
    setOurScore(next);
  }, [initialOurScore, setOurScore]);

  const adjustOpponentScore = useCallback((delta) => {
    const next = Math.max(0, initialOpponentScore + delta);
    setOpponentScore(next);
  }, [initialOpponentScore, setOpponentScore]);

  const applyDeltaToRotation = useCallback((delta) => {
    setRotationPM((prev) => {
      const next = [...prev];
      next[rotationIndex] = (next[rotationIndex] || 0) + delta;
      return next;
    });
  }, [rotationIndex]);

  const applyDeltaToOnCourtPlayers = useCallback((delta) => {
    setPlayerPM((prev) => {
      const next = { ...prev };
      safeCourt.forEach((p) => {
        if (p && p._id && p.name !== "?") {
          next[p._id] = (next[p._id] || 0) + delta;
        }
      });
      return next;
    });
  }, [safeCourt]);

  const doRotateIfSideout = useCallback(
    async (winner) => {
      const weGainedServe = winner === SERVE_SIDE.OUR && servingSide === SERVE_SIDE.THEIR;

      if (weGainedServe) {
        const oldCourt = safeCourt;
        const liberoAtIndex3 = oldCourt[LIBERO.DEFAULT_POSITION]?.isLibero;
        const hasReplacedPlayer = oldCourt[LIBERO.DEFAULT_POSITION]?.replacedPlayer;

        if (liberoAtIndex3 && hasReplacedPlayer) {
          const libero = oldCourt[LIBERO.DEFAULT_POSITION];
          const replacedPlayer = libero.replacedPlayer;

          try {
            await Promise.all([
              axios.put(`${API_URL}/api/players/${libero._id}`, { isOnCourt: false }, {
                headers: { Authorization: `Bearer ${token}` },
              }),
              axios.put(`${API_URL}/api/players/${replacedPlayer._id}`, { isOnCourt: true }, {
                headers: { Authorization: `Bearer ${token}` },
              }),
            ]);

            const newCourt = [replacedPlayer, oldCourt[0], oldCourt[1], oldCourt[4], oldCourt[5], oldCourt[2]];
            const playerRotatingIntoSlot5 = oldCourt[2];
            if (playerRotatingIntoSlot5 && playerRotatingIntoSlot5.name !== "?" && !playerRotatingIntoSlot5.isLibero) {
              setSlot5TargetId(playerRotatingIntoSlot5);
            }

            updatePlayersOnCourt(newCourt);
            setRotationIndex((prev) => (prev + 1) % 6);
            refreshBench();
          } catch (error) {
            console.error("❌ Libero rotation failed:", error);
          }
        } else {
          const rotated = rotateCourt(safeCourt);
          updatePlayersOnCourt(rotated);
          setRotationIndex((prev) => (prev + 1) % 6);
        }
      }

      setServingSide(winner);
    },
    [safeCourt, servingSide, token, updatePlayersOnCourt, refreshBench, setSlot5TargetId]
  );

  const awardPoint = useCallback(
    (winner, type) => {
      if (winner === SERVE_SIDE.OUR) {
        if (type === POINT_TYPE.EARNED) {
          setOurPointsEarned((prev) => prev + 1);
        } else {
          setOurPointsByTheirErrors((prev) => prev + 1);
        }
        setOurScore((prev) => prev + 1);
      } else {
        if (type === POINT_TYPE.EARNED) {
          setTheirPointsEarned((prev) => prev + 1);
        } else {
          setTheirPointsByOurErrors((prev) => prev + 1);
        }
        setOpponentScore((prev) => prev + 1);
      }

      applyDeltaToRotation(1);
      applyDeltaToOnCourtPlayers(winner === SERVE_SIDE.OUR ? 1 : -1);
      doRotateIfSideout(winner);

      if (isSetLive) {
        applyDeltaToRotation(0);
      }
    },
    [
      setOurScore,
      setOpponentScore,
      applyDeltaToRotation,
      applyDeltaToOnCourtPlayers,
      doRotateIfSideout,
      isSetLive,
    ]
  );

  return {
    // Match state
    servingSide,
    rotationIndex,
    setNumber,
    isSetLive,
    setEndingInProgress,
    pendingWinner,

    // Team colors
    ourTeamColor,
    opponentTeamColor,
    setOurTeamColor,
    setOpponentTeamColor,

    // Substitutions
    subCount,
    setSubCount,
    subLog,
    setSubLog,
    maxSubs,
    setMaxSubs,

    // Analytics
    ourPointsEarned,
    ourPointsByTheirErrors,
    theirPointsEarned,
    theirPointsByOurErrors,
    rotationPM,
    playerPM,

    // Court
    safeCourt,

    // Event handlers
    toggleServe,
    adjustOurScore,
    adjustOpponentScore,
    applyDeltaToRotation,
    applyDeltaToOnCourtPlayers,
    doRotateIfSideout,
    awardPoint,
    setPendingWinner,
    setRotationIndex,
    setIsSetLive,
    setSetEndingInProgress,
    setSetNumber,

    // Helpers
    isCourtFull: isCourtFull(safeCourt),
  };
};
