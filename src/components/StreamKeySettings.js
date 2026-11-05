import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../utils/getApiUrl';

const API_URL = getApiUrl();

const PLATFORMS = [
  {
    key: 'youtube',
    label: 'YouTube',
    where: 'studio.youtube.com › Create › Go live › Streaming software › copy the Stream key.',
  },
];

// Profile card (Premium): save the YouTube stream key here, on a computer where they're
// easy to copy, and the filming phone uses them when it goes live (Film a Match).
export default function StreamKeySettings() {
  const { token, hasPremium } = useAuth();
  const [saved, setSaved] = useState(null); // { youtube: { last4 } | null }
  const [drafts, setDrafts] = useState({ youtube: '' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});

  useEffect(() => {
    if (!hasPremium || !token) return;
    let cancelled = false;
    axios.get(`${API_URL}/api/camera/stream-keys`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
      .then(({ data }) => { if (!cancelled) setSaved(data); })
      .catch(() => { if (!cancelled) setSaved({ youtube: null }); });
    return () => { cancelled = true; };
  }, [hasPremium, token]);

  if (!hasPremium) return null;

  const save = async (platform, key) => {
    setBusy(platform);
    setMsg((m) => ({ ...m, [platform]: '' }));
    try {
      const { data } = await axios.put(`${API_URL}/api/camera/stream-keys/${platform}`, { key },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      setSaved((s) => ({ ...s, [platform]: data.saved }));
      setDrafts((d) => ({ ...d, [platform]: '' }));
      setMsg((m) => ({ ...m, [platform]: data.saved ? 'Saved. Your phone will use it when you go live.' : 'Removed.' }));
    } catch (err) {
      setMsg((m) => ({ ...m, [platform]: err?.response?.data?.message || "Couldn't save. Try again." }));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ margin: '0 0 4px' }}>🔴 Live streaming</h3>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-muted, #6b7280)' }}>
        Stream keys are long, so paste them here from your computer. When you film a match in the
        Loggerhead app and go live, your phone uses the saved key.
      </p>
      {PLATFORMS.map((p) => {
        const current = saved?.[p.key];
        return (
          <div key={p.key} style={{ padding: '10px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong>{p.label}</strong>
              <span style={{ fontSize: 13, color: current ? '#166534' : 'var(--text-muted, #6b7280)' }}>
                {saved === null ? '…' : current ? `✓ Saved (ends in ${current.last4})` : 'No key saved'}
              </span>
            </div>
            <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>{p.where}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="password"
                value={drafts[p.key]}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                placeholder={current ? 'Paste a new key to replace it' : `Paste your ${p.label} stream key`}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ flex: '1 1 220px', minWidth: 0, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)' }}
              />
              <button type="button" className="primary-button" style={{ width: 'auto', flex: '0 0 auto' }}
                disabled={busy === p.key || !drafts[p.key].trim()} onClick={() => save(p.key, drafts[p.key])}>
                {busy === p.key ? 'Saving…' : 'Save'}
              </button>
              {current && (
                <button type="button" style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 13 }}
                  disabled={busy === p.key} onClick={() => save(p.key, '')}>
                  Remove
                </button>
              )}
            </div>
            {msg[p.key] && <p style={{ margin: '6px 0 0', fontSize: 13 }}>{msg[p.key]}</p>}
          </div>
        );
      })}
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>
        Keys are stored encrypted and only your account can use them. Anyone with a stream key can
        stream to your channel, so don't share it.
      </p>
    </div>
  );
}
