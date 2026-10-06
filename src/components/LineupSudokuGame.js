import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GameLevelSelect, { makeRanges, tierColor } from './GameLevelSelect';
import { useGameProgress } from '../utils/useGameProgress';
import {
  SIZE, PLAYERS, TOTAL_LEVELS, getDiff, generatePuzzle, courtOf,
} from '../utils/lineupPuzzle';

// ── Look ─────────────────────────────────────────────────────────────────────
// Opposites share a color family so the pairing reads at a glance.
const PLAYER_COLORS = ['#B45309', '#D97706', '#1D4ED8', '#3B82F6', '#15803D', '#22C55E'];
const PLAYER_BG     = ['#FEF3C7', '#FFEDD5', '#DBEAFE', '#E0F2FE', '#DCFCE7', '#ECFCCB'];
const NOTE_LABELS   = ['S', 'OP', 'H1', 'H2', 'M1', 'M2'];
// Court zone numbers: front row 4-3-2, back row 5-6-1.
const ZONES = [[4, 3, 2], [5, 6, 1]];
const zoneOf = (i) => ZONES[Math.floor(i / SIZE) % 2][(i % SIZE) % 3];

const DIFF_RANGES = makeRanges([
  ['Easy', 1, 150], ['Medium', 151, 350], ['Hard', 351, 600],
  ['Expert', 601, 850], ['Master', 851, 1000],
]);
const MAX_LIVES = 3;
const GAME_ID = 'lineup';
const STORE_KEY = 'loggerhead_lineup_progress';

const sameUnit = (a, b) =>
  Math.floor(a / SIZE) === Math.floor(b / SIZE) || a % SIZE === b % SIZE || courtOf(a) === courtOf(b);

