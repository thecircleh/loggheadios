// Gem Tray engine (pure, no React) — a full-information tile-match puzzle.
// Gems are piled in overlapping layers; only uncovered gems can be tapped, but every gem
// is visible, so the whole level can be planned. A tapped gem goes into a 7-slot tray;
// three of a kind clear. Fill the tray and the level is lost.
//
// Levels are built backwards from a removal order: we pick an order in which the pile can
// be taken apart, then assign gem types along that order so the tray never holds more
// than `peak` gems. Every level is therefore winnable. From Hard up, levels that a
// grab-the-nearest-match player can win are thrown out, so winning takes planning.
import { mulberry32 } from './turtlePuzzle';

export const TRAY_SIZE = 7;
export const TOTAL_LEVELS = 1000;
// Board positions are in half-cell units so upper layers can sit offset over lower ones.
export const COLS = 8, ROWS = 9;          // in whole cells
export const GRID_W = COLS * 2, GRID_H = ROWS * 2;

export const GEMS = ['💎', '🔶', '🟣', '🟢', '❤️', '⭐', '🌙', '🍀', '🏐', '🐢', '🔷', '🍒'];

export function getDiff(n) {
  if (n <= 150) return { tiles: [27, 36],   types: [5, 6],   layers: 2, peak: 4, beatGreedy: false, label: 'Easy' };
  if (n <= 350) return { tiles: [39, 51],   types: [6, 8],   layers: 3, peak: 5, beatGreedy: false, label: 'Medium' };
  if (n <= 600) return { tiles: [54, 69],   types: [8, 9],   layers: 3, peak: 6, beatGreedy: true,  label: 'Hard' };
  if (n <= 850) return { tiles: [72, 90],   types: [9, 11],  layers: 4, peak: 6, beatGreedy: true,  label: 'Expert' };
  return          { tiles: [93, 111],  types: [11, 12], layers: 5, peak: 6, beatGreedy: true,  label: 'Master' };
}

const overlaps = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

// Which quarters of `lower` (bits 0-3: top-left, top-right, bottom-left, bottom-right)
// the gem `upper` covers.
function coverMask(lower, upper) {
  let m = 0;
  for (let q = 0; q < 4; q++) {
    const qx = lower.x + (q & 1), qy = lower.y + (q >> 1);
    if (qx >= upper.x && qx < upper.x + 2 && qy >= upper.y && qy < upper.y + 2) m |= 1 << q;
  }
  return m;
}

// The quarter of gem i to show its icon in: -1 means fully uncovered (show it centered).
// Layouts guarantee every gem always has at least one uncovered quarter.
export function visibleQuarter(tiles, i, removed) {
  const t = tiles[i];
  let m = 0;
  for (let j = 0; j < tiles.length; j++) {
    if (j === i || removed[j] || tiles[j].z <= t.z || !overlaps(t, tiles[j])) continue;
    m |= coverMask(t, tiles[j]);
  }
  if (!m) return -1;
  for (const q of [3, 2, 1, 0]) if (!(m & (1 << q))) return q;
  return -1;
}

