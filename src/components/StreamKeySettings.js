import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import { connectYouTube, disconnectYouTube, setFacebookPage, youtubeStatus } from '../utils/youtube';

const API_URL = getApiUrl();
const muted = { fontSize: 12, color: 'var(--text-muted, #6b7280)' };

// Connect YouTube: the easy way. Loggerhead starts and ends each broadcast itself.
function YouTubeConnect({ token }) {
  const [status, setStatus] = useState(null); // { connected, channelTitle }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('youtube');
      if (q === 'connected') return 'YouTube connected.';
      if (q === 'failed') return "YouTube wasn't connected. Try again.";
    } catch {}
    return '';
  });

  const load = React.useCallback(() => {
    youtubeStatus(token).then(setStatus).catch(() => setStatus({ connected: false }));
  }, [token]);

  const boxRef = React.useRef(null);
  const backFromGoogle = React.useRef(!!msg);
  useEffect(() => {
    // Back from Google's sign-in on the website: show this section.
    if (backFromGoogle.current) boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setMsg('');
    try {
      await connectYouTube(token, load);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Couldn't open YouTube sign-in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMsg('');
    try {
      await disconnectYouTube(token);
      setStatus({ connected: false });
      setMsg('YouTube disconnected. Loggerhead no longer has access to your channel.');
    } catch {
      setMsg("Couldn't disconnect. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} style={{ padding: '10px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong>Connect YouTube <span style={{ fontWeight: 500, ...muted }}>(easiest)</span></strong>
        <span style={{ fontSize: 13, color: status?.connected ? '#166534' : 'var(--text-muted, #6b7280)' }}>
          {status === null ? '…' : status.connected ? `✓ ${status.channelTitle || 'Connected'}` : 'Not connected'}
        </span>
      </div>
      <p style={{ margin: '4px 0 8px', ...muted }}>
        Sign in with Google once. Each time you go live, Loggerhead creates the YouTube stream with the
        match name, starts it, gives you the link to share, and ends it when you stop. No YouTube Studio,
        no stream key.
      </p>
      {status?.connected ? (
        <button type="button" disabled={busy} onClick={disconnect}
          style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 14, padding: 0 }}>
          {busy ? 'Disconnecting…' : 'Disconnect YouTube'}
        </button>
      ) : (
        <button type="button" className="primary-button" style={{ width: 'auto' }} disabled={busy || status === null} onClick={connect}>
          {busy ? 'Opening…' : 'Connect YouTube'}
        </button>
      )}
      {msg && <p style={{ margin: '6px 0 0', fontSize: 13 }}>{msg}</p>}
      <p style={{ margin: '8px 0 0', ...muted }}>
        Loggerhead only uses this to create, start and end your live streams. By connecting, you agree to
        the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>.
        See our <a href="https://www.loggerhead.app/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a> and
        the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.
        You can also remove access at myaccount.google.com/permissions. First time streaming? Verify your
        phone at youtube.com/verify a day before.
      </p>
    </div>
  );
}

// Connect Facebook: Loggerhead creates and ends live videos on a Facebook Page they manage.
function FacebookConnect({ token }) {
  const [status, setStatus] = useState(null); // { connected, name, pages, pageId, pageName }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('facebook');
      if (q === 'connected') return 'Facebook connected.';
      if (q === 'failed') return "Facebook wasn't connected. Try again.";
    } catch {}
    return '';
  });

  const load = React.useCallback(() => {
    youtubeStatus(token, 'facebook').then(setStatus).catch(() => setStatus({ connected: false }));
  }, [token]);

  const boxRef = React.useRef(null);
  const backFromFacebook = React.useRef(!!msg);
  useEffect(() => {
    if (backFromFacebook.current) boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setMsg('');
    try {
      await connectYouTube(token, load, 'facebook');
    } catch (err) {
      setMsg(err?.response?.data?.message || "Couldn't open Facebook sign-in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMsg('');
    try {
      await disconnectYouTube(token, 'facebook');
      setStatus({ connected: false });
      setMsg('Facebook disconnected. Loggerhead no longer has access to your Pages.');
    } catch {
      setMsg("Couldn't disconnect. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickPage = async (pageId) => {
    setBusy(true);
    setMsg('');
    try {
      setStatus(await setFacebookPage(token, pageId));
    } catch (err) {
      setMsg(err?.response?.data?.message || "Couldn't change the Page. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} style={{ padding: '10px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong>Connect Facebook</strong>
        <span style={{ fontSize: 13, color: status?.pageName ? '#166534' : 'var(--text-muted, #6b7280)' }}>
          {status === null ? '…' : status.pageName ? `✓ ${status.pageName}` : status.connected ? 'Choose a Page' : 'Not connected'}
        </span>
      </div>
      <p style={{ margin: '4px 0 8px', ...muted }}>
        Stream to a Facebook Page you manage, like your team's or club's Page. Each time you go live,
        Loggerhead creates the live video with the match name, gives you the link to share, and ends it
        when you're done. No Live Producer, no Go live click. Facebook only lets Pages with at least 100
        followers go live from apps.
      </p>
      {status?.connected && status.pages?.length > 0 && (
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>
          Stream to{' '}
          <select value={status.pageId || ''} disabled={busy} onChange={(e) => pickPage(e.target.value)}
            style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)' }}>
            {!status.pageId && <option value="">Choose a Page</option>}
            {status.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {status?.connected ? (
        <button type="button" disabled={busy} onClick={disconnect}
          style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 14, padding: 0 }}>
          {busy ? 'Working…' : 'Disconnect Facebook'}
        </button>
      ) : (
        <button type="button" className="primary-button" style={{ width: 'auto' }} disabled={busy || status === null} onClick={connect}>
          {busy ? 'Opening…' : 'Connect Facebook'}
        </button>
      )}
      {msg && <p style={{ margin: '6px 0 0', fontSize: 13 }}>{msg}</p>}
      <p style={{ margin: '8px 0 0', ...muted }}>
        Loggerhead only uses this to create, check and end live videos on the Page you choose. See our{' '}
        <a href="https://www.loggerhead.app/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.
        You can also remove access in Facebook › Settings › Business integrations.
      </p>
    </div>
  );
}

const PLATFORMS = [
  {
    key: 'youtube',
    label: 'YouTube',
    where: 'studio.youtube.com › Create › Go live › Schedule stream › Streaming software. Use the Default stream key and leave manual settings off (if you turn them on, pick RTMP and Variable bitrate). In the stream settings, turn Auto-start on (otherwise someone has to click Go live), Auto-stop off, and latency to Normal. Then copy the Stream key. It stays the same, but schedule a new stream before each match.',
  },
];

// Profile card (Premium): save the YouTube stream key here, on a computer where they're
// easy to copy, and the filming phone uses them when it goes live (Film a Match).
export default function StreamKeySettings() {
  const { token, hasPremium } = useAuth();
  const [saved, setSaved] = useState(null); // { youtube: { last4 } | null }
  const [drafts, setDrafts] = useState({ youtube: '' });
  const [showKey, setShowKey] = useState(false);
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
        Connect your YouTube channel or Facebook Page, or save a YouTube stream key. When you film a
        match in the Loggerhead app and go live, your phone uses them.
      </p>
      <YouTubeConnect token={token} />
      <FacebookConnect token={token} />
      <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 700 }}>Or use a YouTube stream key</p>
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
              {/* Plain text field, masked with CSS: a password-type box gets filled by password
                  managers with the account password. */}
              <input
                type="text"
                name={`${p.key}-stream-key`}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={drafts[p.key]}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                placeholder={current ? 'Paste a new key to replace it' : `Paste your ${p.label} stream key`}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ flex: '1 1 220px', minWidth: 0, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)',
                  WebkitTextSecurity: showKey ? 'none' : 'disc' }}
              />
              <button type="button" onClick={() => setShowKey((v) => !v)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', padding: '0 4px' }}>
                {showKey ? 'Hide' : 'Show'}
              </button>
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
