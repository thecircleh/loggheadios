import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import { useCameraScoreFeed, savedCameraCode, createCameraLink, cameraLinkStatus } from '../utils/cameraLink';
import CameraConnectSheet from './CameraConnectSheet';
import { styles as shared } from './clipStitcherShared';

// Score Only (Log › Score Only Mode): just the score, sets and serve, with big buttons, to feed
// the live score to a filming phone (Film a Match / streaming) without logging any stats.
// The match is saved (mode "Score") so the camera code and rally markers have a match to point at;
// it has no player stats, so stats pages leave it out. Free for everyone (no daily match limit).

const API_URL = getApiUrl();
const STORE = 'lh_score_only_v1';
const MAX_UNDO = 300;
const SERVE = '🏐';
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
};
const save = (data) => {
  try { data ? localStorage.setItem(STORE, JSON.stringify(data)) : localStorage.removeItem(STORE); } catch {}
};

// Points needed this set: the last set of a match uses the deciding-set target.
const targetFor = (cfg, set) => (cfg.totalSets > 1 && set === cfg.totalSets ? cfg.decidingPoints : cfg.points);
const isSetOver = (cfg, g) => {
  const t = targetFor(cfg, g.set);
  return Math.max(g.us, g.them) >= t && Math.abs(g.us - g.them) >= 2;
};
const isMatchOver = (cfg, ourSets, oppSets) => (cfg.playAllSets
  ? ourSets + oppSets >= cfg.totalSets
  : Math.max(ourSets, oppSets) > cfg.totalSets / 2);

const vibrate = () => { try { navigator.vibrate?.(15); } catch {} };

