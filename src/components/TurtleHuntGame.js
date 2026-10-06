import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GameLevelSelect, { makeRanges, tierColor } from './GameLevelSelect';
import { useGameProgress } from '../utils/useGameProgress';
import {
  TOTAL_LEVELS, getDiff, generatePuzzle, around, findConflicts, isSolved,
} from '../utils/turtlePuzzle';

// ── Look ─────────────────────────────────────────────────────────────────────
// Beachy pastels, one per region (max 10 regions).
const REGION_COLORS = [
  '#BFE3F5', '#F9D9A8', '#C8EBC4', '#F6C6CF', '#DCCCF2',
  '#FDF0A6', '#B8E6E0', '#F7CDB0', '#D3DDB2', '#C9D3F2',
];
const DIFF_RANGES = makeRanges([
  ['Easy', 1, 100], ['Medium', 101, 250], ['Hard', 251, 450],
  ['Expert', 451, 700], ['Master', 701, 900], ['Max', 901, 1000],
]);

const EMPTY = 0, MARK = 1, TURTLE = 2;
const MAX_LIVES = 3;

// ── Board (shared by the game and the How to Play demo) ──────────────────────
function Board({ puzzle, cells, cellSize, conflicts, solved, wrong, gridRef, ...handlers }) {
  const { size, regions, clues } = puzzle;
  const clueAt = new Map(clues.map(c => [c.cell, c.n]));
  const THIN = '1px solid rgba(0,0,0,0.12)';
  const THICK = '2.5px solid #1F2937';
  const GS = cellSize * size;

  return (
    <div
      ref={gridRef}
      {...handlers}
      style={{
        display: 'grid', gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
        width: GS + 5, margin: '0 auto', border: THICK, borderRadius: 8, overflow: 'hidden',
        touchAction: 'none', boxSizing: 'border-box',
        boxShadow: solved ? '0 0 26px #22C55E66' : '0 4px 16px rgba(0,0,0,0.15)',
        transition: 'box-shadow 0.3s',
      }}
    >
      {regions.map((reg, i) => {
        const r = Math.floor(i / size), c = i % size;
        const state = cells[i];
        const nest = clueAt.get(i);
        const nestState = conflicts?.nestState?.[i];
        const bad = state === TURTLE && conflicts?.bad?.has(i);
        const isWrong = wrong?.has(i);
        return (
          <div key={i} style={{
            width: cellSize, height: cellSize, boxSizing: 'border-box',
            background: bad || isWrong ? '#FCA5A5' : REGION_COLORS[reg],
            borderRight: c < size - 1 ? (regions[i + 1] !== reg ? THICK : THIN) : 'none',
            borderBottom: r < size - 1 ? (regions[i + size] !== reg ? THICK : THIN) : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.floor(cellSize * 0.58), lineHeight: 1, cursor: 'pointer',
            transition: 'background 0.15s',
          }}>
            {nest != null ? (
              <div style={{
                width: '74%', height: '74%', borderRadius: '50%',
                background: nestState === 'ok' ? '#86EFAC' : nestState === 'over' ? '#F87171' : '#E7D3AE',
                border: '2px dashed #8B6B3E', boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: Math.floor(cellSize * 0.36), fontWeight: 900, color: '#5B4120',
              }}>{nest}</div>
            ) : isWrong ? (
              <span style={{ fontSize: Math.floor(cellSize * 0.4), color: '#DC2626', fontWeight: 900 }}>✕</span>
            ) : state === TURTLE ? (
              <span role="img" aria-label="turtle">🐢</span>
            ) : state === MARK ? (
              <span style={{ fontSize: Math.floor(cellSize * 0.32), color: 'rgba(31,41,55,0.45)', fontWeight: 700 }}>✕</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── How To Play ──────────────────────────────────────────────────────────────
function HowToPlayModal({ onClose }) {
  const demo = useMemo(() => generatePuzzle(1), []);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n = n > demo.size + 2 ? 0 : n + 1; // pause on the finished board, then loop
      setShown(n);
    }, 800);
    return () => clearInterval(id);
  }, [demo]);

  const cells = new Array(demo.size * demo.size).fill(EMPTY);
  demo.solution.slice(0, shown).forEach(i => { cells[i] = TURTLE; });
  const done = shown >= demo.size;
  const conflicts = findConflicts(demo, new Set(demo.solution.slice(0, shown)));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 360, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>🐢 How to Play</div>

        {[
          ['🎨', 'Find the one turtle hiding in every colored region'],
          ['↔️', 'Only one turtle per row and per column'],
          ['🚫', 'Turtles never touch — not even diagonally'],
          ['🪺', 'Nests show how many turtles are in the 8 cells around them. No turtle can sit on a nest.'],
          ['👆', 'Tap once to mark ✕, again for a turtle, again to clear. Drag to mark many ✕s.'],
          ['❤️', 'You have 3 lives. A turtle in the wrong spot costs one — lose all 3 and you start the level over.'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.06em', marginBottom: 8 }}>LIVE DEMO</div>
          <Board puzzle={demo} cells={cells} cellSize={44} conflicts={conflicts} solved={done} />
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Got it!
        </button>
      </div>
    </div>
  );
}

// ── Persistence ──────────────────────────────────────────────────────────────
const GAME_ID = 'turtles';
const STORE_KEY = 'loggerhead_turtles_progress';
const AUTOX_KEY = 'lh_turtles_autox';

// ── Main component ────────────────────────────────────────────────────────────
export default function TurtleHuntGame({ isNative = false }) {
  const navigate = useNavigate();

  const [screen, setScreen] = useState('levels');
  const [currentLevel, setCurrentLevel] = useState(1);

  const [puzzle, setPuzzle] = useState(null);
  const [cells, setCells] = useState([]);
  const [history, setHistory] = useState([]);
  const [solved, setSolved] = useState(false);
  const [lives, setLives] = useState(MAX_LIVES);
  const [wrong, setWrong] = useState(() => new Set()); // cells where a turtle cost a life
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const [autoX, setAutoX] = useState(() => {
    try { return localStorage.getItem(AUTOX_KEY) === '1'; } catch { return false; }
  });

  const gridRef = useRef(null);
  const timerRef = useRef(null);
  const dragRef = useRef(null); // { last } while drag-marking ✕s

  const { progress, recordWin, saveSettings } = useGameProgress(GAME_ID, STORE_KEY, {
    onSettings: (settings) => {
      if (typeof settings.autoX !== 'boolean') return;
      setAutoX(settings.autoX);
      try { localStorage.setItem(AUTOX_KEY, settings.autoX ? '1' : '0'); } catch {}
    },
  });

  const failed = lives <= 0;

  const startFresh = (p) => {
    setCells(new Array(p.size * p.size).fill(EMPTY));
    setHistory([]);
    setSolved(false);
    setElapsed(0);
    setLives(MAX_LIVES);
    setWrong(new Set());
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

  const turtles = useMemo(() => new Set(cells.flatMap((s, i) => (s === TURTLE ? [i] : []))), [cells]);
  const conflicts = useMemo(() => (puzzle ? findConflicts(puzzle, turtles) : null), [puzzle, turtles]);
  const nestCells = useMemo(() => new Set(puzzle ? puzzle.clues.map(c => c.cell) : []), [puzzle]);

  // ── Win check
  useEffect(() => {
    if (!puzzle || solved || !isSolved(puzzle, turtles)) return;
    setSolved(true);
    clearInterval(timerRef.current);
    recordWin(currentLevel, { time: elapsed });
  }, [turtles, puzzle, solved, elapsed, currentLevel, recordWin]);

  // ── Editing
  const commit = useCallback((next) => {
    setHistory(h => [...h.slice(-199), cells]);
    setCells(next);
  }, [cells]);

  // Cells a turtle at `cell` rules out: its row, column, region and neighbors.
  const blockedBy = useCallback((cell) => {
    const { size, regions } = puzzle;
    const r = Math.floor(cell / size), c = cell % size;
    const out = new Set(around(cell, size));
    for (let i = 0; i < size * size; i++) {
      if (i !== cell && (Math.floor(i / size) === r || i % size === c || regions[i] === regions[cell])) out.add(i);
    }
    return out;
  }, [puzzle]);

  const placeTurtle = useCallback((base, cell) => {
    const next = [...base];
    next[cell] = TURTLE;
    if (autoX) blockedBy(cell).forEach(i => { if (next[i] === EMPTY && !nestCells.has(i)) next[i] = MARK; });
    return next;
  }, [autoX, blockedBy, nestCells]);

  const getCellAt = (x, y) => {
    const grid = gridRef.current;
    if (!grid || !puzzle) return -1;
    const rect = grid.getBoundingClientRect();
    const cs = rect.width / puzzle.size;
    const c = Math.floor((x - rect.left) / cs), r = Math.floor((y - rect.top) / cs);
    if (r < 0 || c < 0 || r >= puzzle.size || c >= puzzle.size) return -1;
    return r * puzzle.size + c;
  };

  const handlePtrDown = (e) => {
    if (solved || failed) return;
    const cell = getCellAt(e.clientX, e.clientY);
    if (cell < 0 || nestCells.has(cell) || wrong.has(cell)) return;
    e.preventDefault();
    const state = cells[cell];
    if (state === EMPTY) {
      const next = [...cells];
      next[cell] = MARK;
      commit(next);
      dragRef.current = { last: cell, cells: next };
      gridRef.current?.setPointerCapture?.(e.pointerId);
    } else if (state === MARK) {
      // A turtle outside the solution costs a life and leaves a red ✕ instead.
      if (!puzzle.solution.includes(cell)) {
        setWrong(w => new Set(w).add(cell));
        setLives(l => l - 1);
        return;
      }
      commit(placeTurtle(cells, cell));
    } else {
      const next = [...cells];
      next[cell] = EMPTY;
      commit(next);
    }
  };

  // Dragging after starting on an empty cell marks every empty cell passed over.
  const handlePtrMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const cell = getCellAt(e.clientX, e.clientY);
    if (cell < 0 || cell === d.last) return;
    d.last = cell;
    if (d.cells[cell] !== EMPTY || nestCells.has(cell) || wrong.has(cell)) return;
    d.cells = [...d.cells];
    d.cells[cell] = MARK;
    setCells(d.cells); // one undo step for the whole drag
  };

  const handlePtrUp = () => { dragRef.current = null; };

  // Undo only touches marks and turtles; lost lives stay lost.
  const undo = () => {
    if (!history.length || solved || failed) return;
    setCells(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  };

  const reset = () => { if (puzzle) startFresh(puzzle); };

  // Hint: place one correct turtle (free — doesn't cost a life).
  const hint = () => {
    if (!puzzle || solved || failed) return;
    const missing = puzzle.solution.find(i => cells[i] !== TURTLE);
    if (missing != null) commit(placeTurtle(cells, missing));
  };

  const toggleAutoX = () => {
    const next = !autoX;
    setAutoX(next);
    try { localStorage.setItem(AUTOX_KEY, next ? '1' : '0'); } catch {}
    saveSettings({ autoX: next });
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    return (
      <GameLevelSelect
        icon="🐢" title="Turtle Hunt" subtitle="One turtle per row, column & region · Read the nests"
        accent="#0E7490" totalLevels={TOTAL_LEVELS} ranges={DIFF_RANGES} progress={progress}
        isNative={isNative}
        onBack={() => navigate('/puzzle')}
        onHowTo={() => setShowHowTo(true)}
        onPick={(lv) => { setCurrentLevel(lv); setScreen('game'); }}
        renderDone={() => '🐢'}
      >
        {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      </GameLevelSelect>
    );
  }

  // ── GAME SCREEN ────────────────────────────────────────────────────────────
  if (!puzzle) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Generating puzzle…</div>;
  }

  const { size } = puzzle;
  const availW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 34, 460);
  const CS = Math.floor(availW / size);
  const diff = getDiff(currentLevel);
  const placed = turtles.size;

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
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>{size}×{size} · {puzzle.clues.length} nests</span>
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: '#0E7490', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: solved ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {solved ? '✅' : fmtTime(elapsed)}
        </div>
      </div>

      {/* Lives + turtles found */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#555', marginBottom: 10, fontWeight: 600 }}>
        <div aria-label={`${lives} lives left`}>
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <span key={i} style={{ fontSize: 16, marginRight: 2, opacity: i < lives ? 1 : 0.25, filter: i < lives ? 'none' : 'grayscale(1)' }}>❤️</span>
          ))}
        </div>
        <div>
          {Array.from({ length: size }, (_, i) => (
            <span key={i} style={{ opacity: i < placed ? 1 : 0.2, marginRight: 2 }}>🐢</span>
          ))}
          <span style={{ marginLeft: 6, color: conflicts?.bad.size ? '#DC2626' : '#555' }}>{placed}/{size}</span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <Board
          puzzle={puzzle} cells={cells} cellSize={CS} conflicts={conflicts} solved={solved} wrong={wrong}
          gridRef={gridRef}
          onPointerDown={handlePtrDown}
          onPointerMove={handlePtrMove}
          onPointerUp={handlePtrUp}
          onPointerCancel={handlePtrUp}
        />
        {solved && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, pointerEvents: 'none' }}>
            🎉
          </div>
        )}
        {failed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 14, padding: '18px 22px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
              <div style={{ fontSize: 34 }}>💔</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>Out of lives</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>The turtles slipped away. Start the level over.</div>
              <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                ↺ Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={undo} disabled={!history.length || solved || failed} style={{ ...btn, opacity: !history.length || solved || failed ? 0.4 : 1 }}>↶ Undo</button>
        <button onClick={reset} style={btn}>↺ Reset</button>
        <button onClick={hint} disabled={solved || failed} style={{ ...btn, opacity: solved || failed ? 0.4 : 1 }}>💡 Hint</button>
        <button onClick={toggleAutoX} style={{ ...btn, background: autoX ? '#ECFEFF' : '#fff', color: autoX ? '#0E7490' : '#333' }}>
          Auto ✕ {autoX ? 'On' : 'Off'}
        </button>
        {solved ? (
          currentLevel < TOTAL_LEVELS && (
            <button onClick={() => setCurrentLevel(l => l + 1)} style={{ ...btn, border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700 }}>
              Next Level →
            </button>
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
