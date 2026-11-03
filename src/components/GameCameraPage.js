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

  const connect = async () => {
    const code = codeInput.trim().toUpperCase();
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

  const openCamera = async () => {
    setMsg('');
    try {
      await GameCamera.open();
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
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                style={{ flex: 1, fontSize: 22, fontWeight: 800, letterSpacing: 4, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)', textTransform: 'uppercase' }}
              />
              <button type="button" className="primary-button" style={{ width: 'auto' }} onClick={connect} disabled={joining}>
                {joining ? '…' : 'Connect'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <p style={styles.stepTitle}>2. Film</p>
        <button type="button" className="primary-button" onClick={openCamera} disabled={cameraOpen}>
          {link ? '🎥 Open camera' : '🎥 Film without a live score'}
        </button>
        <ul style={{ ...styles.muted, paddingLeft: 18, fontSize: 12 }}>
          <li>Turn the phone sideways and keep the whole court in view.</li>
          <li>Keep Loggerhead open while filming. A long match uses a lot of battery and storage; a power bank helps.</li>
          <li>Tap the red button to start and stop. Each recording is kept on this phone until you save or share it.</li>
        </ul>
      </div>

      {msg && <p style={{ ...styles.muted, marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
