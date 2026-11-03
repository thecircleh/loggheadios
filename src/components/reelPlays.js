// Player highlight reel: turns a Stat Book match's stat log into video segments.
// Each stat is saved with the time it was tapped; videos say when they were filmed. A play
// at time T is in a clip that was recording at T, so it's cut from a few seconds before T
// (the tap comes just after the play) to a moment after.

export const PLAY_TYPES = [
  { key: 'kill', label: 'Kills', caption: 'KILL', test: (s) => s.label === 'Kill' },
  { key: 'ace', label: 'Aces', caption: 'ACE', test: (s) => s.label === 'Service Ace' },
  { key: 'block', label: 'Blocks', caption: 'BLOCK', test: (s) => s.label === 'Solo Block' || s.label === 'Block Assist' },
  { key: 'dig', label: 'Digs', caption: 'DIG', test: (s) => s.label === 'Dig' },
  { key: 'assist', label: 'Assists', caption: 'ASSIST', test: (s) => s.label === 'Assist' },
  { key: 'pass', label: 'Perfect passes', caption: 'PERFECT PASS', test: (s) => s.label === 'Reception' && s.statKeys.includes('receive_3') },
];
export const DEFAULT_TYPES = ['kill', 'ace', 'block'];

export const LENGTHS = {
  short: { label: 'Short', before: 4000, after: 1000 },
  normal: { label: 'Normal', before: 6000, after: 2000 },
  long: { label: 'Long', before: 9000, after: 3000 },
};

const toMs = (v) => (typeof v === 'number' ? v : Date.parse(v));
const typeOf = (stat) => PLAY_TYPES.find((type) => type.test(stat)) || null;

// Stats still standing after undos, in logged order.
export function activeStats(actionLog) {
  const live = [];
  for (const entry of actionLog || []) {
    if (!entry) continue;
    if (entry.type === 'stat_log' && !entry.undone && entry.meta?.playerId) {
      const t = toMs(entry.timestamp);
      if (!Number.isFinite(t)) continue;
      live.push({
        t,
        playerId: String(entry.meta.playerId),
        label: entry.meta.label || '',
        statKeys: Array.isArray(entry.meta.statKeys) ? entry.meta.statKeys : [],
        undoId: entry.undoId || null,
        // "#12 Ava → Kill": the name, in case the player isn't on the saved roster
        who: typeof entry.action === 'string' ? entry.action.split(' → ')[0].trim() : '',
      });
    } else if (entry.type === 'stat_undo') {
      const undoId = entry.meta?.undoId;
      if (undoId) {
        for (let i = live.length - 1; i >= 0; i--) if (live[i].undoId === undoId) live.splice(i, 1);
        continue;
      }
      // Older matches: the undo only names the stat, so drop the latest one with that name.
      const label = entry.meta?.originalLabel || '';
      const labels = label === 'Assist → Kill' ? ['Kill', 'Assist'] : [label];
      for (const name of labels) {
        for (let i = live.length - 1; i >= 0; i--) {
          if (live[i].label === name) {
            live.splice(i, 1);
            break;
          }
        }
      }
    }
  }
  return live;
}

// Players with at least one highlight play, most plays first.
export function reelPlayers(match, stats) {
  const roster = new Map();
  for (const p of [...(match?.courtPlayers || []), ...(match?.benchPlayers || [])]) {
    if (p && p._id && p.name && p.name !== '?') roster.set(String(p._id), p);
  }
  const players = new Map();
  for (const stat of stats) {
    if (!typeOf(stat)) continue;
    const entry = players.get(stat.playerId) || {
      id: stat.playerId,
      name: roster.get(stat.playerId)?.name || stat.who || 'Player',
      number: roster.get(stat.playerId)?.number,
      count: 0,
    };
    entry.count += 1;
    players.set(stat.playerId, entry);
  }
  return [...players.values()].sort((a, b) => b.count - a.count);
}

export const playerLabel = (player) => {
  if (!player) return '';
  const number = player.number !== undefined && player.number !== null && player.number !== '' && player.number !== '?'
    ? `#${player.number} `
    : '';
  // stat.who may already include the number ("#12 Ava")
  return player.name.startsWith('#') ? player.name : `${number}${player.name}`;
};

// Set and score when the play happened: the first rally that ended at or after it, before
// that rally's point was added. Only matches logged with rally times (3.0.1+) have this.
function scoreAt(rallies, t) {
  const rally = rallies.find((r) => r.ms >= t - 500);
  if (!rally) return null;
  const weWon = rally.won === 'our';
  return { set: rally.set, us: rally.us - (weWon ? 1 : 0), them: rally.them - (weWon ? 0 : 1) };
}

