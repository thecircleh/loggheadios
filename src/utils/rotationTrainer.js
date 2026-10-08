// Rotation Trainer engine (pure, no React).
// Court coordinates are in meters on one 9×9 m half court, from the team's own view facing
// the net: x = 0 at the left sideline → 9 at the right; y = 0 at the net → 9 at the end line.
//
// Overlap rules at the moment of serve (USAV / NFHS / FIVB agree on these):
//  • Side to side, same row only: front 4 left of 3 left of 2; back 5 left of 6 left of 1.
//  • Front to back, partners only: 4 closer to the net than 5, 3 than 6, 2 than 1.
//  • Diagonal pairs are never compared. The serving team's server is exempt.
//  • Everyone but the server must be inside their court.
import { mulberry32 } from './turtlePuzzle';

export const COURT = 9;
export const TOTAL_LEVELS = 500;
export const QUESTIONS_PER_LEVEL = 8;

// 5-1 serving order. Player i starts in zone i + 1, so opposites are 3 apart.
export const PLAYERS = ['S', 'OH1', 'M1', 'OPP', 'OH2', 'M2'];
export const PLAYER_NAMES = ['Setter', 'Outside 1', 'Middle 1', 'Opposite', 'Outside 2', 'Middle 2'];

// Zone of player i after `rot` clockwise rotations (2→1, 1→6, 6→5, …).
export const zoneOf = (i, rot) => ((i - rot + 12) % 6) + 1;
export const playerInZone = (zone, rot) => PLAYERS.findIndex((_, i) => zoneOf(i, rot) === zone);

// [a, b]: zone a must be LEFT of zone b (smaller x).
export const LATERAL = [[4, 3], [3, 2], [5, 6], [6, 1]];
// [a, b]: zone a must be closer to the NET than zone b (smaller y).
export const DEPTH = [[4, 5], [3, 6], [2, 1]];

// Home spots for drawing a plain rotation.
export const BASE_SPOTS = {
  4: { x: 1.5, y: 1.8 }, 3: { x: 4.5, y: 1.8 }, 2: { x: 7.5, y: 1.8 },
  5: { x: 1.5, y: 6.5 }, 6: { x: 4.5, y: 6.5 }, 1: { x: 7.5, y: 6.5 },
};
export const SERVER_SPOT = { x: 7.5, y: 9.7 };

const ZONE_LABEL = { 1: 'right back', 2: 'right front', 3: 'middle front', 4: 'left front', 5: 'left back', 6: 'middle back' };

// Every rule broken by `pos` (zone → {x, y}). Each fault: { a, b, kind }.
export function findFaults(pos, serving) {
  const exempt = (z) => serving && z === 1;
  const faults = [];
  for (const [a, b] of LATERAL) {
    if (exempt(a) || exempt(b)) continue;
    if (!(pos[a].x < pos[b].x)) faults.push({ a, b, kind: 'lateral' });
  }
  for (const [a, b] of DEPTH) {
    if (exempt(a) || exempt(b)) continue;
    if (!(pos[a].y < pos[b].y)) faults.push({ a, b, kind: 'depth' });
  }
  return faults;
}

export function describeFault({ a, b, kind }, rot) {
  const pa = PLAYERS[playerInZone(a, rot)], pb = PLAYERS[playerInZone(b, rot)];
  return kind === 'lateral'
    ? `${pa} (zone ${a}, ${ZONE_LABEL[a]}) must be to the left of ${pb} (zone ${b}, ${ZONE_LABEL[b]}).`
    : `${pa} (zone ${a}, ${ZONE_LABEL[a]}) must be closer to the net than ${pb} (zone ${b}, ${ZONE_LABEL[b]}).`;
}

// Where zone z may legally stand given everyone else: { x0, x1, y0, y1 } (open interval).
export function legalBox(z, pos, serving) {
  let x0 = 0, x1 = COURT, y0 = 0, y1 = COURT;
  for (const [a, b] of LATERAL) {
    if (serving && (a === 1 || b === 1)) continue;
    if (a === z) x1 = Math.min(x1, pos[b].x);
    if (b === z) x0 = Math.max(x0, pos[a].x);
  }
  for (const [a, b] of DEPTH) {
    if (serving && (a === 1 || b === 1)) continue;
    if (a === z) y1 = Math.min(y1, pos[b].y);
    if (b === z) y0 = Math.max(y0, pos[a].y);
  }
  return { x0, x1, y0, y1 };
}

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const rnd = (lo, hi, rand) => lo + rand() * (hi - lo);
const round1 = (v) => Math.round(v * 10) / 10;

