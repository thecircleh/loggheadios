import React, { useState } from 'react';

const TIER_STYLES = {
  Easy:   { color: '#22C55E', bg: '#DCFCE7' },
  Medium: { color: '#3B82F6', bg: '#DBEAFE' },
  Hard:   { color: '#F59E0B', bg: '#FEF3C7' },
  Expert: { color: '#EF4444', bg: '#FEE2E2' },
  Master: { color: '#A855F7', bg: '#F3E8FF' },
  Max:    { color: '#DC2626', bg: '#1C0000', dark: true },
};

// [['Easy', 1, 100], ...] → ranges with the shared tier colors.
export const makeRanges = (tiers) => tiers.map(([label, lo, hi]) => ({
  ...TIER_STYLES[label], label: label === 'Max' ? '💀 Max' : label, tier: label, lo, hi,
}));
export const tierColor = (label) => TIER_STYLES[label]?.color || '#555';

// Shared Brain Break level-select screen: header, tier stats, page tabs, level grid.
// ranges: [{ label, lo, hi, color, bg }] — a range with dark: true gets the 💀 styling.
export default function GameLevelSelect({
  icon, title, subtitle, accent, totalLevels, ranges, progress,
  onPick, onBack, onHowTo, isNative = false, renderDone, children,
}) {
  const PER_PAGE = 100;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(totalLevels / PER_PAGE);
  const startLv = page * PER_PAGE + 1;
  const rangeOf = (lv) => ranges.find(r => lv >= r.lo && lv <= r.hi) || ranges[ranges.length - 1];

  return (
    <div style={{ padding: isNative ? 'max(env(safe-area-inset-top),16px) 16px calc(90px + env(safe-area-inset-bottom))' : '16px', maxWidth: 560, margin: '0 auto' }}>
      {children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#555', padding: '4px 8px 4px 0' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{icon} {title}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{subtitle}</div>
        </div>
        <button onClick={onHowTo} style={{ background: accent, border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0 }}>How to Play</button>
      </div>

      {/* Tier stats */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {ranges.map(({ label, lo, hi, color, bg, dark }) => {
          const done = Object.keys(progress).filter(l => +l >= lo && +l <= hi).length;
          return (
            <div
              key={label}
              onClick={() => setPage(Math.floor((lo - 1) / PER_PAGE))}
              style={{ flex: '1 0 80px', padding: '8px 10px', borderRadius: 8, background: bg, textAlign: 'center', cursor: 'pointer', border: `1px solid ${color}44` }}
            >
              <div style={{ fontSize: 11, color: dark ? '#ff9999' : '#555', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>{done}<span style={{ fontSize: 10, color: dark ? '#cc6666' : '#999', fontWeight: 400 }}>/{hi - lo + 1}</span></div>
            </div>
          );
        })}
      </div>

      {/* Page tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {Array.from({ length: totalPages }, (_, i) => (
          <button key={i} onClick={() => setPage(i)} style={{
            padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
            background: page === i ? '#111' : '#f0f0f0',
            color: page === i ? '#fff' : rangeOf(i * PER_PAGE + 1).color,
          }}>
            {i * PER_PAGE + 1}–{Math.min(totalLevels, i * PER_PAGE + PER_PAGE)}
          </button>
        ))}
      </div>

      {/* Level grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
        {Array.from({ length: Math.min(PER_PAGE, totalLevels - startLv + 1) }, (_, i) => {
          const lv = startLv + i;
          const result = progress[lv];
          const { color, dark } = rangeOf(lv);
          return (
            <button key={lv} onClick={() => onPick(lv)} style={{
              aspectRatio: '1', borderRadius: 5, padding: 0,
              border: result ? `2px solid ${color}` : dark ? '1px solid #7f1d1d' : '1px solid #e0e0e0',
              background: result ? (dark ? '#3b0a0a' : '#e8f5e9') : dark ? '#1C0000' : '#fafafa',
              cursor: 'pointer', fontSize: result ? 14 : 9, fontWeight: result ? 700 : 400,
              color: result ? (dark ? '#fca5a5' : '#166534') : dark ? '#7f1d1d' : '#777',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {result ? renderDone(lv, result) : lv}
            </button>
          );
        })}
      </div>
    </div>
  );
}
