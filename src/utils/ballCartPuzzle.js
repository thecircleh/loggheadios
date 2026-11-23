// Ball Carts engine (pure, no React).
//
// The equipment room is a grid of volleyball carts, each pointing one way. Tap a cart
// and it rolls straight out in that direction, but only if nothing is in its way. A
// rolled-out cart parks in the loading zone, which has a few spots. Volleyballs wait in
// a line; the ball at the front drops into a parked cart of its color (the one that
// parked first), and a cart rolls off once it holds CART_CAPACITY balls. If every spot
// is taken and none of the parked carts matches the next ball, the level is lost.
//
// Levels are built so they can always be won. Carts are placed so that some order lets
// every cart out; the ball line is then written by playing that order, keeping no more
// carts parked than the level allows. Every level is replayed before it's used.
import { mulberry32 } from './turtlePuzzle';

export const TOTAL_LEVELS = 1000;
export const CART_CAPACITY = 3;

// Volleyball colors. `seam` is the panel line color drawn on the ball.
export const COLORS = [
  { name: 'Blue',   fill: '#2563EB', seam: '#fff' },
  { name: 'Yellow', fill: '#EAB308', seam: '#fff' },
  { name: 'Red',    fill: '#DC2626', seam: '#fff' },
  { name: 'Green',  fill: '#16A34A', seam: '#fff' },
  { name: 'Purple', fill: '#7C3AED', seam: '#fff' },
  { name: 'Orange', fill: '#EA580C', seam: '#fff' },
  { name: 'Pink',   fill: '#DB2777', seam: '#fff' },
];

export const DIRS = {
  up:    { dx: 0,  dy: -1, arrow: '▲' },
  down:  { dx: 0,  dy: 1,  arrow: '▼' },
  left:  { dx: -1, dy: 0,  arrow: '◀' },
  right: { dx: 1,  dy: 0,  arrow: '▶' },
};
const DIR_NAMES = Object.keys(DIRS);

// spots: loading zone size. peak: most carts the built solution ever parks at once.
// planning (Hard and up): levels a "grab the matching cart" player can win are rebuilt.
export function getDiff(n) {
  if (n <= 150) return { cols: 4, rows: 5, carts: [6, 8],   colors: 3, spots: 5, peak: 3, planning: false, label: 'Easy' };
  if (n <= 350) return { cols: 5, rows: 6, carts: [9, 12],  colors: 4, spots: 5, peak: 4, planning: false, label: 'Medium' };
  if (n <= 600) return { cols: 6, rows: 7, carts: [13, 17], colors: 5, spots: 4, peak: 4, planning: true,  label: 'Hard' };
  if (n <= 850) return { cols: 6, rows: 8, carts: [18, 22], colors: 6, spots: 4, peak: 4, planning: true,  label: 'Expert' };
  return          { cols: 7, rows: 8, carts: [23, 28], colors: 7, spots: 4, peak: 4, planning: true,  label: 'Master' };
}

// ── Rules ────────────────────────────────────────────────────────────────────
// State: { out: bool[] (cart has left the room), parked: [{ cart, load }] in arrival
// order, next: index of the next ball in the line }.

export const initialState = (p) => ({ out: new Array(p.carts.length).fill(false), parked: [], next: 0 });

// Can cart i roll out? Every cell from it to the edge, in its direction, must be empty.
export function canRollOut(p, out, i) {
  if (out[i]) return false;
  const c = p.carts[i];
  const { dx, dy } = DIRS[c.dir];
  let x = c.x + dx, y = c.y + dy;
  while (x >= 0 && y >= 0 && x < p.cols && y < p.rows) {
    if (p.grid[y * p.cols + x] != null && !out[p.grid[y * p.cols + x]]) return false;
    x += dx; y += dy;
  }
  return true;
}

// The first cart in cart i's way, and how many cells away it is (1 = right next to it).
// null when the path is clear.
export function blockerOf(p, out, i) {
  const c = p.carts[i];
  const { dx, dy } = DIRS[c.dir];
  let x = c.x + dx, y = c.y + dy, cells = 1;
  while (x >= 0 && y >= 0 && x < p.cols && y < p.rows) {
    const j = p.grid[y * p.cols + x];
    if (j != null && !out[j]) return { cart: j, cells };
    x += dx; y += dy; cells++;
  }
  return null;
}

