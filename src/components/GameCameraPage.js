import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { GameCamera } from 'loggerhead-game-camera';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import { VideoResult, isAndroid, styles } from './clipStitcherShared';
import { REEL_HANDOFF_KEY } from './HighlightReel';
import { QUALITIES, checkConnection, deviceWarnings } from '../utils/streamCheck';
import { trackFeature, trackFeatureLength } from '../utils/featureUsage';
import { createStreamLog } from '../utils/streamQuality';
import {
  YT_PRIVACY, broadcastStatus, connectYouTube, createBroadcast, endBroadcast, shareLink, youtubeStatus,
} from '../utils/youtube';

const YT_CHECK_MS = 45000; // while live: is the broadcast still on YouTube (ended in Studio)?
const YT_DONE = ['complete', 'revoked', 'deleted'];

const API_URL = getApiUrl();
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const SERVE = '🏐';

// Where to stream. People save the stream key from YouTube Studio on the website (or paste it here).
const STREAM_TARGETS = {
  youtube: { label: 'YouTube', url: 'rtmps://a.rtmps.youtube.com/live2' },
  other: { label: 'Other', url: '' },
};
const STREAM_KEY = 'lh_stream_target'; // { on, platform, key, url, quality } on this phone only
const loadStreamTarget = () => {
  try {
    const saved = { on: false, platform: 'youtube', key: '', url: '', quality: 'auto', ...JSON.parse(localStorage.getItem(STREAM_KEY) || '{}') };
    return STREAM_TARGETS[saved.platform] ? saved : { ...saved, platform: 'youtube', key: '' };
  } catch {
    return { on: false, platform: 'youtube', key: '', url: '', quality: 'auto' };
  }
};
const CHECK_FRESH_MS = 10 * 60 * 1000; // re-check the connection after 10 minutes
const describeCheck = (c) => (c.quality === 'too-slow'
  ? `Upload ${c.uploadMbps} Mbps · delay ${c.rttMs} ms: too slow to stream here.`
  : `Upload ${c.uploadMbps} Mbps · delay ${c.rttMs} ms → ${QUALITIES[c.quality].label}.`);

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
  const streamUsageRef = useRef(null); // { id, log } while a stream is going, for admin usage
  const streamPlanRef = useRef(null); // quality, connection check and network when the camera opened
  const streamPlatformRef = useRef('');
  const [accountKeys, setAccountKeys] = useState({}); // keys saved on the website: { youtube: { last4 } }
  const [netCheck, setNetCheck] = useState(null); // { uploadMbps, rttMs, quality, at }, or false if it failed
  const [checking, setChecking] = useState(false);
  const [preflight, setPreflight] = useState(null); // warnings to confirm before opening the camera
  const [finishing, setFinishing] = useState(false);
  // Connect YouTube: Loggerhead makes the broadcast (see utils/youtube.js).
  const [yt, setYt] = useState(null); // { connected, channelTitle }
  const [ytTitle, setYtTitle] = useState('');
  const [broadcast, setBroadcast] = useState(null); // { broadcastId, url, key, watchUrl, title, privacy }
  const [ytBusy, setYtBusy] = useState(false);
  const [ytMsg, setYtMsg] = useState('');
  const broadcastRef = useRef(null); // the broadcast this camera session is sending to
  const ytSessionRef = useRef(null); // { title, privacy } while the camera streams through Connect YouTube

  // Videos left behind when the app closed mid-recording (crash, dead battery): offer them.
  useEffect(() => {
    if (!isNative() || !isSubscriber) return;
    GameCamera.recoverRecordings().then((res) => {
      const found = res?.recordings || [];
      if (!found.length) return;
      setRecordings((prev) => [...found.map((r) => ({ ...r, markers: [] })), ...prev]);
      setMsg(found.length === 1
        ? 'Recovered a video from filming that was interrupted (the app closed mid-recording). Save it below.'
        : `Recovered ${found.length} videos from filming that was interrupted. Save them below.`);
    }).catch(() => {});
  }, [isSubscriber]);

  // Stream keys saved from the website (Profile › Live streaming), so nobody types them here.
  useEffect(() => {
    if (!isSubscriber || !token || !isNative()) return undefined;
    let cancelled = false;
    const load = () => {
      axios.get(`${API_URL}/api/camera/stream-keys`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
        .then(({ data }) => { if (!cancelled) setAccountKeys(data || {}); })
        .catch(() => {});
      youtubeStatus(token)
        .then((data) => { if (!cancelled) setYt(data); })
        .catch(() => { if (!cancelled) setYt((prev) => prev || { connected: false }); });
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
    // Connect YouTube: end the broadcast when the stream stops (a broadcast that never went live
    // is deleted), and make a fresh one if they go live again with the camera still open. The
    // phone keeps the same stream key, so the new broadcast picks it up.
    const finishBroadcast = () => {
      const b = broadcastRef.current;
      broadcastRef.current = null;
      setBroadcast(null);
      if (b?.broadcastId) endBroadcast(token, b.broadcastId).catch(() => {});
    };
    const reopenBroadcast = () => {
      const session = ytSessionRef.current;
      if (!session || broadcastRef.current) return;
      broadcastRef.current = { pending: true };
      createBroadcast(token, session).then((b) => {
        broadcastRef.current = b;
        setBroadcast(b);
      }).catch((err) => {
        broadcastRef.current = null;
        setYtMsg(err?.response?.data?.message || "Couldn't start a new YouTube stream.");
      });
    };
    (async () => {
      handles.push(await GameCamera.addListener('recording', (e) => {
        if (e.state === 'started') {
          recordingRef.current = true;
          markersRef.current = [];
        } else if (e.state === 'finishing') {
          setFinishing(true);
        } else if (e.state === 'stopped') {
          setFinishing(false);
          recordingRef.current = false;
          const rec = { ...e, markers: markersRef.current, matchId: linkRef.current?.matchId };
          markersRef.current = [];
          setRecordings((prev) => [...prev, rec]);
          trackFeature(token, 'film', { durationMs: e.durationMs || 0 });
          if (e.message) setMsg(e.message);
          if (rec.matchId) {
            axios.post(`${API_URL}/api/camera/recordings`, {
              matchId: rec.matchId, startedAt: rec.startedAt, durationMs: rec.durationMs, markers: rec.markers,
            }, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }).catch(() => {});
          }
        } else if (e.state === 'error') {
          setFinishing(false);
          recordingRef.current = false;
          setMsg(e.message || 'The recording stopped.');
        }
      }));
      handles.push(await GameCamera.addListener('closed', () => {
        setCameraOpen(false);
        finishBroadcast();
        ytSessionRef.current = null;
        // Camera closed mid-stream: save what we have and start fresh next time.
        const row = streamUsageRef.current;
        if (row) {
          row.log.onLive('ended');
          saveStream(row);
          streamUsageRef.current = null;
        }
      }));
      // Admin usage + quality log: one row per stream (including ones that never connected),
      // saved on every change, every minute and when it ends.
      const saveStream = (row) => {
        if (!row.id) return;
        const stats = row.log.summary();
        trackFeatureLength(token, row.id, stats.liveMs, stats);
      };
      handles.push(await GameCamera.addListener('live', (e) => {
        setLive(e);
        if (e.state === 'connecting') reopenBroadcast();
        if (e.state === 'ended') finishBroadcast();
        let row = streamUsageRef.current;
        if (!row && e.state !== 'ended') {
          row = { id: null, log: createStreamLog(streamPlanRef.current || {}), done: false };
          streamUsageRef.current = row;
          trackFeature(token, 'stream', { detail: streamPlatformRef.current }).then((id) => {
            row.id = id;
            saveStream(row);
          });
        }
        if (!row) return;
        row.log.onLive(e.state);
        saveStream(row);
        if (e.state === 'ended') streamUsageRef.current = null;
      }));
      handles.push(await GameCamera.addListener('health', (e) => {
        streamUsageRef.current?.log.onHealth(e);
      }));
      // Every minute, so a stream cut off by a crash or dead battery still leaves a record.
      const timer = setInterval(() => {
        if (streamUsageRef.current) saveStream(streamUsageRef.current);
      }, 60000);
      handles.push({ remove: () => clearInterval(timer) });
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

  // While live through Connect YouTube: notice if the broadcast is ended in YouTube Studio.
  const liveState = live?.state;
  useEffect(() => {
    if (liveState !== 'live' && liveState !== 'reconnecting') return undefined;
    const timer = setInterval(async () => {
      const b = broadcastRef.current;
      if (!b?.broadcastId) return;
      try {
        const status = await broadcastStatus(token, b.broadcastId);
        if (!YT_DONE.includes(status) || broadcastRef.current !== b) return;
        broadcastRef.current = null;
        setBroadcast(null);
        ytSessionRef.current = null; // don't start a new one by itself
        setYtMsg('The stream was ended on YouTube. Viewers no longer see it. Tap the red button to stop sending; the recording on this phone is fine.');
        GameCamera.showPlay({ text: 'YouTube ended this stream · tap the red button to stop' }).catch(() => {});
      } catch {}
    }, YT_CHECK_MS);
    return () => clearInterval(timer);
  }, [liveState, token]);

  // Leaving the page with a broadcast that never went live: remove it from the channel.
  const pendingRef = useRef(null);
  pendingRef.current = broadcast;
  useEffect(() => () => {
    if (pendingRef.current && !broadcastRef.current) endBroadcast(token, pendingRef.current.broadcastId).catch(() => {});
  }, [token]);

  const defaultYtTitle = () => {
    const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return link ? `${link.teamName || 'Us'} vs ${link.opponentName || 'Them'} · ${day}` : `Volleyball live · ${day}`;
  };

  // Make the YouTube broadcast now (before the camera opens), so the link can be shared first.
  const getBroadcast = async () => {
    if (broadcast) return broadcast;
    setYtBusy(true);
    setYtMsg('');
    try {
      const b = await createBroadcast(token, { title: ytTitle.trim() || defaultYtTitle(), privacy: streamTarget.ytPrivacy || 'unlisted' });
      setBroadcast(b);
      return b;
    } catch (err) {
      const data = err?.response?.data || {};
      if (data.code === 'YT_RECONNECT' || data.code === 'YT_NOT_CONNECTED') setYt({ connected: false });
      setYtMsg(data.message || "Couldn't create the YouTube stream. Check your connection, or use your stream key.");
      return null;
    } finally {
      setYtBusy(false);
    }
  };

  const shareBroadcast = async (b) => {
    const how = await shareLink(b.watchUrl, b.title);
    if (how === 'copied') setYtMsg('Link copied.');
  };

  const startConnect = async () => {
    setYtMsg('');
    try {
      await connectYouTube(token, () => youtubeStatus(token).then(setYt).catch(() => {}));
    } catch (err) {
      setYtMsg(err?.response?.data?.message || "Couldn't open YouTube sign-in.");
    }
  };

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
  streamPlatformRef.current = streamTarget.platform;
  const savedKey = accountKeys[streamTarget.platform]; // { last4 } when saved on the website
  // Connect YouTube is used unless they chose to use a stream key instead.
  const ytConnected = streamTarget.platform === 'youtube' && !!yt?.connected;
  const ytMode = ytConnected && !streamTarget.useKey;
  const useYtConnect = streaming && ytMode;
  if (useYtConnect) streamPlatformRef.current = 'youtube-connect';

  const runCheck = async () => {
    setChecking(true);
    const result = await checkConnection(API_URL, token);
    setChecking(false);
    setNetCheck(result || false); // false: the check couldn't run
    return result;
  };

  // force: the person saw the warnings and chose to go ahead.
  const openCamera = async (force = false) => {
    setMsg('');
    setLive(null);
    setPreflight(null);
    // Quality: what they picked, or what the connection check says (checked again if stale).
    let quality = streamTarget.quality && streamTarget.quality !== 'auto' ? streamTarget.quality : null;
    const warnings = [];
    // The latest connection check, for the stream quality log.
    let checkUsed = netCheck && Date.now() - netCheck.at < CHECK_FRESH_MS ? netCheck : null;
    if (streaming && !quality) {
      let result = checkUsed;
      if (!result && !force) result = await runCheck();
      checkUsed = result || null;
      if (result?.quality === 'too-slow') {
        warnings.push(`The upload here is only ${result.uploadMbps} Mbps, too slow for a steady stream. Turn off Wi-Fi to use cellular and check again, or film without streaming. If you go ahead, it streams at the lowest quality.`);
      }
      quality = result ? (result.quality === 'too-slow' ? 'low' : result.quality) : 'medium';
    }
    if (!force) {
      warnings.push(...await deviceWarnings());
      if (warnings.length) {
        setPreflight(warnings);
        return;
      }
    }
    let key = streamTarget.key.trim();
    let url = streamUrl;
    if (useYtConnect) {
      const b = await getBroadcast();
      if (!b) return;
      broadcastRef.current = b;
      ytSessionRef.current = { title: b.title, privacy: b.privacy };
      url = b.url;
      key = b.key;
    } else if (streaming && !key && savedKey) {
      try {
        const { data } = await axios.get(`${API_URL}/api/camera/stream-keys/${streamTarget.platform}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        key = data.key || '';
      } catch (err) {
        setMsg(err?.response?.data?.message || "Couldn't get your saved stream key. Check your connection.");
        return;
      }
    }
    if (streaming && (!key || !url)) {
      setMsg(url
        ? 'Add your stream key first: on your computer, save it at ui.loggerhead.app/profile › Live streaming.'
        : 'Enter the stream server URL first.');
      return;
    }
    if (streaming) {
      let network = 'unknown';
      try { network = (await GameCamera.deviceStatus()).network || 'unknown'; } catch {}
      streamPlanRef.current = {
        quality: quality || 'medium',
        picked: streamTarget.quality && streamTarget.quality !== 'auto' ? 'manual' : 'auto',
        check: checkUsed,
        network,
      };
    }
    try {
      await GameCamera.open(streaming ? { stream: { url, key, quality: quality || 'medium' } } : undefined);
      setCameraOpen(true);
    } catch (err) {
      setMsg(err?.message || "Couldn't open the camera.");
      // The broadcast stays for the next try; nothing was sent to it.
      broadcastRef.current = null;
      ytSessionRef.current = null;
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
          Stream this game live on YouTube
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
            {ytMode && (
              <div style={{ marginTop: 10 }}>
                <p style={{ ...styles.muted, fontSize: 13, color: '#166534', fontWeight: 700, margin: 0 }}>
                  ✓ Connected to YouTube{yt.channelTitle ? ` (${yt.channelTitle})` : ''}. Loggerhead creates and
                  ends the stream for you.
                </p>
                {broadcast ? (
                  <div style={{ border: '1px solid var(--border, #d1d5db)', borderRadius: 10, padding: '10px 12px', marginTop: 10 }}>
                    <div style={{ fontWeight: 700 }}>{broadcast.title}</div>
                    <div style={{ ...styles.muted, fontSize: 12, margin: '2px 0 6px' }}>
                      {YT_PRIVACY[broadcast.privacy] || broadcast.privacy} · {broadcast.watchUrl}
                    </div>
                    <button type="button" className="primary-button" style={{ width: 'auto' }} onClick={() => shareBroadcast(broadcast)}>
                      Share the watch link
                    </button>
                    <p style={{ ...styles.muted, fontSize: 12, margin: '6px 0 0' }}>
                      The link works now: it shows "starting soon" until you go live.
                    </p>
                  </div>
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginTop: 10 }}>
                      Stream title
                      <input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder={defaultYtTitle()} maxLength={100}
                        style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)', fontWeight: 400 }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginTop: 8 }}>
                      Who can watch{' '}
                      <select value={streamTarget.ytPrivacy || 'unlisted'} onChange={(e) => updateStream({ ytPrivacy: e.target.value })}
                        style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)' }}>
                        {Object.entries(YT_PRIVACY).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                    </label>
                    <button type="button" style={{ ...styles.link, fontSize: 13, marginTop: 8 }} disabled={ytBusy} onClick={getBroadcast}>
                      {ytBusy ? 'Creating the YouTube stream…' : 'Get the watch link now (to share before the game)'}
                    </button>
                  </>
                )}
                {ytMsg && <p style={{ ...styles.muted, fontSize: 13, margin: '6px 0 0' }}>{ytMsg}</p>}
                <button type="button" style={{ ...styles.link, fontSize: 12, marginTop: 6 }} onClick={() => updateStream({ useKey: true })}>
                  Use my stream key instead
                </button>
              </div>
            )}
            {streamTarget.platform === 'youtube' && !ytMode && (
              <div style={{ marginTop: 10 }}>
                {ytConnected ? (
                  <button type="button" style={{ ...styles.link, fontSize: 13 }} onClick={() => updateStream({ useKey: false })}>
                    Use Connect YouTube instead (no stream key)
                  </button>
                ) : yt && (
                  <>
                    <button type="button" className="primary-button" style={{ width: 'auto' }} onClick={startConnect}>
                      Connect YouTube (easiest)
                    </button>
                    <p style={{ ...styles.muted, fontSize: 12, margin: '4px 0 0' }}>
                      Sign in with Google once. Loggerhead then creates each stream, gives you the link to share and
                      ends it when you stop. No YouTube Studio or stream key. Or set up a stream key below.
                    </p>
                  </>
                )}
                {ytMsg && <p style={{ ...styles.muted, fontSize: 13, margin: '6px 0 0' }}>{ytMsg}</p>}
              </div>
            )}
            {!ytMode && streamTarget.platform !== 'other' && savedKey && (
              <>
                <p style={{ ...styles.muted, fontSize: 13, color: '#166534', fontWeight: 700, margin: '10px 0 0' }}>
                  ✓ Using the {STREAM_TARGETS[streamTarget.platform].label} key saved on your account (ends in {savedKey.last4}).
                  {streamTarget.key.trim() ? ' The key pasted on this phone replaces it here.' : ''}
                </p>
                {streamTarget.platform === 'youtube' && (
                  <p style={{ ...styles.muted, fontSize: 12 }}>
                    Game day: tap the red button on the camera. YouTube starts the stream by itself within about
                    30 seconds, and nobody needs YouTube Studio open during the match. Sharing: a Public stream is
                    always at youtube.com/@yourchannel/live; for an Unlisted one, copy its share link from the Go live
                    page before the match (each new stream gets a new link). Once, in YouTube Studio's stream
                    settings: set <strong>Stream latency</strong> to <strong>Normal</strong> and, if you see it, turn
                    off <strong>Auto-stop</strong>, so gym Wi-Fi hiccups don't end the broadcast. Use the Go live
                    page's stream, not a scheduled one: it goes live without anyone clicking Go live.
                  </p>
                )}
              </>
            )}
            {!ytMode && streamTarget.platform === 'youtube' && !savedKey && (
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
                  <li>In the stream settings, set <strong>Stream latency</strong> to <strong>Normal</strong> (not Low or
                    Ultra-low): YouTube then buffers through gym Wi-Fi hiccups. Stay on this page rather than
                    scheduling a stream: it goes live by itself when your phone starts sending, so nobody has to click Go live.
                    If you see <strong>Auto-stop</strong>, turn it off, so a dropped connection rejoins the same broadcast instead of ending it.</li>
                  <li>Use the <strong>Default stream key</strong>, and leave <strong>manual settings off</strong> so YouTube
                    detects the resolution itself: Loggerhead raises and lowers the quality as the Wi-Fi changes. If you do
                    turn manual settings on, pick <strong>RTMP</strong> (not HLS) and <strong>Variable</strong> bitrate.</li>
                  <li>Copy the <strong>Stream key</strong>. It stays the same from game to game.</li>
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
            {ytMode ? null : (streamTarget.platform === 'other' || phoneKeyOpen || streamTarget.key.trim()) ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <input value={streamTarget.key} onChange={(e) => updateStream({ key: e.target.value })}
                  type="text" name="stream-key" autoComplete="off"
                  data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"
                  placeholder={savedKey && streamTarget.platform !== 'other' ? 'Leave blank to use your saved key' : 'Stream key'}
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)',
                    WebkitTextSecurity: showKey ? 'none' : 'disc' }} />
                <button type="button" style={{ ...styles.link, whiteSpace: 'nowrap' }} onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            ) : (
              <button type="button" style={{ ...styles.link, fontSize: 12, marginTop: 6 }} onClick={() => setPhoneKeyOpen(true)}>
                {savedKey ? 'Use a different key on this phone' : 'Paste the key on this phone instead'}
              </button>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Stream quality{' '}
                <select value={streamTarget.quality || 'auto'} onChange={(e) => updateStream({ quality: e.target.value })}
                  style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)' }}>
                  <option value="auto">Auto (checks the connection)</option>
                  {Object.entries(QUALITIES).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" style={{ ...styles.link, fontSize: 13 }} onClick={runCheck} disabled={checking}>
                  {checking ? 'Checking the connection…' : 'Check the connection here'}
                </button>
                {netCheck && !checking && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: netCheck.quality === 'too-slow' ? '#b91c1c' : '#166534' }}>
                    {describeCheck(netCheck)}
                  </span>
                )}
                {netCheck === false && !checking && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>
                    Couldn't check: the connection may be down.
                  </span>
                )}
              </div>
              <p style={{ ...styles.muted, fontSize: 12, margin: '4px 0 0' }}>
                Gym Wi-Fi is often slower than cellular. If the check says it's slow, turn off Wi-Fi and check again.
              </p>
            </div>
            <ul style={{ ...styles.muted, paddingLeft: 18, fontSize: 12 }}>
              <li>The camera shows how the stream is doing: green is good, yellow is struggling, red means a weak
                connection (the quality drops so the stream keeps going).</li>
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
        {preflight && (
          <div style={{ border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.08)', borderRadius: 10, padding: '10px 12px', margin: '0 0 10px' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 14 }}>Before you start</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {preflight.map((w) => <li key={w} style={{ marginBottom: 4 }}>{w}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button type="button" className="primary-button" style={{ width: 'auto' }} onClick={() => openCamera(true)}>
                Open the camera anyway
              </button>
              <button type="button" style={styles.link} onClick={() => setPreflight(null)}>Cancel</button>
            </div>
          </div>
        )}
        <button type="button" className="primary-button" onClick={() => openCamera(false)} disabled={cameraOpen || checking}>
          {checking ? 'Checking the connection…' : streaming
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
      {finishing && <p style={{ ...styles.muted, marginTop: 12, fontWeight: 700 }}>Finishing the video… (a long match can take a minute)</p>}
      {msg && <p style={{ ...styles.muted, marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
