// Generates src/data/shellSlideLevels.json for the Shell Slide Brain Break game.
// Run from client/:  node scripts/generateShellSlideLevels.mjs
// Optional: SHELL_SLIDE_MINUTES=180 (time budget). Progress is checkpointed to
// scripts/.shellslide-checkpoint.json so a stopped run resumes where it left off;
// the checkpoint is deleted once the level file is written.
//
// For each random beach it maps every reachable board, measures each board's fewest-moves
// distance to solved, and keeps start boards whose optimal move count fills a tier.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIZE, EXIT_ROW, GOAL_OFFSET, TIERS, pieceCells, occupancy, neighbors, keyOf, encodeLevel, decodeLevel, solveFrom,
} from '../src/utils/shellSlidePuzzle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '../src/data/shellSlideLevels.json');
const CHECKPOINT = path.join(HERE, '.shellslide-checkpoint.json');
const TIME_BUDGET_MS = (+process.env.SHELL_SLIDE_MINUTES || 180) * 60 * 1000;
const MAX_COMPONENT = 60000;

function mulberry32(seed) {
  seed = seed | 0;
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBoard(rand, pieceCount, rockCount) {
  const pieces = [{ horiz: true, len: 2, line: EXIT_ROW, turtle: true }];
  const offs = [Math.floor(rand() * 3)];
  const rocks = [];
  const occ = occupancy(pieces, rocks, offs);
  for (let tries = 0; pieces.length - 1 < pieceCount && tries < 400; tries++) {
    const horiz = rand() < 0.5;
    const len = rand() < 0.7 ? 2 : 3;
    const line = Math.floor(rand() * SIZE);
    if (horiz && line === EXIT_ROW) continue; // would block the turtle's lane for good
    const off = Math.floor(rand() * (SIZE - len + 1));
    const p = { horiz, len, line };
    const cells = pieceCells(p, off);
    if (cells.some(i => occ[i])) continue;
    cells.forEach(i => { occ[i] = 1; });
    pieces.push(p);
    offs.push(off);
  }
  for (let tries = 0; rocks.length < rockCount && tries < 100; tries++) {
    const i = Math.floor(rand() * SIZE * SIZE);
    if (occ[i] || Math.floor(i / SIZE) === EXIT_ROW) continue;
    occ[i] = 1;
    rocks.push(i);
  }
  return { pieces, rocks, offs };
}

// Distance-to-solved for every board reachable from `start`, or null if none is solvable.
function componentDistances(pieces, rocks, start) {
  const states = new Map([[keyOf(start), start]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    if (states.size > MAX_COMPONENT) return null;
    for (const n of neighbors(pieces, rocks, queue[q])) {
      const key = keyOf(n);
      if (!states.has(key)) { states.set(key, n); queue.push(n); }
    }
  }
  const dist = new Map();
  let frontier = [];
  for (const [key, s] of states) if (s[0] === GOAL_OFFSET) { dist.set(key, 0); frontier.push(s); }
  if (!frontier.length) return null;
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const s of frontier) {
      for (const n of neighbors(pieces, rocks, s)) {
        const key = keyOf(n);
        if (!dist.has(key)) { dist.set(key, d); next.push(n); }
      }
    }
    frontier = next;
  }
  return { states, dist };
}

const buckets = TIERS.map(() => []);
const seen = new Set();
const tierOf = (d) => TIERS.findIndex(t => d >= t.min && d <= t.max);

// Resume from a checkpoint if there is one.
let resumed = 0;
if (fs.existsSync(CHECKPOINT)) {
  for (const level of JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'))) {
    const { pieces, rocks, start, optimal } = decodeLevel(level);
    const t = tierOf(optimal);
    if (t < 0 || seen.has(level)) continue;
    seen.add(level);
    buckets[t].push({ level, d: optimal, pieces, rocks, start });
    resumed++;
  }
  console.log(`Resumed ${resumed} levels from checkpoint.`);
}
const saveCheckpoint = () => fs.writeFileSync(CHECKPOINT, JSON.stringify(buckets.flat().map(b => b.level)));
const rand = mulberry32(20261006 + resumed * 7919); // fresh sequence after a resume
const full = () => TIERS.every((t, i) => buckets[i].length >= t.count);
const started = Date.now();
let boards = 0;
let lastSave = Date.now();

while (!full() && Date.now() - started < TIME_BUDGET_MS) {
  boards++;
  // Once the easier tiers are full, only crowded beaches can produce what's left.
  const easyFull = [0, 1, 2].every(i => buckets[i].length >= TIERS[i].count);
  const pieceCount = easyFull ? 9 + Math.floor(rand() * 5) : 6 + Math.floor(rand() * 8);
  const rockCount = Math.floor(rand() * 3);
  const { pieces, rocks, offs } = randomBoard(rand, pieceCount, rockCount);
  const comp = componentDistances(pieces, rocks, offs);
  if (!comp) continue;

  // Group this component's boards by tier; keep up to one start board per tier.
  const byTier = TIERS.map(() => []);
  let deepest = 0;
  for (const [key, d] of comp.dist) {
    const t = tierOf(d);
    if (t >= 0) byTier[t].push(key);
    deepest = Math.max(deepest, d);
  }
  byTier.forEach((keys, t) => {
    if (!keys.length || buckets[t].length >= TIERS[t].count) return;
    // Prefer the deepest boards of the tier: they make the most of this layout.
    const maxD = Math.max(...keys.map(k => comp.dist.get(k)));
    const top = keys.filter(k => comp.dist.get(k) === maxD);
    const key = top[Math.floor(rand() * top.length)];
    const start = comp.states.get(key);
    const level = encodeLevel({ pieces, rocks, start, optimal: maxD });
    if (seen.has(level)) return;
    seen.add(level);
    buckets[t].push({ level, d: maxD, pieces, rocks, start });
  });

  if (Date.now() - lastSave > 2 * 60 * 1000) { saveCheckpoint(); lastSave = Date.now(); }
  if (boards % 500 === 0) {
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`${secs}s, ${boards} beaches:`, TIERS.map((t, i) => `${t.label} ${buckets[i].length}/${t.count}`).join('  '));
  }
}

const missing = TIERS.filter((t, i) => buckets[i].length < t.count);
if (missing.length) {
  saveCheckpoint();
  console.error('Not enough levels for:', missing.map(t => t.label).join(', '), '— adjust TIERS or the time budget.');
  process.exit(1);
}

// Easy → hard within each tier; verify every level with the runtime solver.
const levels = [];
TIERS.forEach((t, i) => {
  const picked = buckets[i].slice(0, t.count).sort((a, b) => a.d - b.d);
  for (const { level, d, pieces, rocks, start } of picked) {
    const check = solveFrom({ pieces, rocks }, start);
    if (!check || check.moves !== d) throw new Error(`Solver mismatch on ${level}`);
    levels.push(level);
  }
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(levels) + '\n');
fs.rmSync(CHECKPOINT, { force: true });
console.log(`Wrote ${levels.length} levels to ${OUT} after ${boards} beaches.`);