export const hasSpot = (p, s) => s.parked.length < p.spots;

// Roll cart i out into the loading zone (no balls loaded yet; call settle next).
export function rollOut(p, s, i) {
  const out = [...s.out];
  out[i] = true;
  return { out, parked: [...s.parked, { cart: i, load: 0 }], next: s.next };
}

// Load balls from the front of the line until the next ball has no parked cart of its
// color (or `maxSteps` balls have loaded). Full carts roll off. Returns the new state
// and each step (for animation).
export function settle(p, s, maxSteps = Infinity) {
  let parked = s.parked.map(b => ({ ...b }));
  let next = s.next;
  const steps = [];
  while (next < p.balls.length && steps.length < maxSteps) {
    const color = p.balls[next];
    const k = parked.findIndex(b => p.carts[b.cart].color === color && b.load < CART_CAPACITY);
    if (k < 0) break;
    parked[k].load++;
    next++;
    const full = parked[k].load >= CART_CAPACITY;
    steps.push({ cart: parked[k].cart, full });
    if (full) parked = parked.filter((_, j) => j !== k);
  }
  return { state: { out: s.out, parked, next }, steps };
}

// 'won' when every ball is loaded; 'stuck' when the zone is full and nothing matches.
export function statusOf(p, s) {
  if (s.next >= p.balls.length) return 'won';
  if (!hasSpot(p, s)) return 'stuck';
  return 'playing';
}

// Carts that can roll out right now (only when there's a spot to park in).
export function movableCarts(p, s) {
  if (!hasSpot(p, s)) return [];
  const list = [];
  for (let i = 0; i < p.carts.length; i++) if (canRollOut(p, s.out, i)) list.push(i);
  return list;
}

// ── Solver (for hints) ───────────────────────────────────────────────────────
// Depth-first search over (carts out, balls loaded): that pair fixes everything else,
// because each color fills one cart at a time. Tries carts that match the next ball
// first. Returns a winning cart, null if none exists, or undefined if the search ran
// out of budget.
export function findWinningMove(p, s, budget = 60000) {
  const dead = new Set();
  let nodes = 0;
  const key = (st) => `${st.out.map(o => (o ? 1 : 0)).join('')}:${st.next}`;
  const ordered = (st) => {
    const color = p.balls[st.next];
    const moves = movableCarts(p, st);
    return [...moves.filter(i => p.carts[i].color === color), ...moves.filter(i => p.carts[i].color !== color)];
  };
  const wins = (st) => {
    const status = statusOf(p, st);
    if (status === 'won') return true;
    if (status === 'stuck') return false;
    const k = key(st);
    if (dead.has(k)) return false;
    if (++nodes > budget) throw new Error('budget');
    for (const i of ordered(st)) {
      if (wins(settle(p, rollOut(p, st, i)).state)) return true;
    }
    dead.add(k);
    return false;
  };
  try {
    const start = settle(p, s).state;
    if (statusOf(p, start) !== 'playing') return null;
    for (const i of ordered(start)) {
      if (wins(settle(p, rollOut(p, start, i)).state)) return i;
    }
    return null;
  } catch {
    return undefined;
  }
}

// ── Level building ───────────────────────────────────────────────────────────
function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const between = ([lo, hi], rand) => lo + Math.floor(rand() * (hi - lo + 1));

// Place carts one at a time. Each new cart must have a clear path to the edge past the
// carts already placed, so letting them out newest-first always works.
function placeCarts(cols, rows, count, rand) {
  const grid = new Array(cols * rows).fill(null);
  const carts = [];
  const clear = (x, y, dir) => {
    const { dx, dy } = DIRS[dir];
    for (let cx = x + dx, cy = y + dy; cx >= 0 && cy >= 0 && cx < cols && cy < rows; cx += dx, cy += dy) {
      if (grid[cy * cols + cx] != null) return false;
    }
    return true;
  };
  for (let k = 0; k < count; k++) {
    const cells = shuffle([...Array(cols * rows).keys()].filter(c => grid[c] == null), rand);
    let placed = false;
    for (const cell of cells) {
      const x = cell % cols, y = Math.floor(cell / cols);
      const dir = shuffle([...DIR_NAMES], rand).find(d => clear(x, y, d));
      if (!dir) continue;
      grid[cell] = carts.length;
      carts.push({ x, y, dir });
      placed = true;
      break;
    }
    if (!placed) break;
  }
  return { grid, carts, exitOrder: carts.map((_, i) => i).reverse() };
}