// A gem is free when no remaining gem on a higher layer overlaps it.
export function isFree(tiles, i, removed) {
  const t = tiles[i];
  for (let j = 0; j < tiles.length; j++) {
    if (j === i || removed[j]) continue;
    const u = tiles[j];
    if (u.z > t.z && overlaps(t, u)) return false;
  }
  return true;
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lay out `count` gem positions over `layers` layers, pyramid-weighted. Each layer is a
// grid inside a region that shrinks toward the middle; odd layers sit half a cell offset.
// Upper layers must rest on gems below; anything they can't hold goes on the bottom layer.
// No placement may cover all four quarters of any gem, so every gem stays visible.
function layout(count, layers, rand) {
  const tiles = [];
  const weights = [...Array(layers).keys()].map(z => layers - z + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const share = weights.map(w => Math.floor((count * w) / total));
  share[0] += count - share.reduce((a, b) => a + b, 0);
  const spotsFor = (z) => {
    const out = [];
    // Starting at z both insets the layer and gives odd layers a half-cell offset.
    for (let y = z; y + 2 <= GRID_H - z; y += 2) {
      for (let x = z; x + 2 <= GRID_W - z; x += 2) out.push({ x, y });
    }
    return shuffle(out, rand);
  };
  const bottomSpots = spotsFor(0);
  // Bottom layer first, then each upper layer on top of what's there.
  for (let k = 0; k < share[0] && bottomSpots.length; k++) tiles.push({ ...bottomSpots.pop(), z: 0 });
  const covered = tiles.map(() => 0); // quarters of each gem already covered
  let shortfall = 0;
  for (let z = 1; z < layers; z++) {
    let placed = 0;
    for (const s of spotsFor(z)) {
      if (placed >= share[z]) break;
      if (!tiles.some(t => t.z === z - 1 && overlaps(t, s))) continue;
      const hits = [];
      let hidesOne = false;
      tiles.forEach((t, k) => {
        if (t.z >= z || !overlaps(t, s)) return;
        const m = covered[k] | coverMask(t, s);
        if (m === 15) hidesOne = true;
        hits.push([k, m]);
      });
      if (hidesOne) continue;
      hits.forEach(([k, m]) => { covered[k] = m; });
      tiles.push({ x: s.x, y: s.y, z });
      covered.push(0);
      placed++;
    }
    shortfall += share[z] - placed;
  }
  // Extra bottom gems go only where the gems above leave part of them showing.
  while (shortfall > 0 && bottomSpots.length) {
    const s = { ...bottomSpots.pop(), z: 0 };
    const m = tiles.reduce((acc, u) => (u.z > 0 && overlaps(s, u) ? acc | coverMask(s, u) : acc), 0);
    if (m === 15) continue;
    tiles.push(s);
    shortfall--;
  }
  return shortfall > 0 ? null : tiles;
}

// A random order in which the pile can be taken apart (always picking a free gem).
function removalOrder(tiles, rand) {
  const removed = new Array(tiles.length).fill(false);
  const order = [];
  while (order.length < tiles.length) {
    const free = [];
    for (let i = 0; i < tiles.length; i++) if (!removed[i] && isFree(tiles, i, removed)) free.push(i);
    if (!free.length) return null;
    const pick = free[Math.floor(rand() * free.length)];
    removed[pick] = true;
    order.push(pick);
  }
  return order;
}

// Assign a type to each step of the removal order so that playing it never puts more than
// `peak` gems in the tray (peak < TRAY_SIZE). "Open" types have 1 or 2 gems waiting.
// The tray only reaches `peak` with a pair in it, so a clearing move always exists.
function assignTypes(order, typeCount, peak, rand) {
  const types = new Array(order.length);
  const open = new Map(); // type -> gems in tray (1 or 2)
  let tray = 0;
  for (let step = 0; step < order.length; step++) {
    const remaining = order.length - step;
    const owed = [...open.values()].reduce((n, c) => n + (3 - c), 0); // gems needed to close all
    const choices = [];
    for (const [t, c] of open) {
      if (c === 2) choices.push(t, t);                       // closing is always safe
      else if (tray + 1 < peak || (tray + 1 === peak)) {     // pairing: tray may reach peak (a pair exists then)
        if (remaining - 1 >= owed - 1) choices.push(t);
      }
    }
    // Opening a new type adds a single; never let that be what reaches peak.
    if (tray + 1 < peak && remaining - owed >= 3 && open.size < typeCount) {
      const closed = [...Array(typeCount).keys()].filter(t => !open.has(t));
      const t = closed[Math.floor(rand() * closed.length)];
      choices.push(t, t);
    }
    if (!choices.length) return null;
    const type = choices[Math.floor(rand() * choices.length)];
    types[order[step]] = type;
    const c = (open.get(type) || 0) + 1;
    if (c === 3) { open.delete(type); tray -= 2; } else { open.set(type, c); tray++; }
  }
  return open.size ? null : types;
}

export function generatePuzzle(levelNum) {
  const diff = getDiff(levelNum);
  for (let att = 0; att < 200; att++) {
    const rand = mulberry32(levelNum * 40503 + 17 + att * 7907);
    const span = diff.tiles[1] - diff.tiles[0];
    const count = diff.tiles[0] + 3 * Math.floor(rand() * (span / 3 + 1));
    const typeCount = diff.types[0] + Math.floor(rand() * (diff.types[1] - diff.types[0] + 1));
    const tiles = layout(count, diff.layers, rand);
    if (!tiles) continue;
    const order = removalOrder(tiles, rand);
    if (!order) continue;
    const types = assignTypes(order, typeCount, diff.peak, rand);
    if (!types) continue;
    // Map type indexes onto a level-specific selection of gems.
    const palette = shuffle([...GEMS.keys()], rand).slice(0, typeCount);
    const puzzle = {
      tiles: tiles.map((t, i) => ({ ...t, gem: palette[types[i]] })),
      solution: order,
      typeCount,
    };
    if (diff.beatGreedy && greedyWins(puzzle.tiles)) continue;
    return puzzle;
  }
  return null;
}

// Insert a gem into the tray next to its matches, then clear any three of a kind.
// Returns { tray, cleared } where cleared is the gem that cleared (or null).
export function addToTray(tray, gem) {
  const next = [...tray];
  const last = next.lastIndexOf(gem);
  next.splice(last >= 0 ? last + 1 : next.length, 0, gem);
  if (next.filter(g => g === gem).length >= 3) {
    return { tray: next.filter(g => g !== gem), cleared: gem };
  }
  return { tray: next, cleared: null };
}

// Free gems right now, given which are gone.
export function freeTiles(tiles, removed) {
  const out = [];
  for (let i = 0; i < tiles.length; i++) if (!removed[i] && isFree(tiles, i, removed)) out.push(i);
  return out;
}

// Rank a free gem the way a no-look-ahead player would: complete a match, else pair up,
// else take the gem with the most free copies.
function greedyScore(tiles, removed, tray, i, free) {
  const gem = tiles[i].gem;
  const inTray = tray.filter(g => g === gem).length;
  const freeCopies = free.filter(j => tiles[j].gem === gem).length;
  return inTray * 100 + freeCopies;
}

// Does the grab-the-nearest-match strategy clear the board?
export function greedyWins(tiles) {
  const removed = new Array(tiles.length).fill(false);
  let tray = [];
  for (let step = 0; step < tiles.length; step++) {
    const free = freeTiles(tiles, removed);
    let best = free[0], bestScore = -1;
    for (const i of free) {
      const s = greedyScore(tiles, removed, tray, i, free);
      if (s > bestScore) { best = i; bestScore = s; }
    }
    removed[best] = true;
    tray = addToTray(tray, tiles[best].gem).tray;
    if (tray.length >= TRAY_SIZE) return false;
  }
  return true;
}

// Look-ahead search from the current position. Returns the gem index to tap next on a
// winning line, or null if none was found within `budget` positions.
export function findWinningMove(tiles, removed, tray, budget = 40000) {
  const seen = new Set();
  let nodes = 0;
  const rem = [...removed];
  const go = (tr) => {
    if (++nodes > budget) return undefined;
    if (rem.every(Boolean)) return tr.length === 0 ? -1 : null;
    const key = rem.map(r => (r ? 1 : 0)).join('') + '|' + [...tr].sort().join(',');
    if (seen.has(key)) return null;
    seen.add(key);
    const free = freeTiles(tiles, rem);
    free.sort((a, b) => greedyScore(tiles, rem, tr, b, free) - greedyScore(tiles, rem, tr, a, free));
    for (const i of free) {
      const next = addToTray(tr, tiles[i].gem).tray;
      if (next.length >= TRAY_SIZE) continue;
      rem[i] = true;
      const r = go(next);
      rem[i] = false;
      if (r === undefined) return undefined;
      if (r !== null) return i;
    }
    return null;
  };
  const r = go(tray);
  return r === undefined || r === -1 ? null : r;
}
