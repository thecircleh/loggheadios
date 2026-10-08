import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { loadLocalProgress, mergeProgress, fetchAllGameProgress } from '../utils/gameProgress';

// Brain Break games. Subscribers play everything; free users get one game a day,
// rotating through this list in order (same game for everyone on a given day).
const GAMES = [
  { id: 'flow',    path: '/puzzle/flow',    storeKey: 'loggerhead_flow_progress',    icon: '🔵', name: 'Flow Puzzles', blurb: 'Connect the dots · Fill the grid', total: 2100, accent: '#3B82F6' },
  { id: 'turtles', path: '/puzzle/turtles', storeKey: 'loggerhead_turtles_progress', icon: '🐢', name: 'Turtle Hunt',  blurb: 'Find the turtles · Read the nests', total: 1000, accent: '#0E7490' },
  { id: 'lineup',  path: '/puzzle/lineup',  storeKey: 'loggerhead_lineup_progress',  icon: '🏐', name: 'Lineup Sudoku', blurb: 'Every player once · Read the rotation courts', total: 1000, accent: '#B45309' },
  { id: 'shellslide', path: '/puzzle/shell-slide', storeKey: 'loggerhead_shellslide_progress', icon: '🌊', name: 'Shell Slide', blurb: 'Clear a path to the ocean', total: 1000, accent: '#0369A1' },
  { id: 'gemtray', path: '/puzzle/gem-tray', storeKey: 'loggerhead_gemtray_progress', icon: '💎', name: 'Gem Tray', blurb: 'Plan your picks · Three of a kind clear', total: 1000, accent: '#7C3AED' },
  { id: 'rotation', path: '/puzzle/rotation-trainer', storeKey: 'loggerhead_rotation_progress', icon: '🔄', name: 'Rotation Trainer', blurb: 'Learn the overlap rules · Volleyball IQ', total: 500, accent: '#EA580C' },
];

// Games free every day on top of the daily one (e.g. ['flow']). Empty = daily game only.
const ALWAYS_FREE = [];
const SPIN_KEY = 'lh_brainbreak_spun';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Whole days since the epoch for the viewer's local calendar date.
const localDayNumber = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const localDateKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const freeGameIndexOn = (date = new Date()) => localDayNumber(date) % GAMES.length;
export const isFreeToday = (gameId) =>
  ALWAYS_FREE.includes(gameId) || GAMES[freeGameIndexOn()].id === gameId;

// Next date (within the coming week) a game is free.
function nextFreeDate(gameIdx) {
  for (let k = 1; k <= GAMES.length; k++) {
    const d = new Date();
    d.setDate(d.getDate() + k);
    if (freeGameIndexOn(d) === gameIdx) return { date: d, inDays: k };
  }
  return null;
}

// Route guard: subscribers play everything; others only today's free game(s).
export function SubscriberGame({ gameId, children }) {
  const { isSubscriber } = useAuth();
  return isSubscriber || isFreeToday(gameId) ? children : <Navigate to="/puzzle" replace />;
}