// Write the ball line by playing the exit order: park up to a few carts, then send
// balls for the parked carts (in a mixed order) until one rolls off, and repeat.
function writeBalls(carts, exitOrder, peak, rand) {
  const balls = [];
  let parked = [];
  let r = 0;
  while (r < exitOrder.length || parked.length) {
    const want = 1 + Math.floor(rand() * peak);
    while (r < exitOrder.length && parked.length < want) parked.push({ cart: exitOrder[r++], load: 0 });
    let rolledOff = false;
    while (!rolledOff) {
      const pick = parked[Math.floor(rand() * parked.length)];
      const color = carts[pick.cart].color;
      balls.push(color);
      const k = parked.findIndex(b => carts[b.cart].color === color && b.load < CART_CAPACITY);
      parked[k].load++;
      if (parked[k].load >= CART_CAPACITY) {
        parked = parked.filter((_, j) => j !== k);
        rolledOff = true;
      }
    }
  }
  return balls;
}

// Play a level with a simple policy; true if it wins.
function playsThrough(p, choose) {
  let s = settle(p, initialState(p)).state;
  for (let guard = 0; guard < p.carts.length + 1; guard++) {
    const status = statusOf(p, s);
    if (status !== 'playing') return status === 'won';
    const i = choose(s);
    if (i == null) return false;
    s = settle(p, rollOut(p, s, i)).state;
  }
  return statusOf(p, s) === 'won';
}

function tryBuild(level, rand, { planning } = {}) {
  const diff = getDiff(level);
  const needsPlan = planning ?? diff.planning;
  const want = between(diff.carts, rand);
  const { grid, carts, exitOrder } = placeCarts(diff.cols, diff.rows, want, rand);
  if (carts.length < diff.carts[0]) return null;

  // Every color appears at least once; the rest are random.
  const colors = shuffle([...Array(COLORS.length).keys()], rand).slice(0, diff.colors);
  const paint = shuffle(carts.map((_, i) => (i < colors.length ? colors[i] : colors[Math.floor(rand() * colors.length)])), rand);
  carts.forEach((c, i) => { c.color = paint[i]; });

  const balls = writeBalls(carts, exitOrder, diff.peak, rand);
  const p = { level, cols: diff.cols, rows: diff.rows, spots: diff.spots, carts, grid, balls, solution: exitOrder };

  // The built order must win when played: roll out the next cart in that order only
  // when the next ball has nowhere to go.
  let r = 0;
  const planned = (s) => {
    while (r < exitOrder.length && s.out[exitOrder[r]]) r++;
    const i = exitOrder[r];
    return i != null && hasSpot(p, s) && canRollOut(p, s.out, i) ? i : null;
  };
  if (!playsThrough(p, planned)) return null;

  // Harder levels must need a plan: grabbing whichever free cart matches the next
  // ball (or else the first free cart) mustn't be enough.
  if (needsPlan) {
    const grabby = (s) => {
      const moves = movableCarts(p, s);
      const color = p.balls[s.next];
      return moves.find(i => p.carts[i].color === color) ?? moves[0] ?? null;
    };
    if (playsThrough(p, grabby)) return 'easy';
  }
  return p;
}

const cache = new Map();
const seedFor = (level, attempt) => mulberry32(level * 104729 + attempt * 7919 + 17);

export function generatePuzzle(level) {
  if (cache.has(level)) return cache.get(level);
  let puzzle = null;
  let fallback = null;
  for (let attempt = 0; attempt < 400 && !puzzle; attempt++) {
    const built = tryBuild(level, seedFor(level, attempt));
    if (built === 'easy') {
      // Winnable but doesn't need a plan. Kept in case no harder one turns up.
      if (!fallback) fallback = tryBuild(level, seedFor(level, attempt), { planning: false });
    } else if (built) {
      puzzle = built;
    }
  }
  const result = puzzle || fallback;
  cache.set(level, result);
  return result;
}
