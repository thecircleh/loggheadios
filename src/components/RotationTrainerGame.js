import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GameLevelSelect, { makeRanges, tierColor } from './GameLevelSelect';
import { useGameProgress } from '../utils/useGameProgress';
import {
  COURT, TOTAL_LEVELS, QUESTIONS_PER_LEVEL, PLAYERS, BASE_SPOTS,
  getDiff, generateLevel, isCorrect, starsFor, zoneOf, playerInZone, findFaults,
} from '../utils/rotationTrainer';

const GAME_ID = 'rotation';
const STORE_KEY = 'loggerhead_rotation_progress';
const MAX_LIVES = 3;
// Opposites share a color family (matches Lineup Sudoku).
const PLAYER_COLORS = ['#B45309', '#1D4ED8', '#15803D', '#D97706', '#3B82F6', '#22C55E'];

const DIFF_RANGES = makeRanges([
  ['Easy', 1, 60], ['Medium', 61, 150], ['Hard', 151, 280], ['Expert', 281, 400], ['Master', 401, 500],
]);

const Stars = ({ n, size = 14 }) => (
  <span style={{ fontSize: size, letterSpacing: -1, lineHeight: 1 }}>
    {[0, 1, 2].map(i => <span key={i} style={{ color: i < n ? '#F59E0B' : '#D1D5DB' }}>★</span>)}
  </span>
);