// A legal, realistic-looking formation with every constrained pair at least `gap` m apart.
// Styles mimic real serve receive: front row can crowd the net, a hiding setter tucks in.
function legalFormation(rand, serving, gap = 0.7) {
  for (let tries = 0; tries < 500; tries++) {
    const pos = {};
    // Back row first (depth), then front row in front of their partners.
    for (const z of [5, 6, 1]) pos[z] = { x: 0, y: round1(rnd(3.2, 8.3, rand)) };
    for (const [f, b] of [[4, 5], [3, 6], [2, 1]]) pos[f] = { x: 0, y: round1(rnd(0.4, Math.min(5, pos[b].y - gap), rand)) };
    // Lateral order within each row, with occasional stacking toward one side.
    const lean = rand() < 0.35 ? rnd(-2, 2, rand) : 0;
    const row = (zones) => {
      const xs = [rnd(0.4, 3.4, rand), rnd(3.2, 5.8, rand), rnd(5.6, 8.6, rand)].map(v => round1(Math.min(8.6, Math.max(0.4, v + lean))));
      xs.sort((p, q) => p - q);
      zones.forEach((z, k) => { pos[z].x = xs[k]; });
    };
    row([4, 3, 2]);
    row([5, 6, 1]);
    if (serving) pos[1] = { ...SERVER_SPOT, x: round1(rnd(6.5, 8.6, rand)) };
    const ok = findFaults(pos, serving).length === 0 &&
      LATERAL.every(([a, b]) => (serving && (a === 1 || b === 1)) || pos[b].x - pos[a].x >= gap) &&
      DEPTH.every(([a, b]) => (serving && (a === 1 || b === 1)) || pos[b].y - pos[a].y >= gap);
    if (ok) return pos;
  }
  return null;
}

// Break exactly one rule by moving one player past a neighbor by `margin` meters.
function withOneFault(pos, serving, margin, rand) {
  const rules = [...LATERAL.map(r => ['lateral', ...r]), ...DEPTH.map(r => ['depth', ...r])]
    .filter(([, a, b]) => !(serving && (a === 1 || b === 1)));
  for (let tries = 0; tries < 60; tries++) {
    const [kind, a, b] = pick(rules, rand);
    const mover = rand() < 0.5 ? a : b;
    const other = mover === a ? b : a;
    const next = Object.fromEntries(Object.entries(pos).map(([z, p]) => [z, { ...p }]));
    const axis = kind === 'lateral' ? 'x' : 'y';
    // a must be smaller than b on this axis; push the mover past the other.
    next[mover][axis] = round1(mover === a ? pos[other][axis] + margin : pos[other][axis] - margin);
    if (next[mover][axis] < 0.3 || next[mover][axis] > COURT - 0.3) continue;
    const faults = findFaults(next, serving);
    if (faults.length === 1 && faults[0].a === a && faults[0].b === b) return { pos: next, fault: faults[0] };
  }
  return null;
}

export function getDiff(n) {
  if (n <= 60)  return { label: 'Easy',   types: ['rotate', 'rotate', 'legal'],        margin: [1.4, 2.2], servingChance: 0.3 };
  if (n <= 150) return { label: 'Medium', types: ['rotate', 'legal', 'legal'],         margin: [0.8, 1.4], servingChance: 0.5 };
  if (n <= 280) return { label: 'Hard',   types: ['legal', 'find', 'find'],           margin: [0.6, 1.1], servingChance: 0.5 };
  if (n <= 400) return { label: 'Expert', types: ['find', 'place', 'place', 'legal'], margin: [0.5, 0.9], servingChance: 0.5 };
  return          { label: 'Master', types: ['rotate', 'legal', 'find', 'place'],    margin: [0.4, 0.7], servingChance: 0.6 };
}

