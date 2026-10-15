// Volleyball as a Markov chain (rally scoring).
// A set's state is the score plus who's serving. Each rally is decided by the receiving
// team's side-out rate: when we serve we win the rally with (1 − their side-out %), when
// they serve we win it with our side-out %. Everything below follows from those two numbers.

// P(we win the set) from (us, them) with `weServe`, playing to `target`, win by 2.
export function setWinProb(us, them, weServe, soUs, soThem, target = 25) {
  const p = 1 - soThem; // we win a rally we serve
  const q = soUs;       // we win a rally they serve

  // Deuce (tied at target−1 or later): closed form for the endless win-by-2 tail.
  // X = P(win | tied, we serve), Y = P(win | tied, they serve).
  const k = 1 - (1 - p) * q;
  const X = (p * p * k + p * p * (1 - p) * q) / (k * k - p * (1 - p) * q * (1 - q));
  const Y = (p * q + q * (1 - q) * X) / k;
  // A = we lead by 1 and serve; B = they lead by 1 and serve.
  const A = p + (1 - p) * Y;
  const B = q * X;

  const memo = new Map();
  const P = (a, b, serve) => {
    if (a >= target && a - b >= 2) return 1;
    if (b >= target && b - a >= 2) return 0;
    if (a >= target - 1 && b >= target - 1) {
      if (a === b) return serve ? X : Y;
      if (a === b + 1) return serve ? A : q * 1 + (1 - q) * Y; // we lead by 1 (if they serve, a won rally ends it)
      if (b === a + 1) return serve ? p * X : B;               // they lead by 1
    }
    const key = a * 4096 + b * 2 + (serve ? 1 : 0);
    if (memo.has(key)) return memo.get(key);
    const pw = serve ? p : q;
    const v = pw * P(a + 1, b, true) + (1 - pw) * P(a, b + 1, false);
    memo.set(key, v);
    return v;
  };
  return P(us, them, weServe);
}

// P(we win the match) given sets won so far and the live set's state.
// bestOf 3 or 5; the deciding set goes to `decidingTarget`. Later sets: 50/50 who serves first.
export function matchWinProb({ setsUs, setsThem, us, them, weServe, soUs, soThem, bestOf = 3, target = 25, decidingTarget = 15 }) {
  const need = Math.floor(bestOf / 2) + 1;
  const setNumber = setsUs + setsThem + 1;
  const isDeciding = (n) => n === bestOf;
  const freshSet = (n) => {
    const t = isDeciding(n) ? decidingTarget : target;
    return 0.5 * setWinProb(0, 0, true, soUs, soThem, t) + 0.5 * setWinProb(0, 0, false, soUs, soThem, t);
  };
  const rest = (wu, wt) => {
    if (wu >= need) return 1;
    if (wt >= need) return 0;
    const s = freshSet(wu + wt + 1);
    return s * rest(wu + 1, wt) + (1 - s) * rest(wu, wt + 1);
  };
  if (setsUs >= need) return 1;
  if (setsThem >= need) return 0;
  const cur = setWinProb(us, them, weServe, soUs, soThem, isDeciding(setNumber) ? decidingTarget : target);
  return cur * rest(setsUs + 1, setsThem) + (1 - cur) * rest(setsUs, setsThem + 1);
}

// How much the next rally matters: set win % if we win it minus if we lose it (0–1).
export function rallyLeverage(us, them, weServe, soUs, soThem, target = 25) {
  return setWinProb(us + 1, them, true, soUs, soThem, target) - setWinProb(us, them + 1, false, soUs, soThem, target);
}

// Side-out % with a prior, so a handful of rallies doesn't produce 0% or 100%.
// Prior: 60% over 10 rallies (typical club side-out rate), blended with what we've seen.
export function estimateSideOut(won, chances, prior = 0.6, priorWeight = 10) {
  return (won + prior * priorWeight) / (chances + priorWeight);
}

// Side-out stats from a rally list: [{ weServed: bool, weWon: bool }, ...]
export function sideOutStats(rallies) {
  let ourChances = 0, ourSideOuts = 0, theirChances = 0, theirSideOuts = 0;
  for (const r of rallies) {
    if (r.weServed) { theirChances++; if (!r.weWon) theirSideOuts++; }
    else { ourChances++; if (r.weWon) ourSideOuts++; }
  }
  return {
    ourChances, ourSideOuts, theirChances, theirSideOuts,
    soUs: estimateSideOut(ourSideOuts, ourChances),
    soThem: estimateSideOut(theirSideOuts, theirChances),
    rawUs: ourChances ? ourSideOuts / ourChances : null,
    rawThem: theirChances ? theirSideOuts / theirChances : null,
  };
}

// What an edge in our side-out % is worth over a match, holding theirs fixed.
export function sideOutEdgeTable(soThem, edges = [0, 0.01, 0.02, 0.04, 0.06], bestOf = 3) {
  return edges.map(e => {
    const soUs = Math.min(0.95, soThem + e);
    const set = 0.5 * setWinProb(0, 0, true, soUs, soThem) + 0.5 * setWinProb(0, 0, false, soUs, soThem);
    const match = matchWinProb({ setsUs: 0, setsThem: 0, us: 0, them: 0, weServe: true, soUs, soThem, bestOf });
    return { soUs, set, match };
  });
}

// Longest scoring run by either team in a rally list (sequence of weWon booleans).
export function longestRun(rallies) {
  let best = { length: 0, ours: true }, cur = 0, curOurs = null;
  for (const r of rallies) {
    if (r.weWon === curOurs) cur++; else { cur = 1; curOurs = r.weWon; }
    if (cur > best.length) best = { length: cur, ours: curOurs };
  }
  return best;
}

// Momentum check: how often pure chance (the memoryless model, same side-out rates)
// produces a run at least this long in a set of this many rallies. Deterministic seed.
export function runProbability(runLength, ralliesInSet, soUs, soThem, trials = 4000) {
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let hits = 0;
  for (let t = 0; t < trials; t++) {
    let weServe = rand() < 0.5, cur = 0, last = null, best = 0;
    for (let i = 0; i < ralliesInSet; i++) {
      const weWon = rand() < (weServe ? 1 - soThem : soUs);
      if (weWon === last) cur++; else { cur = 1; last = weWon; }
      if (cur > best) best = cur;
      weServe = weWon;
    }
    if (best >= runLength) hits++;
  }
  return hits / trials;
}
