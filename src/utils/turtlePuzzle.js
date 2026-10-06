// Turtle Hunt puzzle engine (pure, no React) — a Star Battle / "Queens" variant.
// Rules: one turtle per row, column and region; turtles never touch (incl. diagonally).
// Wrinkle — nests: a nest cell shows how many turtles sit in its 8 neighbors and can't
// hold a turtle itself. The generator adds nests until the solution is unique.

export function mulberry32(seed) {
  seed = seed | 0;
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TOTAL_LEVELS = 1000;

export function getDiff(n) {
  if (n <= 100) return { size: 5,  label: 'Easy' };
  if (n <= 250) return { size: 6,  label: 'Medium' };
  if (n <= 450) return { size: 7,  label: 'Hard' };
  if (n <= 700) return { size: 8,  label: 'Expert' };
  if (n <= 900) return { size: 9,  label: 'Master' };
  return          { size: 10, label: 'Max' };
}

// 8-neighborhood
export function around(i, size) {
  const r = Math.floor(i / size), c = i % size, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
    }
  }
  return out;
}

function orth(i, size) {
  const r = Math.floor(i / size), c = i % size, out = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Column per row with no two turtles in adjacent rows within one column of each other.
function randomPlacement(size, rand) {
  const cols = [];
  const used = new Array(size).fill(false);
  const go = (r) => {
    if (r === size) return true;
    for (const c of shuffle([...Array(size).keys()], rand)) {
      if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]) < 2)) continue;
      used[c] = true; cols[r] = c;
      if (go(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  return go(0) ? cols : null;
}

// Grow one connected region from each turtle until the grid is covered.
function growRegions(size, turtles, rand) {
  const regions = new Array(size * size).fill(-1);
  turtles.forEach((cell, k) => { regions[cell] = k; });
  let left = size * size - size;
  while (left > 0) {
    const frontier = [];
    for (let i = 0; i < regions.length; i++) {
      if (regions[i] !== -1) continue;
      for (const n of orth(i, size)) if (regions[n] !== -1) frontier.push([i, regions[n]]);
    }
    const [cell, k] = frontier[Math.floor(rand() * frontier.length)];
    regions[cell] = k;
    left--;
  }
  return regions;
}

// Returns up to `limit` solutions (arrays of turtle cells, one per row).
export function solve({ size, regions, clues }, limit = 2) {
  const clueAt = new Map(clues.map(({ cell, n }) => [cell, n]));
  const count = new Map(clues.map(({ cell }) => [cell, 0]));
  const cluesInRow = Array.from({ length: size }, () => []);
  clues.forEach(({ cell, n }) => cluesInRow[Math.floor(cell / size)].push({ cell, n }));
  const colUsed = new Array(size).fill(false);
  const regUsed = new Array(size).fill(false);
  const cols = [];
  const out = [];

  const rowDone = (r) => r < 0 || cluesInRow[r].every(({ cell, n }) => count.get(cell) === n);

  const go = (r) => {
    if (r === size) {
      if (rowDone(size - 1)) out.push(cols.map((c, rr) => rr * size + c));
      return;
    }
    for (let c = 0; c < size; c++) {
      const cell = r * size + c;
      if (colUsed[c] || regUsed[regions[cell]] || clueAt.has(cell)) continue;
      if (r > 0 && Math.abs(c - cols[r - 1]) < 2) continue;
      const touched = around(cell, size).filter(n => clueAt.has(n));
      let ok = true;
      for (const n of touched) {
        count.set(n, count.get(n) + 1);
        if (count.get(n) > clueAt.get(n)) ok = false;
      }
      // Clues in the previous row are now fully determined.
      if (ok && rowDone(r - 1)) {
        colUsed[c] = regUsed[regions[cell]] = true; cols[r] = c;
        go(r + 1);
        colUsed[c] = regUsed[regions[cell]] = false;
      }
      for (const n of touched) count.set(n, count.get(n) - 1);
      if (out.length >= limit) return;
    }
  };
  go(0);
  return out;
}

const nestCount = (cell, size, turtleSet) => around(cell, size).filter(n => turtleSet.has(n)).length;

function tryGen(size, rand, maxClues) {
  const cols = randomPlacement(size, rand);
  if (!cols) return null;
  const solution = cols.map((c, r) => r * size + c);
  const solSet = new Set(solution);
  const regions = growRegions(size, solution, rand);
  const clues = [];
  const puz = { size, regions, clues };

  for (;;) {
    const sols = solve(puz, 2);
    const alt = sols.find(s => s.some((cell, r) => cell !== solution[r]));
    if (!alt) break;
    if (clues.length >= maxClues) return null;
    // Add a nest that the real solution satisfies but the alternative doesn't.
    const altSet = new Set(alt);
    const taken = new Set(clues.map(c => c.cell));
    const cands = [];
    for (let i = 0; i < size * size; i++) {
      if (solSet.has(i) || taken.has(i)) continue;
      if (altSet.has(i) || nestCount(i, size, solSet) !== nestCount(i, size, altSet)) cands.push(i);
    }
    if (!cands.length) return null;
    const cell = cands[Math.floor(rand() * cands.length)];
    clues.push({ cell, n: nestCount(cell, size, solSet) });
  }

  // Every level gets at least one nest so the wrinkle is always in play.
  if (!clues.length) {
    const free = [...Array(size * size).keys()].filter(i => !solSet.has(i));
    const cell = free[Math.floor(rand() * free.length)];
    clues.push({ cell, n: nestCount(cell, size, solSet) });
  }
  return { size, regions, clues, solution };
}

export function generatePuzzle(levelNum) {
  const { size } = getDiff(levelNum);
  const base = levelNum * 2654435 + 11;
  // Allow more nests on the occasional stubborn seed rather than failing.
  for (let att = 0; att < 300; att++) {
    const maxClues = Math.ceil(size / 2) + 1 + Math.floor(att / 60);
    const p = tryGen(size, mulberry32(base + att * 7919), maxClues);
    if (p) return p;
  }
  return null;
}

// Rule violations for the player's current board (Set of turtle cells).
export function findConflicts({ size, regions, clues }, turtles) {
  const bad = new Set();
  const list = [...turtles];
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const x = list[a], y = list[b];
      const sameRow = Math.floor(x / size) === Math.floor(y / size);
      const sameCol = x % size === y % size;
      const touch = around(x, size).includes(y);
      if (sameRow || sameCol || touch || regions[x] === regions[y]) { bad.add(x); bad.add(y); }
    }
  }
  const nestState = {};
  clues.forEach(({ cell, n }) => {
    const have = nestCount(cell, size, turtles);
    nestState[cell] = have === n ? 'ok' : have > n ? 'over' : 'under';
  });
  return { bad, nestState };
}

export function isSolved(puzzle, turtles) {
  if (turtles.size !== puzzle.size) return false;
  const { bad, nestState } = findConflicts(puzzle, turtles);
  return bad.size === 0 && Object.values(nestState).every(s => s === 'ok');
}
