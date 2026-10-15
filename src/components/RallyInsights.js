import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RallyInsightsHelp from './RallyInsightsHelp';
import {
  setWinProb, matchWinProb, rallyLeverage, sideOutStats, sideOutEdgeTable, runProbability,
} from '../utils/winProbability';

// Live Markov-chain insights for Match Tracking: win probability, pressure points, momentum
// and side-out. Subscribers see the numbers; everyone else sees the same card with locks.
//
// rallies / pastRallies: [{ us, them, srv: 'our'|'their', won: 'our'|'their', rot }]
export default function RallyInsights({
  rallies = [], pastRallies = [], ourScore = 0, opponentScore = 0, servingSide = 'our',
  setsUs = 0, setsThem = 0, setNumber = 1, matchSettings = {}, isSubscriber = false,
  opponentName = 'Opponent', teamName = 'Us',
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const bestOf = Number(matchSettings?.totalSets) || 3;
  const playAllSets = !!matchSettings?.playAllSets;
  const target = Number(matchSettings?.pointsNonDeciding) || 25;
  const decidingTarget = Number(matchSettings?.pointsDeciding) || 15;
  const setTarget = setNumber >= bestOf ? decidingTarget : target;
  const weServe = servingSide === 'our';

  const all = useMemo(
    () => [...pastRallies, ...rallies].map(r => ({ weServed: r.srv === 'our', weWon: r.won === 'our', rot: r.rot })),
    [pastRallies, rallies]
  );
  const so = useMemo(() => sideOutStats(all), [all]);

  const live = useMemo(() => {
    const set = setWinProb(ourScore, opponentScore, weServe, so.soUs, so.soThem, setTarget);
    const match = playAllSets ? null : matchWinProb({
      setsUs, setsThem, us: ourScore, them: opponentScore, weServe,
      soUs: so.soUs, soThem: so.soThem, bestOf, target, decidingTarget,
    });
    const leverage = rallyLeverage(ourScore, opponentScore, weServe, so.soUs, so.soThem, setTarget);
    return { set, match, leverage };
  }, [ourScore, opponentScore, weServe, so, setsUs, setsThem, bestOf, target, decidingTarget, setTarget, playAllSets]);

  // Current run in this set (consecutive rallies won by the same team).
  const run = useMemo(() => {
    if (!rallies.length) return null;
    const last = rallies[rallies.length - 1].won;
    let n = 0;
    for (let i = rallies.length - 1; i >= 0 && rallies[i].won === last; i--) n++;
    return { length: n, ours: last === 'our' };
  }, [rallies]);

  const runChance = useMemo(() => {
    if (!run || run.length < 4) return null;
    const expectedRallies = Math.max(rallies.length, setTarget * 2 - 5);
    return runProbability(run.length, expectedRallies, so.soUs, so.soThem, 3000);
  }, [run, rallies.length, setTarget, so.soUs, so.soThem]);

  // Our side-out % in each rotation (rallies they served).
  const byRotation = useMemo(() => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ rot: i, chances: 0, won: 0 }));
    for (const r of all) {
      if (r.weServed || r.rot == null || !rows[r.rot]) continue;
      rows[r.rot].chances++;
      if (r.weWon) rows[r.rot].won++;
    }
    return rows;
  }, [all]);

  const edge = useMemo(() => sideOutEdgeTable(so.soThem, [0, 0.02, 0.05], playAllSets ? 3 : bestOf), [so.soThem, bestOf, playAllSets]);

  const pct = (v) => `${Math.round(v * 100)}%`;
  const lock = <span aria-label="Premium" style={st.lock}>🔒</span>;
  const val = (v) => (isSubscriber ? v : lock);
  const bigPoint = live.leverage >= 0.2;
  const runRare = runChance != null && runChance < 0.1;

  return (
    <div style={st.card}>
      <div style={st.header}>
        <span style={st.title}>📈 Rally Insights</span>
        {!isSubscriber && <span style={st.premiumTag}>Premium</span>}
        <button type="button" onClick={() => setOpen(o => !o)} style={st.toggle}>{open ? 'Less ▲' : 'Side-out ▼'}</button>
        <button type="button" onClick={() => setShowHelp(true)} style={st.help} aria-label="How Rally Insights works">?</button>
      </div>
      {showHelp && <RallyInsightsHelp onClose={() => setShowHelp(false)} />}

      <div style={st.row}>
        <div style={st.stat}>
          <div style={st.statLabel}>Set win</div>
          <div style={{ ...st.statValue, color: isSubscriber ? colorFor(live.set) : '#94A3B8' }}>{val(pct(live.set))}</div>
        </div>
        {!playAllSets && (
          <div style={st.stat}>
            <div style={st.statLabel}>Match win</div>
            <div style={{ ...st.statValue, color: isSubscriber ? colorFor(live.match) : '#94A3B8' }}>{val(pct(live.match))}</div>
          </div>
        )}
        <div style={st.stat}>
          <div style={st.statLabel}>Side-out</div>
          <div style={st.statSmall}>{val(`${so.rawUs == null ? '–' : pct(so.rawUs)} vs ${so.rawThem == null ? '–' : pct(so.rawThem)}`)}</div>
        </div>
      </div>

      {bigPoint && (
        <div style={st.pressure}>
          🔥 Pressure point{isSubscriber
            ? <> — this rally swings the set by <strong>{pct(live.leverage)}</strong>{live.leverage >= 0.3 ? '. Good moment for a timeout.' : '.'}</>
            : <> — how much this rally matters is {lock}</>}
        </div>
      )}

      {run && run.length >= 4 && (
        <div style={{ ...st.run, ...(runRare && isSubscriber ? st.runRare : {}) }}>
          {run.ours ? '🟢' : '🔴'} {run.length}-0 run for {run.ours ? teamName : opponentName}.{' '}
          {isSubscriber
            ? (runRare
              ? <>Pure chance makes a run this long in only <strong>{pct(runChance)}</strong> of sets — something real is happening.</>
              : <>Chance alone does this in <strong>{pct(runChance)}</strong> of sets — likely a normal swing, not momentum.</>)
            : <>Real momentum or normal swing? {lock}</>}
        </div>
      )}

      {open && (
        <div style={st.more}>
          <div style={st.moreTitle}>Your side-out % by rotation</div>
          <div style={st.rotGrid}>
            {byRotation.map(r => (
              <div key={r.rot} style={st.rotCell}>
                <div style={st.rotLabel}>R{r.rot + 1}</div>
                <div style={st.rotValue}>{isSubscriber ? (r.chances ? pct(r.won / r.chances) : '–') : '🔒'}</div>
                <div style={st.rotSub}>{isSubscriber && r.chances ? `${r.won}/${r.chances}` : ''}</div>
              </div>
            ))}
          </div>
          <div style={st.moreTitle}>What a better side-out is worth</div>
          {isSubscriber ? (
            <div style={st.edgeList}>
              {edge.map((e, i) => (
                <div key={i} style={st.edgeRow}>
                  <span>{i === 0 ? 'Even with them' : `+${Math.round((e.soUs - so.soThem) * 100)}% side-out`}</span>
                  <span><strong>{pct(e.set)}</strong> sets · <strong>{pct(e.match)}</strong> matches</span>
                </div>
              ))}
              <div style={st.note}>Small side-out edges compound: one more side-out per 50 rallies adds up over a match.</div>
            </div>
          ) : (
            <div style={st.note}>See how much each extra point of side-out % raises your odds of winning sets and matches. {lock}</div>
          )}
        </div>
      )}

      {!isSubscriber && (
        <button type="button" onClick={() => navigate('/profile?section=subscription')} style={st.upsell}>
          Unlock live win %, pressure points & momentum →
        </button>
      )}
    </div>
  );
}

