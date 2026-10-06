import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GameLevelSelect, { makeRanges, tierColor } from './GameLevelSelect';
import { useGameProgress } from '../utils/useGameProgress';
import {
  SIZE, EXIT_ROW, GOAL_OFFSET, TIERS, TOTAL_LEVELS, getDiff, decodeLevel, slideRange, solveFrom, starsFor,
} from '../utils/shellSlidePuzzle';

const GAME_ID = 'shellslide';
const STORE_KEY = 'loggerhead_shellslide_progress';

const DIFF_RANGES = makeRanges(TIERS.reduce((acc, t) => {
  const lo = acc.length ? acc[acc.length - 1][2] + 1 : 1;
  return [...acc, [t.label, lo, lo + t.count - 1]];
}, []));

// Levels are pre-generated data (scripts/generateShellSlideLevels.mjs), loaded on demand.
let levelsPromise = null;
const loadLevels = () => {
  if (!levelsPromise) levelsPromise = import('../data/shellSlideLevels.json').then(m => m.default);
  return levelsPromise;
};

const Stars = ({ n, size = 14 }) => (
  <span style={{ fontSize: size, letterSpacing: -1, lineHeight: 1 }}>
    {[0, 1, 2].map(i => <span key={i} style={{ color: i < n ? '#F59E0B' : '#D1D5DB' }}>★</span>)}
  </span>
);

