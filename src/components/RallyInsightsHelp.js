import React from 'react';

// Plain-language explainer for Rally Insights / Rally Report. Shown to everyone (free users
// learn what the locked numbers do).
const SECTIONS = [
  {
    icon: '🔁',
    title: 'Side-out % — the number everything is built on',
    body: 'When the other team serves, did you win the rally? That\'s a side-out. Your side-out % is how often you do it. Their side-out % is how often they win the rally on your serve. In rally scoring, these two numbers decide who wins: every point is either a side-out or a point on serve.',
  },
  {
    icon: '📈',
    title: 'Set win % and Match win %',
    body: 'Your chance of winning this set and the match from the current score, who is serving, and both teams\' side-out % so far. Early in a match there are few rallies to go on, so it starts from a typical 60% side-out and adjusts as rallies are logged. It\'s an estimate from the math of rally scoring — not a guarantee.',
  },
  {
    icon: '🔥',
    title: 'Pressure point',
    body: 'Some rallies matter far more than others. At 5–5 a rally moves your set chances about 13%; at 23–23 it moves them about 45%; down 20–24 only about 3%. A pressure point means the next rally swings the set by 20% or more. At 30% or more it suggests a timeout — that\'s when one rally decides the most.',
  },
  {
    icon: '🌊',
    title: 'Momentum check',
    body: 'When a team scores 4 or more in a row, Rally Insights asks: how often would a run this long happen by pure chance, given how both teams side out? A 5-point run happens by chance in about half of all sets — usually a normal swing. If chance alone would do it less than 10% of the time, it flags the run as rare: something real is happening (a serving streak, a rotation problem) worth acting on.',
  },
  {
    icon: '🔄',
    title: 'Side-out by rotation (R1–R6)',
    body: 'Your side-out % in each rotation, counted from the lineup you started the set in (R1). Low numbers show which rotation struggles to get the ball back — a place to adjust the lineup, serve receive, or setter options.',
  },
  {
    icon: '➕',
    title: 'What a better side-out is worth',
    body: 'Small edges add up. Winning just 2 more rallies out of every 100 the other team serves raises your chance of winning a set and a match by more than you\'d expect, because the edge compounds over every rally. This table shows what +2% and +5% side-out would mean for you against this opponent.',
  },
  {
    icon: '📊',
    title: 'Biggest swings (after the match)',
    body: 'The five rallies that changed your chance of winning the match the most — usually late in close sets. Good clips to review with the team.',
  },
  {
    icon: '📝',
    title: 'Where the data comes from',
    body: 'Every point you log records the score, who served, who won, and your rotation. Nothing extra to tap. Undoing a point removes its rally. If you correct the score by editing it directly, that correction isn\'t counted as a rally.',
  },
];

export default function RallyInsightsHelp({ onClose }) {
  return (
    <div style={st.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="How Rally Insights works">
      <div style={st.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={st.title}>📈 How Rally Insights works</div>
        <p style={st.lede}>
          Volleyball with rally scoring follows simple math: each rally is decided by who is serving and how well each
          team sides out. Rally Insights uses that math on the rallies you log to show what's really happening.
        </p>
        {SECTIONS.map((s) => (
          <div key={s.title} style={st.section}>
            <div style={st.sectionTitle}><span style={st.icon}>{s.icon}</span>{s.title}</div>
            <div style={st.body}>{s.body}</div>
          </div>
        ))}
        <button type="button" onClick={onClose} style={st.close}>Got it</button>
      </div>
    </div>
  );
}

const st = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { background: '#fff', borderRadius: 16, padding: '18px 18px 14px', maxWidth: 440, width: '100%', maxHeight: '88vh', overflowY: 'auto' },
  title: { fontSize: 19, fontWeight: 900, marginBottom: 8, color: '#0F172A' },
  lede: { fontSize: 13, color: '#334155', lineHeight: 1.5, margin: '0 0 10px' },
  section: { padding: '9px 0', borderTop: '1px solid #F1F5F9' },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 3 },
  icon: { width: 22, textAlign: 'center', flexShrink: 0 },
  body: { fontSize: 13, color: '#475569', lineHeight: 1.5, paddingLeft: 30 },
  close: { width: '100%', marginTop: 12, padding: 11, borderRadius: 10, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' },
};
