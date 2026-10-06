// Lineup Sudoku engine (pure, no React).
// 6×6 grid of six 2×3 "courts" (front row on top: zones 4-3-2, back row: 5-6-1).
// Every row, column and court holds each player once (S, OPP, OH1, OH2, M1, M2).
// Wrinkle — rotation courts: in a few marked courts the six players form a real 5-1
// lineup, so each player is directly across from their opposite (zones 1↔4, 2↔5, 3↔6,
// i.e. the cell mirrored through the court's center): S–OPP, OH1–OH2, M1–M2.
import { mulberry32 } from './turtlePuzzle';

export const SIZE = 6;
export const PLAYERS = ['S', 'OPP', 'OH1', 'OH2', 'M1', 'M2'];
export const opposite = (p) => p ^ 1; // pairs are (0,1), (2,3), (4,5)
export const TOTAL_LEVELS = 1000;

// givens: starting players (0 = as few as uniqueness allows); rotations: marked courts.
export function getDiff(n) {
  if (n <= 150) return { givens: 16, rotations: [2, 3], label: 'Easy' };
  if (n <= 350) return { givens: 13, rotations: [2, 2], label: 'Medium' };
  if (n <= 600) return { givens: 11, rotations: [1, 2], label: 'Hard' };
  if (n <= 850) return { givens: 9,  rotations: [1, 1], label: 'Expert' };
  return          { givens: 0,  rotations: [1, 1], label: 'Master' };
}

export const courtOf = (i) => Math.floor(Math.floor(i / SIZE) / 2) * 2 + Math.floor((i % SIZE) / 3);

// The opposite cell within the same court: mirrored through the court's center.
export const partnerOf = (i) => {
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const r0 = r - (r % 2), c0 = c - (c % 3);
  return (r0 + 1 - (r - r0)) * SIZE + (c0 + 2 - (c - c0));
};

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Players that can legally go in cell i given the other filled cells (-1 = empty).
export function candidates(grid, i, rotations = []) {
  const r = Math.floor(i / SIZE), c = i % SIZE, court = courtOf(i);
  const used = new Set();
  for (let k = 0; k < SIZE * SIZE; k++) {
    if (k === i || grid[k] < 0) continue;
    if (Math.floor(k / SIZE) === r || k % SIZE === c || courtOf(k) === court) used.add(grid[k]);
  }
  const partner = rotations.includes(court) ? grid[partnerOf(i)] : -1;
  return [0, 1, 2, 3, 4, 5].filter(p => !used.has(p) && (partner < 0 || partner === opposite(p)));
}

// Up to `limit` completed grids. With `rand`, candidates are tried in random order.
export function solve(start, rotations = [], limit = 2, rand = null) {
  const grid = [...start];
  const out = [];
  const go = () => {
    let best = -1, bestCands = null;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] >= 0) continue;
      const cs = candidates(grid, i, rotations);
      if (!cs.length) return;
      if (!bestCands || cs.length < bestCands.length) { best = i; bestCands = cs; }
      if (cs.length === 1) break;
    }
    if (best < 0) { out.push([...grid]); return; }
    for (const p of rand ? shuffle(bestCands, rand) : bestCands) {
      grid[best] = p;
      go();
      if (out.length >= limit) break;
    }
    grid[best] = -1;
  };
  go();
  return out;
}

// True if the puzzle falls to the simplest logic alone: a cell with one possible player,
// or a player with one possible cell in a row, column or court.
export function solvableBySingles({ givens, rotations }) {
  const g = [...givens];
  const units = [];
  for (let k = 0; k < SIZE; k++) {
    units.push([...Array(SIZE)].map((_, j) => k * SIZE + j));
    units.push([...Array(SIZE)].map((_, j) => j * SIZE + k));
    units.push([...Array(SIZE * SIZE).keys()].filter(i => courtOf(i) === k));
  }
  for (let progress = true; progress;) {
    progress = false;
    for (let i = 0; i < g.length; i++) {
      if (g[i] >= 0) continue;
      const cs = candidates(g, i, rotations);
      if (cs.length === 1) { g[i] = cs[0]; progress = true; }
    }
    for (const unit of units) {
      for (let p = 0; p < SIZE; p++) {
        if (unit.some(i => g[i] === p)) continue;
        const spots = unit.filter(i => g[i] < 0 && candidates(g, i, rotations).includes(p));
        if (spots.length === 1) { g[spots[0]] = p; progress = true; }
      }
    }
  }
  return g.every(v => v >= 0);
}

function buildPuzzle(diff, rand) {
  const nRot = diff.rotations[0] + Math.floor(rand() * (diff.rotations[1] - diff.rotations[0] + 1));
  const rotations = shuffle([0, 1, 2, 3, 4, 5], rand).slice(0, nRot).sort();
  const solution = solve(new Array(SIZE * SIZE).fill(-1), rotations, 1, rand)[0];
  const givens = [...solution];
  let count = givens.length;
  for (const i of shuffle([...Array(SIZE * SIZE).keys()], rand)) {
    if (count <= diff.givens) break;
    const keep = givens[i];
    givens[i] = -1;
    if (solve(givens, rotations, 2).length === 1) count--;
    else givens[i] = keep;
  }
  return { givens, solution, rotations };
}

export function generatePuzzle(levelNum) {
  const diff = getDiff(levelNum);
  const rand = mulberry32(levelNum * 7368787 + 3);
  let puzzle = buildPuzzle(diff, rand);
  // Master levels must need more than the simplest logic.
  for (let att = 0; diff.label === 'Master' && att < 30 && solvableBySingles(puzzle); att++) {
    puzzle = buildPuzzle(diff, rand);
  }
  return puzzle;
}