// ── How To Play ──────────────────────────────────────────────────────────────
function HowToPlayModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 360, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>🌊 How to Play</div>
        {[
          ['🐢', 'Get the baby turtle to the ocean opening on the right edge'],
          ['🪵', 'Drag logs to slide them — only along their length'],
          ['🪨', 'Rocks never move'],
          ['⭐', 'Solve it in the fewest moves for 3 stars. Each slide counts as one move, however far it goes.'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}
        <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Got it!
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ShellSlideGame({ isNative = false }) {
  const navigate = useNavigate();
  const { progress, recordWin } = useGameProgress(GAME_ID, STORE_KEY);

  const [levels, setLevels] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [screen, setScreen] = useState('levels');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [puzzle, setPuzzle] = useState(null);
  const [offs, setOffs] = useState([]);
  const [history, setHistory] = useState([]);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [hintBoard, setHintBoard] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const dragRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    loadLevels()
      .then(data => (data?.length ? setLevels(data) : setLoadError(true)))
      .catch(() => setLoadError(true));
  }, []);

  const startFresh = (p) => {
    setOffs([...p.start]);
    setHistory([]);
    setMoves(0);
    setSolved(false);
    setHintBoard(null);
    setElapsed(0);
  };

  // ── Load puzzle
  useEffect(() => {
    if (screen !== 'game' || !levels) return;
    const p = decodeLevel(levels[currentLevel - 1]);
    setPuzzle(p);
    startFresh(p);
  }, [screen, currentLevel, levels]);

  // ── Timer
  useEffect(() => {
    clearInterval(timerRef.current);
    if (screen === 'game' && !solved) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, solved, currentLevel]);

  const finishMove = (prevOffs, nextOffs) => {
    const nextMoves = moves + 1;
    setHistory(h => [...h, prevOffs]);
    setMoves(nextMoves);
    setHintBoard(null);
    if (nextOffs[0] === GOAL_OFFSET) {
      setSolved(true);
      clearInterval(timerRef.current);
      recordWin(currentLevel, { score: starsFor(nextMoves, puzzle.optimal), time: elapsed });
    }
  };

  // ── Dragging a piece along its axis
  const onPieceDown = (e, k) => {
    if (solved || !puzzle) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [lo, hi] = slideRange(puzzle.pieces, puzzle.rocks, offs, k);
    const horiz = puzzle.pieces[k].horiz;
    dragRef.current = {
      k, lo, hi, startOff: offs[k], off: offs[k], startOffs: offs,
      startPos: horiz ? e.clientX : e.clientY,
      cs: e.currentTarget.parentElement.getBoundingClientRect().width / SIZE,
    };
  };

  const onPieceMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const horiz = puzzle.pieces[d.k].horiz;
    const delta = ((horiz ? e.clientX : e.clientY) - d.startPos) / d.cs;
    const off = Math.max(d.lo, Math.min(d.hi, Math.round(d.startOff + delta)));
    if (off === d.off) return;
    d.off = off;
    setOffs(Object.assign([...d.startOffs], { [d.k]: off }));
  };

  // One drag = one move, however far it went (and none if it ended where it started).
  const onPieceUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && d.off !== d.startOff) finishMove(d.startOffs, Object.assign([...d.startOffs], { [d.k]: d.off }));
  };

  const undo = () => {
    if (!history.length || solved) return;
    setOffs(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setMoves(m => m - 1);
    setHintBoard(null);
  };

  const reset = () => { if (puzzle) startFresh(puzzle); };

  // Hint: show a ghost of the next best slide.
  const hint = () => {
    if (!puzzle || solved) return;
    const res = solveFrom(puzzle, offs);
    if (res?.next) setHintBoard(res.next);
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    return (
      <GameLevelSelect
        icon="🌊" title="Shell Slide" subtitle="Clear a path to the ocean · Fewest moves for ⭐⭐⭐"
        accent="#0369A1" totalLevels={TOTAL_LEVELS} ranges={DIFF_RANGES} progress={progress}
        isNative={isNative}
        onBack={() => navigate('/puzzle')}
        onHowTo={() => setShowHowTo(true)}
        onPick={(lv) => { setCurrentLevel(lv); setScreen('game'); }}
        renderDone={(lv, r) => <Stars n={r.bestScore || 1} size={10} />}
      >
        {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      </GameLevelSelect>
    );
  }

  // ── GAME SCREEN ────────────────────────────────────────────────────────────
  if (loadError) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Couldn't load levels. Check your connection and try again.</div>;
  }
  if (!puzzle || !levels) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading level…</div>;
  }

  const availW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 70, 400);
  const CS = Math.floor(availW / SIZE);
  const GS = CS * SIZE;
  const PAD = Math.max(3, Math.round(CS * 0.07));
  const BORDER = 8;
  const diff = getDiff(currentLevel);
  const best = progress[currentLevel]?.bestScore || 0;
  const hintPiece = hintBoard ? hintBoard.findIndex((o, k) => o !== offs[k]) : -1;

  const pieceBox = (piece, off) => {
    const r = piece.horiz ? piece.line : off, c = piece.horiz ? off : piece.line;
    return {
      left: c * CS + PAD, top: r * CS + PAD,
      width: (piece.horiz ? piece.len * CS : CS) - PAD * 2,
      height: (piece.horiz ? CS : piece.len * CS) - PAD * 2,
    };
  };

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
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: '#0369A1', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: solved ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {solved ? '✅' : fmtTime(elapsed)}
        </div>
      </div>

      {/* Moves vs. par */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#555', fontWeight: 600, marginBottom: 12 }}>
        <span>Moves: <b style={{ color: '#111' }}>{moves}</b> <span style={{ color: '#999', fontWeight: 400 }}>· Par {puzzle.optimal}</span></span>
        <span>{best > 0 && <span style={{ fontSize: 11, color: '#999', marginRight: 6 }}>Best</span>}<Stars n={best} /></span>
      </div>

      {/* Beach */}
      <div style={{ position: 'relative', width: GS + BORDER * 2, margin: '0 auto' }}>
        {/* Ocean opening */}
        <div style={{
          position: 'absolute', left: GS + BORDER, top: BORDER + EXIT_ROW * CS, width: 40, height: CS,
          background: 'linear-gradient(90deg, #7DD3FC, #0284C7)', borderRadius: '0 10px 10px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: 16,
        }}>🌊</div>
        <div style={{
          position: 'relative', width: GS, height: GS, border: `${BORDER}px solid #C8A26B`, borderRadius: 10,
          borderRightColor: '#C8A26B', background: '#F5E6C8', touchAction: 'none',
          boxShadow: solved ? '0 0 26px #22C55E66' : '0 4px 16px rgba(0,0,0,0.15)', transition: 'box-shadow 0.3s',
        }}>
          {/* Gap in the wall at the exit */}
          <div style={{ position: 'absolute', left: GS, top: EXIT_ROW * CS, width: BORDER, height: CS, background: '#7DD3FC' }} />
          {/* Sand grid */}
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: (i % SIZE) * CS, top: Math.floor(i / SIZE) * CS, width: CS, height: CS, boxSizing: 'border-box', border: '1px solid rgba(160,120,60,0.12)' }} />
          ))}
          {/* Rocks */}
          {puzzle.rocks.map(i => (
            <div key={`rock-${i}`} style={{
              position: 'absolute', left: (i % SIZE) * CS + PAD * 1.5, top: Math.floor(i / SIZE) * CS + PAD * 1.5,
              width: CS - PAD * 3, height: CS - PAD * 3, borderRadius: '45% 55% 50% 40%',
              background: 'radial-gradient(circle at 35% 30%, #A8A29E, #57534E)', boxShadow: 'inset -2px -3px 4px rgba(0,0,0,0.3)',
            }} />
          ))}
          {/* Hint ghost */}
          {hintPiece >= 0 && (
            <div style={{ position: 'absolute', ...pieceBox(puzzle.pieces[hintPiece], hintBoard[hintPiece]), border: '3px dashed #F59E0B', borderRadius: 10, boxSizing: 'border-box', pointerEvents: 'none' }} />
          )}
          {/* Logs + turtle */}
          {puzzle.pieces.map((piece, k) => {
            const off = solved && piece.turtle ? SIZE + 1 : offs[k];
            const box = pieceBox(piece, off);
            const dragging = dragRef.current?.k === k;
            return (
              <div
                key={k}
                onPointerDown={(e) => onPieceDown(e, k)}
                onPointerMove={onPieceMove}
                onPointerUp={onPieceUp}
                onPointerCancel={onPieceUp}
                style={{
                  position: 'absolute', ...box, boxSizing: 'border-box', cursor: solved ? 'default' : 'grab',
                  borderRadius: piece.turtle ? CS * 0.4 : CS * 0.22,
                  background: piece.turtle
                    ? 'radial-gradient(circle at 40% 35%, #86EFAC, #15803D)'
                    : piece.horiz
                      ? 'repeating-linear-gradient(0deg, #A16207 0 4px, #92400E 4px 7px)'
                      : 'repeating-linear-gradient(90deg, #A16207 0 4px, #92400E 4px 7px)',
                  border: piece.turtle ? '2px solid #14532D' : '2px solid #78350F',
                  boxShadow: hintPiece === k ? '0 0 0 3px #F59E0B' : '0 2px 4px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: CS * 0.55,
                  transition: dragging ? 'none' : 'left 0.12s, top 0.12s',
                  ...(solved && piece.turtle && { transition: 'left 0.7s ease-in, opacity 0.7s ease-in', opacity: 0 }),
                  zIndex: piece.turtle ? 2 : 1,
                }}
              >
                {piece.turtle && <span style={{ transform: 'scaleX(-1)', pointerEvents: 'none' }}>🐢</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {solved && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Stars n={starsFor(moves, puzzle.optimal)} size={32} />
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            {moves <= puzzle.optimal ? 'Perfect — par!' : `${moves} moves · par is ${puzzle.optimal}`}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={undo} disabled={!history.length || solved} style={{ ...btn, opacity: !history.length || solved ? 0.4 : 1 }}>↶ Undo</button>
        <button onClick={reset} style={btn}>↺ Reset</button>
        <button onClick={hint} disabled={solved} style={{ ...btn, opacity: solved ? 0.4 : 1 }}>💡 Hint</button>
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
