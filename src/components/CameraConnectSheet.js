import React, { useEffect, useState } from 'react';
import { createCameraLink, cameraLinkStatus, stopCameraLink, savedCameraCode } from '../utils/cameraLink';

// Logging phone: "Connect a Camera" (from the Log menu). Shows a code to type into the
// filming phone (Log › Film a Match) and whether a camera is connected.
export default function CameraConnectSheet({ token, matchId, matchLabel }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(null);
  const [watchers, setWatchers] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('lh-camera-connect', show);
    return () => window.removeEventListener('lh-camera-connect', show);
  }, []);

  // Make (or reuse) the code when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setError('');
    if (!matchId) {
      setCode(null);
      return;
    }
    setLoading(true);
    createCameraLink(token, matchId)
      .then((data) => {
        setCode(data.code);
        setWatchers(data.watchers || 0);
      })
      .catch((err) => setError(err?.response?.data?.message || "Couldn't make a camera code. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [open, token, matchId]);

  // Check every few seconds whether the camera has connected.
  useEffect(() => {
    if (!open || !code) return undefined;
    const check = () => cameraLinkStatus(token, code).then((s) => setWatchers(s.watchers || 0)).catch(() => {});
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [open, code, token]);

  if (!open) return null;

  const stop = async () => {
    await stopCameraLink(token, matchId);
    setCode(null);
    setOpen(false);
  };

  return (
    <div role="dialog" aria-label="Connect a camera" style={s.overlay} onClick={() => setOpen(false)}>
      <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🎥 Connect a camera</h3>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={s.close}>×</button>
        </div>

        {!matchId ? (
          <p style={s.text}>Start or resume a match first, then connect a camera to it.</p>
        ) : loading ? (
          <p style={s.text}>Making a code…</p>
        ) : error ? (
          <p style={{ ...s.text, color: '#b91c1c' }}>{error}</p>
        ) : (
          <>
            {matchLabel && <p style={{ ...s.text, marginBottom: 0 }}>{matchLabel}</p>}
            <p style={s.text}>
              On the phone that's filming, open <strong>Log › Film a Match</strong> and enter this code:
            </p>
            <div style={s.code} aria-label={`Camera code ${code?.split('').join(' ')}`}>{code}</div>
            <p style={{ ...s.status, color: watchers ? '#166534' : '#92400e', background: watchers ? '#dcfce7' : '#fef3c7' }}>
              {watchers
                ? `✅ Camera connected${watchers > 1 ? ` (${watchers})` : ''}. Every point you log shows on their screen.`
                : '⏳ Waiting for the camera to connect…'}
            </p>
            <p style={{ ...s.text, fontSize: 12 }}>
              Keep logging as usual. The filming phone records the game with your live score and
              marks every rally, so highlight reels line up exactly. The code works for 12 hours.
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="primary-button" style={{ flex: 1 }} onClick={() => setOpen(false)}>Done</button>
          {code && savedCameraCode(matchId) && (
            <button type="button" className="primary-button" style={{ flex: 1, background: '#6b7280' }} onClick={stop}>
              Stop sharing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: {
    background: 'var(--card-bg, #fff)', color: 'inherit', width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
    borderRadius: '16px 16px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
  },
  close: { background: 'none', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: 'inherit', padding: 0 },
  text: { fontSize: 14, lineHeight: 1.5, margin: '10px 0 0' },
  code: { fontSize: 40, fontWeight: 900, letterSpacing: 8, textAlign: 'center', margin: '12px 0', fontFamily: 'ui-monospace, Menlo, monospace' },
  status: { fontSize: 14, fontWeight: 700, borderRadius: 10, padding: '10px 12px', margin: '6px 0 0' },
};
