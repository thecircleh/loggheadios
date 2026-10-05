import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Seeded RNG ──────────────────────────────────────────────────────────────
function mulberry32(seed) {
  seed = seed | 0;
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Colors ──────────────────────────────────────────────────────────────────
const COLORS = [
  '#EF4444', '#3B82F6', '#22C55E', '#F59E0B',
  '#A855F7', '#F97316', '#EC4899', '#06B6D4',
  '#84CC16', '#6366F1',
];

// ── Difficulty ───────────────────────────────────────────────────────────────
function getDiff(n) {
  if (n <= 150)  return { size: 5, nc: 4,  label: 'Easy' };
  if (n <= 400)  return { size: 6, nc: 5,  label: 'Medium' };
  if (n <= 750)  return { size: 7, nc: 6,  label: 'Hard' };
  if (n <= 1500) return { size: 8, nc: 7,  label: 'Expert' };
  return { size: 9, nc: 8, label: 'Master' };
}

// ── Grid helpers ────────────────────────────────────────────────────────────
const rowOf = (i, s) => Math.floor(i / s);
const colOf = (i, s) => i % s;
const idxOf = (r, c, s) => r * s + c;

function nbrs(i, size) {
  const r = rowOf(i, size), c = colOf(i, size), out = [];
  if (r > 0)        out.push(idxOf(r - 1, c, size));
  if (r < size - 1) out.push(idxOf(r + 1, c, size));
  if (c > 0)        out.push(idxOf(r, c - 1, size));
  if (c < size - 1) out.push(idxOf(r, c + 1, size));
  return out;
}

const isAdj = (a, b, size) => nbrs(a, size).includes(b);

// ── Puzzle generation ────────────────────────────────────────────────────────
function generatePuzzle(levelNum) {
  const { size, nc } = getDiff(levelNum);
  const base = levelNum * 1000003 + 7;
  for (let att = 0; att < 400; att++) {
    const rand = mulberry32(base + att * 997);
    const p = tryGen(size, nc, rand);
    if (p) return p;
  }
  return snakeFallback(size, nc);
}

function tryGen(size, nc, rand) {
  const total = size * size;
  const sol = new Array(total).fill(-1);
  const paths = Array.from({ length: nc }, () => []);

  // Place start endpoints spread across grid
  const starts = [];
  for (let c = 0; c < nc; c++) {
    let best = -1, bestScore = -1;
    for (let a = 0; a < 60; a++) {
      const cell = Math.floor(rand() * total);
      if (starts.includes(cell)) continue;
      const r0 = rowOf(cell, size), c0 = colOf(cell, size);
      let score = starts.length === 0 ? 1 : 0;
      for (const s of starts) {
        score += Math.abs(r0 - rowOf(s, size)) + Math.abs(c0 - colOf(s, size));
      }
      if (score > bestScore) { bestScore = score; best = cell; }
    }
    if (best < 0) return null;
    starts.push(best);
    sol[best] = c;
    paths[c].push(best);
  }

  // Grow paths to fill all cells; prefer most-constrained heads
  for (let step = 0; step < total * 80 && sol.includes(-1); step++) {
    const ext = [];
    for (let c = 0; c < nc; c++) {
      const head = paths[c][paths[c].length - 1];
      const free = nbrs(head, size).filter(n => sol[n] === -1);
      if (free.length > 0) ext.push({ c, free, cnt: free.length });
    }
    if (ext.length === 0) break;
    ext.sort((a, b) => a.cnt - b.cnt);
    const pool = ext.slice(0, Math.max(1, Math.ceil(ext.length * 0.5)));
    const pick = pool[Math.floor(rand() * pool.length)];
    const next = pick.free[Math.floor(rand() * pick.free.length)];
    sol[next] = pick.c;
    paths[pick.c].push(next);
  }

  if (sol.includes(-1)) return null;
  for (const p of paths) if (p.length < 2) return null;

  return {
    size, nc,
    endpoints: paths.map((p, i) => ({ c: i, s: p[0], e: p[p.length - 1] })),
    solution: sol,
  };
}

function snakeFallback(size, nc) {
  const total = size * size;
  const chunk = Math.ceil(total / nc);
  const sol = Array.from({ length: total }, (_, i) => Math.min(Math.floor(i / chunk), nc - 1));
  const paths = Array.from({ length: nc }, () => []);
  sol.forEach((c, i) => paths[c].push(i));
  return {
    size, nc,
    endpoints: paths.map((p, i) => ({ c: i, s: p[0], e: p[p.length - 1] })),
    solution: sol,
  };
}

// ── How To Play ──────────────────────────────────────────────────────────────
// Verified 4×4 two-color demo (covers all 16 cells):
// Red:  0→1→2→3→7→11→15  (top row right, then right column down)
// Blue: 6→5→4→8→12→13→14→10→9  (winds through remaining cells)
const DEMO_PATHS = [
  { c: 0, cells: [0, 1, 2, 3, 7, 11, 15] },
  { c: 1, cells: [6, 5, 4, 8, 12, 13, 14, 10, 9] },
];
const DEMO_SEQ = [];
DEMO_PATHS.forEach(({ c, cells }) => cells.forEach(cell => DEMO_SEQ.push({ cell, c })));

function HowToPlayModal({ onClose }) {
  const [step, setStep] = useState(-1);
  const tiRef = useRef(null);

  useEffect(() => {
    let s = 0, alive = true;
    function go(delay) {
      tiRef.current = setTimeout(() => {
        if (!alive) return;
        if (s >= DEMO_SEQ.length) {
          tiRef.current = setTimeout(() => { if (!alive) return; s = 0; setStep(-1); go(700); }, 1400);
          return;
        }
        const boundary = s > 0 && DEMO_SEQ[s].c !== DEMO_SEQ[s - 1].c;
        setStep(s++);
        go(boundary ? 550 : 160);
      }, delay);
    }
    go(900);
    return () => { alive = false; clearTimeout(tiRef.current); };
  }, []);

  const CS = 54, SZ = 4;
  const TUBE = Math.round(CS * 0.42);
  const DOT  = Math.round(CS * 0.54);
  const FILL = Math.round(CS * 0.38);
  const GS   = CS * SZ;

  const shown = {};
  DEMO_SEQ.slice(0, Math.max(0, step + 1)).forEach(({ cell, c }) => { shown[cell] = c; });

  const eps = new Map();
  DEMO_PATHS.forEach(({ c, cells }) => { eps.set(cells[0], c); eps.set(cells[cells.length - 1], c); });

  const stepOf = new Map();
  DEMO_SEQ.forEach(({ cell }, i) => stepOf.set(cell, i));

  const segs = [];
  DEMO_PATHS.forEach(({ c, cells }) => {
    for (let i = 0; i < cells.length - 1; i++) {
      if ((stepOf.get(cells[i + 1]) ?? 99) <= step) segs.push({ from: cells[i], to: cells[i + 1], c });
    }
  });

  const done = step >= DEMO_SEQ.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 340, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 14 }}>🧩 How to Play</div>

        {[
          ['🔵', 'Connect matching colored dots with a path'],
          ['🚫', 'Paths cannot cross or share cells'],
          ['🟩', 'Fill every cell in the grid to win'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.06em', marginBottom: 8 }}>LIVE DEMO</div>
          <div style={{ position: 'relative', width: GS, height: GS, margin: '0 auto', background: '#16213E', borderRadius: 8, boxShadow: done ? '0 0 18px #22C55E55' : 'none', transition: 'box-shadow 0.4s' }}>
            {Array.from({ length: SZ + 1 }, (_, i) => (
              <React.Fragment key={i}>
                <div style={{ position: 'absolute', left: i * CS, top: 0, width: 1, height: GS, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ position: 'absolute', top: i * CS, left: 0, height: 1, width: GS, background: 'rgba(255,255,255,0.08)' }} />
              </React.Fragment>
            ))}

            {segs.map(({ from, to, c }, i) => {
              const fr = Math.floor(from / SZ), fc = from % SZ;
              const tr = Math.floor(to / SZ), tc = to % SZ;
              if (fr === tr) return <div key={i} style={{ position: 'absolute', left: Math.min(fc, tc) * CS + CS / 2, top: fr * CS + (CS - TUBE) / 2, width: CS, height: TUBE, background: COLORS[c] }} />;
              return <div key={i} style={{ position: 'absolute', left: fc * CS + (CS - TUBE) / 2, top: Math.min(fr, tr) * CS + CS / 2, width: TUBE, height: CS, background: COLORS[c] }} />;
            })}

            {Object.entries(shown).map(([cell, c]) => {
              if (eps.has(+cell)) return null;
              const r = Math.floor(+cell / SZ), col = +cell % SZ;
              return <div key={cell} style={{ position: 'absolute', left: col * CS + (CS - FILL) / 2, top: r * CS + (CS - FILL) / 2, width: FILL, height: FILL, borderRadius: '50%', background: COLORS[c] }} />;
            })}

            {Array.from(eps.entries()).map(([cell, c]) => {
              const r = Math.floor(cell / SZ), col = cell % SZ;
              return <div key={cell} style={{ position: 'absolute', left: col * CS + (CS - DOT) / 2, top: r * CS + (CS - DOT) / 2, width: DOT, height: DOT, borderRadius: '50%', background: COLORS[c], border: '2px solid rgba(255,255,255,0.28)', boxShadow: done ? `0 0 10px ${COLORS[c]}` : 'none', zIndex: 2, transition: 'box-shadow 0.3s' }} />;
            })}

            {done && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, pointerEvents: 'none' }}>🎉</div>}
          </div>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Got it!
        </button>
      </div>
    </div>
  );
}