const colorFor = (p) => (p >= 0.6 ? '#15803D' : p <= 0.4 ? '#B91C1C' : '#0F172A');

const st = {
  card: { margin: '8px auto', padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #E2E8F0', maxWidth: 520, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontWeight: 800, fontSize: 14, color: '#0F172A', flex: 1 },
  premiumTag: { fontSize: 10, fontWeight: 900, color: '#fff', background: '#7C3AED', borderRadius: 4, padding: '2px 6px' },
  toggle: { background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 },
  help: { width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #94A3B8', background: '#fff', color: '#475569', fontWeight: 900, fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: '18px' },
  row: { display: 'flex', gap: 8 },
  stat: { flex: 1, textAlign: 'center', background: '#F8FAFC', borderRadius: 8, padding: '6px 4px' },
  statLabel: { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' },
  statValue: { fontSize: 22, fontWeight: 900, lineHeight: 1.2 },
  statSmall: { fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 4 },
  lock: { fontSize: 15, filter: 'grayscale(0.2)' },
  pressure: { marginTop: 8, padding: '7px 10px', borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', fontSize: 13, color: '#7C2D12' },
  run: { marginTop: 8, padding: '7px 10px', borderRadius: 8, background: '#F1F5F9', fontSize: 13, color: '#1E293B' },
  runRare: { background: '#FEF2F2', border: '1px solid #FCA5A5' },
  more: { marginTop: 10, borderTop: '1px solid #E2E8F0', paddingTop: 8 },
  moreTitle: { fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 6px' },
  rotGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 8 },
  rotCell: { textAlign: 'center', background: '#F8FAFC', borderRadius: 6, padding: '4px 0' },
  rotLabel: { fontSize: 10, color: '#64748B', fontWeight: 700 },
  rotValue: { fontSize: 13, fontWeight: 800, color: '#0F172A' },
  rotSub: { fontSize: 9, color: '#94A3B8', minHeight: 11 },
  edgeList: { fontSize: 12, color: '#1E293B' },
  edgeRow: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed #E2E8F0' },
  note: { fontSize: 11, color: '#64748B', marginTop: 6 },
  upsell: { marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
};
