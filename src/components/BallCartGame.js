import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GameLevelSelect, { makeRanges, tierColor } from './GameLevelSelect';
import { useGameProgress } from '../utils/useGameProgress';
import {
  COLORS, DIRS, CART_CAPACITY, TOTAL_LEVELS, getDiff, generatePuzzle,
  initialState, canRollOut, hasSpot, rollOut, settle, statusOf, findWinningMove, blockerOf,
} from '../utils/ballCartPuzzle';

const GAME_ID = 'ballcarts';
const STORE_KEY = 'loggerhead_ballcarts_progress';
const ACCENT = '#BE123C';
const MAX_UNDOS = 3;

// Animation timing (ms). With "reduce motion" on, everything is near-instant.
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ROLL_MS = REDUCED ? 1 : 560;      // cart rolls out of the room and into a spot
const BALL_MS = REDUCED ? 1 : 260;      // ball flies from the line into a cart
const LEAVE_MS = REDUCED ? 1 : 520;     // full cart rolls off
const LINE_SHIFT_MS = REDUCED ? 0 : 200; // balls in the line roll forward

// Line layout: the next ball is bigger; the rest follow at a fixed pitch.
const LINE_H = 44, FRONT = 34, BALL = 24, PITCH = 28, FRONT_GAP = 12;
const lineX = (k) => (k === 0 ? 6 : 6 + FRONT + FRONT_GAP + (k - 1) * PITCH);

const DIFF_RANGES = makeRanges([
  ['Easy', 1, 150], ['Medium', 151, 350], ['Hard', 351, 600],
  ['Expert', 601, 850], ['Master', 851, 1000],
]);

const SPIN_CSS = `
@keyframes bcSpin { to { transform: rotate(-360deg); } }
@keyframes bcSpinFast { to { transform: rotate(720deg); } }
@keyframes bcBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
`;

