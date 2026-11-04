import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { GameCamera } from 'loggerhead-game-camera';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import { VideoResult, isAndroid, styles } from './clipStitcherShared';
import { REEL_HANDOFF_KEY } from './HighlightReel';

const API_URL = getApiUrl();
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const SERVE = '🏐';

// Where to stream. People paste the stream key from YouTube Studio or Facebook Live Producer.
const STREAM_TARGETS = {
  youtube: { label: 'YouTube', url: 'rtmps://a.rtmps.youtube.com/live2' },
  facebook: { label: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp' },
  other: { label: 'Other', url: '' },
};
const STREAM_KEY = 'lh_stream_target'; // { on, platform, key, url } on this phone only
const loadStreamTarget = () => {
  try {
    return { on: false, platform: 'youtube', key: '', url: '', ...JSON.parse(localStorage.getItem(STREAM_KEY) || '{}') };
  } catch {
    return { on: false, platform: 'youtube', key: '', url: '' };
  }
};
const LIVE_TEXT = {
  connecting: 'Connecting to the stream…',
  live: '● You are live',
  reconnecting: 'Connection dropped: reconnecting (still recording on the phone)',
  failed: 'Not live (the video is still recording on the phone)',
  ended: 'Stream ended',
};

// "🏐 Lakers 18 – 16 Waves": the ball marks the serving team.
const scoreLine = (teams, score) =>
  `${score.serving === 'our' ? `${SERVE} ` : ''}${teams[0]} ${score.us} – ${score.them} ${teams[1]}${score.serving === 'their' ? ` ${SERVE}` : ''}`;

// Film a Match (filming phone). Enter the code from the logging phone to get its live score:
// it shows on the camera screen, and every point is pinned to where it happened in the video
// (the "rally markers"), so highlight reels line up exactly later. Premium.
export default function GameCameraPage() {
  const navigate = useNavigate();
  const { token, isSubscriber } = useAuth();
  const [codeInput, setCodeInput] = useState('');
  const [link, setLink] = useState(null); // { code, matchId, teamName, opponentName }
  const [score, setScore] = useState(null);
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [msg, setMsg] = useState('');
  const [streamTarget, setStreamTarget] = useState(loadStreamTarget);
  const [showKey, setShowKey] = useState(false);
  const [phoneKeyOpen, setPhoneKeyOpen] = useState(false);
  const [live, setLive] = useState(null); // { state, message }
  const [accountKeys, setAccountKeys] = useState({}); // keys saved on the website: { youtube: { last4 } }

  // Stream keys saved from the website (Profile › Live streaming), so nobody types them here.
  useEffect(() => {
    if (!isSubscriber || !token || !isNative()) return undefined;
    let cancelled = false;
    const load = () => {
      axios.get(`${API_URL}/api/camera/stream-keys`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
        .then(({ data }) => { if (!cancelled) setAccountKeys(data || {}); })
        .catch(() => {});
    };
    load();
    // Check again when they come back from saving the key on their computer.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isSubscriber, token]);

  const socketRef = useRef(null);
  const linkRef = useRef(null);
  const scoreRef = useRef(null);
  const recordingRef = useRef(false);
  const markersRef = useRef([]);

  // ── Score from the logging phone ──────────────────────────────────────────
  const handleScore = useCallback((next) => {
    if (!next) return;
    const prev = scoreRef.current;
    scoreRef.current = next;
    setScore(next);
    // A new highlight play from the logging phone: banner on the camera screen.
    if (prev && next.play?.id && next.play.id !== prev.play?.id) {
      GameCamera.showPlay({ text: next.play.text }).catch(() => {});
    }
    if (!recordingRef.current || !prev) return;
    const sameSet = prev.set === next.set;
    const ourPoint = sameSet && next.us === prev.us + 1 && next.them === prev.them;
    const theirPoint = sameSet && next.them === prev.them + 1 && next.us === prev.us;
    if (ourPoint || theirPoint) {
      // Pin the point to where the recording is right now.
      GameCamera.mark().then(({ recording, positionMs }) => {
        if (!recording) return;
        markersRef.current.push({ positionMs, set: next.set, us: next.us, them: next.them, won: ourPoint ? 'our' : 'their' });
      }).catch(() => {});
    } else if (sameSet && (next.us < prev.us || next.them < prev.them)) {
      // Undo on the logging phone: drop the rallies above the new score.
      markersRef.current = markersRef.current.filter(
        (m) => m.set !== next.set || (m.us <= next.us && m.them <= next.them),
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
  }, []);

  const connect = async (typed) => {
    const code = (typeof typed === 'string' ? typed : codeInput).trim().toUpperCase();
    if (code.length < 6) {
      setMsg('Enter the 6-character code from the logging phone.');
      return;
    }
    setMsg('');
    setJoining(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/camera/links/${code}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      linkRef.current = data;
      setLink(data);
      scoreRef.current = null;
      handleScore(data.last);
      disconnect();
      const socket = io(`${API_URL}/camera`, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });
      socketRef.current = socket;
      socket.on('connect', async () => {
        try {
          const res = await socket.timeout(10000).emitWithAck('watch', { code });
          if (res?.ok) {
            setConnected(true);
            if (res.last) handleScore(res.last);
          } else {
            setConnected(false);
            setMsg(res?.message || "Couldn't connect to the match.");
          }
        } catch {
          setConnected(false);
        }
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('score', handleScore);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Couldn't find that code. Check it on the logging phone.");
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => () => disconnect(), [disconnect]);

  // ── Camera events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative()) return undefined;
    const handles = [];
    (async () => {
      handles.push(await GameCamera.addListener('recording', (e) => {
        if (e.state === 'started') {
          recordingRef.current = true;
          markersRef.current = [];
        } else if (e.state === 'stopped') {
          recordingRef.current = false;
          const rec = { ...e, markers: markersRef.current, matchId: linkRef.current?.matchId };
          markersRef.current = [];
          setRecordings((prev) => [...prev, rec]);
          if (e.message) setMsg(e.message);
          if (rec.matchId) {
            axios.post(`${API_URL}/api/camera/recordings`, {
              matchId: rec.matchId, startedAt: rec.startedAt, durationMs: rec.durationMs, markers: rec.markers,
            }, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }).catch(() => {});
          }
        } else if (e.state === 'error') {
          recordingRef.current = false;
          setMsg(e.message || 'The recording stopped.');
        }
      }));
      handles.push(await GameCamera.addListener('closed', () => setCameraOpen(false)));
      handles.push(await GameCamera.addListener('live', (e) => setLive(e)));
    })();
    return () => handles.forEach((h) => h?.remove?.());
  }, [token]);

  // Keep the scoreboard on the camera screen current.
  useEffect(() => {
    if (!cameraOpen) return;
    const teams = link ? [link.teamName || score?.teamName || 'Us', link.opponentName || score?.opponentName || 'Them'] : null;
    GameCamera.setScoreboard(link ? {
      title: score ? scoreLine(teams, score) : `${teams[0]} vs ${teams[1]}`,
      subtitle: score ? `Set ${score.set} · Sets ${score.ourSets}–${score.oppSets}` : '',
      status: connected ? '● Live score' : '○ Live score paused, reconnecting…',
      connected,
    } : { title: '', subtitle: '', status: '' }).catch(() => {});
  }, [cameraOpen, link, score, connected]);

  const updateStream = (patch) => {
    setStreamTarget((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STREAM_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const streamUrl = streamTarget.platform === 'other'
    ? streamTarget.url.trim()
    : STREAM_TARGETS[streamTarget.platform]?.url || '';
  const streaming = streamTarget.on;
  const savedKey = accountKeys[streamTarget.platform]; // { last4 } when saved on the website

  const openCamera = async () => {
    setMsg('');
    setLive(null);
    let key = streamTarget.key.trim();
    if (streaming && !key && savedKey) {
      try {
        const { data } = await axios.get(`${API_URL}/api/camera/stream-keys/${streamTarget.platform}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        key = data.key || '';
      } catch (err) {
        setMsg(err?.response?.data?.message || "Couldn't get your saved stream key. Check your connection.");
        return;
      }
    }
    if (streaming && (!key || !streamUrl)) {
      setMsg(streamUrl
        ? 'Add your stream key first: on your computer, save it at ui.loggerhead.app/profile › Live streaming.'
        : 'Enter the stream server URL first.');
      return;
    }
    try {
      await GameCamera.open(streaming ? { stream: { url: streamUrl, key } } : undefined);
      setCameraOpen(true);
    } catch (err) {
      setMsg(err?.message || "Couldn't open the camera.");
    }
  };

  // ── Screens ───────────────────────────────────────────────────────────────
  if (!isNative()) {
    return (
      <div style={styles.page}>
        <h2 style={styles.h2}>🎥 Film a Match</h2>
        <div className="card"><p style={{ margin: 0 }}>Filming works in the Loggerhead app for iPhone and Android.</p></div>
      </div>
    );
  }

  if (!isSubscriber) {
    return (
      <div style={styles.page}>
        <h2 style={styles.h2}>🎥 Film a Match <span style={styles.premiumTag}>Premium</span></h2>
        <div className="card">
          <p style={{ margin: 0, fontWeight: 700 }}>Film the game with the live score on screen.</p>
          <p style={{ ...styles.lead, margin: '8px 0 0' }}>
            One phone logs stats, this one films. Every point shows on the camera screen and is
            pinned to the video, so highlight reels line up exactly.
          </p>
          <button type="button" className="primary-button" style={{ marginTop: 14 }}
            onClick={() => navigate('/profile?section=subscription')}>
            Go Premium to film your matches →
          </button>
        </div>
      </div>
    );
  }

  const latest = recordings[recordings.length - 1];

  return (
    <div style={styles.page}>
      <h2 style={styles.h2}>🎥 Film a Match</h2>
      <p style={styles.lead}>
        One phone logs stats, this one films. Connect to the logging phone to show the live score
        while you film and to mark every rally in the video.
      </p>

      {latest && (
        <>
          <VideoResult
            title="Your game video"
            result={latest}
            detail={latest.markers?.length ? `${latest.markers.length} rallies marked` : undefined}
          />
          {link && latest.markers?.length > 0 && (
            <button type="button" style={styles.link} onClick={() => {
              // Hand the video and match to the highlight reel (it finds the plays by marker).
              try {
                sessionStorage.setItem(REEL_HANDOFF_KEY, JSON.stringify({
                  matchId: latest.matchId,
                  clip: {
                    id: isAndroid() ? latest.uri : latest.path,
                    name: 'Game video',
                    durationMs: latest.durationMs,
                    createdAt: latest.startedAt,
                  },
                }));
              } catch {}
              navigate('/stitch?mode=reel');
            }}>
              Make a highlight reel from this match →
            </button>
          )}
          {recordings.length > 1 && (
            <p style={styles.muted}>{recordings.length} videos recorded this session. Saved videos are in your gallery.</p>
          )}
          <div style={{ height: 14 }} />
        </>
      )}

      <div className="card">
        <p style={styles.stepTitle}>1. Connect to the logging phone</p>
        {link ? (
          <>
            <div style={{ fontWeight: 600 }}>{link.teamName || 'Your team'} vs {link.opponentName || 'Opponent'}</div>
            {score && (
              <div style={{ fontSize: 28, fontWeight: 900, margin: '6px 0 0' }}>
                {score.serving === 'our' && <span style={{ fontSize: 18 }}>{SERVE} </span>}
                {score.us} – {score.them}
                {score.serving === 'their' && <span style={{ fontSize: 18 }}> {SERVE}</span>}
                <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 10, color: 'var(--text-muted, #6b7280)' }}>
                  Set {score.set} · Sets {score.ourSets}–{score.oppSets}
                </span>
              </div>
            )}
            {score?.play?.text && (
              <p style={{ ...styles.muted, margin: '4px 0 0' }}>Last play: <strong>{score.play.text}</strong></p>
            )}
            <p style={{ ...styles.muted, color: connected ? '#166534' : '#92400e', fontWeight: 700 }}>
              {connected ? '● Live score connected' : '○ Connecting…'}
            </p>
            <button type="button" style={styles.link} onClick={() => { disconnect(); setLink(null); setScore(null); linkRef.current = null; }}>
              Use a different code
            </button>
          </>
        ) : (
          <>
            <p style={styles.muted}>
              On the logging phone: <strong>Log › Connect a Camera</strong>. Enter the code it shows:
            </p>
            <input
              value={codeInput}
              onChange={(e) => {
                const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                setCodeInput(code);
                // All six characters in: connect without hunting for the button.
                if (code.length === 6 && !joining) connect(code);
              }}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="go"
              onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
              style={{
                display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 10,
                fontSize: 26, fontWeight: 800, letterSpacing: 6, textAlign: 'center',
                padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)', textTransform: 'uppercase',
              }}
            />
            <button type="button" className="primary-button" style={{ width: '100%', marginTop: 10 }}
              onClick={() => connect()} disabled={joining || codeInput.length < 6}>
              {joining ? 'Connecting…' : 'Connect'}
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <p style={styles.stepTitle}>2. Go live <span style={{ fontWeight: 500, color: 'var(--text-muted, #6b7280)' }}>(optional)</span></p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={streaming} onChange={(e) => updateStream({ on: e.target.checked })}
            style={{ width: 20, height: 20 }} />
          Stream this game live on YouTube or Facebook
        </label>
        {streaming && (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {Object.entries(STREAM_TARGETS).map(([key, t]) => (
                <button key={key} type="button" onClick={() => updateStream({ platform: key })}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
                    border: streamTarget.platform === key ? '2px solid #2563eb' : '1px solid var(--border, #d1d5db)',
                    background: streamTarget.platform === key ? 'rgba(37,99,235,0.08)' : 'transparent',
                    color: 'inherit',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            {streamTarget.platform !== 'other' && savedKey && (
              <>
                <p style={{ ...styles.muted, fontSize: 13, color: '#166534', fontWeight: 700, margin: '10px 0 0' }}>
                  ✓ Using the {STREAM_TARGETS[streamTarget.platform].label} key saved on your account (ends in {savedKey.last4}).
                  {streamTarget.key.trim() ? ' The key pasted on this phone replaces it here.' : ''}
                </p>
                {streamTarget.platform === 'youtube' && (
                  <p style={{ ...styles.muted, fontSize: 12 }}>
                    Game day: tap the red button on the camera. YouTube starts the stream by itself within about
                    30 seconds; share the watch link from YouTube Studio.
                  </p>
                )}
                {streamTarget.platform === 'facebook' && (
                  <p style={{ ...styles.muted, fontSize: 12 }}>
                    Game day: on your computer (or a phone browser), open <strong>facebook.com/live/create</strong>,
                    choose where to post and <strong>Streaming software</strong>. Then tap the red button on the camera,
                    and click <strong>Go live</strong> on Facebook when the preview shows the game.
                  </p>
                )}
              </>
            )}
            {streamTarget.platform === 'youtube' && !savedKey && (
              <>
                <p style={{ ...styles.muted, fontSize: 13, fontWeight: 700, margin: '10px 0 0' }}>
                  One-time setup, on your computer (stream keys are long, so don't type them on the phone):
                </p>
                <ol style={{ ...styles.muted, fontSize: 12, paddingLeft: 18 }}>
                  <li><strong>First time only:</strong> open <strong>youtube.com/verify</strong> and verify your phone number.
                    YouTube can take up to 24 hours to turn on live streaming, so do this before game day.</li>
                  <li>Open <strong>studio.youtube.com</strong> › <strong>Create</strong> › <strong>Go live</strong>.</li>
                  <li>Choose <strong>Streaming software</strong> (not Webcam or Mobile). Set it to <strong>Unlisted</strong> so only
                    people with the link can watch, a good choice for kids' games.</li>
                  <li>Copy the <strong>Stream key</strong>. It stays the same from game to game.</li>
                  <li>On the same computer, open <strong>ui.loggerhead.app/profile</strong> › <strong>Live streaming</strong>,
                    paste the key and tap <strong>Save</strong>. This phone picks it up.</li>
                </ol>
              </>
            )}
            {streamTarget.platform === 'facebook' && !savedKey && (
              <>
                <p style={{ ...styles.muted, fontSize: 13, fontWeight: 700, margin: '10px 0 0' }}>
                  One-time setup, on your computer (Facebook's key is very long, and its phone app only offers its own camera):
                </p>
                <ol style={{ ...styles.muted, fontSize: 12, paddingLeft: 18 }}>
                  <li>Open <strong>facebook.com/live/create</strong>.</li>
                  <li>Choose where to post (your profile, a Page or a Group) and who can see it.</li>
                  <li>Under the video source, choose <strong>Streaming software</strong>, not Webcam. Facebook starts on your
                    camera: switch it.</li>
                  <li>Turn on <strong>Persistent stream key</strong> so the same key works every game, then copy the <strong>Stream key</strong>.</li>
                  <li>On the same computer, open <strong>ui.loggerhead.app/profile</strong> › <strong>Live streaming</strong>,
                    paste the key and tap <strong>Save</strong>. This phone picks it up.</li>
                </ol>
              </>
            )}
            {streamTarget.platform === 'other' && (
              <input value={streamTarget.url} onChange={(e) => updateStream({ url: e.target.value })}
                placeholder="Server URL (rtmp:// or rtmps://)" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)' }} />
            )}
            {(streamTarget.platform === 'other' || phoneKeyOpen || streamTarget.key.trim()) ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <input value={streamTarget.key} onChange={(e) => updateStream({ key: e.target.value })}
                  type={showKey ? 'text' : 'password'}
                  placeholder={savedKey && streamTarget.platform !== 'other' ? 'Leave blank to use your saved key' : 'Stream key'}
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)' }} />
                <button type="button" style={{ ...styles.link, whiteSpace: 'nowrap' }} onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            ) : (
              <button type="button" style={{ ...styles.link, fontSize: 12, marginTop: 6 }} onClick={() => setPhoneKeyOpen(true)}>
                {savedKey ? 'Use a different key on this phone' : 'Paste the key on this phone instead'}
              </button>
            )}
            <ul style={{ ...styles.muted, paddingLeft: 18, fontSize: 12 }}>
              <li>The score, the latest play and a Loggerhead tag are shown in the stream. A full-quality copy stays on this phone.</li>
              <li>Check your event's rules first: some tournaments sell exclusive streaming rights and don't allow other streams.</li>
              <li>Streaming uses about 1.2 GB of data an hour and a lot of battery. Wi-Fi and a power bank help.</li>
              <li>Keys saved on the website are stored encrypted on your account. A key pasted here stays on this phone.</li>
            </ul>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <p style={styles.stepTitle}>3. Film</p>
        <button type="button" className="primary-button" onClick={openCamera} disabled={cameraOpen}>
          {streaming
            ? `🔴 Open camera to go live on ${STREAM_TARGETS[streamTarget.platform]?.label || 'stream'}`
            : link ? '🎥 Open camera' : '🎥 Film without a live score'}
        </button>
        <ul style={{ ...styles.muted, paddingLeft: 18, fontSize: 12 }}>
          <li>Turn the phone sideways and keep the whole court in view.</li>
          <li>Keep Loggerhead open while filming. A long match uses a lot of battery and storage; a power bank helps.</li>
          <li>{streaming
            ? 'Tap the red button to go live and start recording; tap again to end the stream.'
            : 'Tap the red button to start and stop.'} Each recording is kept on this phone until you save or share it.</li>
        </ul>
      </div>

      {live && LIVE_TEXT[live.state] && (
        <p style={{ ...styles.muted, marginTop: 12, fontWeight: 700, color: live.state === 'live' ? '#b91c1c' : undefined }}>
          {LIVE_TEXT[live.state]}{live.message ? ` (${live.message})` : ''}
        </p>
      )}
      {msg && <p style={{ ...styles.muted, marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
