import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RallyInsightsHelp from './RallyInsightsHelp';
import { matchWinProb, sideOutStats, sideOutEdgeTable, longestRun, runProbability } from '../utils/winProbability';

// After-match rally analysis for Match Tracking (coach stats page).
// sets: coach-analytics sets ({ setNumber, matchId, rallyLog, winner, setScore }) for one
// match or a whole season. Biggest swings need a single match; side-out works for both.
export default function MatchRallyReport({ sets = [], singleMatch = false, isSubscriber = false, isMobile = false }) {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  const ordered = useMemo(
    () => [...sets].filter(s => Array.isArray(s.rallyLog) && s.rallyLog.length)
      .sort((a, b) => String(a.matchId).localeCompare(String(b.matchId)) || (a.setNumber || 0) - (b.setNumber || 0)),
    [sets]
  );
  const rallies = useMemo(
    () => ordered.flatMap(s => s.rallyLog.map(r => ({ weServed: r.srv === 'our', weWon: r.won === 'our', rot: r.rot, set: s.setNumber, us: r.us, them: r.them }))),
    [ordered]
  );
  const so = useMemo(() => sideOutStats(rallies), [rallies]);

  const byRotation = useMemo(() => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ rot: i, chances: 0, won: 0 }));
    for (const r of rallies) {
      if (r.weServed || r.rot == null || !rows[r.rot]) continue;
      rows[r.rot].chances++;
      if (r.weWon) rows[r.rot].won++;
    }
    return rows;
  }, [rallies]);

  // Single match: each rally's swing in match win probability, using this match's side-out rates.
  const swings = useMemo(() => {
    if (!singleMatch || !ordered.length) return [];
    const bestOf = ordered.length > 3 ? 5 : 3;
    const out = [];
    let setsUs = 0, setsThem = 0;
    for (const s of ordered) {
      const target = s.setNumber >= bestOf ? 15 : 25;
      const log = s.rallyLog;
      log.forEach((r, i) => {
        const weWon = r.won === 'our';
        const before = { us: r.us - (weWon ? 1 : 0), them: r.them - (weWon ? 0 : 1), weServe: r.srv === 'our' };
        const pBefore = matchWinProb({ setsUs, setsThem, ...before, soUs: so.soUs, soThem: so.soThem, bestOf, target: 25, decidingTarget: 15 });
        const setOver = (r.us >= target || r.them >= target) && Math.abs(r.us - r.them) >= 2;
        const pAfter = setOver
          ? matchWinProb({ setsUs: setsUs + (weWon ? 1 : 0), setsThem: setsThem + (weWon ? 0 : 1), us: 0, them: 0, weServe: weWon, soUs: so.soUs, soThem: so.soThem, bestOf, target: 25, decidingTarget: 15 })
          : matchWinProb({ setsUs, setsThem, us: r.us, them: r.them, weServe: weWon, soUs: so.soUs, soThem: so.soThem, bestOf, target: 25, decidingTarget: 15 });
        out.push({ set: s.setNumber, before, after: { us: r.us, them: r.them }, weWon, served: r.srv, swing: pAfter - pBefore, idx: i });
        if (setOver && i === log.length - 1) { if (weWon) setsUs++; else setsThem++; }
      });
    }
    return out.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing)).slice(0, 5);
  }, [singleMatch, ordered, so.soUs, so.soThem]);

  const runs = useMemo(() => {
    if (!singleMatch) return [];
    return ordered.map(s => {
      const lr = longestRun(s.rallyLog.map(r => ({ weWon: r.won === 'our' })));
      return { set: s.setNumber, ...lr, chance: lr.length >= 4 ? runProbability(lr.length, s.rallyLog.length, so.soUs, so.soThem, 3000) : null };
    }).filter(r => r.length >= 4);
  }, [singleMatch, ordered, so.soUs, so.soThem]);

  const edge = useMemo(() => sideOutEdgeTable(so.soThem, [0, 0.02, 0.05]), [so.soThem]);
  const pct = v => `${Math.round(v * 100)}%`;
  const signed = v => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  const lock = '🔒';

  if (!rallies.length) {
    return (
      <div style={st.card}>
        <div style={st.header}>
          <span style={st.title}>📈 Rally Report</span>
          <button type="button" onClick={() => setShowHelp(true)} style={{ ...st.help, marginLeft: 'auto' }} aria-label="How the Rally Report works">?</button>
        </div>
        {showHelp && <RallyInsightsHelp onClose={() => setShowHelp(false)} />}
        <div style={st.note}>Rally-by-rally data is saved for matches tracked from this update on. Track a match in Match Tracking to see win-probability swings, momentum and side-out by rotation here.</div>
      </div>
    );
  }

  return (
    <div style={st.card}>
      <div style={st.header}>
        <span style={st.title}>📈 Rally Report</span>
        {!isSubscriber && <span style={st.premiumTag}>Premium</span>}
        <span style={st.count}>{rallies.length} rallies</span>
        <button type="button" onClick={() => setShowHelp(true)} style={st.help} aria-label="How the Rally Report works">?</button>
      </div>
      {showHelp && <RallyInsightsHelp onClose={() => setShowHelp(false)} />}

      <div style={{ ...st.row, flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={st.box}>
          <div style={st.boxTitle}>Side-out %</div>
          <div style={st.big}>{isSubscriber ? (so.rawUs == null ? '–' : pct(so.rawUs)) : lock} <span style={st.vs}>vs</span> {isSubscriber ? (so.rawThem == null ? '–' : pct(so.rawThem)) : lock}</div>
          <div style={st.small}>Us {so.ourSideOuts}/{so.ourChances} · Them {so.theirSideOuts}/{so.theirChances}</div>
          <div style={st.rotGrid}>
            {byRotation.map(r => (
              <div key={r.rot} style={st.rotCell}>
                <div style={st.rotLabel}>R{r.rot + 1}</div>
                <div style={st.rotValue}>{isSubscriber ? (r.chances ? pct(r.won / r.chances) : '–') : lock}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={st.box}>
          <div style={st.boxTitle}>What a better side-out is worth</div>
          {edge.map((e, i) => (
            <div key={i} style={st.edgeRow}>
              <span>{i === 0 ? 'Even with opponents' : `+${Math.round((e.soUs - so.soThem) * 100)}% side-out`}</span>
              <span>{isSubscriber ? <><strong>{pct(e.set)}</strong> sets · <strong>{pct(e.match)}</strong> matches</> : lock}</span>
            </div>
          ))}
        </div>
      </div>

      {singleMatch && (
        <>
          <div style={st.boxTitle}>Biggest swings</div>
          {swings.map((w, i) => (
            <div key={i} style={st.swingRow}>
              <span>Set {w.set}: {w.before.us}–{w.before.them} → {w.after.us}–{w.after.them} <span style={st.small}>({w.weWon ? 'our point' : 'their point'}, {w.served === 'our' ? 'we served' : 'they served'})</span></span>
              <strong style={{ color: isSubscriber ? (w.swing >= 0 ? '#15803D' : '#B91C1C') : '#94A3B8' }}>{isSubscriber ? `${signed(w.swing)} match win` : lock}</strong>
            </div>
          ))}
          {runs.length > 0 && (
            <>
              <div style={st.boxTitle}>Momentum check</div>
              {runs.map((r, i) => (
                <div key={i} style={st.swingRow}>
                  <span>Set {r.set}: {r.length}-0 run by {r.ours ? 'us' : 'them'}</span>
                  <span>{isSubscriber
                    ? (r.chance < 0.1 ? <strong style={{ color: '#B91C1C' }}>Rare — chance alone: {pct(r.chance)}</strong> : <>Normal swing — chance alone: {pct(r.chance)}</>)
                    : lock}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {!isSubscriber && (
        <button type="button" onClick={() => navigate('/profile?section=subscription')} style={st.upsell}>
          Unlock side-out by rotation, biggest swings & momentum →
        </button>
      )}
    </div>
  );
}

const st = {
  card: { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontWeight: 800, fontSize: 16, color: '#0F172A' },
  premiumTag: { fontSize: 10, fontWeight: 900, color: '#fff', background: '#7C3AED', borderRadius: 4, padding: '2px 6px' },
  count: { marginLeft: 'auto', fontSize: 12, color: '#64748B' },
  help: { width: 24, height: 24, borderRadius: '50%', border: '1.5px solid #94A3B8', background: '#fff', color: '#475569', fontWeight: 900, fontSize: 13, cursor: 'pointer', padding: 0 },
  row: { display: 'flex', gap: 12, marginBottom: 12 },
  box: { flex: 1, background: '#F8FAFC', borderRadius: 10, padding: 12 },
  boxTitle: { fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '8px 0 6px' },
  big: { fontSize: 24, fontWeight: 900, color: '#0F172A' },
  vs: { fontSize: 13, color: '#94A3B8', fontWeight: 600 },
  small: { fontSize: 11, color: '#64748B' },
  rotGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 8 },
  rotCell: { textAlign: 'center', background: '#fff', borderRadius: 6, padding: '4px 0' },
  rotLabel: { fontSize: 10, color: '#64748B', fontWeight: 700 },
  rotValue: { fontSize: 13, fontWeight: 800 },
  edgeRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px dashed #E2E8F0' },
  swingRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap' },
  note: { fontSize: 13, color: '#64748B', marginTop: 6, lineHeight: 1.5 },
  upsell: { marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
};