// ── How To Play ──────────────────────────────────────────────────────────────
function HowToPlayModal({ onClose }) {
  const demo = [[1, 4, 2], [3, 5, 0]]; // a legal 5-1: OPP M1 OH1 / OH2 M2 S
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 360, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>🏐 How to Play</div>

        {[
          ['🔢', 'Every row and column has each player once: S, OPP, OH1, OH2, M1, M2'],
          ['🏟️', 'Each boxed 2×3 area is a court — front row on top, back row below. Each court also has every player once.'],
          ['🔄', 'Rotation courts (marked 🔄) hold a real 5-1 lineup: every player is directly across the court from their opposite (zones 1↔4, 2↔5, 3↔6). S–OPP, OH1–OH2, M1–M2.'],
          ['👆', 'Tap a cell, then a player. Turn on ✏️ Notes to pencil in possibilities.'],
          ['❤️', 'You have 3 lives. A wrong player costs one — lose all 3 and you start the level over.'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.06em', marginBottom: 8 }}>A ROTATION COURT</div>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>— net —</div>
          <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3, 56px)', border: '2.5px solid #1F2937', borderRadius: 6, overflow: 'hidden' }}>
            {demo.flatMap((row, r) => row.map((p, c) => (
              <div key={`${r}-${c}`} style={{
                position: 'relative', height: 48, background: PLAYER_BG[p], color: PLAYER_COLORS[p],
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15,
                borderRight: c < 2 ? '1px solid rgba(0,0,0,0.12)' : 'none',
                borderBottom: r === 0 ? '1px dashed rgba(0,0,0,0.25)' : 'none',
              }}>
                <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: '#9CA3AF', fontWeight: 600 }}>{ZONES[r][c]}</span>
                {PLAYERS[p]}
              </div>
            )))}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Opposites mirror through the center: 1↔4, 2↔5, 3↔6</div>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Got it!
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LineupSudokuGame({ isNative = false }) {
  const navigate = useNavigate();
  const { progress, recordWin } = useGameProgress(GAME_ID, STORE_KEY);

  const [screen, setScreen] = useState('levels');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [puzzle, setPuzzle] = useState(null);
  const [values, setValues] = useState([]);  // -1 or player index; only correct players are ever placed
  const [notes, setNotes] = useState([]);    // bitmask of penciled players per cell
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [notesMode, setNotesMode] = useState(false);
  const [lives, setLives] = useState(MAX_LIVES);
  const [flash, setFlash] = useState(null);  // { cell, player } for a wrong guess
  const [solved, setSolved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const timerRef = useRef(null);
  const flashRef = useRef(null);

  const failed = lives <= 0;

  const startFresh = (p) => {
    setValues([...p.givens]);
    setNotes(new Array(SIZE * SIZE).fill(0));
    setHistory([]);
    setSelected(-1);
    setLives(MAX_LIVES);
    setFlash(null);
    setSolved(false);
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

  useEffect(() => () => clearTimeout(flashRef.current), []);

  // ── Win check
  useEffect(() => {
    if (!puzzle || solved || !values.length || values.some(v => v < 0)) return;
    setSolved(true);
    setSelected(-1);
    clearInterval(timerRef.current);
    recordWin(currentLevel, { time: elapsed });
  }, [values, puzzle, solved, elapsed, currentLevel, recordWin]);

  const commit = useCallback((nextValues, nextNotes) => {
    setHistory(h => [...h.slice(-199), { values, notes }]);
    setValues(nextValues);
    setNotes(nextNotes);
  }, [values, notes]);

  const enter = (player) => {
    if (!puzzle || solved || failed || selected < 0 || puzzle.givens[selected] >= 0 || values[selected] >= 0) return;
    if (notesMode) {
      const next = [...notes];
      next[selected] ^= 1 << player;
      commit(values, next);
      return;
    }
    if (puzzle.solution[selected] !== player) {
      setLives(l => l - 1);
      setFlash({ cell: selected, player });
      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlash(null), 700);
      return;
    }
    const nextValues = [...values];
    nextValues[selected] = player;
    // Placing a player clears it from notes in the same row, column and court.
    const nextNotes = notes.map((m, i) => (i === selected ? 0 : sameUnit(i, selected) ? m & ~(1 << player) : m));
    commit(nextValues, nextNotes);
  };

  // Undo only touches entries and notes; lost lives stay lost.
  const undo = () => {
    if (!history.length || solved || failed) return;
    const last = history[history.length - 1];
    setValues(last.values);
    setNotes(last.notes);
    setHistory(h => h.slice(0, -1));
  };

  const clearNotes = () => {
    if (selected < 0 || !notes[selected] || solved || failed) return;
    const next = [...notes];
    next[selected] = 0;
    commit(values, next);
  };

  // Hint: fill the selected empty cell, or the first empty one. Free — doesn't cost a life.
  const hint = () => {
    if (!puzzle || solved || failed) return;
    const cell = selected >= 0 && values[selected] < 0 ? selected : values.findIndex(v => v < 0);
    if (cell < 0) return;
    const player = puzzle.solution[cell];
    const nextValues = [...values];
    nextValues[cell] = player;
    const nextNotes = notes.map((m, i) => (i === cell ? 0 : sameUnit(i, cell) ? m & ~(1 << player) : m));
    commit(nextValues, nextNotes);
    setSelected(cell);
  };

  const reset = () => { if (puzzle) startFresh(puzzle); };

  // How many of each player are placed (for dimming finished ones on the pad).
  const placedCount = useMemo(() => {
    const counts = new Array(6).fill(0);
    values.forEach(v => { if (v >= 0) counts[v]++; });
    return counts;
  }, [values]);

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    return (
      <GameLevelSelect
        icon="🏐" title="Lineup Sudoku" subtitle="Every player once · Read the rotation courts"
        accent="#B45309" totalLevels={TOTAL_LEVELS} ranges={DIFF_RANGES} progress={progress}
        isNative={isNative}
        onBack={() => navigate('/puzzle')}
        onHowTo={() => setShowHowTo(true)}
        onPick={(lv) => { setCurrentLevel(lv); setScreen('game'); }}
        renderDone={() => '🏐'}
      >
        {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      </GameLevelSelect>
    );
  }

  // ── GAME SCREEN ────────────────────────────────────────────────────────────
  if (!puzzle) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Generating puzzle…</div>;
  }

  const availW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 34, 420);
  const CS = Math.floor(availW / SIZE);
  const diff = getDiff(currentLevel);
  const selPlayer = selected >= 0 ? values[selected] : -1;
  const THIN = '1px solid rgba(0,0,0,0.12)';
  const THICK = '2.5px solid #1F2937';
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
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>🔄 ×{puzzle.rotations.length}</span>
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: '#B45309', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: solved ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {solved ? '✅' : fmtTime(elapsed)}
        </div>
      </div>

      {/* Lives */}
      <div style={{ marginBottom: 10 }} aria-label={`${lives} lives left`}>
        {Array.from({ length: MAX_LIVES }, (_, i) => (
          <span key={i} style={{ fontSize: 16, marginRight: 2, opacity: i < lives ? 1 : 0.25, filter: i < lives ? 'none' : 'grayscale(1)' }}>❤️</span>
        ))}
      </div>

      {/* Board */}
      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${SIZE}, ${CS}px)`, width: CS * SIZE + 5, margin: '0 auto',
          border: THICK, borderRadius: 8, overflow: 'hidden', boxSizing: 'border-box',
          boxShadow: solved ? '0 0 26px #22C55E66' : '0 4px 16px rgba(0,0,0,0.15)', transition: 'box-shadow 0.3s',
        }}>
          {values.map((v, i) => {
            const r = Math.floor(i / SIZE), c = i % SIZE;
            const given = puzzle.givens[i] >= 0;
            const isSel = i === selected;
            const related = selected >= 0 && !isSel && sameUnit(i, selected);
            const samePlayer = selPlayer >= 0 && v === selPlayer;
            const isFlash = flash?.cell === i;
            const bg = isFlash ? '#FCA5A5'
              : isSel ? '#FDE68A'
              : samePlayer ? '#FEF9C3'
              : related ? '#F3F4F6'
              : puzzle.rotations.includes(courtOf(i)) ? '#E0F2FE'
              : courtOf(i) % 2 === 0 ? '#FFFFFF' : '#FAF7F0';
            return (
              <div key={i} onClick={() => !solved && !failed && setSelected(i)} style={{
                position: 'relative', width: CS, height: CS, boxSizing: 'border-box', background: bg, cursor: 'pointer',
                borderRight: c < SIZE - 1 ? (c === 2 ? THICK : THIN) : 'none',
                borderBottom: r < SIZE - 1 ? (r % 2 === 1 ? THICK : '1px dashed rgba(0,0,0,0.22)') : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s',
              }}>
                <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: '#C4C9D1', fontWeight: 600 }}>{zoneOf(i)}</span>
                {r % 2 === 0 && c % 3 === 2 && puzzle.rotations.includes(courtOf(i)) && (
                  <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 10 }} aria-label="rotation court">🔄</span>
                )}
                {isFlash ? (
                  <span style={{ fontSize: Math.floor(CS * 0.3), fontWeight: 800, color: '#DC2626', textDecoration: 'line-through' }}>{PLAYERS[flash.player]}</span>
                ) : v >= 0 ? (
                  <span style={{ fontSize: Math.floor(CS * (PLAYERS[v].length > 2 ? 0.27 : 0.34)), fontWeight: given ? 900 : 700, color: given ? '#111827' : PLAYER_COLORS[v] }}>{PLAYERS[v]}</span>
                ) : notes[i] ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '88%', gap: 0 }}>
                    {NOTE_LABELS.map((lbl, p) => (
                      <span key={p} style={{ fontSize: Math.max(8, Math.floor(CS * 0.16)), lineHeight: 1.3, textAlign: 'center', fontWeight: 700, color: PLAYER_COLORS[p], visibility: notes[i] & (1 << p) ? 'visible' : 'hidden' }}>{lbl}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {solved && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, pointerEvents: 'none' }}>🎉</div>
        )}
        {failed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 14, padding: '18px 22px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
              <div style={{ fontSize: 34 }}>💔</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>Out of lives</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Lineup card rejected. Start the level over.</div>
              <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#B45309', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>↺ Try Again</button>
            </div>
          </div>
        )}
      </div>

      {/* Player pad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 14, maxWidth: CS * SIZE + 5, marginLeft: 'auto', marginRight: 'auto' }}>
        {PLAYERS.map((name, p) => {
          const done = placedCount[p] >= SIZE;
          return (
            <button key={name} onClick={() => enter(p)} disabled={done || solved || failed} style={{
              padding: '12px 0', borderRadius: 8, border: `1.5px solid ${PLAYER_COLORS[p]}`,
              background: notesMode ? '#fff' : PLAYER_BG[p], color: PLAYER_COLORS[p],
              fontSize: 14, fontWeight: 800, cursor: done ? 'default' : 'pointer', opacity: done ? 0.3 : 1,
              borderStyle: notesMode ? 'dashed' : 'solid',
            }}>
              {name}
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setNotesMode(m => !m)} style={{ ...btn, background: notesMode ? '#FEF3C7' : '#fff', color: notesMode ? '#B45309' : '#333' }}>
          ✏️ Notes {notesMode ? 'On' : 'Off'}
        </button>
        <button onClick={clearNotes} style={btn}>⌫ Clear</button>
        <button onClick={undo} disabled={!history.length || solved || failed} style={{ ...btn, opacity: !history.length || solved || failed ? 0.4 : 1 }}>↶ Undo</button>
        <button onClick={hint} disabled={solved || failed} style={{ ...btn, opacity: solved || failed ? 0.4 : 1 }}>💡 Hint</button>
        <button onClick={reset} style={btn}>↺ Reset</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
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
