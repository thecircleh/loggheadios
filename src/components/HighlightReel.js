import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { ClipStitcher } from 'loggerhead-clip-stitcher';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import {
  PLAY_TYPES, DEFAULT_TYPES, LENGTHS,
  activeStats, reelPlayers, reelPlays, placePlays, reelSegments, whyNothingPlaced, playerLabel,
  makeAnchor, addAnchor, TAP_DELAY_MS,
} from './reelPlays';
import {
  useClipPicker, pickMessage, PickProgress, MakingProgress, VideoResult, formatDuration, styles,
} from './clipStitcherShared';

const API_URL = getApiUrl();

const matchDate = (m) => {
  const ms = m.timestamp ? Date.parse(m.timestamp) : parseInt(String(m._id).slice(0, 8), 16) * 1000;
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

const isStatBook = (m) => ['statbook', 'Statbook', 'Express'].includes(m.mode);

// Player highlight reel: pick a Stat Book match, a player and the kinds of plays, then the
// videos from that match. Plays are found in the videos by time and joined into one reel.
export default function HighlightReel() {
  const { token, user } = useAuth();
  const [matches, setMatches] = useState(null); // null while loading
  const [listError, setListError] = useState('');
  const [match, setMatch] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [lengthKey, setLengthKey] = useState('normal');
  const [captions, setCaptions] = useState(true);
  const [clips, setClips] = useState([]);
  const [offsetSec, setOffsetSec] = useState(0);
  // Plays lined up by hand (for matches statted from the video later). See reelPlays.js.
  const [anchors, setAnchors] = useState([]);
  const [finding, setFinding] = useState(null); // { play, clipId, startSec } while lining up
  const [timelineMode, setTimelineMode] = useState('live'); // clock the line-up uses (reelPlays.js)
  const [previewIndex, setPreviewIndex] = useState(0);
  const [making, setMaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const picker = useClipPicker();
  const progressRef = useRef(null);

  useEffect(() => () => progressRef.current?.remove?.(), []);

  // Stat Book matches to choose from. Older servers don't have the light list, so fall back
  // to the team match lists.
  useEffect(() => {
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/matches/highlight-candidates`, { headers, timeout: 20000 });
        if (!cancelled) setMatches(Array.isArray(data) ? data : []);
      } catch {
        try {
          const lists = await Promise.all((user?.teams || []).map((teamName) =>
            axios.get(`${API_URL}/api/matches/team`, { headers, params: { teamName }, timeout: 30000 })
              .then((r) => r.data).catch(() => [])));
          const found = lists.flat()
            .filter((m) => m && isStatBook(m) && (m.actionLog || []).length)
            .map(({ _id, teamName, opponentName, eventName, timestamp }) => ({ _id, teamName, opponentName, eventName, timestamp }))
            .sort((a, b) => String(b._id).localeCompare(String(a._id)));
          if (!cancelled) setMatches(found);
        } catch {
          if (!cancelled) {
            setMatches([]);
            setListError("Couldn't load your matches. Check your connection and try again.");
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token, user?.teams]);

  const chooseMatch = async (id) => {
    setMsg('');
    setResult(null);
    setLoadingMatch(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/matches/${id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 30000,
      });
      setMatch(data);
      setPlayerId(null);
      setPreviewIndex(0);
      setAnchors([]);
      setFinding(null);
      setOffsetSec(0);
    } catch {
      setMsg("Couldn't open that match. Check your connection and try again.");
    } finally {
      setLoadingMatch(false);
    }
  };

  const stats = useMemo(() => (match ? activeStats(match.actionLog) : []), [match]);
  const players = useMemo(() => (match ? reelPlayers(match, stats) : []), [match, stats]);
  const player = players.find((p) => p.id === playerId) || null;

  // Count of each kind of play for the chosen player.
  const typeCounts = useMemo(() => {
    if (!player) return {};
    const counts = {};
    for (const p of reelPlays(match, stats, player, PLAY_TYPES.map((t) => t.key))) {
      counts[p.typeKey] = (counts[p.typeKey] || 0) + 1;
    }
    return counts;
  }, [match, stats, player]);

  const plays = useMemo(
    () => (player ? reelPlays(match, stats, player, types) : []),
    [match, stats, player, types],
  );
  const length = LENGTHS[lengthKey];
  const { placed, missed } = useMemo(
    () => placePlays(plays, clips, offsetSec * 1000, length, anchors, anchors.length ? timelineMode : 'live'),
    [plays, clips, offsetSec, length, anchors, timelineMode],
  );
  const undated = clips.filter((c) => !c.createdAt).length;
  const preview = placed[Math.min(previewIndex, placed.length - 1)] || null;
  const reason = placed.length || anchors.length ? '' : whyNothingPlaced(plays, clips, offsetSec * 1000);

  // The parent found finding.play at markMs into clip: line every play up from it.
  // Statted later: the stat times follow playback of the videos back to back, so line up on
  // that timeline. Logged live: line up on real time (only the clocks differ).
  const lineUp = (clip, markMs) => {
    const mode = anchors.length ? timelineMode : (reason === 'later' || reason === 'earlier' ? 'watched' : 'live');
    const next = addAnchor(anchors, makeAnchor(finding.play, clip, markMs, mode, clips));
    const index = placePlays(plays, clips, 0, length, next, mode).placed.findIndex((p) => p.play.t === finding.play.t);
    setTimelineMode(mode);
    setAnchors(next);
    setOffsetSec(0);
    setFinding(null);
    setPreviewIndex(Math.max(0, index));
    setResult(null);
  };

  // Where the play itself is in the previewed stretch (the tap came a moment after it).
  const fixPreviewPlay = () => {
    const at = preview.startMs > 0 ? preview.startMs + length.before : preview.endMs - length.after;
    setFinding({ play: preview.play, clipId: preview.id, startSec: Math.max(0, at - TAP_DELAY_MS) / 1000 });
  };

  const toggleType = (key) => {
    setResult(null);
    setTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const addVideos = async () => {
    setMsg('');
    try {
      const res = await picker.pickClips();
      setMsg(pickMessage(res));
      if (res.clips.length) {
        setResult(null);
        setClips((prev) => {
          const known = new Set(prev.map((c) => c.id));
          return [...prev, ...res.clips.filter((c) => !known.has(c.id))];
        });
      }
    } catch (err) {
      setMsg(err?.message || "Couldn't open your videos.");
    }
  };

  const makeReel = async () => {
    setMsg('');
    setResult(null);
    setProgress(0);
    setMaking(true);
    try {
      progressRef.current = await ClipStitcher.addListener('progress', ({ progress: p }) => setProgress(p || 0));
      const res = await ClipStitcher.makeReel({ segments: reelSegments(placed, captions) });
      setResult(res);
    } catch (err) {
      if (err?.code !== 'CANCELLED') setMsg(err?.message || "Couldn't make the reel.");
    } finally {
      progressRef.current?.remove?.();
      progressRef.current = null;
      setMaking(false);
    }
  };

  // Keeps the picked-video copies on the phone: the Stitch clips tab may be using them.
  const startOver = () => {
    setClips([]);
    setResult(null);
    setMatch(null);
    setPlayerId(null);
    setOffsetSec(0);
    setAnchors([]);
    setFinding(null);
    setMsg('');
  };

  if (result) {
    return (
      <>
        <VideoResult
          title={`${player ? player.name : 'Player'}'s highlight reel`}
          result={result}
          detail={`${placed.length} play${placed.length === 1 ? '' : 's'}`}
          onBack={() => setResult(null)}
          backLabel="← Change plays"
          onStartOver={startOver}
        />
        {msg && <p style={{ ...styles.muted, marginTop: 12 }}>{msg}</p>}
      </>
    );
  }

  return (
    <>
      <p style={styles.lead}>
        Pick a Stat Book match and a player, then the videos you filmed at that match. Loggerhead
        finds each of their big plays in the videos and joins them into one reel.
      </p>

      {/* 1. Match */}
      <div className="card">
        <p style={styles.stepTitle}>1. Match</p>
        {match ? (
          <>
            <div style={{ fontWeight: 600 }}>{match.teamName} vs {match.opponentName || 'Opponent'}</div>
            <div style={styles.muted}>{matchDate(match)}{match.eventName ? ` · ${match.eventName}` : ''}</div>
            <button type="button" style={styles.link} onClick={() => { setMatch(null); setPlayerId(null); }}>Change match</button>
          </>
        ) : matches === null || loadingMatch ? (
          <p style={styles.muted}>Loading…</p>
        ) : matches.length === 0 ? (
          <p style={styles.muted}>
            {listError || 'No Stat Book matches yet. Highlight reels use the plays logged in Stat Book, so log a match in Stat Book while someone films.'}
          </p>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {matches.map((m) => (
              <button key={m._id} type="button" style={styles.listItem} onClick={() => chooseMatch(m._id)}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.teamName} vs {m.opponentName || 'Opponent'}</div>
                <div style={styles.muted}>{matchDate(m)}{m.eventName ? ` · ${m.eventName}` : ''}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Player and plays */}
      {match && (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={styles.stepTitle}>2. Player and plays</p>
          {players.length === 0 ? (
            <p style={styles.muted}>No kills, aces, blocks, digs, assists or perfect passes were logged for anyone in this match.</p>
          ) : (
            <>
              <div style={styles.chips}>
                {players.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setPlayerId(p.id); setPreviewIndex(0); setResult(null); }}
                    style={{ ...styles.chip, ...(p.id === playerId ? styles.chipOn : null) }}>
                    {playerLabel(p)} · {p.count}
                  </button>
                ))}
              </div>
              {player && (
                <>
                  <p style={{ ...styles.muted, marginTop: 14, fontWeight: 700 }}>Plays to include</p>
                  <div style={styles.chips}>
                    {PLAY_TYPES.map((t) => (
                      <button key={t.key} type="button" onClick={() => toggleType(t.key)} disabled={!typeCounts[t.key]}
                        style={{ ...styles.chip, ...(types.includes(t.key) && typeCounts[t.key] ? styles.chipOn : null), ...(!typeCounts[t.key] ? { opacity: 0.4 } : null) }}>
                        {t.label} · {typeCounts[t.key] || 0}
                      </button>
                    ))}
                  </div>
                  <p style={{ ...styles.muted, marginTop: 14, fontWeight: 700 }}>Length of each play</p>
                  <div style={styles.chips}>
                    {Object.entries(LENGTHS).map(([key, l]) => (
                      <button key={key} type="button" onClick={() => setLengthKey(key)}
                        style={{ ...styles.chip, ...(key === lengthKey ? styles.chipOn : null) }}>
                        {l.label} ({(l.before + l.after) / 1000}s)
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14 }}>
                    <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
                    Caption each play (e.g. "KILL · {playerLabel(player)} · Set 2 · 18–16")
                  </label>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* 3. Videos */}
      {player && plays.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={styles.stepTitle}>3. Videos from this match</p>
          {picker.active ? (
            <PickProgress pick={picker.pick} elapsedMs={picker.elapsedMs} />
          ) : (
            <button type="button" className="primary-button" onClick={addVideos} disabled={picker.loading || making}>
              {picker.loading ? 'Loading videos…' : clips.length ? '+ Add more videos' : 'Choose videos'}
            </button>
          )}
          {clips.length > 0 && (
            <>
              <p style={{ ...styles.muted, fontSize: 13 }}>
                {clips.length} video{clips.length > 1 ? 's' : ''} · {formatDuration(clips.reduce((n, c) => n + (c.durationMs || 0), 0))}
              </p>
              <p style={{ margin: '10px 0 0', fontWeight: 700, color: placed.length ? '#166534' : '#B45309' }}>
                {placed.length} of {plays.length} play{plays.length > 1 ? 's are' : ' is'} in your videos
              </p>
              {reason === 'later' && !finding && (
                <div style={styles.lineUpBox}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Statted from the video later?</p>
                  <p style={{ ...styles.muted, fontSize: 13 }}>
                    These stats were logged after the videos were filmed, so their times don't match
                    the video. Find one play in the video and Loggerhead lines up the rest.
                  </p>
                  <button type="button" className="primary-button" style={{ marginTop: 10 }}
                    onClick={() => setFinding({ play: plays[0], clipId: null, startSec: 0 })}>
                    Line up the first play
                  </button>
                </div>
              )}
              {reason === 'earlier' && !finding && (
                <p style={styles.warn}>
                  These videos were filmed after the match was logged. Check you picked the videos
                  from this match, or <button type="button" style={styles.inlineLink}
                    onClick={() => setFinding({ play: plays[0], clipId: null, startSec: 0 })}>line up a play by hand</button>.
                </p>
              )}
              {reason === 'gaps' && !finding && (
                <p style={styles.warn}>
                  The plays fall in gaps between your clips. Try the timing slider, pick more of this
                  match's videos, or <button type="button" style={styles.inlineLink}
                    onClick={() => setFinding({ play: plays[0], clipId: null, startSec: 0 })}>line up a play by hand</button>.
                </p>
              )}
              {placed.length === 0 && anchors.length > 0 && !finding && (
                <p style={styles.warn}>None of the plays land inside your videos with that line-up. Try lining up the play again.</p>
              )}
              {placed.length > 0 && missed.length > 0 && (
                <p style={styles.muted}>The other {missed.length} happened while no video was recording.</p>
              )}
              {undated > 0 && (
                <p style={styles.warn}>
                  {undated} video{undated > 1 ? "s don't" : " doesn't"} say when {undated > 1 ? 'they were' : 'it was'} filmed, so {undated > 1 ? "they can't" : "it can't"} be matched to plays.
                </p>
              )}

              {finding ? (
                <FindPlay
                  play={finding.play}
                  clips={clips}
                  initialClipId={finding.clipId}
                  initialSec={finding.startSec}
                  onDone={lineUp}
                  onCancel={() => setFinding(null)}
                />
              ) : (
                <>
                  <p style={{ ...styles.muted, marginTop: 14, fontWeight: 700 }}>
                    Timing: {offsetSec === 0 ? (anchors.length ? 'lined up by hand' : 'as recorded') : `${Math.abs(offsetSec)}s ${offsetSec > 0 ? 'later' : 'earlier'}`}
                  </p>
                  <input type="range" min={-60} max={60} step={1} value={offsetSec}
                    onChange={(e) => setOffsetSec(Number(e.target.value))} style={{ width: '100%' }} />
                  <p style={styles.muted}>
                    If the plays start too early or late (for example, one phone filmed and another
                    logged stats), slide until the preview shows the play.
                  </p>
                  {anchors.length > 0 && (
                    <p style={styles.muted}>
                      {anchors.length} play{anchors.length > 1 ? 's' : ''} lined up by hand.{' '}
                      <button type="button" style={styles.inlineLink} onClick={() => { setAnchors([]); setPreviewIndex(0); }}>
                        Undo line-up
                      </button>
                    </p>
                  )}
                </>
              )}

              {preview && !finding && (
                <div style={{ marginTop: 10 }}>
                  <ReelPreview segment={preview} />
                  <div style={{ ...styles.row, alignItems: 'center', justifyContent: 'space-between' }}>
                    <button type="button" style={styles.icon} disabled={previewIndex <= 0}
                      onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}>‹</button>
                    <span style={{ fontSize: 13, textAlign: 'center' }}>
                      Play {Math.min(previewIndex, placed.length - 1) + 1} of {placed.length}: {preview.play.what}
                      {preview.play.when ? ` · ${preview.play.when}` : ''}
                    </span>
                    <button type="button" style={styles.icon} disabled={previewIndex >= placed.length - 1}
                      onClick={() => setPreviewIndex((i) => Math.min(placed.length - 1, i + 1))}>›</button>
                  </div>
                  <p style={{ ...styles.muted, textAlign: 'center' }}>
                    Wrong moment?{' '}
                    <button type="button" style={styles.inlineLink} onClick={fixPreviewPlay}>Fix this play</button>
                    {' '}— plays after it move too (handy if the stats were paused or rewound).
                  </p>
                </div>
              )}

              {making ? (
                <MakingProgress progress={progress} label="Making the reel" />
              ) : (
                <button type="button" className="primary-button" onClick={makeReel}
                  disabled={!placed.length || picker.loading} style={{ marginTop: 14 }}>
                  🎬 Make reel ({placed.length} play{placed.length === 1 ? '' : 's'})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {msg && <p style={{ ...styles.muted, marginTop: 12 }}>{msg}</p>}
    </>
  );
}

const formatClock = (ms) =>
  new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// Line up one play by hand: pick the video it's in, move to the moment it happens, confirm.
function FindPlay({ play, clips, initialClipId, initialSec, onDone, onCancel }) {
  const usable = clips.filter((c) => c.createdAt && c.durationMs).sort((a, b) => a.createdAt - b.createdAt);
  const [clipId, setClipId] = useState(
    usable.some((c) => c.id === initialClipId) ? initialClipId : usable[0]?.id,
  );
  const ref = useRef(null);
  const clip = usable.find((c) => c.id === clipId);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    const seek = () => {
      if (clipId === initialClipId && initialSec) video.currentTime = initialSec;
    };
    if (video.readyState >= 1) seek();
    video.addEventListener('loadedmetadata', seek);
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [clipId, initialClipId, initialSec]);

  const nudge = (seconds) => {
    const video = ref.current;
    if (video) video.currentTime = Math.max(0, video.currentTime + seconds);
  };

  if (!clip) {
    return <p style={styles.warn}>None of your videos say when they were filmed, so plays can't be lined up.</p>;
  }

  return (
    <div style={styles.lineUpBox}>
      <p style={{ margin: 0, fontWeight: 700 }}>
        Find this play: {play.what} · {play.who}{play.when ? ` · ${play.when}` : ''}
      </p>
      <p style={{ ...styles.muted, fontSize: 13 }}>
        Pick the video it's in, then play or drag to the moment the ball is hit (or served, or
        blocked) and tap "The play is here".
      </p>
      {usable.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 0' }}>
          {usable.map((c, i) => (
            <button key={c.id} type="button" onClick={() => setClipId(c.id)}
              style={{ ...styles.chip, flexShrink: 0, textAlign: 'left', ...(c.id === clipId ? styles.chipOn : null) }}>
              Video {i + 1}
              <div style={{ fontSize: 11, fontWeight: 400 }}>{formatClock(c.createdAt)} · {formatDuration(c.durationMs)}</div>
            </button>
          ))}
        </div>
      )}
      <video
        key={clip.id}
        ref={ref}
        src={Capacitor.convertFileSrc(clip.id)}
        controls
        playsInline
        style={{ width: '100%', borderRadius: 10, background: '#000', marginTop: 6 }}
      />
      <div style={{ ...styles.row, justifyContent: 'center' }}>
        <button type="button" style={{ ...styles.icon, width: 56 }} onClick={() => nudge(-1)}>−1s</button>
        <button type="button" style={{ ...styles.icon, width: 56 }} onClick={() => nudge(-0.25)}>−¼s</button>
        <button type="button" style={{ ...styles.icon, width: 56 }} onClick={() => nudge(0.25)}>+¼s</button>
        <button type="button" style={{ ...styles.icon, width: 56 }} onClick={() => nudge(1)}>+1s</button>
      </div>
      <button type="button" className="primary-button" style={{ marginTop: 12 }}
        onClick={() => onDone(clip, (ref.current?.currentTime || 0) * 1000)}>
        ✓ The play is here
      </button>
      <button type="button" style={styles.link} onClick={onCancel}>Cancel</button>
    </div>
  );
}

// Plays one play's stretch of the video on a loop, muted, to check the timing.
function ReelPreview({ segment }) {
  const ref = useRef(null);
  const start = segment.startMs / 1000;
  const end = segment.endMs / 1000;

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    const seek = () => {
      video.currentTime = start;
      video.play().catch(() => {});
    };
    const loop = () => {
      if (video.currentTime >= end) video.currentTime = start;
    };
    if (video.readyState >= 1) seek();
    video.addEventListener('loadedmetadata', seek);
    video.addEventListener('timeupdate', loop);
    return () => {
      video.removeEventListener('loadedmetadata', seek);
      video.removeEventListener('timeupdate', loop);
    };
  }, [segment.id, start, end]);

  return (
    <video
      ref={ref}
      src={Capacitor.convertFileSrc(segment.id)}
      muted
      playsInline
      controls
      style={{ width: '100%', borderRadius: 10, background: '#000' }}
    />
  );
}
