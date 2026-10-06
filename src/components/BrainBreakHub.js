import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import FlowPuzzleGame from './FlowPuzzleGame';
import { loadLocalProgress, mergeProgress, fetchAllGameProgress } from '../utils/gameProgress';

// Brain Break games. Subscribers get this menu; everyone else goes straight to Flow.
const GAMES = [
  { id: 'flow',    path: '/puzzle/flow',    storeKey: 'loggerhead_flow_progress',    icon: '🔵', name: 'Flow Puzzles', blurb: 'Connect the dots · Fill the grid', total: 2100, accent: '#3B82F6' },
  { id: 'turtles', path: '/puzzle/turtles', storeKey: 'loggerhead_turtles_progress', icon: '🐢', name: 'Turtle Hunt',  blurb: 'Find the turtles · Read the nests', total: 1000, accent: '#0E7490' },
  { id: 'lineup',  path: '/puzzle/lineup',  storeKey: 'loggerhead_lineup_progress',  icon: '🏐', name: 'Lineup Sudoku', blurb: 'Every player once · Read the rotation courts', total: 1000, accent: '#B45309' },
  { id: 'shellslide', path: '/puzzle/shell-slide', storeKey: 'loggerhead_shellslide_progress', icon: '🌊', name: 'Shell Slide', blurb: 'Clear a path to the ocean', total: 1000, accent: '#0369A1' },
];

// Wrap subscriber-only games; non-subscribers land back on /puzzle (Flow).
export function SubscriberGame({ children }) {
  const { isSubscriber } = useAuth();
  return isSubscriber ? children : <Navigate to="/puzzle" replace />;
}

export default function BrainBreakHub({ isMobile = false, isNative = false }) {
  const navigate = useNavigate();
  const { token, isSubscriber } = useAuth();
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(GAMES.map(g => [g.id, Object.keys(loadLocalProgress(g.storeKey)).length]))
  );

  useEffect(() => {
    if (!token || !isSubscriber) return;
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
  }, [token, isSubscriber]);

  if (!isSubscriber) return <FlowPuzzleGame isMobile={isMobile} isNative={isNative} />;

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),16px) 16px calc(90px + env(safe-area-inset-bottom))' : '16px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#555', padding: '4px 8px 4px 0' }}>←</button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🧠 Brain Break</div>
          <div style={{ fontSize: 12, color: '#888' }}>Quick Puzzles Between Sets, Matches, Tournaments, Seasons</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {GAMES.map(g => {
          const done = counts[g.id] || 0;
          return (
            <button key={g.id} onClick={() => navigate(g.path)} style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%',
              padding: '16px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff',
              cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 34, lineHeight: 1 }}>{g.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#111' }}>{g.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{g.blurb}</div>
                <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (done / g.total) * 100)}%`, background: g.accent }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#555', fontWeight: 700, whiteSpace: 'nowrap' }}>{done}/{g.total}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