export default function ScoreOnlyPage() {
  const { token, user } = useAuth();
  const saved = useMemo(load, []);
  const [cfg, setCfg] = useState(saved?.cfg || null); // { matchId, teamName, opponentName, totalSets, points, decidingPoints, playAllSets }
  const [game, setGame] = useState(saved?.game || null); // { set, us, them, ourSets, oppSets, serving, setFirstServe, setScores, done }
  const [history, setHistory] = useState(saved?.history || []);
  const [cameraCode, setCameraCode] = useState(() => savedCameraCode(saved?.cfg?.matchId));

  // Keep the match on this phone so closing the app mid-set picks up where it left off.
  useEffect(() => { save(cfg && game ? { cfg, game, history } : null); }, [cfg, game, history]);

  useEffect(() => {
    const refresh = () => setCameraCode(savedCameraCode(cfg?.matchId));
    refresh();
    window.addEventListener('lh-camera-link-changed', refresh);
    return () => window.removeEventListener('lh-camera-link-changed', refresh);
  }, [cfg?.matchId]);

  // Score Only is for feeding a camera, so make the camera code as soon as the match starts and
  // show it on the page until a camera connects (and again if the camera drops off).
  const [watchers, setWatchers] = useState(null); // null = not checked yet
  const [codeError, setCodeError] = useState('');
  const [hideCode, setHideCode] = useState(false);
  const askedFor = useRef(null);
  const matchId = cfg?.matchId;
  const done = !!game?.done;
  useEffect(() => {
    if (!matchId || !token || done || savedCameraCode(matchId) || askedFor.current === matchId) return;
    askedFor.current = matchId; // once per match: "Stop sharing" in the sheet stays stopped
    setCodeError('');
    createCameraLink(token, matchId)
      .then((data) => setWatchers(data.watchers || 0))
      .catch(() => setCodeError("Couldn't make a camera code. Check your connection, then tap Connect a camera."));
  }, [matchId, token, done]);

  useEffect(() => {
    if (!cameraCode || !token || done) return undefined;
    let stopped = false;
    const check = () => cameraLinkStatus(token, cameraCode)
      .then((st) => { if (!stopped) setWatchers(st.watchers || 0); })
      .catch(() => {});
    check();
    const id = setInterval(check, 4000);
    return () => { stopped = true; clearInterval(id); };
  }, [cameraCode, token, done]);

  // Live score to the filming phone (only while this match has a camera code).
  useCameraScoreFeed({
    token,
    matchId: cfg?.matchId,
    us: game?.us || 0,
    them: game?.them || 0,
    set: game?.set || 1,
    ourSets: game?.ourSets || 0,
    oppSets: game?.oppSets || 0,
    serving: game ? game.serving : null,
    teamName: cfg?.teamName || '',
    opponentName: cfg?.opponentName || '',
  });

  // Save the score to the match a moment after each change (a failed save retries on the next one).
  const lastSaved = useRef('');
  useEffect(() => {
    if (!cfg?.matchId || !game || !token) return undefined;
    const body = {
      ourScore: game.us,
      opponentScore: game.them,
      currentSet: game.set,
      ourSetsWon: game.ourSets,
      opponentSetsWon: game.oppSets,
      setScores: game.setScores,
      status: game.done ? 'Final' : 'In Progress',
      winner: !game.done || game.ourSets === game.oppSets ? null
        : (game.ourSets > game.oppSets ? cfg.teamName : cfg.opponentName),
    };
    const key = JSON.stringify([cfg.matchId, body]);
    if (key === lastSaved.current) return undefined;
    const id = setTimeout(() => {
      axios.put(`${API_URL}/api/matches/${cfg.matchId}`, body, auth(token))
        .then(() => { lastSaved.current = key; })
        .catch(() => {});
    }, game.done ? 0 : 1500);
    return () => clearTimeout(id);
  }, [cfg, game, token]);

  const change = useCallback((next) => {
    setHistory((h) => [...h, game].slice(-MAX_UNDO));
    setGame(next);
    vibrate();
  }, [game]);

  const point = (side) => {
    if (!game || game.done || isSetOver(cfg, game)) return;
    change({ ...game, us: game.us + (side === 'our' ? 1 : 0), them: game.them + (side === 'their' ? 1 : 0), serving: side });
  };

  const undo = () => {
    if (!history.length) return;
    setGame(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    vibrate();
  };

  const endSet = () => {
    const wonByUs = game.us > game.them;
    const ourSets = game.ourSets + (wonByUs ? 1 : 0);
    const oppSets = game.oppSets + (wonByUs ? 0 : 1);
    const setScores = [...game.setScores, { setNumber: game.set, ourScore: game.us, opponentScore: game.them }];
    if (isMatchOver(cfg, ourSets, oppSets)) {
      change({ ...game, ourSets, oppSets, setScores, done: true });
      return;
    }
    // Serve alternates each set: the team that received first this set serves first next set.
    const firstServe = game.setFirstServe === 'our' ? 'their' : 'our';
    change({ ...game, set: game.set + 1, us: 0, them: 0, ourSets, oppSets, setScores, serving: firstServe, setFirstServe: firstServe });
  };

  const switchServe = () => {
    const serving = game.serving === 'our' ? 'their' : 'our';
    change({ ...game, serving, ...(game.us === 0 && game.them === 0 ? { setFirstServe: serving } : {}) });
  };

  const finishNow = () => {
    if (!window.confirm('Finish the match now with the sets played so far?')) return;
    change({ ...game, done: true });
  };

  const newMatch = () => {
    if (game && !game.done && !window.confirm('Start a new match? This one stays saved with the score so far.')) return;
    setCfg(null);
    setGame(null);
    setHistory([]);
    setHideCode(false);
    setWatchers(null);
  };

  if (!cfg || !game) {
    return (
      <SetupForm
        token={token}
        userId={user?.id}
        onStart={(nextCfg, firstServe) => {
          setCfg(nextCfg);
          setHistory([]);
          setGame({ set: 1, us: 0, them: 0, ourSets: 0, oppSets: 0, serving: firstServe, setFirstServe: firstServe, setScores: [], done: false });
        }}
      />
    );
  }

  const setOver = !game.done && isSetOver(cfg, game);
  const target = targetFor(cfg, game.set);
  const setWinner = game.us > game.them ? cfg.teamName : cfg.opponentName;
  const label = `${cfg.teamName} vs ${cfg.opponentName}`;

  return (
    <div style={{ ...shared.page, maxWidth: 640 }}>
      <CameraConnectSheet token={token} matchId={cfg.matchId} matchLabel={label} />

      <div style={s.topRow}>
        <div>
          <h2 style={{ ...shared.h2, fontSize: 20 }}>Score Only</h2>
          <div style={shared.muted}>
            {game.done ? 'Final' : `Set ${game.set} · to ${target}`}
            {cfg.playAllSets ? ` · all ${cfg.totalSets} sets` : ` · best of ${cfg.totalSets}`}
          </div>
        </div>
        <button type="button" style={s.camBtn} onClick={() => window.dispatchEvent(new Event('lh-camera-connect'))}>
          {!cameraCode ? '🎥 Connect a camera' : watchers ? '✅ Camera connected' : `🎥 Camera · ${cameraCode}`}
        </button>
      </div>

      {!game.done && cameraCode && watchers === 0 && !hideCode && (
        <div style={s.codeCard}>
          <div style={{ fontSize: 14, lineHeight: 1.45 }}>
            On the phone that's filming, open <strong>Log › Film a Match</strong> and enter this code:
          </div>
          <div style={s.code} aria-label={`Camera code ${cameraCode.split('').join(' ')}`}>{cameraCode}</div>
          <div style={s.codeFoot}>
            <span>⏳ Waiting for the camera to connect…</span>
            <button type="button" style={{ ...s.linkBtn, flex: 'none', padding: 0 }} onClick={() => setHideCode(true)}>Hide</button>
          </div>
        </div>
      )}
      {!game.done && !cameraCode && codeError && <div style={{ ...s.error, marginBottom: 12 }}>{codeError}</div>}

      <div style={s.board}>
        <TeamButton
          name={cfg.teamName} score={game.us} sets={game.ourSets} serving={game.serving === 'our'}
          color="#15803D" disabled={game.done || setOver} onClick={() => point('our')}
        />
        <TeamButton
          name={cfg.opponentName} score={game.them} sets={game.oppSets} serving={game.serving === 'their'}
          color="#1F2937" disabled={game.done || setOver} onClick={() => point('their')}
        />
      </div>

      {setOver && (
        <div style={s.banner}>
          <div style={{ fontWeight: 800 }}>Set {game.set} to {setWinner}, {Math.max(game.us, game.them)}–{Math.min(game.us, game.them)}</div>
          <div style={s.row}>
            <button type="button" className="primary-button" style={s.flex} onClick={endSet}>
              {isMatchOver(cfg, game.ourSets + (game.us > game.them ? 1 : 0), game.oppSets + (game.us > game.them ? 0 : 1))
                ? 'End match'
                : `Start set ${game.set + 1}`}
            </button>
            <button type="button" className="primary-button" style={{ ...s.flex, background: '#6b7280' }} onClick={undo}>
              Undo last point
            </button>
          </div>
        </div>
      )}

      {game.done && (
        <div style={s.banner}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {game.ourSets === game.oppSets ? 'Match tied' : `${game.ourSets > game.oppSets ? cfg.teamName : cfg.opponentName} wins`}, {Math.max(game.ourSets, game.oppSets)}–{Math.min(game.ourSets, game.oppSets)}
          </div>
          <div style={shared.muted}>
            {game.setScores.map((x) => `${x.ourScore}–${x.opponentScore}`).join(' · ') || 'No sets finished'}
          </div>
          <div style={s.row}>
            <button type="button" className="primary-button" style={s.flex} onClick={newMatch}>New match</button>
            <button type="button" className="primary-button" style={{ ...s.flex, background: '#6b7280' }} onClick={undo}>Undo</button>
          </div>
        </div>
      )}

      {!game.done && (
        <div style={s.row}>
          <button type="button" style={s.ctl} onClick={undo} disabled={!history.length}>↶ Undo</button>
          <button type="button" style={s.ctl} onClick={switchServe}>{SERVE} Switch serve</button>
        </div>
      )}

      {game.setScores.length > 0 && !game.done && (
        <div style={{ ...shared.muted, marginTop: 12 }}>
          Sets: {game.setScores.map((x) => `${x.ourScore}–${x.opponentScore}`).join(' · ')}
        </div>
      )}

      {!game.done && (
        <div style={{ ...s.row, marginTop: 18 }}>
          <button type="button" style={s.linkBtn} onClick={finishNow}>Finish match now</button>
          <button type="button" style={s.linkBtn} onClick={newMatch}>New match</button>
        </div>
      )}

      <p style={{ ...shared.muted, marginTop: 18 }}>
        Tap a team to give them the point; the serve follows the point. On the phone that's filming,
        open <strong>Log › Film a Match</strong> and enter the camera code to show this score in the video
        and the live stream.
      </p>
    </div>
  );
}

function TeamButton({ name, score, sets, serving, color, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Point to ${name}. ${name} has ${score}.`}
      style={{ ...s.team, background: color, opacity: disabled ? 0.75 : 1 }}
    >
      <div style={s.teamName}>{name}</div>
      <div style={s.score}>{score}</div>
      <div style={s.teamMeta}>
        <span>Sets {sets}</span>
        <span style={{ visibility: serving ? 'visible' : 'hidden' }}>{SERVE} Serving</span>
      </div>
    </button>
  );
}

function SetupForm({ token, userId, onStart }) {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ teamName: '', opponentName: '', totalSets: 3, points: 25, decidingPoints: 15, playAllSets: false, firstServe: 'our' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !userId) return;
    axios.get(`${API_URL}/api/users/${userId}`, auth(token))
      .then(({ data }) => {
        const list = data?.teams || [];
        setTeams(list);
        setForm((f) => ({ ...f, teamName: f.teamName || list[0] || '' }));
      })
      .catch(() => {});
  }, [token, userId]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

  const start = async () => {
    const teamName = form.teamName.trim();
    const opponentName = form.opponentName.trim();
    if (!teamName) return setError('Enter your team.');
    if (!opponentName) return setError('Enter the opponent.');
    const totalSets = Math.min(5, Math.max(1, Number(form.totalSets) || 3));
    const points = Math.min(50, Math.max(5, Number(form.points) || 25));
    const decidingPoints = Math.min(50, Math.max(5, Number(form.decidingPoints) || 15));
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/matches`, {
        teamName,
        opponentName,
        mode: 'Score',
        status: 'In Progress',
        totalSets,
        playAllSets: !!form.playAllSets,
        pointsNonDeciding: points,
        pointsDeciding: decidingPoints,
        matchData: { teamName, opponentName, sets: totalSets, points, decidingSetPoints: decidingPoints, playAllSets: !!form.playAllSets },
      }, auth(token));
      if (!data?._id) throw new Error('no id');
      onStart({ matchId: data._id, teamName, opponentName, totalSets, points, decidingPoints, playAllSets: !!form.playAllSets }, form.firstServe);
    } catch (err) {
      const d = err?.response?.data;
      setError(d?.message || d?.error || "Couldn't start the match. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={shared.page}>
      <h2 style={shared.h2}>Score Only</h2>
      <p style={shared.lead}>
        Keep just the score, with big buttons and no stats. Made for feeding the live score to the
        phone that's filming or streaming the match.
      </p>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={s.label}>Your team</label>
        {teams.length ? (
          <select value={form.teamName} onChange={(e) => set('teamName', e.target.value)} style={s.input}>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : (
          <input value={form.teamName} onChange={(e) => set('teamName', e.target.value)} placeholder="Team name" style={s.input} />
        )}

        <label style={s.label}>Opponent</label>
        <input value={form.opponentName} onChange={(e) => set('opponentName', e.target.value)} placeholder="Opponent name" style={s.input} />

        <div style={s.grid3}>
          <div>
            <label style={s.label}>Sets</label>
            <input type="number" min="1" max="5" value={form.totalSets} onChange={(e) => set('totalSets', e.target.value)} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Points</label>
            <input type="number" min="5" max="50" value={form.points} onChange={(e) => set('points', e.target.value)} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Deciding</label>
            <input type="number" min="5" max="50" value={form.decidingPoints} onChange={(e) => set('decidingPoints', e.target.value)} style={s.input} />
          </div>
        </div>

        <label style={s.check}>
          <input type="checkbox" checked={form.playAllSets} onChange={(e) => set('playAllSets', e.target.checked)} />
          Play all sets
        </label>

        <label style={s.label}>First serve</label>
        <div style={s.row}>
          {[['our', form.teamName || 'Us'], ['their', form.opponentName || 'Them']].map(([v, name]) => (
            <button
              key={v} type="button" onClick={() => set('firstServe', v)}
              style={{ ...s.ctl, ...(form.firstServe === v ? s.ctlOn : {}) }}
            >
              {SERVE} {name}
            </button>
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}
        <button type="button" className="primary-button" disabled={busy} onClick={start} style={{ marginTop: 6 }}>
          {busy ? 'Starting…' : 'Start match'}
        </button>
      </div>
    </div>
  );
}

const s = {
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  camBtn: {
    border: '1px solid var(--border, #d1d5db)', background: 'var(--card-bg, #fff)', color: 'inherit', borderRadius: 10,
    padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  board: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  team: {
    border: 'none', borderRadius: 18, color: '#fff', padding: '16px 10px 14px', minHeight: 260, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  teamName: { fontSize: 16, fontWeight: 800, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' },
  score: { fontSize: 96, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  teamMeta: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, opacity: 0.95 },
  banner: {
    marginTop: 12, padding: 14, borderRadius: 14, background: 'var(--card-bg, #fff)',
    border: '2px solid #15803D', display: 'flex', flexDirection: 'column', gap: 6,
  },
  row: { display: 'flex', gap: 10, marginTop: 10 },
  flex: { flex: 1, width: 'auto', margin: 0 },
  ctl: {
    flex: 1, padding: '12px 10px', borderRadius: 12, border: '1px solid var(--border, #d1d5db)',
    background: 'var(--card-bg, #fff)', color: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
  ctlOn: { background: '#15803D', borderColor: '#15803D', color: '#fff' },
  linkBtn: { flex: 1, background: 'none', border: 'none', color: 'var(--blue, #2563eb)', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 8 },
  label: { fontSize: 13, fontWeight: 700 },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border, #d1d5db)', fontSize: 16,
    boxSizing: 'border-box', background: 'var(--card-bg, #fff)', color: 'inherit',
  },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 },
  codeCard: {
    marginBottom: 12, padding: '12px 14px', borderRadius: 14, background: '#fef3c7', color: '#78350f',
    border: '1px solid #fcd34d', textAlign: 'center',
  },
  code: { fontSize: 40, fontWeight: 900, letterSpacing: 8, margin: '6px 0', fontFamily: 'ui-monospace, Menlo, monospace' },
  codeFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700 },
  error: { background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: '10px 12px', fontSize: 14 },
};