// ── Persistence ──────────────────────────────────────────────────────────────
const STORE_KEY = 'loggerhead_flow_progress';
const loadProg = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } };
const saveProg = (d) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {} };

// ── Main component ────────────────────────────────────────────────────────────
export default function FlowPuzzleGame({ isMobile = false, isNative = false }) {
  const navigate = useNavigate();

  const [screen, setScreen] = useState('levels');
  const [levelPage, setLevelPage] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);

  const [puzzle, setPuzzle] = useState(null);
  const [userPaths, setUserPaths] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [solved, setSolved] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(loadProg);
  const [showHowTo, setShowHowTo] = useState(false);

  // Refs to avoid stale closures in pointer handlers
  const drawingRef    = useRef(null);
  const userPathsRef  = useRef([]);
  const puzzleRef     = useRef(null);
  const gridRef       = useRef(null);
  const timerRef      = useRef(null);

  useEffect(() => { drawingRef.current   = drawing;   }, [drawing]);
  useEffect(() => { userPathsRef.current = userPaths; }, [userPaths]);
  useEffect(() => { puzzleRef.current    = puzzle;    }, [puzzle]);

  // ── Load puzzle
  useEffect(() => {
    if (screen !== 'game') return;
    const p = generatePuzzle(currentLevel);
    setPuzzle(p);
    setUserPaths(Array.from({ length: p.nc }, () => []));
    setDrawing(null);
    setSolved(false);
    setShowSolution(false);
    setElapsed(0);
    drawingRef.current   = null;
    userPathsRef.current = Array.from({ length: p.nc }, () => []);
    puzzleRef.current    = p;
  }, [screen, currentLevel]);

  // ── Timer
  useEffect(() => {
    clearInterval(timerRef.current);
    if (screen === 'game' && !solved) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, solved, currentLevel]);

  // ── Derived maps
  const cellColorMap = useMemo(() => {
    if (!puzzle) return {};
    const map = {};
    userPaths.forEach((path, c) => (path || []).forEach(i => { map[i] = c; }));
    if (drawing) drawing.path.forEach(i => { map[i] = drawing.c; });
    return map;
  }, [puzzle, userPaths, drawing]);

  const completeFlags = useMemo(() => {
    if (!puzzle) return [];
    return puzzle.endpoints.map(({ c, s, e }) => {
      const path = userPaths[c] || [];
      if (path.length < 2) return false;
      const a = path[0], b = path[path.length - 1];
      return (a === s && b === e) || (a === e && b === s);
    });
  }, [puzzle, userPaths]);

  const coverage = useMemo(() => {
    if (!puzzle) return 0;
    const filled = new Set();
    userPaths.forEach(p => (p || []).forEach(i => filled.add(i)));
    if (drawing) drawing.path.forEach(i => filled.add(i));
    return filled.size / (puzzle.size * puzzle.size);
  }, [puzzle, userPaths, drawing]);

  // ── Win check
  useEffect(() => {
    if (!puzzle || solved || !completeFlags.every(Boolean)) return;
    const filled = new Set();
    userPaths.forEach(p => (p || []).forEach(i => filled.add(i)));
    if (filled.size !== puzzle.size * puzzle.size) return;
    setSolved(true);
    clearInterval(timerRef.current);
    const newProg = { ...progress, [currentLevel]: { time: elapsed } };
    setProgress(newProg);
    saveProg(newProg);
  }, [userPaths, completeFlags, puzzle, solved, elapsed, currentLevel, progress]);

  // ── Pointer handlers
  const getCellAt = (x, y) => {
    const grid = gridRef.current;
    const p = puzzleRef.current;
    if (!grid || !p) return -1;
    const rect = grid.getBoundingClientRect();
    const gx = x - rect.left;
    const gy = y - rect.top;
    const availW = Math.min(window.innerWidth - 28, 480);
    const cs = Math.floor(availW / p.size);
    const gs = cs * p.size;
    if (gx < 0 || gy < 0 || gx >= gs || gy >= gs) return -1;
    const c = Math.floor(gx / cs);
    const r = Math.floor(gy / cs);
    if (c >= p.size || r >= p.size) return -1;
    return r * p.size + c;
  };

  const epColorOf = useCallback((cell) => {
    const p = puzzleRef.current;
    if (!p) return null;
    for (const ep of p.endpoints) {
      if (ep.s === cell || ep.e === cell) return ep.c;
    }
    return null;
  }, []);

  const startDraw = useCallback((cell) => {
    const p = puzzleRef.current;
    if (!p) return;
    const ec = epColorOf(cell);
    if (ec === null) return;
    const np = [...userPathsRef.current];
    np[ec] = [];
    setUserPaths(np);
    userPathsRef.current = np;
    const d = { c: ec, path: [cell] };
    setDrawing(d);
    drawingRef.current = d;
  }, [epColorOf]);

  const extendDraw = useCallback((cell) => {
    const d = drawingRef.current;
    if (!d) return;
    const p = puzzleRef.current;
    if (!p) return;
    const { c: ci, path } = d;

    // Backtrack if revisiting own path
    const pos = path.indexOf(cell);
    if (pos >= 0) {
      const nd = { c: ci, path: path.slice(0, pos + 1) };
      setDrawing(nd);
      drawingRef.current = nd;
      return;
    }

    // Must be adjacent to head
    if (!isAdj(path[path.length - 1], cell, p.size)) return;

    // Block moving onto another color's endpoint
    const ec = epColorOf(cell);
    if (ec !== null && ec !== ci) return;

    // Clear any other color whose path passes through this cell
    const cp = [...userPathsRef.current];
    let changed = false;
    for (let oc = 0; oc < p.nc; oc++) {
      if (oc === ci) continue;
      if ((cp[oc] || []).includes(cell)) { cp[oc] = []; changed = true; }
    }
    if (changed) { setUserPaths(cp); userPathsRef.current = cp; }

    const nd = { c: ci, path: [...path, cell] };
    setDrawing(nd);
    drawingRef.current = nd;
  }, [epColorOf]);

  const commitDraw = useCallback(() => {
    const d = drawingRef.current;
    if (!d) return;
    const np = [...userPathsRef.current];
    np[d.c] = d.path;
    setUserPaths(np);
    userPathsRef.current = np;
    setDrawing(null);
    drawingRef.current = null;
  }, []);

  const handlePtrDown = useCallback((e) => {
    if (solved || showSolution) return;
    e.preventDefault();
    const cell = getCellAt(e.clientX, e.clientY);
    if (cell < 0) return;
    startDraw(cell);
    gridRef.current?.setPointerCapture?.(e.pointerId);
  }, [solved, showSolution, startDraw]);

  const handlePtrMove = useCallback((e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const cell = getCellAt(e.clientX, e.clientY);
    if (cell >= 0) extendDraw(cell);
  }, [extendDraw]);

  const handlePtrUp = useCallback(() => { commitDraw(); }, [commitDraw]);

  const resetPuzzle = () => {
    if (!puzzle) return;
    const empty = Array.from({ length: puzzle.nc }, () => []);
    setUserPaths(empty);
    userPathsRef.current = empty;
    setDrawing(null);
    drawingRef.current = null;
    setSolved(false);
    setElapsed(0);
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    const PER_PAGE = 100;
    const startLv = levelPage * PER_PAGE + 1;
    const TOTAL_LEVELS = 2000;
    const totalPages = Math.ceil(TOTAL_LEVELS / PER_PAGE);
    const DIFF_RANGES = [
      { label: 'Easy',   lo: 1,    hi: 150,  color: '#22C55E', bg: '#DCFCE7' },
      { label: 'Medium', lo: 151,  hi: 400,  color: '#3B82F6', bg: '#DBEAFE' },
      { label: 'Hard',   lo: 401,  hi: 750,  color: '#F59E0B', bg: '#FEF3C7' },
      { label: 'Expert', lo: 751,  hi: 1500, color: '#EF4444', bg: '#FEE2E2' },
      { label: 'Master', lo: 1501, hi: 2000, color: '#A855F7', bg: '#F3E8FF' },
    ];

    return (
      <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),16px) 16px 20px' : '16px', maxWidth: 560, margin: '0 auto' }}>
        {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#555', padding: '4px 8px 4px 0' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>🔵 Flow Puzzles</div>
            <div style={{ fontSize: 12, color: '#888' }}>Connect the dots · Fill the grid</div>
          </div>
          <button onClick={() => setShowHowTo(true)} style={{ background: '#3B82F6', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        </div>

        {/* Tier stats */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {DIFF_RANGES.map(({ label, lo, hi, color, bg }) => {
            const done = Object.keys(progress).filter(l => +l >= lo && +l <= hi).length;
            return (
              <div
                key={label}
                onClick={() => { const pg = Math.floor((lo - 1) / PER_PAGE); setLevelPage(pg); }}
                style={{ flex: '1 0 80px', padding: '8px 10px', borderRadius: 8, background: bg, textAlign: 'center', cursor: 'pointer', border: `1px solid ${color}44` }}
              >
                <div style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color }}>{done}<span style={{ fontSize: 10, color: '#999', fontWeight: 400 }}>/{hi - lo + 1}</span></div>
              </div>
            );
          })}
        </div>

        {/* Page tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
          {Array.from({ length: totalPages }, (_, i) => {
            const diff = getDiff(i * PER_PAGE + 1);
            const diffColor = { Easy: '#22C55E', Medium: '#3B82F6', Hard: '#F59E0B', Expert: '#EF4444', Master: '#A855F7' }[diff.label];
            return (
              <button key={i} onClick={() => setLevelPage(i)} style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: levelPage === i ? '#111' : '#f0f0f0',
                color: levelPage === i ? '#fff' : diffColor,
              }}>
                {i * 100 + 1}–{i * 100 + 100}
              </button>
            );
          })}
        </div>

        {/* Level grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
          {Array.from({ length: PER_PAGE }, (_, i) => {
            const lv = startLv + i;
            const done = !!progress[lv];
            const diff = getDiff(lv);
            const dc = { Easy: '#22C55E', Medium: '#3B82F6', Hard: '#F59E0B', Expert: '#EF4444', Master: '#A855F7' }[diff.label];
            return (
              <button key={lv} onClick={() => { setCurrentLevel(lv); setScreen('game'); }} style={{
                aspectRatio: '1', borderRadius: 5, border: done ? `2px solid ${dc}` : '1px solid #e0e0e0',
                background: done ? '#e8f5e9' : '#fafafa', cursor: 'pointer',
                fontSize: 9, fontWeight: done ? 700 : 400, color: done ? '#166534' : '#777',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done ? '✓' : lv}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── GAME SCREEN ────────────────────────────────────────────────────────────
  if (!puzzle) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Generating puzzle…</div>;
  }

  const { size, nc, endpoints, solution } = puzzle;
  const availW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 28, 480);
  const CS = Math.floor(availW / size); // cell size in px
  const GS = CS * size;                 // grid size in px
  const TUBE = Math.round(CS * 0.42);   // tube thickness
  const DOT  = Math.round(CS * 0.52);   // endpoint dot size
  const FILL = Math.round(CS * 0.38);   // path fill dot size

  const endpointSet = new Map();
  endpoints.forEach(ep => { endpointSet.set(ep.s, ep.c); endpointSet.set(ep.e, ep.c); });

  // Merge drawing into display paths
  const displayPaths = userPaths.map((p, c) => (drawing && drawing.c === c) ? drawing.path : p || []);
  if (drawing) displayPaths[drawing.c] = drawing.path;

  // Build segments list for rendering tubes
  const segments = [];
  for (let c = 0; c < nc; c++) {
    const path = displayPaths[c];
    for (let i = 0; i < path.length - 1; i++) {
      segments.push({ from: path[i], to: path[i + 1], c });
    }
  }

  const diff = getDiff(currentLevel);
  const diffColor = { Easy: '#22C55E', Medium: '#3B82F6', Hard: '#F59E0B', Expert: '#EF4444', Master: '#A855F7' }[diff.label];

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),10px) 12px 20px' : '10px 12px 20px', maxWidth: 520, margin: '0 auto', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button onClick={() => setScreen('levels')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#555', padding: '2px 6px 2px 0' }}>←</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Level {currentLevel}</span>
          <span style={{ fontSize: 12, color: diffColor, fontWeight: 700, marginLeft: 8 }}>{diff.label}</span>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>{size}×{size} · {nc} colors</span>
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: '#3B82F6', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: solved ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {solved ? '✅' : fmtTime(elapsed)}
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ height: 3, borderRadius: 2, background: '#eee', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${coverage * 100}%`, background: '#22C55E', borderRadius: 2, transition: 'width 0.15s' }} />
      </div>

      {/* Color completion pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {endpoints.map(({ c }) => (
          <div key={c} style={{
            width: 12, height: 12, borderRadius: '50%',
            background: COLORS[c],
            opacity: completeFlags[c] ? 1 : 0.25,
            boxShadow: completeFlags[c] ? `0 0 6px ${COLORS[c]}` : 'none',
            transition: 'all 0.2s',
          }} />
        ))}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        onPointerDown={handlePtrDown}
        onPointerMove={handlePtrMove}
        onPointerUp={handlePtrUp}
        onPointerCancel={handlePtrUp}
        style={{
          position: 'relative', width: GS, height: GS, margin: '0 auto',
          background: '#16213E',
          borderRadius: 10,
          boxShadow: solved ? '0 0 30px #22C55E55, 0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.4)',
          touchAction: 'none', cursor: 'crosshair',
          transition: 'box-shadow 0.3s',
        }}
      >
        {/* Grid lines */}
        {Array.from({ length: size + 1 }, (_, i) => (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: i * CS, top: 0, width: 1, height: GS, background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: i * CS, left: 0, height: 1, width: GS, background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
          </React.Fragment>
        ))}

        {/* Solution overlay (shown cells) */}
        {showSolution && solution.map((c, i) => {
          const r = rowOf(i, size), cl = colOf(i, size);
          return (
            <div key={`sol-${i}`} style={{
              position: 'absolute',
              left: cl * CS + (CS - FILL) / 2, top: r * CS + (CS - FILL) / 2,
              width: FILL, height: FILL, borderRadius: '50%',
              background: COLORS[c], opacity: 0.4, pointerEvents: 'none',
            }} />
          );
        })}

        {/* Path tube segments */}
        {!showSolution && segments.map(({ from, to, c: ci }, i) => {
          const fr = rowOf(from, size), fc = colOf(from, size);
          const tr = rowOf(to, size), tc = colOf(to, size);
          const isH = fr === tr;
          const color = COLORS[ci];
          const dimmed = !completeFlags[ci] && drawing && drawing.c !== ci;

          if (isH) {
            const left = Math.min(fc, tc) * CS + CS / 2;
            return (
              <div key={i} style={{
                position: 'absolute',
                left, top: fr * CS + (CS - TUBE) / 2,
                width: CS, height: TUBE,
                background: color, opacity: dimmed ? 0.5 : 1,
                pointerEvents: 'none',
              }} />
            );
          } else {
            const top = Math.min(fr, tr) * CS + CS / 2;
            return (
              <div key={i} style={{
                position: 'absolute',
                left: fc * CS + (CS - TUBE) / 2, top,
                width: TUBE, height: CS,
                background: color, opacity: dimmed ? 0.5 : 1,
                pointerEvents: 'none',
              }} />
            );
          }
        })}

        {/* Path fill dots (at each non-endpoint path cell) */}
        {!showSolution && Array.from({ length: size * size }, (_, i) => {
          const c = cellColorMap[i];
          if (c === undefined || c === null || c < 0) return null;
          if (endpointSet.has(i)) return null; // endpoints rendered separately
          const r = rowOf(i, size), cl = colOf(i, size);
          return (
            <div key={`dot-${i}`} style={{
              position: 'absolute',
              left: cl * CS + (CS - FILL) / 2, top: r * CS + (CS - FILL) / 2,
              width: FILL, height: FILL, borderRadius: '50%',
              background: COLORS[c],
              pointerEvents: 'none',
            }} />
          );
        })}

        {/* Endpoint circles */}
        {endpoints.map(({ c: ci, s, e }) => (
          [s, e].map(cell => {
            const r = rowOf(cell, size), cl = colOf(cell, size);
            const isConn = completeFlags[ci];
            return (
              <div key={`ep-${cell}`} style={{
                position: 'absolute',
                left: cl * CS + (CS - DOT) / 2, top: r * CS + (CS - DOT) / 2,
                width: DOT, height: DOT, borderRadius: '50%',
                background: COLORS[ci],
                border: `2px solid ${isConn ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                boxShadow: isConn ? `0 0 10px ${COLORS[ci]}` : 'none',
                zIndex: 2,
                pointerEvents: 'none',
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }} />
            );
          })
        ))}

        {/* Win overlay */}
        {solved && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            background: 'rgba(34,197,94,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', fontSize: 52,
          }}>
            🎉
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={resetPuzzle} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#333' }}>
          ↺ Reset
        </button>
        <button onClick={() => setShowSolution(s => !s)} style={{
          padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd',
          background: showSolution ? '#FEF9C3' : '#fff',
          fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#333',
        }}>
          💡 {showSolution ? 'Hide' : 'Hint'}
        </button>
        {solved ? (
          <button onClick={() => setCurrentLevel(l => l + 1)} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: '#22C55E', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700,
          }}>
            Next Level →
          </button>
        ) : (
          <>
            {currentLevel > 1 && (
              <button onClick={() => setCurrentLevel(l => l - 1)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#555' }}>
                ← Prev
              </button>
            )}
            <button onClick={() => setCurrentLevel(l => l + 1)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#555' }}>
              Skip →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