// ── How To Play ──────────────────────────────────────────────────────────────
function HowToPlayModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 20px 16px', maxWidth: 380, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>🔄 Rotation Rules</div>
        {[
          ['🔁', 'Rotation is clockwise. On a side-out, the player in zone 2 moves to zone 1 and serves.'],
          ['↔️', 'Side to side — same row only: left front (4) is left of middle front (3), which is left of right front (2). Back row: 5 left of 6, 6 left of 1.'],
          ['↕️', 'Front to back — partners only: 4 is closer to the net than 5, 3 than 6, and 2 than 1.'],
          ['↗️', 'Diagonals never count. Left front vs. middle back is never an overlap.'],
          ['🏐', 'The server is exempt while your team serves. In serve receive, all six count.'],
          ['⏱️', 'Overlaps only matter at the moment of serve. After contact, everyone can move anywhere.'],
          ['❤️', '8 questions per level, 3 lives. Fewer misses = more stars.'],
        ].map(([icon, rule]) => (
          <div key={rule} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f3f3' }}>
            <span style={{ fontSize: 17, flexShrink: 0, width: 22, textAlign: 'center' }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>— net —</div>
          <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3, 52px)', border: '2px solid #1F2937', borderRadius: 6, overflow: 'hidden', fontWeight: 800, fontSize: 15 }}>
            {[4, 3, 2, 5, 6, 1].map(z => (
              <div key={z} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: z >= 2 && z <= 4 ? '#FFEDD5' : '#FED7AA', borderRight: '1px solid rgba(0,0,0,0.1)' }}>{z}</div>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Got it!
        </button>
      </div>
    </div>
  );
}

// ── Court ────────────────────────────────────────────────────────────────────
// SVG in meters: net at y = 0, end line at y = 9; the server stands behind it.
function Court({ q, revealed, selected, spot, onPlayer, onCourt, svgRef }) {
  const showZones = q.type === 'rotate';
  const faults = revealed && q.type !== 'rotate' && q.type !== 'place' ? findFaults(q.pos, q.serving) : [];
  const faultZones = new Set(faults.flatMap(f => [f.a, f.b]));
  const box = revealed && q.type === 'place' ? q.answer.box : null;

  return (
    <svg
      ref={svgRef}
      viewBox="-0.8 -1.2 10.6 12.2"
      style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto', touchAction: 'manipulation', cursor: q.type === 'place' && !revealed ? 'crosshair' : 'default' }}
      onClick={onCourt}
    >
      <rect x="-0.8" y="-1.2" width="10.6" height="12.2" fill="#E0F2FE" rx="0.4" />
      <rect x="0" y="0" width={COURT} height={COURT} fill="#FDBA74" stroke="#fff" strokeWidth="0.08" />
      <line x1="0" y1="3" x2={COURT} y2="3" stroke="#fff" strokeWidth="0.06" strokeDasharray="0.3 0.2" />
      {/* Net */}
      <rect x="-0.5" y="-0.22" width={COURT + 1} height="0.22" fill="#1F2937" />
      <text x={COURT / 2} y="-0.45" textAnchor="middle" fontSize="0.42" fill="#1F2937" fontWeight="700">NET</text>
      {showZones && Object.entries(BASE_SPOTS).map(([z, p]) => (
        <text key={z} x={p.x} y={p.y + 1.35} textAnchor="middle" fontSize="0.5" fill="rgba(124,45,18,0.55)" fontWeight="800">zone {z}</text>
      ))}
      {/* Legal area revealed after a placement answer */}
      {box && (
        <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0}
          fill="rgba(34,197,94,0.28)" stroke="#16A34A" strokeWidth="0.06" strokeDasharray="0.2 0.12" />
      )}
      {/* Fault lines */}
      {faults.map(f => (
        <line key={`${f.a}-${f.b}`} x1={q.pos[f.a].x} y1={q.pos[f.a].y} x2={q.pos[f.b].x} y2={q.pos[f.b].y}
          stroke="#DC2626" strokeWidth="0.12" strokeDasharray="0.25 0.15" />
      ))}
      {/* Players */}
      {[1, 2, 3, 4, 5, 6].map(z => {
        if (q.type === 'place' && z === q.zone) return null;
        const p = q.pos[z];
        const i = playerInZone(z, q.rot);
        const isServer = q.serving && z === 1;
        const sel = selected.includes(z);
        const fault = faultZones.has(z);
        const isAnswer = revealed && q.type === 'rotate' && q.answer.player === i;
        return (
          <g key={z} onClick={(e) => { e.stopPropagation(); onPlayer(z, i); }} style={{ cursor: q.type === 'rotate' || q.type === 'find' ? 'pointer' : 'default' }}>
            <circle cx={p.x} cy={p.y} r="0.62"
              fill={PLAYER_COLORS[i]}
              stroke={fault ? '#DC2626' : isAnswer ? '#16A34A' : sel ? '#111827' : '#fff'}
              strokeWidth={fault || sel || isAnswer ? 0.16 : 0.08} />
            <text x={p.x} y={p.y + 0.17} textAnchor="middle" fontSize={PLAYERS[i].length > 2 ? 0.4 : 0.48} fill="#fff" fontWeight="800" pointerEvents="none">{PLAYERS[i]}</text>
            {!showZones && (
              <text x={p.x} y={p.y + 1.05} textAnchor="middle" fontSize="0.36" fill="#7C2D12" fontWeight="700" pointerEvents="none">
                {isServer ? '🏐 serving' : `z${z}`}
              </text>
            )}
          </g>
        );
      })}
      {/* The player being placed, and where they were tapped */}
      {q.type === 'place' && (
        <g>
          {spot && <circle cx={spot.x} cy={spot.y} r="0.62" fill={PLAYER_COLORS[playerInZone(q.zone, q.rot)]} opacity="0.85" stroke="#111827" strokeWidth="0.1" />}
          {spot && <text x={spot.x} y={spot.y + 0.17} textAnchor="middle" fontSize="0.42" fill="#fff" fontWeight="800" pointerEvents="none">{PLAYERS[playerInZone(q.zone, q.rot)]}</text>}
        </g>
      )}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RotationTrainerGame({ isNative = false }) {
  const navigate = useNavigate();
  const { progress, recordWin } = useGameProgress(GAME_ID, STORE_KEY);

  const [screen, setScreen] = useState('levels');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [qi, setQi] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [mistakes, setMistakes] = useState(0);
  const [revealed, setRevealed] = useState(null); // { correct } once answered
  const [selected, setSelected] = useState([]);   // zones tapped (find)
  const [spot, setSpot] = useState(null);         // tapped spot (place)
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);
  const svgRef = useRef(null);
  const timerRef = useRef(null);

  const failed = lives <= 0;

  const startFresh = (lv) => {
    setQuestions(generateLevel(lv));
    setQi(0);
    setLives(MAX_LIVES);
    setMistakes(0);
    setRevealed(null);
    setSelected([]);
    setSpot(null);
    setDone(false);
    setElapsed(0);
  };

  useEffect(() => {
    if (screen === 'game') startFresh(currentLevel);
  }, [screen, currentLevel]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (screen === 'game' && !done && !failed) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, done, failed, currentLevel]);

  const q = questions[qi];

  const answer = (response) => {
    if (!q || revealed || failed || done) return;
    const correct = isCorrect(q, response);
    setRevealed({ correct });
    if (!correct) {
      setMistakes(m => m + 1);
      setLives(l => l - 1);
    }
  };

  const next = () => {
    if (qi + 1 < questions.length) {
      setQi(qi + 1);
      setRevealed(null);
      setSelected([]);
      setSpot(null);
      return;
    }
    setDone(true);
    clearInterval(timerRef.current);
    recordWin(currentLevel, { score: starsFor(mistakes), time: elapsed });
  };

  const onPlayer = (zone, playerIdx) => {
    if (!q || revealed) return;
    if (q.type === 'rotate') answer({ player: playerIdx });
    if (q.type === 'find') {
      const sel = selected.includes(zone) ? selected.filter(z => z !== zone) : [...selected, zone];
      setSelected(sel);
      if (sel.length === 2) answer({ pair: sel });
    }
  };

  const onCourt = (e) => {
    if (!q || q.type !== 'place' || revealed) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (p.x < 0 || p.x > COURT || p.y < 0 || p.y > COURT) return; // must stand in the court
    const tapped = { x: p.x, y: p.y };
    setSpot(tapped);
    answer({ spot: tapped });
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── LEVEL SELECT SCREEN ───────────────────────────────────────────────────
  if (screen === 'levels') {
    return (
      <GameLevelSelect
        icon="🔄" title="Rotation Trainer" subtitle="Learn the overlap rules · Volleyball IQ"
        accent="#EA580C" totalLevels={TOTAL_LEVELS} ranges={DIFF_RANGES} progress={progress}
        isNative={isNative}
        onBack={() => navigate('/puzzle')}
        onHowTo={() => setShowHowTo(true)}
        onPick={(lv) => { setCurrentLevel(lv); setScreen('game'); }}
        renderDone={(lv, r) => <Stars n={r.bestScore || 1} size={10} />}
      >
        {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      </GameLevelSelect>
    );
  }

  // ── GAME SCREEN ────────────────────────────────────────────────────────────
  if (!q) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>;

  const diff = getDiff(currentLevel);
  const setterZone = zoneOf(0, q.rot);
  const btn = { padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#333' };
  const big = { flex: 1, padding: '14px 0', borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: 'pointer' };

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),10px) 12px calc(90px + env(safe-area-inset-bottom))' : '10px 12px 20px', maxWidth: 520, margin: '0 auto', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button onClick={() => setScreen('levels')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#555', padding: '2px 6px 2px 0' }}>←</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Level {currentLevel}</span>
          <span style={{ fontSize: 12, color: tierColor(diff.label), fontWeight: 700, marginLeft: 8 }}>{diff.label}</span>
        </div>
        <button onClick={() => setShowHowTo(true)} style={{ background: '#EA580C', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>Rules</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: done ? '#22C55E' : '#333', minWidth: 44, textAlign: 'right' }}>
          {done ? '✅' : fmtTime(elapsed)}
        </div>
      </div>

      {/* Progress + lives */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <span key={i} style={{ fontSize: 16, marginRight: 2, opacity: i < lives ? 1 : 0.25, filter: i < lives ? 'none' : 'grayscale(1)' }}>❤️</span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Question {Math.min(qi + 1, QUESTIONS_PER_LEVEL)} / {QUESTIONS_PER_LEVEL}</div>
      </div>

      {/* Prompt */}
      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#9A3412', fontWeight: 800, letterSpacing: '0.04em', marginBottom: 3 }}>
          SETTER IN ZONE {setterZone}{q.serving ? ' · SERVING' : q.type === 'rotate' ? '' : ' · SERVE RECEIVE'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', lineHeight: 1.35 }}>{q.prompt}</div>
      </div>

      <div style={{ position: 'relative' }}>
        <Court q={q} revealed={!!revealed} selected={selected} spot={spot} onPlayer={onPlayer} onCourt={onCourt} svgRef={svgRef} />
        {failed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '18px 22px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.25)', maxWidth: 300 }}>
              <div style={{ fontSize: 34 }}>💔</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>Out of lives</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{revealed && !revealed.correct ? q.explain : 'Review the rules and start the level over.'}</div>
              <button onClick={() => startFresh(currentLevel)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#EA580C', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>↺ Try Again</button>
            </div>
          </div>
        )}
        {done && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '18px 22px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
              <Stars n={starsFor(mistakes)} size={34} />
              <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0 2px' }}>{mistakes === 0 ? 'Perfect rotation IQ!' : 'Level complete'}</div>
              <div style={{ fontSize: 13, color: '#666' }}>{mistakes === 0 ? 'No misses.' : `${mistakes} miss${mistakes > 1 ? 'es' : ''}.`}</div>
            </div>
          </div>
        )}
      </div>

      {/* Answer controls */}
      {q.type === 'legal' && !revealed && !failed && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={() => answer({ legal: true })} style={{ ...big, border: '2px solid #16A34A', background: '#F0FDF4', color: '#15803D' }}>✅ Legal</button>
          <button onClick={() => answer({ legal: false })} style={{ ...big, border: '2px solid #DC2626', background: '#FEF2F2', color: '#B91C1C' }}>❌ Overlap</button>
        </div>
      )}
      {q.type === 'find' && !revealed && (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#666', marginTop: 8 }}>Selected {selected.length} / 2</div>
      )}

      {/* Feedback */}
      {revealed && !failed && (
        <div style={{ marginTop: 12, borderRadius: 10, padding: '10px 12px', background: revealed.correct ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${revealed.correct ? '#86EFAC' : '#FCA5A5'}` }}>
          <div style={{ fontWeight: 800, color: revealed.correct ? '#15803D' : '#B91C1C', marginBottom: 3 }}>{revealed.correct ? '✅ Correct' : '❌ Not quite'}</div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.45 }}>{q.explain}</div>
          {!done && (
            <button onClick={next} style={{ ...btn, marginTop: 10, width: '100%', border: 'none', background: '#EA580C', color: '#fff', fontWeight: 800 }}>
              {qi + 1 < questions.length ? 'Next question →' : 'Finish level'}
            </button>
          )}
        </div>
      )}

      {/* Level nav */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => startFresh(currentLevel)} style={btn}>↺ Restart</button>
        {done && currentLevel < TOTAL_LEVELS && (
          <button onClick={() => setCurrentLevel(l => l + 1)} style={{ ...btn, border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700 }}>Next Level →</button>
        )}
        {!done && currentLevel > 1 && <button onClick={() => setCurrentLevel(l => l - 1)} style={{ ...btn, fontWeight: 400, color: '#555' }}>← Prev</button>}
        {!done && currentLevel < TOTAL_LEVELS && <button onClick={() => setCurrentLevel(l => l + 1)} style={{ ...btn, fontWeight: 400, color: '#555' }}>Skip →</button>}
      </div>
    </div>
  );
}
