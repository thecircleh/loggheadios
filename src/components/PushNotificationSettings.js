import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  isPushSupported, getPushPermission, isPushEnabledHere, enablePush, disablePush,
  getPushPrefs, savePushPrefs, sendTestPush,
} from '../utils/pushNotifications';

// Profile card: opt in to push notifications on this device, then choose which kinds.
// Native apps only — renders nothing on the web.
export default function PushNotificationSettings() {
  const { token, hasPremium } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('prompt');
  const [prefs, setPrefs] = useState({ matchSummaries: true, dailyGame: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!isPushSupported() || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const [on, perm, p] = await Promise.all([isPushEnabledHere(), getPushPermission(), getPushPrefs(token)]);
        if (cancelled) return;
        setEnabled(on);
        setPermission(perm);
        setPrefs(p);
      } catch (err) {
        console.warn('Notification settings load failed:', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (!isPushSupported()) return null;

  const toggleMaster = async () => {
    setBusy(true);
    setMsg('');
    try {
      if (enabled) {
        await disablePush(token);
        setEnabled(false);
        setMsg('Notifications off on this device.');
      } else {
        const result = await enablePush(token);
        setPermission(result);
        if (result === 'granted') {
          setEnabled(true);
          setMsg('Notifications on. Choose what you want below.');
        } else if (result === 'denied') {
          setMsg('Notifications are blocked for Loggerhead. Turn them on in your phone\'s Settings → Loggerhead → Notifications, then try again.');
        }
      }
    } catch (err) {
      setMsg(err?.message || 'Something went wrong turning notifications on. Please try again.');
      console.warn('Push toggle failed:', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const togglePref = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      setPrefs(await savePushPrefs(token, { [key]: next[key] }));
    } catch {
      setPrefs(prefs);
      setMsg('Couldn\'t save that setting. Please try again.');
    }
  };

  const test = async () => {
    setMsg('');
    try {
      await sendTestPush(token);
      setMsg('Test sent — it should arrive in a few seconds.');
    } catch (err) {
      setMsg(err?.response?.data?.message || 'Couldn\'t send a test notification.');
    }
  };

  const row = (key, title, desc, note) => (
    <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border, #e5e7eb)', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!prefs[key]} onChange={() => togglePref(key)} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
      <span>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</span>
        {note && <span style={{ display: 'block', fontSize: 11, color: '#B45309', marginTop: 3 }}>{note}</span>}
      </span>
    </label>
  );

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p className="card-title" style={{ margin: 0 }}>🔔 Notifications</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {enabled ? 'On for this device' : permission === 'denied' ? 'Blocked in your phone\'s settings' : 'Off — nothing is sent until you turn this on'}
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={toggleMaster}
          disabled={busy}
          style={{ width: 'auto', padding: '8px 14px', fontSize: 13, flexShrink: 0, background: enabled ? '#6b7280' : undefined }}
        >
          {busy ? '…' : enabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      {enabled && (
        <div style={{ marginTop: 12 }}>
          {row('matchSummaries', '🏐 Match summaries',
            'When a match your claimed player is in ends: who won and their stats.',
            hasPremium ? null : 'Claimed players are a Premium feature.')}
          {row('dailyGame', '🎰 Today\'s free Brain Break game',
            'One reminder at 9 AM with the day\'s free game.')}
          <button type="button" onClick={test} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, color: 'var(--blue, #2563eb)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Send a test notification
          </button>
        </div>
      )}

      {msg && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{msg}</p>}
    </div>
  );
}
