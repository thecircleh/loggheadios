import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { ClipStitcher } from 'loggerhead-clip-stitcher';

// Pieces shared by Stitch Game Clips and the player highlight reel.

export const isAndroid = () => window.Capacitor?.getPlatform?.() === 'android';
export const cloudName = () => (isAndroid() ? 'Google Photos' : 'iCloud');
export const galleryName = () => (isAndroid() ? 'Google Photos' : 'Photos');

export const formatDuration = (ms) => {
  const total = Math.round((ms || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// Opens the video picker and reports loading progress. Clips in iCloud / Google Photos
// download first, which can take minutes on cellular, so the page shows it's still working.
export function useClipPicker() {
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null); // { done, total, fraction } while clips load
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const listenerRef = useRef(null);

  useEffect(() => () => listenerRef.current?.remove?.(), []);

  const active = loading && !!pick?.total;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Resolves to { clips, failed, cancelled }; throws if the picker couldn't open.
  const pickClips = async () => {
    setPick(null);
    setLoading(true);
    try {
      // The first event arrives when the picker closes; time loading from there.
      let started = false;
      listenerRef.current = await ClipStitcher.addListener('pickProgress', (p) => {
        if (!started) {
          started = true;
          setStartedAt(Date.now());
          setNow(Date.now());
        }
        setPick(p);
      });
      const { clips = [], failed = 0, cancelled = false } = await ClipStitcher.pickVideos();
      return { clips, failed, cancelled };
    } finally {
      listenerRef.current?.remove?.();
      listenerRef.current = null;
      setPick(null);
      setLoading(false);
    }
  };

  return { pickClips, loading, active, pick, elapsedMs: now - startedAt };
}

// The message to show after picking, or '' if all went well.
export const pickMessage = ({ clips, failed, cancelled }) => {
  if (cancelled) {
    return clips.length
      ? `Stopped. Kept the ${clips.length} clip${clips.length > 1 ? 's' : ''} that finished loading.`
      : 'Stopped loading clips.';
  }
  if (failed) {
    return `${failed} clip${failed > 1 ? 's' : ''} couldn't be loaded. If they're in ${cloudName()}, open them in your ${galleryName()} app so they download, then try again.`;
  }
  return '';
};

export function PickProgress({ pick, elapsedMs }) {
  return (
    <div className="card">
      <p style={{ margin: 0, fontWeight: 700 }}>
        {pick.done >= pick.total
          ? `Preparing ${pick.total} clip${pick.total > 1 ? 's' : ''}…`
          : `Getting clip ${pick.done + 1} of ${pick.total}…`}
        <span style={{ ...styles.muted, marginLeft: 8, fontWeight: 400 }}>{formatDuration(elapsedMs)}</span>
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
  );
}

export function MakingProgress({ progress, label }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p style={styles.muted}>{label}… {Math.round(progress * 100)}% — keep Loggerhead open.</p>
      <button type="button" onClick={() => ClipStitcher.cancel()} style={styles.link}>Cancel</button>
    </div>
  );
}

// Finished video: preview, Save and Share. Saving shows clearly that it worked.
export function VideoResult({ title, result, detail, onBack, backLabel, onStartOver }) {
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setSaveState('idle');
    setSaveError('');
  }, [result?.path]);

  const save = async () => {
    setSaveState('saving');
    setSaveError('');
    try {
      await ClipStitcher.saveToGallery({ path: result.path });
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err?.message || "Couldn't save the video.");
    }
  };

  const share = async () => {
    try {
      await Share.share({ title, url: result.uri });
    } catch {
      // closing the share sheet rejects; nothing to do
    }
  };

  const saveLabel = {
    idle: isAndroid() ? 'Save to gallery' : 'Save to Photos',
    saving: 'Saving…',
    saved: '✓ Saved',
    error: 'Try saving again',
  }[saveState];

  return (
    <div className="card">
      <p className="card-title" style={{ marginTop: 0 }}>✅ {title} is ready</p>
      <video
        src={Capacitor.convertFileSrc(result.uri)}
        controls
        playsInline
        style={{ width: '100%', borderRadius: 10, background: '#000' }}
      />
      <p style={styles.muted}>{formatDuration(result.durationMs)}{detail ? ` · ${detail}` : ''}</p>
      <div style={styles.row}>
        <button
          type="button"
          className="primary-button"
          onClick={save}
          disabled={saveState === 'saving' || saveState === 'saved'}
          style={{ ...styles.btn, ...(saveState === 'saved' ? styles.savedBtn : null) }}
        >
          {saveLabel}
        </button>
        <button type="button" className="primary-button" onClick={share} style={{ ...styles.btn, background: '#2563eb' }}>
          Share
        </button>
      </div>
      {saveState === 'saved' && (
        <div role="status" style={styles.savedNote}>
          ✅ Saved! Find it in {isAndroid() ? 'Google Photos, or Files › Movies › Loggerhead' : 'the Photos app, under Recents'}.
        </div>
      )}
      {saveState === 'error' && <div role="alert" style={styles.errorNote}>{saveError}</div>}
      {onBack && <button type="button" onClick={onBack} style={styles.link}>{backLabel}</button>}
      {onStartOver && <button type="button" onClick={onStartOver} style={{ ...styles.link, marginLeft: 16 }}>Start over</button>}
    </div>
  );
}

export const styles = {
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
  savedBtn: { background: '#16a34a', opacity: 1 },
  savedNote: { marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontSize: 14, fontWeight: 700 },
  errorNote: { marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: 13, fontWeight: 600 },
  link: { background: 'none', border: 'none', padding: 0, marginTop: 12, color: 'var(--blue, #2563eb)', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  clip: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border, #e5e7eb)' },
  thumb: { width: 64, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 },
  icon: { width: 32, height: 32, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, background: 'transparent', fontSize: 16, fontWeight: 700, flexShrink: 0, cursor: 'pointer' },
  gap: { fontSize: 11, color: 'var(--text-muted, #9ca3af)', textAlign: 'center', padding: '2px 0' },
  barTrack: { height: 8, borderRadius: 4, background: 'var(--border, #e5e7eb)', overflow: 'hidden' },
  barFill: { height: '100%', background: '#34C759', transition: 'width 0.3s' },
  tabs: { display: 'flex', gap: 6, background: 'var(--border, #e5e7eb)', borderRadius: 10, padding: 4, margin: '0 0 14px' },
  tab: { flex: 1, border: 'none', borderRadius: 8, padding: '8px 6px', fontWeight: 700, fontSize: 14, background: 'transparent', cursor: 'pointer', color: 'inherit' },
  tabOn: { background: 'var(--card-bg, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
  chip: { border: '1px solid var(--border, #d1d5db)', borderRadius: 20, padding: '7px 12px', fontSize: 13, fontWeight: 600, background: 'transparent', cursor: 'pointer', color: 'inherit' },
  chipOn: { background: '#7C3AED', borderColor: '#7C3AED', color: '#fff' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  listItem: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 0', border: 'none', borderTop: '1px solid var(--border, #e5e7eb)', background: 'transparent', cursor: 'pointer', color: 'inherit' },
  stepTitle: { margin: '0 0 4px', fontWeight: 800, fontSize: 15 },
  lineUpBox: { marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid #c4b5fd', background: 'rgba(124,58,237,0.06)' },
  inlineLink: { background: 'none', border: 'none', padding: 0, color: 'var(--blue, #2563eb)', fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline' },
};
