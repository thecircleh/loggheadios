import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import MatchModeSelector from './MatchModeSelector';
import { calculateMatchAge } from './MatchSelectorUtils';

// ─── API helper (matches the rest of the codebase) ───────────────────────────
const getApiUrl = () => {
  const h = window.location.hostname;
  if (
    !window.Capacitor?.isNativePlatform?.() &&
    (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))
  ) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || 'https://api.loggerhead.app';
};
const API_URL = getApiUrl();

// ─── Beach volleyball action definitions ─────────────────────────────────────
const WE_SCORED_ACTIONS = [
  { key: 'kill',     label: 'Attack Kill',    emoji: '💥', side: 'us',   type: 'earned' },
  { key: 'ace',      label: 'Ace',            emoji: '🎯', side: 'us',   type: 'earned' },
  { key: 'block',    label: 'Block',          emoji: '🛡️', side: 'us',   type: 'earned' },
  { key: 'oppError', label: 'Opponent Error', emoji: '❌', side: 'them', type: 'error'  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function BeachPage({
  currentMatchId,
  setCurrentMatchId,
  matchSettings,
  setMatchSettings,
  courtPlayers,
  setCourtPlayers,
  benchPlayers,
  ourScore,
  opponentScore,
  ourSetsWon,
  opponentSetsWon,
  actionLog,
  setActionLog,
  onAddPoint,
  opponentName,
  saveMatchData,
  isMobile,
  isPortrait,
  isRestoringMatch,
  handleNewMatch,
}) {
  const { token } = useAuth();

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [currentMatchAge, setCurrentMatchAge]       = useState(0);
  const [showRosterPicker, setShowRosterPicker]     = useState(false);
  const [pickingSlot, setPickingSlot]               = useState(null);   // 0 | 1
  const [showWeScoredPicker, setShowWeScoredPicker] = useState(false);
  const [pendingActionKey, setPendingActionKey]     = useState(null);   // action key while choosing player
  const [showPlayerCredit, setShowPlayerCredit]     = useState(false);

  // ── Derived beach-rules state ───────────────────────────────────────────────
  const setsPlayed    = (ourSetsWon || 0) + (opponentSetsWon || 0);
  const isDecidingSet = setsPlayed === 2;
  const pointTarget   = isDecidingSet ? 15 : 21;

  const us   = ourScore      || 0;
  const them = opponentScore || 0;
  const totalScore = us + them;

  // Someone reached the target (and leads by 2) → set is over
  const setWinner =
    (us >= pointTarget && us - them >= 2)   ? 'us'   :
    (them >= pointTarget && them - us >= 2) ? 'them' :
    null;

  // Side-change reminder: 3rd set only, every 7 points in the combined score
  const showSideChangeReminder = isDecidingSet;
  const atSideChange =
    showSideChangeReminder && totalScore > 0 && totalScore % 7 === 0;
  const nextSideChangeAt =
    showSideChangeReminder
      ? Math.ceil((totalScore + 1) / 7) * 7
      : null;

  // ── Safe 2-slot court player array ─────────────────────────────────────────
  const safeCourtPlayers = [
    (courtPlayers && courtPlayers[0]) || null,
    (courtPlayers && courtPlayers[1]) || null,
  ];

  // ── Bench players not already on court ─────────────────────────────────────
  const courtPlayerIds = new Set(
    safeCourtPlayers.filter(Boolean).map((p) => p._id)
  );
  const availableBench = (benchPlayers || []).filter(
    (p) => !courtPlayerIds.has(p._id)
  );

  // ── Match age timer (for MatchModeSelector stale-match detection) ──────────
  useEffect(() => {
    if (!matchSettings?.updatedAt) return;
    const refresh = () =>
      setCurrentMatchAge(calculateMatchAge(matchSettings.updatedAt));
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [matchSettings?.updatedAt]);

  // ── MatchModeSelector callbacks ─────────────────────────────────────────────
  const handleStartNewMatch = useCallback(
    async (config) => {
      try {
        const res = await axios.get(`${API_URL}/api/matches/${config.matchId}`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        const matchData = res.data;

        if (setCurrentMatchId) setCurrentMatchId(config.matchId);
        setMatchSettings({ ...matchData, mode: config.mode });
        if (setActionLog) setActionLog([]);
        if (setCourtPlayers) setCourtPlayers([null, null]);
      } catch (err) {
        console.error('Beach: Failed to start new match', err);
        alert('Failed to start match. Please try again.');
      }
    },
    [token, setCurrentMatchId, setMatchSettings, setActionLog, setCourtPlayers]
  );

  const handleResumeMatch = useCallback(
    async (config) => {
      try {
        const res = await axios.get(`${API_URL}/api/matches/${config.matchId}`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        const matchData = res.data;

        if (setCurrentMatchId) setCurrentMatchId(config.matchId);
        setMatchSettings({ ...matchData, mode: config.mode });
        if (setActionLog && matchData.actionLog) setActionLog(matchData.actionLog);
        if (setCourtPlayers && matchData.courtPlayers) {
          setCourtPlayers(matchData.courtPlayers);
        }
      } catch (err) {
        console.error('Beach: Failed to resume match', err);
        alert('Failed to load match. Please try again.');
      }
    },
    [token, setCurrentMatchId, setMatchSettings, setActionLog, setCourtPlayers]
  );

  // ── Player assignment ───────────────────────────────────────────────────────
  const openRosterPicker = (slotIndex) => {
    setPickingSlot(slotIndex);
    setShowRosterPicker(true);
  };

  const pickPlayer = (player) => {
    const next = [...safeCourtPlayers];
    next[pickingSlot] = player;
    setCourtPlayers(next);
    setShowRosterPicker(false);
    setPickingSlot(null);
  };

  const closeRosterPicker = () => {
    setShowRosterPicker(false);
    setPickingSlot(null);
  };

  // ── "We Scored" flow: action → player → log ─────────────────────────────────
  const handleSelectAction = (actionKey) => {
    setPendingActionKey(actionKey);
    setShowWeScoredPicker(false);

    const action = WE_SCORED_ACTIONS.find((a) => a.key === actionKey);

    // Opponent error: no player credit needed, resolve immediately
    if (action && action.key === 'oppError') {
      commitAction(action, null);
      return;
    }

    // For kill / ace / block: ask which court player gets credit
    const assigned = safeCourtPlayers.filter(Boolean);
    if (assigned.length === 0) {
      // No one assigned yet, just log without player
      commitAction(action, null);
    } else if (assigned.length === 1) {
      // Only one player, auto-credit them
      commitAction(action, assigned[0]);
    } else {
      // Two players → show player picker
      setShowPlayerCredit(true);
    }
  };

  const handlePlayerCredit = (player) => {
    const action = WE_SCORED_ACTIONS.find((a) => a.key === pendingActionKey);
    commitAction(action, player);
    setShowPlayerCredit(false);
    setPendingActionKey(null);
  };

  const skipPlayerCredit = () => {
    const action = WE_SCORED_ACTIONS.find((a) => a.key === pendingActionKey);
    commitAction(action, null);
    setShowPlayerCredit(false);
    setPendingActionKey(null);
  };

  const commitAction = (action, creditPlayer) => {
    if (!action) return;

    const entry = {
      action: action.label,
      emoji: action.emoji,
      timestamp: new Date().toISOString(),
      side: action.side,
      statType: action.type,
      playerId: creditPlayer?._id || null,
      playerName: creditPlayer?.name || null,
      playerNumber: creditPlayer?.number || null,
      mode: 'beach',
    };

    if (setActionLog) setActionLog((prev) => [...prev, entry]);

    onAddPoint({ side: action.side, type: action.type });

    if (typeof saveMatchData === 'function') {
      setTimeout(() => saveMatchData(), 200);
    }
  };

  // ── "They Scored" ───────────────────────────────────────────────────────────
  const handleTheyScored = () => {
    const entry = {
      action: 'Opponent Point',
      emoji: '🔴',
      timestamp: new Date().toISOString(),
      side: 'them',
      statType: 'earned',
      mode: 'beach',
    };
    if (setActionLog) setActionLog((prev) => [...prev, entry]);
    onAddPoint({ side: 'them', type: 'earned' });
    if (typeof saveMatchData === 'function') setTimeout(() => saveMatchData(), 200);
  };

  // ── End Set ─────────────────────────────────────────────────────────────────
  const handleEndSet = () => {
    const winnerLabel = setWinner === 'us' ? 'Your team' : (opponentName || 'Opponent');
    const confirmed = window.confirm(
      `End this set? ${winnerLabel} wins Set ${setsPlayed + 1} ${us}–${them}.`
    );
    if (!confirmed) return;

    const entry = {
      action: `Set ${setsPlayed + 1} ended — ${winnerLabel} wins ${us}–${them}`,
      emoji: '🏆',
      timestamp: new Date().toISOString(),
      side: setWinner,
      statType: 'setEnd',
      mode: 'beach',
    };
    if (setActionLog) setActionLog((prev) => [...prev, entry]);

    if (typeof saveMatchData === 'function') setTimeout(() => saveMatchData(), 200);
  };

  // ── Close WeScoredPicker on outside-ish cancel ──────────────────────────────
  const cancelWeScoredPicker = () => {
    setShowWeScoredPicker(false);
    setPendingActionKey(null);
    setShowPlayerCredit(false);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const isCompatible =
    !matchSettings?.mode || matchSettings.mode === 'Beach';

  return (
    <>
      {/* MatchModeSelector overlay — shows when no active beach match */}
      <MatchModeSelector
        currentPage="beach"
        currentMatchId={currentMatchId}
        currentMatchMode={matchSettings?.mode}
        currentMatchAge={currentMatchAge}
        onStartNewMatch={handleStartNewMatch}
        onResumeMatch={handleResumeMatch}
      />

      {/* Main beach UI — only when a compatible match is active */}
      {currentMatchId && matchSettings && isCompatible && (
        <div style={s.page}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={s.header}>
            <span style={s.headerEmoji}>🏖️</span>
            <span style={s.headerTitle}>Beach Volleyball</span>
            <span style={s.headerEmoji}>⛱️</span>
          </div>

          {/* ── Set Wins Banner ──────────────────────────────────────────────── */}
          <div style={s.setBanner}>
            <span style={s.setBannerText}>
              Sets: <strong>{ourSetsWon || 0}</strong>
              <span style={s.setBannerDash}> – </span>
              <strong>{opponentSetsWon || 0}</strong>
            </span>
            {isDecidingSet && (
              <span style={s.decidingBadge}>⚡ Deciding Set (to {pointTarget})</span>
            )}
          </div>

          {/* ── Scoreboard ──────────────────────────────────────────────────── */}
          <div style={s.scoreboard}>
            <div style={s.scoreTeam}>
              <div style={s.scoreTeamLabel}>Us</div>
              <div
                style={{
                  ...s.scoreNumber,
                  ...(setWinner === 'us' ? s.scoreWinner : {}),
                }}
              >
                {us}
              </div>
            </div>

            <div style={s.scoreDivider}>🏐</div>

            <div style={s.scoreTeam}>
              <div style={s.scoreTeamLabel}>
                {opponentName || 'Opponent'}
              </div>
              <div
                style={{
                  ...s.scoreNumber,
                  ...(setWinner === 'them' ? s.scoreWinner : {}),
                }}
              >
                {them}
              </div>
            </div>
          </div>

          {/* ── Side-change reminder (3rd set only) ─────────────────────────── */}
          {showSideChangeReminder && (
            <div
              style={{
                ...s.sideChangeBar,
                ...(atSideChange ? s.sideChangeBarActive : {}),
              }}
            >
              {atSideChange
                ? '⬅️➡️ CHANGE SIDES NOW! ⬅️➡️'
                : `↔️ Change sides every 7 pts · Next at ${nextSideChangeAt} total`}
            </div>
          )}

          {/* ── Player Cards ─────────────────────────────────────────────────── */}
          <div style={s.playerSection}>
            <div style={s.playerSectionLabel}>Your Players</div>
            <div style={s.playerCards}>
              {[0, 1].map((slot) => {
                const player = safeCourtPlayers[slot];
                return (
                  <div key={slot} style={s.playerCard}>
                    {player ? (
                      <>
                        <div style={s.playerNumber}>#{player.number || '—'}</div>
                        <div style={s.playerName}>{player.name}</div>
                      </>
                    ) : (
                      <div style={s.playerEmpty}>Tap to assign</div>
                    )}
                    <button
                      style={s.changeBtn}
                      onClick={() => openRosterPicker(slot)}
                    >
                      {player ? 'Change' : 'Assign'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Action Buttons ───────────────────────────────────────────────── */}
          <div style={s.actionSection}>
            {/* WE SCORED button / inline picker */}
            {!showWeScoredPicker && !showPlayerCredit && (
              <button
                style={s.weScoredBtn}
                onClick={() => setShowWeScoredPicker(true)}
                disabled={!!setWinner}
              >
                🏐 WE SCORED
              </button>
            )}

            {/* Inline WE SCORED sub-picker */}
            {showWeScoredPicker && !showPlayerCredit && (
              <div style={s.inlinePicker}>
                <div style={s.inlinePickerLabel}>How did we score?</div>
                <div style={s.inlinePickerGrid}>
                  {WE_SCORED_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      style={s.inlinePickerBtn}
                      onClick={() => handleSelectAction(action.key)}
                    >
                      <span style={s.inlinePickerEmoji}>{action.emoji}</span>
                      <span style={s.inlinePickerText}>{action.label}</span>
                    </button>
                  ))}
                </div>
                <button style={s.cancelSmallBtn} onClick={cancelWeScoredPicker}>
                  Cancel
                </button>
              </div>
            )}

            {/* Player credit picker */}
            {showPlayerCredit && (
              <div style={s.inlinePicker}>
                <div style={s.inlinePickerLabel}>Who gets credit?</div>
                <div style={s.inlinePickerGrid}>
                  {safeCourtPlayers.filter(Boolean).map((player) => (
                    <button
                      key={player._id}
                      style={s.playerCreditBtn}
                      onClick={() => handlePlayerCredit(player)}
                    >
                      <span style={s.playerCreditNumber}>#{player.number || '—'}</span>
                      <span style={s.playerCreditName}>{player.name}</span>
                    </button>
                  ))}
                </div>
                <button style={s.cancelSmallBtn} onClick={skipPlayerCredit}>
                  Skip / No credit
                </button>
              </div>
            )}

            {/* THEY SCORED */}
            {!showWeScoredPicker && !showPlayerCredit && (
              <button
                style={s.theyScoredBtn}
                onClick={handleTheyScored}
                disabled={!!setWinner}
              >
                ❌ THEY SCORED
              </button>
            )}
          </div>

          {/* ── End Set Button ───────────────────────────────────────────────── */}
          {setWinner && (
            <div style={s.endSetSection}>
              <div style={s.endSetBanner}>
                {setWinner === 'us' ? '🏆 You won this set!' : '😤 They won this set.'}
              </div>
              <button style={s.endSetBtn} onClick={handleEndSet}>
                Record Set End &amp; Continue
              </button>
            </div>
          )}

          {/* ── Recent Action Log (last 5) ───────────────────────────────────── */}
          {actionLog && actionLog.length > 0 && (
            <div style={s.logSection}>
              <div style={s.logLabel}>Recent</div>
              {[...actionLog]
                .filter((e) => e.mode === 'beach' || !e.mode)
                .slice(-5)
                .reverse()
                .map((entry, i) => (
                  <div key={i} style={s.logRow}>
                    <span style={s.logEmoji}>{entry.emoji || '•'}</span>
                    <span style={s.logText}>
                      {entry.action}
                      {entry.playerName ? ` — ${entry.playerName}` : ''}
                    </span>
                    <span style={s.logTime}>
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* ── New Match button ─────────────────────────────────────────────── */}
          {typeof handleNewMatch === 'function' && (
            <button
              style={s.newMatchBtn}
              onClick={handleNewMatch}
            >
              Start New Match
            </button>
          )}
        </div>
      )}

      {/* ── Roster Picker Modal ───────────────────────────────────────────────── */}
      {showRosterPicker && (
        <div style={s.modalOverlay} onClick={closeRosterPicker}>
          <div style={s.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>
              Assign Player — Slot {(pickingSlot ?? 0) + 1}
            </div>

            {availableBench.length === 0 ? (
              <div style={s.modalEmpty}>
                No players available. Add players to your roster first.
              </div>
            ) : (
              <div style={s.rosterGrid}>
                {availableBench.map((player) => (
                  <button
                    key={player._id}
                    style={s.rosterBtn}
                    onClick={() => pickPlayer(player)}
                  >
                    <span style={s.rosterBtnNumber}>#{player.number || '—'}</span>
                    <span style={s.rosterBtnName}>{player.name}</span>
                  </button>
                ))}
              </div>
            )}

            <button style={s.modalCancelBtn} onClick={closeRosterPicker}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Palette: sand #f5c842, ocean #1a6eb5, white #fff, dark ocean #0f4c81
const s = {
  // Page container
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '16px 12px 40px',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #fef9e7 0%, #fef3c7 60%, #e0f0ff 100%)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: 'border-box',
    width: '100%',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  headerEmoji: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#0f4c81',
    letterSpacing: '-0.3px',
  },

  // Set wins banner
  setBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  setBannerText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: 600,
  },
  setBannerDash: {
    color: '#9ca3af',
    margin: '0 2px',
  },
  decidingBadge: {
    background: '#1a6eb5',
    color: '#fff',
    borderRadius: 20,
    padding: '3px 12px',
    fontSize: 13,
    fontWeight: 700,
  },

  // Scoreboard
  scoreboard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    background: '#1a6eb5',
    borderRadius: 20,
    padding: '18px 32px',
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
    boxShadow: '0 6px 20px rgba(26,110,181,0.35)',
  },
  scoreTeam: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  scoreTeamLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    maxWidth: 110,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: 900,
    color: '#fff',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  scoreWinner: {
    color: '#f5c842',
  },
  scoreDivider: {
    fontSize: 28,
    opacity: 0.7,
  },

  // Side-change bar
  sideChangeBar: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    padding: '10px 16px',
    background: 'rgba(26,110,181,0.1)',
    border: '1px solid rgba(26,110,181,0.25)',
    color: '#1a6eb5',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'center',
    boxSizing: 'border-box',
    transition: 'background 0.2s',
  },
  sideChangeBarActive: {
    background: '#f5c842',
    border: '2px solid #d4a017',
    color: '#7a4f00',
    fontSize: 15,
    animation: 'none',
  },

  // Player section
  playerSection: {
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
  },
  playerSectionLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  playerCards: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  playerCard: {
    background: '#fff',
    borderRadius: 16,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: '1.5px solid #e5e7eb',
  },
  playerNumber: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1a6eb5',
  },
  playerName: {
    fontSize: 15,
    fontWeight: 800,
    color: '#111827',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  playerEmpty: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  changeBtn: {
    marginTop: 4,
    padding: '5px 14px',
    borderRadius: 20,
    border: '1.5px solid #1a6eb5',
    background: '#fff',
    color: '#1a6eb5',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },

  // Action section
  actionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
  },
  weScoredBtn: {
    width: '100%',
    padding: '18px 16px',
    borderRadius: 16,
    border: 'none',
    background: '#1a6eb5',
    color: '#fff',
    fontSize: 20,
    fontWeight: 900,
    cursor: 'pointer',
    letterSpacing: '0.5px',
    boxShadow: '0 4px 14px rgba(26,110,181,0.4)',
  },
  theyScoredBtn: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 16,
    border: '1.5px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
  },

  // Inline sub-picker
  inlinePicker: {
    background: '#fff',
    borderRadius: 16,
    padding: '16px',
    border: '1.5px solid #e5e7eb',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    width: '100%',
    boxSizing: 'border-box',
  },
  inlinePickerLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  inlinePickerGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginBottom: 10,
  },
  inlinePickerBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '12px 8px',
    borderRadius: 12,
    border: '1.5px solid #e5e7eb',
    background: '#f9fafb',
    cursor: 'pointer',
  },
  inlinePickerEmoji: {
    fontSize: 22,
  },
  inlinePickerText: {
    fontSize: 12,
    fontWeight: 700,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 1.2,
  },
  playerCreditBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '14px 10px',
    borderRadius: 12,
    border: '1.5px solid #1a6eb5',
    background: '#eff6ff',
    cursor: 'pointer',
  },
  playerCreditNumber: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1a6eb5',
  },
  playerCreditName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#111827',
  },
  cancelSmallBtn: {
    width: '100%',
    padding: '9px',
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#6b7280',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },

  // End Set
  endSetSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
  },
  endSetBanner: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 800,
    color: '#0f4c81',
    background: '#f5c842',
    borderRadius: 14,
    padding: '12px 16px',
  },
  endSetBtn: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 14,
    border: 'none',
    background: '#0f4c81',
    color: '#fff',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
  },

  // Recent log
  logSection: {
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
    background: '#fff',
    borderRadius: 14,
    padding: '12px 14px',
    border: '1px solid #e5e7eb',
  },
  logLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  logEmoji: {
    fontSize: 16,
    flexShrink: 0,
  },
  logText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: 500,
  },
  logTime: {
    fontSize: 11,
    color: '#9ca3af',
    flexShrink: 0,
  },

  // New match button
  newMatchBtn: {
    marginTop: 8,
    padding: '12px 24px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },

  // Roster picker modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: '20px 20px 0 0',
    padding: '20px 16px 36px',
    boxSizing: 'border-box',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalEmpty: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
    padding: '24px 0',
    background: '#f9fafb',
    borderRadius: 12,
    marginBottom: 16,
  },
  rosterGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 16,
  },
  rosterBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '14px 10px',
    borderRadius: 12,
    border: '1.5px solid #e5e7eb',
    background: '#f9fafb',
    cursor: 'pointer',
  },
  rosterBtnNumber: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1a6eb5',
  },
  rosterBtnName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
  },
  modalCancelBtn: {
    width: '100%',
    padding: '13px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