// One player's plays of the chosen kinds, in time order, with caption pieces.
export function reelPlays(match, stats, player, typeKeys) {
  const rallies = (match?.rallyLog || [])
    .map((r) => ({ ...r, ms: toMs(r.t) }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  const who = playerLabel(player);
  return stats
    .filter((s) => s.playerId === player?.id)
    .map((s) => ({ stat: s, type: typeOf(s) }))
    .filter(({ type }) => type && typeKeys.includes(type.key))
    .sort((a, b) => a.stat.t - b.stat.t)
    .map(({ stat, type }) => {
      const score = scoreAt(rallies, stat.t);
      return {
        t: stat.t,
        typeKey: type.key,
        what: type.caption,
        who,
        when: score ? `Set ${score.set} · ${score.us}–${score.them}` : '',
      };
    });
}

// Lined-up plays ("anchors"). When stats were logged later from the video, tap times don't
// match the video's clock. The parent finds a play in the video; the difference between that
// moment and the tap time is that play's offset. Each play uses the offset of the latest
// anchor at or before it (plays before the first anchor use the first one), so fixing a play
// after the statter paused or rewound also realigns everything after it.
// The tap comes just after the play, so the marked moment of the play counts as the tap
// time minus this much.
export const TAP_DELAY_MS = 1500;

// Two clocks a play time can map onto:
// - 'live': stats logged while filming, so a play at T is in the clip recording at T.
// - 'watched': stats logged later while watching the videos back to back (or the stitched
//   game video). Playback has no gaps between clips, so the videos form one continuous
//   timeline in filmed order, and a play maps to a position on that timeline.
export function watchTimeline(clips) {
  const ordered = [
    ...clips.filter((c) => c.createdAt && c.durationMs).sort((a, b) => a.createdAt - b.createdAt),
    ...clips.filter((c) => !c.createdAt && c.durationMs),
  ];
  let start = 0;
  return ordered.map((clip) => {
    const entry = { clip, start };
    start += clip.durationMs;
    return entry;
  });
}

// Where a clip begins on the chosen clock.
const clipBase = (clip, mode, timeline) =>
  mode === 'watched' ? timeline.find((e) => e.clip.id === clip.id)?.start ?? 0 : clip.createdAt;

export function makeAnchor(play, clip, markMs, mode = 'live', clips = []) {
  const base = clipBase(clip, mode, mode === 'watched' ? watchTimeline(clips) : []);
  return { t: play.t, offsetMs: base + markMs + TAP_DELAY_MS - play.t };
}

export function addAnchor(anchors, anchor) {
  return [...anchors.filter((a) => a.t !== anchor.t), anchor].sort((a, b) => a.t - b.t);
}

export function offsetAt(anchors, t) {
  if (!anchors.length) return 0;
  let offset = anchors[0].offsetMs;
  for (const a of anchors) {
    if (a.t <= t) offset = a.offsetMs;
    else break;
  }
  return offset;
}

// Finds each play in the videos. offsetMs shifts play times to the video's clock (if the
// filming phone's clock differs from the logging phone's); anchors (above) come first.
export function placePlays(plays, clips, offsetMs, length, anchors = [], mode = 'live') {
  // [{ clip, start }] on the chosen clock
  const spans = mode === 'watched'
    ? watchTimeline(clips)
    : clips.filter((c) => c.createdAt && c.durationMs).map((clip) => ({ clip, start: clip.createdAt }));
  const placed = [];
  const missed = [];
  for (const play of plays) {
    const vt = play.t + offsetAt(anchors, play.t) + offsetMs;
    // The tap can come a moment after the parent stopped filming.
    const span = spans.find((s) => vt >= s.start - 1000 && vt <= s.start + s.clip.durationMs + 3000);
    if (!span) {
      missed.push(play);
      continue;
    }
    const clip = span.clip;
    const at = vt - span.start;
    const startMs = Math.max(0, at - length.before);
    const endMs = Math.min(clip.durationMs, at + length.after);
    if (endMs - startMs < 500) {
      missed.push(play);
      continue;
    }
    placed.push({ play, id: clip.id, startMs, endMs });
  }
  return { placed, missed };
}

// Why no plays landed in the videos: 'later' (stats logged well after filming, e.g. statted
// from the video later), 'earlier' (videos filmed after the stats), 'gaps' (plays fall
// between clips), or '' if there's nothing to judge.
export function whyNothingPlaced(plays, clips, offsetMs) {
  const timed = clips.filter((c) => c.createdAt && c.durationMs);
  if (!plays.length || !timed.length) return '';
  const firstPlay = Math.min(...plays.map((p) => p.t + offsetMs));
  const lastPlay = Math.max(...plays.map((p) => p.t + offsetMs));
  const firstFilm = Math.min(...timed.map((c) => c.createdAt));
  const lastFilm = Math.max(...timed.map((c) => c.createdAt + c.durationMs));
  const TEN_MIN = 10 * 60 * 1000;
  if (firstPlay > lastFilm + TEN_MIN) {
    return 'later';
  }
  if (lastPlay < firstFilm - TEN_MIN) return 'earlier';
  return 'gaps';
}

// Joins plays that overlap in the same clip (e.g. a dig then a kill in one rally).
export function reelSegments(placed, withCaptions) {
  const merged = [];
  for (const p of placed) {
    const prev = merged[merged.length - 1];
    if (prev && prev.id === p.id && p.startMs <= prev.endMs + 500) {
      prev.endMs = Math.max(prev.endMs, p.endMs);
      if (!prev.whats.includes(p.play.what)) prev.whats.push(p.play.what);
    } else {
      merged.push({ id: p.id, startMs: p.startMs, endMs: p.endMs, whats: [p.play.what], who: p.play.who, when: p.play.when });
    }
  }
  return merged.map((s) => ({
    id: s.id,
    startMs: Math.round(s.startMs),
    endMs: Math.round(s.endMs),
    caption: withCaptions ? [s.whats.join(' + '), s.who, s.when].filter(Boolean).join(' · ') : '',
  }));
}
