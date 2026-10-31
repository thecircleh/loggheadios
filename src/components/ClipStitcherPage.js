import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { ClipStitcher } from 'loggerhead-clip-stitcher';
import { useAuth } from './AuthContext';

// Stitch Game Clips: parents film only the rallies (or only when their player is in), then
// join the clips back into one game video here. Everything happens on the phone.
// Premium only. There's no server call to guard, so this page check is the whole lock.
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const isAndroid = () => window.Capacitor?.getPlatform?.() === 'android';
const cloudName = () => (isAndroid() ? 'Google Photos' : 'iCloud');
const galleryName = () => (isAndroid() ? 'Google Photos' : 'Photos');

const formatDuration = (ms) => {
  const total = Math.round((ms || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

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
  const [clips, setClips] = useState([]);
  const [sorted, setSorted] = useState(true); // false once the user reorders by hand
  const [loading, setLoading] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  // While picked clips load: { done, total, fraction }. Clips in iCloud / Google Photos
  // download first, which can take minutes on cellular, so show it's still working.
  const [pick, setPick] = useState(null);
  const [pickStartedAt, setPickStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const listenerRef = useRef(null);
  const pickListenerRef = useRef(null);

  useEffect(() => () => {
    listenerRef.current?.remove?.();
    pickListenerRef.current?.remove?.();
  }, []);

  // Tick once a second while clips load, so the elapsed time shows the app isn't frozen.
  const pickActive = loading && !!pick?.total;
  useEffect(() => {
    if (!pickActive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pickActive]);

  if (!isNative()) {
    return (
      <div style={styles.page}>
        <h2 style={styles.h2}>🎬 Stitch Game Clips</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Joining clips works in the Loggerhead app for iPhone and Android, where your videos are.
            Open the app and find it under Profile → Stitch Game Clips.
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
            filmed them, right on your phone. Save it to Photos or share it with family.
          </p>
          <button type="button" className="primary-button" style={{ marginTop: 14 }}
            onClick={() => navigate('/profile?section=subscription')}>
            Go Premium to stitch your clips →
          </button>
        </div>
      </div>
    );
  }

  const addClips = async () => {
    setMsg('');
    setPick(null);
    setLoading(true);
    try {
      // The first event arrives when the picker closes; time loading from there.
      let started = false;
      pickListenerRef.current = await ClipStitcher.addListener('pickProgress', (p) => {
        if (!started) {
          started = true;
          setPickStartedAt(Date.now());
          setNow(Date.now());
        }
        setPick(p);
      });
      const { clips: picked = [], failed = 0, cancelled = false } = await ClipStitcher.pickVideos();
      if (cancelled) {
        setMsg(picked.length
          ? `Stopped. Kept the ${picked.length} clip${picked.length > 1 ? 's' : ''} that finished loading.`
          : 'Stopped loading clips.');
      } else if (failed) {
        setMsg(`${failed} clip${failed > 1 ? 's' : ''} couldn't be loaded. If they're in ${cloudName()}, open them in your ${galleryName()} app so they download, then try again.`);
      }
      if (picked.length) {
        setResult(null);
        setClips((prev) => {
          const known = new Set(prev.map((c) => c.id));
          const merged = [...prev, ...picked.filter((c) => !known.has(c.id))];
          return sorted ? sortByFilmed(merged) : merged;
        });
      }
    } catch (err) {
      setMsg(err?.message || "Couldn't open your videos.");
    } finally {
      pickListenerRef.current?.remove?.();
      pickListenerRef.current = null;
      setPick(null);
      setLoading(false);
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

  const save = async () => {
    setMsg('');
    try {
      await ClipStitcher.saveToGallery({ path: result.path });
      setMsg(isAndroid() ? 'Saved to your gallery (Movies › Loggerhead).' : 'Saved to Photos.');
    } catch (err) {
      setMsg(err?.message || "Couldn't save the video.");
    }
  };

  const share = async () => {
    try {
      await Share.share({ title: 'Game video', url: result.uri });
    } catch {
      // closing the share sheet rejects; nothing to do
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
    <div style={styles.page}>
      <h2 style={styles.h2}>🎬 Stitch Game Clips</h2>
      <p style={styles.lead}>
        Filmed the game in pieces? Pick the clips and Loggerhead joins them into one video, in the
        order you filmed them.
      </p>

      {result ? (
        <div className="card">
          <p className="card-title" style={{ marginTop: 0 }}>✅ Your game video is ready</p>
          <video
            src={Capacitor.convertFileSrc(result.uri)}
            controls
            playsInline
            style={{ width: '100%', borderRadius: 10, background: '#000' }}
          />
          <p style={styles.muted}>{formatDuration(result.durationMs)} · {clips.length} clips</p>
          <div style={styles.row}>
            <button type="button" className="primary-button" onClick={save} style={styles.btn}>
              {isAndroid() ? 'Save to gallery' : 'Save to Photos'}
            </button>
            <button type="button" className="primary-button" onClick={share} style={{ ...styles.btn, background: '#2563eb' }}>
              Share
            </button>
          </div>
          <button type="button" onClick={() => setResult(null)} style={styles.link}>← Change clips</button>
          <button type="button" onClick={startOver} style={{ ...styles.link, marginLeft: 16 }}>Start over</button>
        </div>
      ) : (
        <>
          {pickActive ? (
            <div className="card">
              <p style={{ margin: 0, fontWeight: 700 }}>
                {pick.done >= pick.total
                  ? `Preparing ${pick.total} clip${pick.total > 1 ? 's' : ''}…`
                  : `Getting clip ${pick.done + 1} of ${pick.total}…`}
                <span style={{ ...styles.muted, marginLeft: 8, fontWeight: 400 }}>
                  {formatDuration(now - pickStartedAt)}
                </span>
              </p>
              <div style={{ ...styles.barTrack, marginTop: 10 }}>
                <div style={{ ...styles.barFill, width: `${Math.round(Math.max(pick.fraction || 0, pick.done / pick.total) * 100)}%` }} />
              </div>
              <p style={styles.muted}>
                Clips saved in {cloudName()} download to your phone first. On cellular that can take a
                few minutes, longer for long clips. Wi-Fi is much faster. Keep Loggerhead open; it's
                still working.
              </p>
              <button type="button" onClick={() => ClipStitcher.cancel()} style={styles.link}>Cancel</button>
            </div>
          ) : (
            <>
              <button type="button" className="primary-button" onClick={addClips} disabled={loading || stitching}>
                {loading ? 'Loading clips…' : clips.length ? '+ Add more clips' : 'Choose clips'}
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
                <div style={{ marginTop: 14 }}>
                  <div style={styles.barTrack}>
                    <div style={{ ...styles.barFill, width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p style={styles.muted}>Making your video… {Math.round(progress * 100)}% — keep Loggerhead open.</p>
                  <button type="button" onClick={() => ClipStitcher.cancel()} style={styles.link}>Cancel</button>
                </div>
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
    </div>
  );
}

const styles = {
  page: {
    padding: 'max(env(safe-area-inset-top), 16px) 16px calc(90px + env(safe-area-inset-bottom))',
    maxWidth: 560,
    margin: '0 auto',
  },
  h2: { margin: '4px 0 6px' },
  premiumTag: { marginLeft: 6, fontSize: 11, fontWeight: 800, color: '#fff', background: '#7C3AED', borderRadius: 4, padding: '2px 6px', verticalAlign: 'middle' },
  lead: { margin: '0 0 14px', fontSize: 14, color: 'var(--text-muted, #6b7280)' },
  muted: { margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted, #6b7280)' },
  warn: { margin: '8px 0 0', fontSize: 12, color: '#B45309' },
  row: { display: 'flex', gap: 10, marginTop: 10 },
  btn: { flex: 1, width: 'auto' },
  link: { background: 'none', border: 'none', padding: 0, marginTop: 12, color: 'var(--blue, #2563eb)', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  clip: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border, #e5e7eb)' },
  thumb: { width: 64, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 },
  icon: { width: 32, height: 32, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, background: 'transparent', fontSize: 16, fontWeight: 700, flexShrink: 0, cursor: 'pointer' },
  gap: { fontSize: 11, color: 'var(--text-muted, #9ca3af)', textAlign: 'center', padding: '2px 0' },
  barTrack: { height: 8, borderRadius: 4, background: 'var(--border, #e5e7eb)', overflow: 'hidden' },
  barFill: { height: '100%', background: '#34C759', transition: 'width 0.3s' },
};
