// Coach Tips: turn the live rally math into one concrete suggestion (timeout or sub).
// Pure function so the rules can be tested without the UI.
//
// Input:
//   rallies       current set's rallies [{ srv, won, rot }] in order ('our' | 'their')
//   matchRallies  every rally this match (for side-out by rotation)
//   leverage      how much the next rally swings the set (0–1)
//   runChance     P(a run this long happens by chance in a set) for the current run, or null
//   timeoutsLeft  number, or null if not tracked
//   ralliesSinceTimeout  rallies played since our last timeout (Infinity if none)
//   subsLeft      number, or null if the mode doesn't track subs
//   players       on-court players [{ id, name, number, pm }] (pm = +/- this set), optional
//   currentRot    our current rotation (0–5)
// Returns the most important tip { kind, icon, text, key } or null.
export function coachTip({
  rallies = [], matchRallies = [], leverage = 0, runChance = null,
  timeoutsLeft = null, ralliesSinceTimeout = Infinity, subsLeft = null, players = [], currentRot = null,
}) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const tips = [];

  // Current run (consecutive rallies won by the same team this set).
  let run = 0;
  const last = rallies.length ? rallies[rallies.length - 1].won : null;
  for (let i = rallies.length - 1; i >= 0 && rallies[i].won === last; i--) run++;
  const theyAreRunning = last === 'their';

  // ── Timeouts (only if any are left, and not right after one) ──
  const canTimeout = timeoutsLeft == null || timeoutsLeft > 0;
  if (canTimeout && ralliesSinceTimeout >= 2) {
    if (theyAreRunning && run >= 3) {
      const why = runChance != null && run >= 4
        ? ` Chance alone runs this long in ${pct(runChance)} of sets.`
        : ' Break their rhythm before it grows.';
      tips.push({ priority: run >= 4 ? 100 : 80, kind: 'timeout', icon: '⏱', key: `to-run-${rallies.length}`,
        text: `Call a timeout — they've won ${run} straight.${why}` });
    } else if (leverage >= 0.3 && last === 'their') {
      tips.push({ priority: 70, kind: 'timeout', icon: '⏱', key: `to-lev-${rallies.length}`,
        text: `Consider a timeout — the next rally swings the set by ${pct(leverage)}.` });
    }
  }

  // ── Subs (only if subs remain or the mode doesn't track them) ──
  const canSub = subsLeft == null || subsLeft > 0;
  if (canSub && players.length) {
    const ranked = players.filter((p) => Number.isFinite(p.pm)).sort((a, b) => a.pm - b.pm);
    const worst = ranked[0];
    const best = ranked[ranked.length - 1];
    if (worst && worst.pm <= -4 && best && best.pm - worst.pm >= 3) {
      const label = `${worst.number != null && worst.number !== '' ? `#${worst.number} ` : ''}${worst.name || 'a player'}`;
      tips.push({ priority: 60, kind: 'sub', icon: '🔁', key: `sub-${worst.id}-${worst.pm}`,
        text: `Consider subbing ${label} — ${String(worst.pm).replace('-', '−')} while on court this set.` });
    }
  }

  // Side-out in the current rotation across the match (needs at least 5 chances).
  if (currentRot != null && (canSub || subsLeft == null)) {
    let chances = 0, won = 0;
    for (const r of matchRallies) {
      if (r.srv !== 'their' || r.rot !== currentRot) continue;
      chances++;
      if (r.won === 'our') won++;
    }
    if (chances >= 5 && won / chances <= 0.35) {
      tips.push({ priority: 50, kind: 'rotation', icon: '🔄', key: `rot-${currentRot}-${chances}`,
        text: `Rotation ${currentRot + 1} sides out only ${won} of ${chances} (${pct(won / chances)}) — consider a sub or a serve-receive change.` });
    }
  }

  if (!tips.length) return null;
  tips.sort((a, b) => b.priority - a.priority);
  const best = tips[0];
  return { kind: best.kind, icon: best.icon, text: best.text, key: best.key };
}