function rotateQuestion(rand) {
  const rot = Math.floor(rand() * 6);
  if (rand() < 0.5) {
    const server = playerInZone(1, rot + 1);
    return {
      type: 'rotate', rot, pos: { ...BASE_SPOTS }, serving: false,
      prompt: 'You just won the rally on their serve (side-out). Rotate! Who serves now?',
      answer: { player: server },
      explain: `On a side-out you rotate clockwise: the player in zone 2 (${PLAYERS[server]}) moves to zone 1 and serves.`,
    };
  }
  const zone = pick([2, 3, 4, 5, 6], rand);
  const who = playerInZone(zone, rot + 1);
  const from = zoneOf(who, rot);
  return {
    type: 'rotate', rot, pos: { ...BASE_SPOTS }, serving: false,
    prompt: `After your team rotates once, who will be in zone ${zone} (${ZONE_LABEL[zone]})?`,
    answer: { player: who },
    explain: `Rotation is clockwise, so each player moves back one zone: ${PLAYERS[who]} moves from zone ${from} to zone ${zone}.`,
  };
}

function formationQuestion(type, diff, rand) {
  for (let tries = 0; tries < 50; tries++) {
    const rot = Math.floor(rand() * 6);
    const serving = rand() < diff.servingChance;
    const base = legalFormation(rand, serving);
    if (!base) continue;
    const margin = round1(rnd(diff.margin[0], diff.margin[1], rand));
    const situation = serving ? 'Your team is serving.' : 'Your team is in serve receive.';

    if (type === 'legal') {
      const faulty = rand() < 0.55 ? withOneFault(base, serving, margin, rand) : null;
      const pos = faulty ? faulty.pos : base;
      return {
        type, rot, pos, serving,
        prompt: `${situation} Is this lineup legal at the moment of serve?`,
        answer: { legal: !faulty },
        explain: faulty
          ? `Overlap! ${describeFault(faulty.fault, rot)}`
          : `Legal. Every front player is ahead of their back-row partner, and each row is in left-to-right order${serving ? ' (the server is exempt).' : '.'}`,
      };
    }

    if (type === 'find') {
      const faulty = withOneFault(base, serving, margin, rand);
      if (!faulty) continue;
      return {
        type, rot, pos: faulty.pos, serving,
        prompt: `${situation} There's an overlap. Tap the two players involved.`,
        answer: { pair: [faulty.fault.a, faulty.fault.b] },
        explain: describeFault(faulty.fault, rot),
      };
    }

    // place: one player is off the court; tap a legal spot. Need a box big enough to aim at.
    const candidates = [2, 3, 4, 5, 6, ...(serving ? [] : [1])];
    const zone = pick(candidates, rand);
    const box = legalBox(zone, base, serving);
    if (box.x1 - box.x0 < 0.8 || box.y1 - box.y0 < 0.8) continue;
    return {
      type, rot, pos: base, serving, zone,
      prompt: `${situation} Tap a legal spot for ${PLAYERS[playerInZone(zone, rot)]} (zone ${zone}).`,
      answer: { box },
      explain: `${PLAYERS[playerInZone(zone, rot)]} must stay between the neighbors in their row and on the correct side of their front/back partner — the shaded area.`,
    };
  }
  return null;
}

export function generateLevel(levelNum) {
  const diff = getDiff(levelNum);
  const rand = mulberry32(levelNum * 92821 + 5);
  const questions = [];
  while (questions.length < QUESTIONS_PER_LEVEL) {
    const type = diff.types[questions.length % diff.types.length];
    const q = type === 'rotate' ? rotateQuestion(rand) : formationQuestion(type, diff, rand);
    if (q) questions.push(q);
  }
  return questions;
}

export function isCorrect(q, response) {
  if (q.type === 'rotate') return response.player === q.answer.player;
  if (q.type === 'legal') return response.legal === q.answer.legal;
  if (q.type === 'find') {
    const [a, b] = q.answer.pair;
    const r = response.pair || [];
    return r.length === 2 && r.includes(a) && r.includes(b);
  }
  const { x, y } = response.spot || {};
  const { x0, x1, y0, y1 } = q.answer.box;
  return x > x0 && x < x1 && y > y0 && y < y1;
}

// 3 stars for a clean level, 2 for one miss, 1 otherwise.
export const starsFor = (mistakes) => (mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);
