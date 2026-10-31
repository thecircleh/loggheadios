import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Android doesn't show a push notification while Loggerhead is open on screen; the app gets it
// silently instead. pushNotifications.js passes those on as an 'lh-push' event, and this shows
// them as a banner at the top. (iPhone shows them itself, so it never sends the event.)
export default function PushBanner() {
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const onPush = (e) => {
      setNote(e.detail);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setNote(null), 6000);
    };
    window.addEventListener('lh-push', onPush);
    return () => {
      window.removeEventListener('lh-push', onPush);
      clearTimeout(timerRef.current);
    };
  }, []);

  if (!note) return null;

  const open = () => {
    setNote(null);
    if (typeof note.url === 'string' && note.url.startsWith('/')) navigate(note.url);
  };

  return (
    <div role="status" onClick={open} style={styles.banner}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {note.title && <div style={styles.title}>{note.title}</div>}
        {note.body && <div style={styles.body}>{note.body}</div>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); setNote(null); }}
        style={styles.close}
      >
        ×
      </button>
    </div>
  );
}

const styles = {
  banner: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top) + 8px)',
    left: 8,
    right: 8,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: '#111827',
    color: '#fff',
    borderRadius: 14,
    padding: '12px 14px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    maxWidth: 560,
    margin: '0 auto',
  },
  title: { fontWeight: 700, fontSize: 14 },
  body: { fontSize: 13, opacity: 0.9, marginTop: 2 },
  close: { background: 'none', border: 'none', color: '#fff', fontSize: 20, lineHeight: 1, padding: 0, cursor: 'pointer' },
};
