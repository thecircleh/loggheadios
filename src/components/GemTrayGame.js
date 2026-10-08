import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GameLevelSelect, { makeRanges, tierColor } from './GameLevelSelect';
import { useGameProgress } from '../utils/useGameProgress';
import {
  GEMS, TRAY_SIZE, TOTAL_LEVELS, COLS, ROWS, getDiff, generatePuzzle, isFree, addToTray, findWinningMove, visibleQuarter,
} from '../utils/gemTrayPuzzle';

const GAME_ID = 'gemtray';
const STORE_KEY = 'loggerhead_gemtray_progress';
const MAX_UNDOS = 3;
// Soft tile tint per gem so kinds read at a glance, even on covered tiles.
const GEM_BG = ['#E0F2FE', '#FFEDD5', '#F3E8FF', '#DCFCE7', '#FFE4E6', '#FEF9C3', '#E0E7FF', '#ECFCCB', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#FCE7F3'];

const DIFF_RANGES = makeRanges([
  ['Easy', 1, 150], ['Medium', 151, 350], ['Hard', 351, 600],
  ['Expert', 601, 850], ['Master', 851, 1000],
]);

// ── How To Play ──────────────────────────────────────────────────────────────
function HowToPlayModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 360, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>💎 How to Play</div>
        {[
          ['👆', 'Tap an uncovered gem to drop it into the tray. Covered gems are dimmed until the gems on top of them are gone.'],
          ['✨', 'Three of the same gem in the tray clear away.'],
          ['🧺', 'The tray holds 7. Fill it and the level is over — start again.'],
          ['🧠', 'Every gem is visible from the start, and every level can be won. Plan which gems to free and when — grabbing the nearest match won\'t get you through the harder levels.'],
          ['↶', '3 undos per level. Hints are free.'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12 }}>
          {['💎', '💎', '🐢', '🐢', '⭐', '', ''].map((g, i) => (
            <div key={i} style={{ width: 36, height: 36, borderRadius: 7, border: '1.5px solid #CBD5E1', background: g ? '#fff' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{g}</div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#888', marginTop: 6 }}>One more 💎 or 🐢 clears a set</div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Got it!
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GemTrayGame({ isNative = false }) {
  const navigate = useNavigate();
  const { progress, recordWin } = useGameProgress(GAME_ID, STORE_KEY);

  const [screen, setScreen] = useState('levels');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [puzzle, setPuzzle] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [tray, setTray] = useState([]);
  const [history, setHistory] = useState([]);
  const [undosLeft, setUndosLeft] = useState(MAX_UNDOS);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sparkle, setSparkle] = useState(null); // gem that just cleared
  const [hintTile, setHintTile] = useState(null);
  const [hintMsg, setHintMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const timerRef = useRef(null);
  const sparkleRef = useRef(null);

  const startFresh = (p) => {
    setRemoved(new Array(p.tiles.length).fill(false));
    setTray([]);
    setHistory([]);
    setUndosLeft(MAX_UNDOS);
    setSolved(false);
    setFailed(false);
    setSparkle(null);
    setHintTile(null);
    setHintMsg('');
    setElapsed(0);
  };

  // ── Load puzzle
  useEffect(() => {
    if (screen !== 'game') return;
    const p = generatePuzzle(currentLevel);
    setPuzzle(p);
    startFresh(p);
  }, [screen, currentLevel]);

  // ── Timer
  useEffect(() => {
    clearInterval(timerRef.current);
    if (screen === 'game' && !solved && !failed) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, solved, failed, currentLevel]);

  useEffect(() => () => clearTimeout(sparkleRef.current), []);

  const freeSet = useMemo(() => {
    if (!puzzle) return new Set();
    const s = new Set();
    puzzle.tiles.forEach((_, i) => { if (!removed[i] && isFree(puzzle.tiles, i, removed)) s.add(i); });
    return s;
  }, [puzzle, removed]);

  const left = removed.filter(r => !r).length;

  const tap = (i) => {
    if (!puzzle || solved || failed || removed[i] || !freeSet.has(i)) return;
    setHistory(h => [...h, { removed, tray }]);
    const nextRemoved = [...removed];
    nextRemoved[i] = true;
    const { tray: nextTray, cleared } = addToTray(tray, puzzle.tiles[i].gem);
    setRemoved(nextRemoved);
    setTray(nextTray);
    setHintTile(null);
    setHintMsg('');
    if (cleared != null) {
      setSparkle(cleared);
      clearTimeout(sparkleRef.current);
      sparkleRef.current = setTimeout(() => setSparkle(null), 600);
    }
    if (nextTray.length >= TRAY_SIZE) {
      setFailed(true);
    } else if (nextRemoved.every(Boolean) && nextTray.length === 0) {
      setSolved(true);
      clearInterval(timerRef.current);
      recordWin(currentLevel, { time: elapsed });
    }
  };

  const undo = () => {
    if (!history.length || undosLeft <= 0 || solved || failed) return;
    const last = history[history.length - 1];
    setRemoved(last.removed);
    setTray(last.tray);
    setHistory(h => h.slice(0, -1));
    setUndosLeft(u => u - 1);
    setHintTile(null);
    setHintMsg('');
  };

  const hint = () => {
    if (!puzzle || solved || failed) return;
    const move = findWinningMove(puzzle.tiles, removed, tray);
    if (move == null) {
      setHintTile(null);
      setHintMsg(undosLeft > 0 && history.length ? 'No way to win from here — try an undo.' : 'No way to win from here — start the level over.');
    } else {
      setHintTile(move);
      setHintMsg('');
    }
  };

  const reset = () => { if (puzzle) startFresh(puzzle); };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    return (
      <GameLevelSelect
        icon="💎" title="Gem Tray" subtitle="Plan your picks · Three of a kind clear"
        accent="#7C3AED" totalLevels={TOTAL_LEVELS} ranges={DIFF_RANGES} progress={progress}
        isNative={isNative}
        onBack={() => navigate('/puzzle')}
        onHowTo={() => setShowHowTo(true)}
        onPick={(lv) => { setCurrentLevel(lv); setScreen('game'); }}
        renderDone={() => '💎'}
      >
        {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      </GameLevelSelect>
    );
  }

  // ── GAME SCREEN ────────────────────────────────────────────────────────────
  if (!puzzle) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Building level…</div>;
  }

  const availW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 34, 440);
  const CS = Math.floor(availW / COLS);  // one whole cell
  const H = CS / 2;                       // positions are in half cells
  const LIFT = Math.max(2, Math.round(CS * 0.06)); // visual raise per layer
  const diff = getDiff(currentLevel);
  const order = puzzle.tiles.map((t, i) => i).sort((a, b) => {
    const ta = puzzle.tiles[a], tb = puzzle.tiles[b];
    return ta.z - tb.z || ta.y - tb.y || ta.x - tb.x;
  });
  const slot = Math.min(44, Math.floor((CS * COLS - 6 * 6) / TRAY_SIZE));
  const btn = { padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#333' };

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),10px) 12px calc(90px + env(safe-area-inset-bottom))' : '10px 12px 20px', maxWidth: 520, margin: '0 auto', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button onClick={() => setScreen('levels')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#555', padding: '2px 6px 2px 0' }}>←</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Level {currentLevel}</span>
          <span style={{ fontSize: 12, color: tierColor(diff.label), fontWeight: 700, marginLeft: 8 }}>{diff.label}</span>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>{left} gems left</span>
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: '#7C3AED', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: solved ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {solved ? '✅' : fmtTime(elapsed)}
        </div>
      </div>

      {/* Pile */}
      <div style={{ position: 'relative', width: CS * COLS, height: CS * ROWS + LIFT * 6, margin: '8px auto 0', borderRadius: 12, background: 'linear-gradient(180deg, #F5F3FF, #EDE9FE)' }}>
        {order.map(i => {
          if (removed[i]) return null;
          const t = puzzle.tiles[i];
          const free = freeSet.has(i);
          const isHint = hintTile === i;
          // Covered gems show their icon in a quarter that's still visible.
          const q = free ? -1 : visibleQuarter(puzzle.tiles, i, removed);
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              aria-label={free ? `Gem ${GEMS[t.gem]}` : `Covered gem ${GEMS[t.gem]}`}
              style={{
                position: 'absolute',
                left: t.x * H + 1, top: t.y * H + 1 + LIFT * (6 - t.z),
                width: CS - 2, height: CS - 2, padding: 0,
                borderRadius: Math.round(CS * 0.2),
                background: GEM_BG[t.gem],
                border: isHint ? '3px solid #F59E0B' : '1.5px solid rgba(76,29,149,0.35)',
                boxShadow: free ? `0 ${LIFT}px 0 rgba(76,29,149,0.35), 0 ${LIFT + 2}px 6px rgba(0,0,0,0.15)` : `0 ${LIFT}px 0 rgba(76,29,149,0.2)`,
                filter: free ? 'none' : 'brightness(0.62) saturate(0.7)',
                cursor: free && !solved && !failed ? 'pointer' : 'default',
                fontSize: Math.floor(CS * 0.58), lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: t.z * 100 + t.y,
                transition: 'filter 0.15s',
              }}
            >
              {q < 0 ? GEMS[t.gem] : (
                <span style={{
                  position: 'absolute', left: (q & 1) * H, top: (q >> 1) * H, width: H - 1, height: H - 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.floor(H * 0.7),
                }}>{GEMS[t.gem]}</span>
              )}
            </button>
          );
        })}
        {solved && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, pointerEvents: 'none' }}>🎉</div>
        )}
        {failed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '18px 22px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
              <div style={{ fontSize: 34 }}>🧺</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>Tray full</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Every level can be won — plan a new route.</div>
              <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>↺ Try Again</button>
            </div>
          </div>
        )}
      </div>

      {/* Tray */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
        {Array.from({ length: TRAY_SIZE }, (_, k) => {
          const g = tray[k];
          const danger = tray.length >= TRAY_SIZE - 1 && g == null;
          return (
            <div key={k} style={{
              width: slot, height: slot, borderRadius: 8, boxSizing: 'border-box',
              border: `1.5px solid ${danger ? '#F87171' : '#CBD5E1'}`,
              background: g != null ? GEM_BG[g] : danger ? '#FEF2F2' : '#F1F5F9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.floor(slot * 0.6),
            }}>
              {g != null ? GEMS[g] : ''}
            </div>
          );
        })}
        {sparkle != null && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, pointerEvents: 'none' }}>
            ✨ {GEMS[sparkle]}{GEMS[sparkle]}{GEMS[sparkle]} ✨
          </div>
        )}
      </div>
      {hintMsg && <div style={{ textAlign: 'center', fontSize: 13, color: '#B45309', marginTop: 8, fontWeight: 600 }}>{hintMsg}</div>}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={undo} disabled={!history.length || undosLeft <= 0 || solved || failed} style={{ ...btn, opacity: !history.length || undosLeft <= 0 || solved || failed ? 0.4 : 1 }}>↶ Undo ({undosLeft})</button>
        <button onClick={hint} disabled={solved || failed} style={{ ...btn, opacity: solved || failed ? 0.4 : 1 }}>💡 Hint</button>
        <button onClick={reset} style={btn}>↺ Reset</button>
        {solved ? (
          currentLevel < TOTAL_LEVELS && (
            <button onClick={() => setCurrentLevel(l => l + 1)} style={{ ...btn, border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700 }}>Next Level →</button>
          )
        ) : (
          <>
            {currentLevel > 1 && <button onClick={() => setCurrentLevel(l => l - 1)} style={{ ...btn, fontWeight: 400, color: '#555' }}>← Prev</button>}
            {currentLevel < TOTAL_LEVELS && <button onClick={() => setCurrentLevel(l => l + 1)} style={{ ...btn, fontWeight: 400, color: '#555' }}>Skip →</button>}
          </>
        )}
      </div>
    </div>
  );
}