// A volleyball in one of the game colors. `spin`: 'roll' (in the line), 'fast' (in
// the air) or none. It fills its parent box.
function Ball({ color, spin = null, phase = 0 }) {
  const c = COLORS[color];
  const animation = REDUCED || !spin ? 'none'
    : spin === 'fast' ? 'bcSpinFast 0.45s linear infinite'
    : 'bcSpin 2.2s linear infinite';
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-label={`${c.name} ball`}
      style={{ display: 'block', animation, animationDelay: `${-phase}s`, transformOrigin: '50% 50%' }}>
      <circle cx="12" cy="12" r="11" fill={c.fill} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <g fill="none" stroke={c.seam} strokeWidth="1.4" strokeLinecap="round">
        <path d="M12 12 C 9 8.5, 8.5 4.5, 12 1" />
        <path d="M12 12 C 12.5 16.5, 8 18.5, 2.5 17.5" />
        <path d="M12 12 C 16.5 10, 20 12.5, 21.5 17.5" />
      </g>
      <circle cx="8" cy="7" r="2.2" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

// A ball cart: colored basket, its load (in the loading zone), and wheels.
function Cart({ color, size, load = null, arrow = null }) {
  const c = COLORS[color];
  const ball = Math.max(8, Math.floor(size * 0.26));
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <div style={{
        position: 'absolute', left: '6%', right: '6%', top: '8%', bottom: '20%',
        borderRadius: Math.round(size * 0.14), background: c.fill,
        border: '2px solid rgba(0,0,0,0.25)', boxSizing: 'border-box',
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 7px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        {arrow && <span style={{ color: '#fff', fontSize: Math.floor(size * 0.34), lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>{arrow}</span>}
        {load != null && (
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: CART_CAPACITY }, (_, k) => (
              <div key={k} style={{ width: ball, height: ball }}>
                {k < load
                  ? <Ball color={color} spin="roll" phase={k * 0.5} />
                  : <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* wheels */}
      {[22, 78].map(x => (
        <div key={x} style={{ position: 'absolute', left: `${x}%`, bottom: '6%', width: '14%', aspectRatio: '1', transform: 'translateX(-50%)', borderRadius: '50%', background: '#374151', border: '2px solid #9CA3AF', boxSizing: 'border-box' }} />
      ))}
    </div>
  );
}

// Something moving across the screen: a cart rolling, a ball flying. Drawn in fixed
// position over everything, animated once, then removed. It never changes the game;
// moves are committed by timers in the game itself.
function Ghost({ ghost, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || ghost.duration <= 1) { onDone(ghost.id); return undefined; }
    const anim = el.animate(ghost.frames, { duration: ghost.duration, easing: ghost.easing || 'ease-in-out', fill: 'forwards' });
    anim.onfinish = () => onDone(ghost.id);
    return () => anim.cancel();
  }, []); // runs once: each ghost animates a single time
  return (
    <div ref={ref} style={{ position: 'fixed', left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, zIndex: 3000, pointerEvents: 'none', transformOrigin: '0 0' }}>
      {ghost.content}
    </div>
  );
}

// Keep each parked cart in its own spot: carts still parked stay put, carts that left
// free their spot, new carts take the first free spot.
function placeInSpots(prev, parked, spots) {
  const ids = parked.map(b => b.cart);
  const next = Array.from({ length: spots }, (_, k) => (prev[k] != null && ids.includes(prev[k]) ? prev[k] : null));
  for (const id of ids) {
    if (next.includes(id)) continue;
    const free = next.indexOf(null);
    if (free >= 0) next[free] = id;
  }
  return next;
}

// ── How To Play ──────────────────────────────────────────────────────────────
function HowToPlayModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 360, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>🏐 How to Play</div>
        {[
          ['👆', 'Tap a ball cart to roll it out the way its arrow points. It only moves if nothing is in its way.'],
          ['🅿️', 'Carts you roll out park in the loading zone. There are only a few spots.'],
          ['🏐', 'The volleyball at the front of the line drops into a parked cart of the same color. A cart rolls off once it holds 3.'],
          ['⚠️', 'If every spot is full and none of the parked carts matches the next ball, the level is over.'],
          ['🧠', 'You can see the whole ball line. Roll carts out in the right order, and don\'t park a cart until its balls are close.'],
          ['↶', '3 undos per level. Hints are free.'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 18, flexShrink: 0, width: 22, textAlign: 'center' }}>{icon}</span>
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
export default function BallCartGame({ isNative = false }) {
  const navigate = useNavigate();
  const { progress, recordWin } = useGameProgress(GAME_ID, STORE_KEY);

  const [screen, setScreen] = useState('levels');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [puzzle, setPuzzle] = useState(null);
  const [state, setState] = useState(null);
  const [rolling, setRolling] = useState(null);   // cart rolling out to a spot
  const [loading, setLoading] = useState(false);  // balls are dropping into carts
  const [ballInAir, setBallInAir] = useState(false);
  const [ghosts, setGhosts] = useState([]);
  const [history, setHistory] = useState([]);
  const [undosLeft, setUndosLeft] = useState(MAX_UNDOS);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hintCart, setHintCart] = useState(null);
  const [hintMsg, setHintMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const timerRef = useRef(null);
  const moveRef = useRef(null);     // pending roll-out / ball-landing commit
  const ghostId = useRef(0);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  const cartRefs = useRef({});      // cart index → its button in the room
  const roomRef = useRef(null);
  const spotRefs = useRef([]);
  const frontBallRef = useRef(null);
  const spotsRef = useRef([]);      // spot index → parked cart index
  const winSaved = useRef(false);   // a win is saved once per attempt

  const busy = rolling != null || loading;

  const addGhost = (g) => setGhosts(list => [...list, { ...g, id: ++ghostId.current }]);
  const removeGhost = (id) => setGhosts(list => list.filter(g => g.id !== id));

  const startFresh = (p) => {
    clearTimeout(moveRef.current);
    setState(initialState(p));
    spotsRef.current = [];
    winSaved.current = false;
    setRolling(null);
    setLoading(false);
    setBallInAir(false);
    setGhosts([]);
    setHistory([]);
    setUndosLeft(MAX_UNDOS);
    setSolved(false);
    setFailed(false);
    setHintCart(null);
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

  useEffect(() => () => clearTimeout(moveRef.current), []);

  // Parked carts keep their spots (recomputed every render; stable between them).
  if (puzzle && state) spotsRef.current = placeInSpots(spotsRef.current, state.parked, puzzle.spots);

  // ── Balls fly one at a time into their cart; when nothing more loads, check for a
  // win or a jam.
  useEffect(() => {
    if (!loading || ballInAir || !puzzle || !state) return undefined;
    const { state: next, steps } = settle(puzzle, state, 1);
    if (!steps.length) {
      setLoading(false);
      const status = statusOf(puzzle, state);
      if (status === 'won') {
        setSolved(true);
        clearInterval(timerRef.current);
        if (!winSaved.current) {
          winSaved.current = true;
          recordWin(currentLevel, { time: elapsedRef.current });
        }
      } else if (status === 'stuck') {
        setFailed(true);
      }
      return undefined;
    }
    const { cart, full } = steps[0];
    const spot = spotsRef.current.indexOf(cart);
    const from = frontBallRef.current?.getBoundingClientRect();
    const to = spotRefs.current[spot]?.getBoundingClientRect();
    if (from && to) {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height * 0.4 - (from.top + from.height / 2);
      addGhost({
        x: from.left, y: from.top, w: from.width, h: from.height, duration: BALL_MS, easing: 'ease-in',
        content: <Ball color={puzzle.balls[state.next]} spin="fast" />,
        frames: [
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 28}px) scale(0.9)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.55)` },
        ],
      });
    }
    setBallInAir(true);
    moveRef.current = setTimeout(() => {
      // A full cart rolls off to the right.
      if (full && to) {
        addGhost({
          x: to.left, y: to.top, w: to.width, h: to.height, duration: LEAVE_MS, easing: 'ease-in',
          content: <Cart color={puzzle.carts[cart].color} size={to.width} load={CART_CAPACITY} />,
          frames: [
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: 'translate(8px, -4px) rotate(-3deg)', opacity: 1, offset: 0.2 },
            { transform: `translate(${window.innerWidth - to.left + 20}px, -10px) rotate(0deg)`, opacity: 0.2 },
          ],
        });
      }
      setState(next);
      setBallInAir(false);
    }, BALL_MS);
    return undefined;
  }, [loading, ballInAir, state, puzzle, currentLevel, recordWin]);

  const movable = useMemo(() => {
    if (!puzzle || !state) return new Set();
    return new Set(puzzle.carts.map((_, i) => i).filter(i => canRollOut(puzzle, state.out, i)));
  }, [puzzle, state]);

  // A blocked cart rolls toward the cart in its way, bumps it and bounces back.
  const bump = (i) => {
    const el = cartRefs.current[i];
    const block = blockerOf(puzzle, state.out, i);
    if (REDUCED || !el || typeof el.animate !== 'function' || !block) return;
    const { dx, dy } = DIRS[puzzle.carts[i].dir];
    const cell = el.getBoundingClientRect().width || 0;
    const reach = Math.max(6, (block.cells - 1) * cell + 5); // stop just touching it
    const at = (d) => `translate(${dx * d}px, ${dy * d}px)`;
    const duration = 260 + block.cells * 70;
    el.style.position = 'relative';
    el.style.zIndex = '5';
    const anim = el.animate([
      { transform: at(0), easing: 'ease-in' },
      { transform: at(reach), offset: 0.5, easing: 'ease-out' },
      { transform: at(-Math.min(8, reach * 0.25)), offset: 0.8, easing: 'ease-in-out' },
      { transform: at(0) },
    ], { duration });
    anim.onfinish = () => { el.style.zIndex = ''; };
    // The cart that was hit jolts in the same direction.
    const hit = cartRefs.current[block.cart];
    if (hit && typeof hit.animate === 'function') {
      hit.animate([
        { transform: at(0) },
        { transform: at(0), offset: 0.48 },
        { transform: at(5), offset: 0.58 },
        { transform: at(-2), offset: 0.75 },
        { transform: at(0) },
      ], { duration });
    }
  };

  const tap = (i) => {
    if (!puzzle || !state || busy || solved || failed) return;
    if (!movable.has(i)) { bump(i); return; }
    if (!hasSpot(puzzle, state)) { setHintMsg('The loading zone is full.'); return; }
    setHistory(h => [...h, state]);
    setHintCart(null);
    setHintMsg('');

    // Roll out of the room the way the arrow points, then into the first free spot.
    const spot = spotsRef.current.indexOf(null);
    const from = cartRefs.current[i]?.getBoundingClientRect();
    const room = roomRef.current?.getBoundingClientRect();
    const to = spotRefs.current[spot]?.getBoundingClientRect();
    if (from && room && to) {
      const { dx, dy } = DIRS[puzzle.carts[i].dir];
      const exitX = dx > 0 ? room.right + 4 : dx < 0 ? room.left - from.width - 4 : from.left;
      const exitY = dy > 0 ? room.bottom + 4 : dy < 0 ? room.top - from.height - 4 : from.top;
      const ex = exitX - from.left, ey = exitY - from.top;
      const tx = to.left - from.left, ty = to.top - from.top;
      const leg1 = Math.hypot(ex, ey), leg2 = Math.hypot(tx - ex, ty - ey);
      const split = Math.min(0.7, Math.max(0.3, leg1 / (leg1 + leg2 || 1)));
      const scale = to.width / from.width;
      addGhost({
        x: from.left, y: from.top, w: from.width, h: from.height, duration: ROLL_MS,
        content: <Cart color={puzzle.carts[i].color} size={from.width} arrow={DIRS[puzzle.carts[i].dir].arrow} />,
        frames: [
          { transform: 'translate(0, 0) scale(1)', easing: 'ease-in' },
          { transform: `translate(${ex}px, ${ey}px) scale(1)`, offset: split, easing: 'ease-out' },
          { transform: `translate(${tx}px, ${ty}px) scale(${scale})` },
        ],
      });
    }
    setRolling(i);
    moveRef.current = setTimeout(() => {
      setState(s => rollOut(puzzle, s, i));
      setRolling(null);
      setLoading(true);
    }, ROLL_MS);
  };

  const undo = () => {
    if (!history.length || undosLeft <= 0 || solved || busy) return;
    clearTimeout(moveRef.current);
    setGhosts([]);
    setState(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setUndosLeft(u => u - 1);
    setFailed(false);
    setHintCart(null);
    setHintMsg('');
  };

  const hint = () => {
    if (!puzzle || !state || solved || failed || busy) return;
    const move = findWinningMove(puzzle, state);
    if (move === undefined) {
      setHintCart(null);
      setHintMsg('Look for the cart that matches the next ball, and keep a spot free.');
    } else if (move == null) {
      setHintCart(null);
      setHintMsg(undosLeft > 0 && history.length ? 'No way to win from here. Try an undo.' : 'No way to win from here. Start the level over.');
    } else {
      setHintCart(move);
      setHintMsg('');
    }
  };

  const reset = () => { if (puzzle) startFresh(puzzle); };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    return (
      <GameLevelSelect
        icon="🏐" title="Ball Carts" subtitle="Roll out the carts · Load matching balls"
        accent={ACCENT} totalLevels={TOTAL_LEVELS} ranges={DIFF_RANGES} progress={progress}
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
  if (!puzzle || !state) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Building level…</div>;
  }

  const availW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 34, 440);
  const CS = Math.min(64, Math.floor(availW / puzzle.cols));
  const diff = getDiff(currentLevel);
  const cartsLeft = state.out.filter(o => !o).length + state.parked.length + (rolling != null ? 1 : 0);
  // The ball in the air has left the line already.
  const lineStart = state.next + (ballInAir ? 1 : 0);
  const shown = Math.max(4, Math.floor((availW - lineX(1) - 30) / PITCH) + 1);
  const line = puzzle.balls.slice(lineStart, lineStart + shown);
  const moreBalls = puzzle.balls.length - lineStart - line.length;
  const spotSize = Math.min(58, Math.floor((availW - (puzzle.spots - 1) * 8) / puzzle.spots));
  const parkedLoad = Object.fromEntries(state.parked.map(b => [b.cart, b.load]));
  const zoneFull = !hasSpot(puzzle, state);
  const btn = { padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#333' };

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),10px) 12px calc(90px + env(safe-area-inset-bottom))' : '10px 12px 20px', maxWidth: 520, margin: '0 auto', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <style>{SPIN_CSS}</style>
      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      {ghosts.map(g => <Ghost key={g.id} ghost={g} onDone={removeGhost} />)}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button onClick={() => setScreen('levels')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#555', padding: '2px 6px 2px 0' }}>←</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Level {currentLevel}</span>
          <span style={{ fontSize: 12, color: tierColor(diff.label), fontWeight: 700, marginLeft: 8 }}>{diff.label}</span>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>{cartsLeft} carts left</span>
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: ACCENT, border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: solved ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {solved ? `✅ ${fmtTime(elapsed)}` : fmtTime(elapsed)}
        </div>
      </div>

      {/* Ball line: balls roll forward as the front one is loaded */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', marginBottom: 4 }}>
        <span>NEXT ↓ BALL LINE</span>
        <span>{puzzle.balls.length - state.next} left</span>
      </div>
      <div style={{ position: 'relative', height: LINE_H, borderRadius: 12, background: 'linear-gradient(180deg, #F1F5F9, #E2E8F0)', overflow: 'hidden' }}>
        {line.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 13, color: '#16A34A', fontWeight: 700 }}>All balls loaded</div>
        )}
        {line.map((color, k) => {
          const idx = lineStart + k;
          const size = k === 0 ? FRONT : BALL;
          return (
            <div
              key={idx}
              ref={k === 0 ? frontBallRef : undefined}
              style={{
                position: 'absolute', left: lineX(k), top: (LINE_H - size) / 2, width: size, height: size,
                transition: `left ${LINE_SHIFT_MS}ms ease-out, top ${LINE_SHIFT_MS}ms ease-out, width ${LINE_SHIFT_MS}ms ease-out, height ${LINE_SHIFT_MS}ms ease-out`,
                filter: k === 0 ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' : 'none',
              }}
            >
              <Ball color={color} spin="roll" phase={(idx * 0.37) % 2.2} />
            </div>
          );
        })}
        {moreBalls > 0 && (
          <div style={{ position: 'absolute', right: 6, top: 0, bottom: 0, display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 12, color: '#6B7280', fontWeight: 800, background: 'linear-gradient(90deg, rgba(226,232,240,0), #E2E8F0 40%)' }}>+{moreBalls}</div>
        )}
      </div>

      {/* Loading zone */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 4px' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em' }}>LOADING ZONE</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: zoneFull ? '#DC2626' : '#6B7280' }}>{state.parked.length}/{puzzle.spots} spots</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 8, borderRadius: 12, background: '#E5E7EB' }}>
        {spotsRef.current.map((cartIdx, k) => {
          const danger = state.parked.length >= puzzle.spots - 1 && cartIdx == null;
          return (
            <div
              key={k}
              ref={el => { spotRefs.current[k] = el; }}
              style={{
                width: spotSize, height: spotSize, borderRadius: 10, boxSizing: 'border-box',
                border: cartIdx != null ? 'none' : `2px dashed ${danger ? '#F87171' : '#9CA3AF'}`,
                background: cartIdx != null ? 'transparent' : danger ? '#FEF2F2' : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {cartIdx != null && (
                <div style={{ animation: REDUCED || !loading ? 'none' : 'bcBob 0.5s ease-in-out infinite' }}>
                  <Cart color={puzzle.carts[cartIdx].color} size={spotSize} load={parkedLoad[cartIdx] ?? 0} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Equipment room */}
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', margin: '12px 0 4px' }}>EQUIPMENT ROOM</div>
      <div ref={roomRef} style={{ position: 'relative', margin: '0 auto', width: CS * puzzle.cols, padding: 6, borderRadius: 12, background: 'repeating-linear-gradient(90deg, #E9C99A 0 22px, #E2BF8C 22px 44px)', border: '3px solid #A16207' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${puzzle.cols}, ${CS}px)`, gridTemplateRows: `repeat(${puzzle.rows}, ${CS}px)` }}>
          {puzzle.grid.map((cartIdx, cell) => {
            if (cartIdx == null || state.out[cartIdx] || rolling === cartIdx) return <div key={cell} />;
            const cart = puzzle.carts[cartIdx];
            const free = movable.has(cartIdx);
            const isHint = hintCart === cartIdx;
            return (
              <button
                key={cell}
                ref={el => { cartRefs.current[cartIdx] = el; }}
                onClick={() => tap(cartIdx)}
                aria-label={`${COLORS[cart.color].name} cart facing ${cart.dir}${free ? '' : ', blocked'}`}
                style={{
                  padding: 0, border: 'none', background: 'none', borderRadius: 10,
                  outline: isHint ? '3px solid #F59E0B' : 'none', outlineOffset: -2,
                  cursor: free && !busy && !solved && !failed ? 'pointer' : 'default',
                  filter: free ? 'none' : 'brightness(0.78) saturate(0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Cart color={cart.color} size={CS - 4} arrow={DIRS[cart.dir].arrow} />
              </button>
            );
          })}
        </div>
        {solved && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, pointerEvents: 'none' }}>🎉</div>
        )}
        {failed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '18px 22px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
              <div style={{ fontSize: 34 }}>🛑</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>Loading zone jammed</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Every level can be won. Plan a new order.</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {undosLeft > 0 && history.length > 0 && (
                  <button onClick={undo} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>↶ Undo ({undosLeft})</button>
                )}
                <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>↺ Try Again</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {hintMsg && <div style={{ textAlign: 'center', fontSize: 13, color: '#B45309', marginTop: 8, fontWeight: 600 }}>{hintMsg}</div>}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={undo} disabled={!history.length || undosLeft <= 0 || solved || busy} style={{ ...btn, opacity: !history.length || undosLeft <= 0 || solved || busy ? 0.4 : 1 }}>↶ Undo ({undosLeft})</button>
        <button onClick={hint} disabled={solved || failed || busy} style={{ ...btn, opacity: solved || failed || busy ? 0.4 : 1 }}>💡 Hint</button>
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
