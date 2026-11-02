import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipStitcher } from 'loggerhead-clip-stitcher';
import { useAuth } from './AuthContext';
import HighlightReel from './HighlightReel';
import {
  useClipPicker, pickMessage, PickProgress, MakingProgress, VideoResult, cloudName, formatDuration, styles,
} from './clipStitcherShared';

// Stitch Game Clips: parents film only the rallies (or only when their player is in), then
// join the clips back into one game video here. The Highlight reel tab cuts one player's big
// plays out of the match video using the times logged in Stat Book. Everything happens on
// the phone. Premium only. There's no server call to guard, so this page check is the lock.
const isNative = () => !!window.Capacitor?.isNativePlatform?.();

const formatTime = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

const formatGap = (ms) => {
  if (ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s later`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min later`;
  return `${Math.floor(m / 60)} hr ${m % 60} min later`;
};

// Filmed-time order. Clips with no recorded time keep their place relative to each other, last.
const sortByFilmed = (list) => {
  const timed = list.filter((c) => c.createdAt).sort((a, b) => a.createdAt - b.createdAt);
  return [...timed, ...list.filter((c) => !c.createdAt)];
};

export default function ClipStitcherPage() {
  const navigate = useNavigate();
  const { isSubscriber } = useAuth();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'reel' ? 'reel' : 'stitch';

  if (!isNative()) {
    return (
      <div style={styles.page}>
        <h2 style={styles.h2}>🎬 Stitch Game Clips</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Joining clips and making highlight reels works in the Loggerhead app for iPhone and
            Android, where your videos are. Open the app and find it under Profile → Stitch Game Clips.
          </p>
        </div>
      </div>
    );
  }

  if (!isSubscriber) {
    return (
      <div style={styles.page}>
        <h2 style={styles.h2}>🎬 Stitch Game Clips <span style={styles.premiumTag}>Premium</span></h2>
        <div className="card">
          <p style={{ margin: 0, fontWeight: 700 }}>Filmed only the rallies, or only when your player was in?</p>
          <p style={{ ...styles.lead, margin: '8px 0 0' }}>
            Pick the clips and Loggerhead joins them back into one game video, in the order you
            filmed them, right on your phone. Logged the match in Stat Book? Make a highlight reel
            of your player's kills, aces and blocks too.
          </p>
          <button type="button" className="primary-button" style={{ marginTop: 14 }}
            onClick={() => navigate('/profile?section=subscription')}>
            Go Premium to stitch your clips →
          </button>
        </div>
      </div>
    );
  }

  const setMode = (next) => setParams(next === 'reel' ? { mode: 'reel' } : {}, { replace: true });

  return (
    <div style={styles.page}>
      <h2 style={styles.h2}>🎬 {mode === 'reel' ? 'Highlight Reel' : 'Stitch Game Clips'}</h2>
      <div style={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'stitch'} onClick={() => setMode('stitch')}
          style={{ ...styles.tab, ...(mode === 'stitch' ? styles.tabOn : null) }}>
          Stitch clips
        </button>
        <button type="button" role="tab" aria-selected={mode === 'reel'} onClick={() => setMode('reel')}
          style={{ ...styles.tab, ...(mode === 'reel' ? styles.tabOn : null) }}>
          Highlight reel
        </button>
      </div>
      {/* Both stay mounted so switching tabs doesn't lose picked clips. */}
      <div style={{ display: mode === 'stitch' ? 'block' : 'none' }}><StitchClips /></div>
      <div style={{ display: mode === 'reel' ? 'block' : 'none' }}><HighlightReel /></div>
    </div>
  );
}

function StitchClips() {
  const [clips, setClips] = useState([]);
  const [sorted, setSorted] = useState(true); // false once the user reorders by hand
  const [stitching, setStitching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const picker = useClipPicker();
  const listenerRef = useRef(null);

  useEffect(() => () => listenerRef.current?.remove?.(), []);

  const addClips = async () => {
    setMsg('');
    try {
      const res = await picker.pickClips();
      setMsg(pickMessage(res));
      if (res.clips.length) {
        setResult(null);
        setClips((prev) => {
          const known = new Set(prev.map((c) => c.id));
          const merged = [...prev, ...res.clips.filter((c) => !known.has(c.id))];
          return sorted ? sortByFilmed(merged) : merged;
        });
      }
    } catch (err) {
      setMsg(err?.message || "Couldn't open your videos.");
    }
  };

  const move = (index, delta) => {
    const next = [...clips];
    const [clip] = next.splice(index, 1);
    next.splice(index + delta, 0, clip);
    setClips(next);
    setSorted(false);
    setResult(null);
  };

  const remove = (index) => {
    setClips(clips.filter((_, i) => i !== index));
    setResult(null);
  };

  const resort = () => {
    setClips(sortByFilmed(clips));
    setSorted(true);
    setResult(null);
  };

  const stitch = async () => {
    setMsg('');
    setResult(null);
    setProgress(0);
    setStitching(true);
    try {
      listenerRef.current = await ClipStitcher.addListener('progress', ({ progress: p }) => setProgress(p || 0));
      const res = await ClipStitcher.stitch({ ids: clips.map((c) => c.id) });
      setResult(res);
    } catch (err) {
      if (err?.code !== 'CANCELLED') setMsg(err?.message || "Couldn't make the video.");
    } finally {
      listenerRef.current?.remove?.();
      listenerRef.current = null;
      setStitching(false);
    }
  };

  const startOver = async () => {
    try { await ClipStitcher.clear(); } catch {}
    setClips([]);
    setResult(null);
    setSorted(true);
    setMsg('');
  };

  const totalMs = clips.reduce((sum, c) => sum + (c.durationMs || 0), 0);
  const undated = clips.filter((c) => !c.createdAt).length;
  const sizes = new Set(clips.filter((c) => c.width && c.height).map((c) => `${c.width}x${c.height}`));

  return (
    <>
      <p style={styles.lead}>
        Filmed the game in pieces? Pick the clips and Loggerhead joins them into one video, in the
        order you filmed them.
      </p>

      {result ? (
        <VideoResult
          title="Your game video"
          result={result}
          detail={`${clips.length} clips`}
          onBack={() => setResult(null)}
          backLabel="← Change clips"
          onStartOver={startOver}
        />
      ) : (
        <>
          {picker.active ? (
            <PickProgress pick={picker.pick} elapsedMs={picker.elapsedMs} />
          ) : (
            <>
              <button type="button" className="primary-button" onClick={addClips} disabled={picker.loading || stitching}>
                {picker.loading ? 'Loading clips…' : clips.length ? '+ Add more clips' : 'Choose clips'}
              </button>
              {!clips.length && (
                <p style={styles.muted}>
                  Tip: clips saved in {cloudName()} have to download first. Use Wi-Fi if you can,
                  since cellular can be slow.
                </p>
              )}
            </>
          )}

          {clips.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ ...styles.row, justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>{clips.length} clip{clips.length > 1 ? 's' : ''} · {formatDuration(totalMs)}</span>
                {sorted ? (
                  <span style={styles.muted}>In filmed order</span>
                ) : (
                  <button type="button" onClick={resort} style={styles.link}>Sort by time filmed</button>
                )}
              </div>
              {undated > 0 && (
                <p style={styles.warn}>
                  {undated} clip{undated > 1 ? "s don't" : " doesn't"} say when {undated > 1 ? 'they were' : 'it was'} filmed, so {undated > 1 ? "they're" : "it's"} at the end. Use the arrows to move {undated > 1 ? 'them' : 'it'}.
                </p>
              )}

              {clips.map((clip, i) => {
                const prev = clips[i - 1];
                const gap = prev?.createdAt && clip.createdAt
                  ? formatGap(clip.createdAt - (prev.createdAt + (prev.durationMs || 0)))
                  : null;
                return (
                  <div key={clip.id}>
                    {gap && <div style={styles.gap}>{gap}</div>}
                    <div style={styles.clip}>
                      {clip.thumbnail
                        ? <img src={clip.thumbnail} alt="" style={styles.thumb} />
                        : <div style={{ ...styles.thumb, background: '#e5e7eb' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Clip {i + 1} · {formatDuration(clip.durationMs)}</div>
                        <div style={styles.muted}>{clip.createdAt ? formatTime(clip.createdAt) : 'Time unknown'}</div>
                      </div>
                      <button type="button" aria-label="Move up" disabled={i === 0 || stitching} onClick={() => move(i, -1)} style={styles.icon}>↑</button>
                      <button type="button" aria-label="Move down" disabled={i === clips.length - 1 || stitching} onClick={() => move(i, 1)} style={styles.icon}>↓</button>
                      <button type="button" aria-label="Remove clip" disabled={stitching} onClick={() => remove(i)} style={{ ...styles.icon, color: '#dc2626' }}>×</button>
                    </div>
                  </div>
                );
              })}

              {sizes.size > 1 && (
                <p style={styles.muted}>
                  These clips have different sizes or orientations, so joining them takes a little longer.
                </p>
              )}

              {stitching ? (
                <MakingProgress progress={progress} label="Making your video" />
              ) : (
                <button type="button" className="primary-button" onClick={stitch} style={{ marginTop: 14 }}>
                  🎬 Stitch {clips.length} clip{clips.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {msg && <p style={{ ...styles.muted, marginTop: 12 }}>{msg}</p>}
    </>
  );
}