// ── Slot machine: three reels that always land on today's game ───────────────
const REEL_H = 64;
function SlotMachine({ target, onDone }) {
  const [spinning, setSpinning] = useState(false);
  const [settled, setSettled] = useState(false);
  // Each reel scrolls through a few full cycles, later reels a cycle longer, then stops on target.
  const reels = [0, 1, 2].map(k => {
    const stop = (3 + k) * GAMES.length + target;
    return { stop, strip: Array.from({ length: stop + 1 }, (_, i) => GAMES[i % GAMES.length]), ms: 1500 + k * 450 };
  });

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSettled(true); onDone(); }, reels[2].ms + 150);
  };

  return (
    <div style={{ borderRadius: 16, padding: 16, marginBottom: 16, background: 'linear-gradient(160deg, #7C3AED, #4C1D95)', color: '#fff', textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', opacity: 0.85 }}>🎰 TODAY'S FREE GAME</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '12px 0' }}>
        {reels.map((r, k) => (
          <div key={k} style={{ width: 70, height: REEL_H, overflow: 'hidden', borderRadius: 10, background: '#fff', boxShadow: settled ? '0 0 16px #FDE047' : 'inset 0 4px 8px rgba(0,0,0,0.25)', transition: 'box-shadow 0.3s' }}>
            <div style={{
              transform: `translateY(${spinning ? -r.stop * REEL_H : 0}px)`,
              transition: spinning ? `transform ${r.ms}ms cubic-bezier(0.15, 0.6, 0.25, 1)` : 'none',
            }}>
              {r.strip.map((g, i) => (
                <div key={i} style={{ height: REEL_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{g.icon}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={spin} disabled={spinning} style={{
        padding: '11px 28px', borderRadius: 999, border: 'none', fontSize: 15, fontWeight: 900, cursor: spinning ? 'default' : 'pointer',
        background: spinning ? 'rgba(255,255,255,0.3)' : '#FDE047', color: '#4C1D95',
      }}>
        {spinning ? 'Spinning…' : 'SPIN'}
      </button>
    </div>
  );
}

export default function BrainBreakHub({ isNative = false }) {
  const navigate = useNavigate();
  const { token, isSubscriber } = useAuth();
  const todayIdx = freeGameIndexOn();
  const today = GAMES[todayIdx];
  const [spunToday, setSpunToday] = useState(() => {
    try { return localStorage.getItem(SPIN_KEY) === localDateKey(); } catch { return false; }
  });
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(GAMES.map(g => [g.id, Object.keys(loadLocalProgress(g.storeKey)).length]))
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchAllGameProgress(token)
      .then(rows => {
        if (cancelled) return;
        const next = {};
        GAMES.forEach(g => {
          const server = rows.find(r => r.game === g.id)?.levels || {};
          next[g.id] = Object.keys(mergeProgress(loadLocalProgress(g.storeKey), server)).length;
        });
        setCounts(next);
      })
      .catch(err => console.warn('Brain Break progress load failed:', err?.message));
    return () => { cancelled = true; };
  }, [token]);

  const markSpun = () => {
    setSpunToday(true);
    try { localStorage.setItem(SPIN_KEY, localDateKey()); } catch {}
  };

  const tomorrow = GAMES[(todayIdx + 1) % GAMES.length];

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),16px) 16px calc(90px + env(safe-area-inset-bottom))' : '16px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#555', padding: '4px 8px 4px 0' }}>←</button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🧠 Brain Break</div>
          <div style={{ fontSize: 12, color: '#888' }}>Quick Puzzles Between Sets, Matches, Tournaments, Seasons</div>
        </div>
      </div>

      {/* Free users: today's game (spin to reveal once a day) */}
      {!isSubscriber && (
        spunToday ? (
          <div style={{ borderRadius: 16, padding: 16, marginBottom: 16, background: 'linear-gradient(160deg, #7C3AED, #4C1D95)', color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 42, lineHeight: 1 }}>{today.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', opacity: 0.85 }}>TODAY'S FREE GAME</div>
              <div style={{ fontSize: 19, fontWeight: 900 }}>{today.name}</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Tomorrow: {tomorrow.icon} {tomorrow.name}</div>
            </div>
            <button onClick={() => navigate(today.path)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#FDE047', color: '#4C1D95', fontWeight: 900, fontSize: 14, cursor: 'pointer' }}>Play →</button>
          </div>
        ) : (
          <SlotMachine target={todayIdx} onDone={markSpun} />
        )
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {GAMES.map((g, idx) => {
          const done = counts[g.id] || 0;
          const unlocked = isSubscriber || isFreeToday(g.id);
          const freeNext = !unlocked && nextFreeDate(idx);
          const freeLabel = freeNext && (freeNext.inDays === 1 ? 'Free tomorrow' : `Free on ${DAY_NAMES[freeNext.date.getDay()]}`);
          return (
            <button key={g.id} onClick={() => navigate(unlocked ? g.path : '/profile?section=subscription')} style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%',
              padding: '16px 16px', borderRadius: 12, border: `1px solid ${!isSubscriber && unlocked ? '#A78BFA' : '#e5e7eb'}`,
              background: unlocked ? '#fff' : '#F9FAFB', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 34, lineHeight: 1, filter: unlocked ? 'none' : 'grayscale(0.8)', opacity: unlocked ? 1 : 0.6 }}>{g.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: unlocked ? '#111' : '#6B7280' }}>
                  {g.name}
                  {!isSubscriber && unlocked && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 900, color: '#fff', background: '#7C3AED', borderRadius: 4, padding: '2px 6px', verticalAlign: 'middle' }}>FREE TODAY</span>}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {unlocked ? g.blurb : `🔒 Premium · ${freeLabel}`}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (done / g.total) * 100)}%`, background: unlocked ? g.accent : '#D1D5DB' }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#555', fontWeight: 700, whiteSpace: 'nowrap' }}>{done}/{g.total}</div>
            </button>
          );
        })}
      </div>

      {!isSubscriber && (
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#6B7280' }}>
          A new free game every day.{' '}
          <button onClick={() => navigate('/profile?section=subscription')} style={{ background: 'none', border: 'none', padding: 0, color: '#7C3AED', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
            Go Premium to play all {GAMES.length} anytime →
          </button>
        </div>
      )}
    </div>
  );
}
