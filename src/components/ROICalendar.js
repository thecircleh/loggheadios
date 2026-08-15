import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || 'https://api.loggerhead.app';
};
const API_URL = getApiUrl();

const CATEGORIES = [
  { key: 'training',   label: 'Training',   icon: '🏋️', color: '#3b82f6' },
  { key: 'fees',       label: 'Team Fees',  icon: '💳', color: '#8b5cf6' },
  { key: 'travel',     label: 'Travel',     icon: '✈️', color: '#f97316' },
  { key: 'equipment',  label: 'Equipment',  icon: '🎽', color: '#10b981' },
  { key: 'tournament', label: 'Tournament', icon: '🏆', color: '#f59e0b' },
  { key: 'other',      label: 'Other',      icon: '📌', color: '#6b7280' },
];

const STAT_LINES = [
  { key: 'killsPerGame',   label: 'Kills/Gm',  colorL: '#2a78d6', colorD: '#3987e5' },
  { key: 'digsPerGame',    label: 'Digs/Gm',   colorL: '#1baf7a', colorD: '#199e70' },
  { key: 'acesPerGame',    label: 'Aces/Gm',   colorL: '#eda100', colorD: '#c98500' },
  { key: 'assistsPerGame', label: 'Asst/Gm',   colorL: '#4a3aa7', colorD: '#9085e9' },
  { key: 'hittingPct',     label: 'Hit%',       colorL: '#e34948', colorD: '#e66767' },
];

const FREQ_LABELS = { weekly: 'Weekly', biweekly: 'Every 2 wks', monthly: 'Monthly', yearly: 'Yearly' };
const FREQ_OPTS   = [
  { key: 'weekly',   label: 'Weekly'       },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly',  label: 'Monthly'       },
  { key: 'yearly',   label: 'Yearly'        },
];

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmt$ = (n) => '$' + Number(n || 0).toFixed(2).replace(/\.00$/, '');
function catInfo(key) { return CATEGORIES.find(c => c.key === key) || CATEGORIES[5]; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOf(y, m)  { return new Date(y, m, 1).getDay(); }
function dayKey(d) {
  if (!d) return '';
  const s = typeof d === 'string' ? d : new Date(d).toISOString();
  return s.slice(0, 10);
}

// Returns 0-indexed day numbers in `year/month` when a recurring template fires
function occurrenceDaysInMonth(template, year, month) {
  const startDate = new Date(template.startDate);
  const startKey  = dayKey(template.startDate);
  const endKey    = template.endDate ? dayKey(template.endDate) : null;
  const monthStr  = `${year}-${String(month + 1).padStart(2, '0')}`;

  if (startKey.slice(0, 7) > monthStr) return [];
  if (endKey && endKey.slice(0, 7) < monthStr) return [];

  const dInM  = daysInMonth(year, month);
  const freq  = template.frequency;
  const sDay  = startDate.getDate();
  const sMon  = startDate.getMonth();
  const days  = [];

  if (freq === 'monthly') {
    days.push(Math.min(sDay, dInM));
  } else if (freq === 'yearly') {
    if (sMon === month) days.push(Math.min(sDay, dInM));
  } else {
    const interval = freq === 'weekly' ? 7 : 14;
    const firstOfMonth = new Date(year, month, 1);
    const daysSinceStart = Math.floor((firstOfMonth - startDate) / 86400000);
    const offset = daysSinceStart >= 0
      ? (interval - (daysSinceStart % interval)) % interval
      : 0;
    // if start is within this month, first occurrence is sDay
    let day = startKey.startsWith(monthStr) ? sDay : 1 + offset;
    while (day <= dInM) { days.push(day); day += interval; }
  }

  return days.filter(day => {
    const k = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return k >= startKey && (!endKey || k <= endKey);
  });
}

function expandRecurringForMonth(templates, year, month) {
  const virtual = [];
  for (const t of templates) {
    for (const day of occurrenceDaysInMonth(t, year, month)) {
      const cellKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      virtual.push({
        _id: `rec-${t._id}-${cellKey}`,
        date: cellKey,
        category: t.category,
        amount: t.amount,
        note: t.note,
        isRecurring: true,
        recurringId: t._id,
        recurringFreq: FREQ_LABELS[t.frequency],
      });
    }
  }
  return virtual;
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function ROICalendar() {
  const { token, hasPremium } = useAuth();
  const navigate = useNavigate();
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;

  const [claimedPlayers,    setClaimedPlayers]    = useState([]);
  const [selPlayerIdx,      setSelPlayerIdx]      = useState(0);
  const [expenses,          setExpenses]          = useState([]);
  const [allExpenses,       setAllExpenses]       = useState([]);
  const [currentMonth,      setCurrentMonth]      = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay,       setSelectedDay]       = useState(null);
  const [showModal,         setShowModal]         = useState(false);
  const [editingExpense,    setEditingExpense]    = useState(null);
  const [formData,          setFormData]          = useState({ date: '', category: 'training', amount: '', note: '' });
  const [loadingPlayers,    setLoadingPlayers]    = useState(true);
  const [loadingExpenses,   setLoadingExpenses]   = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState('');

  // Recurring
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [showRecurringSection, setShowRecurringSection] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring,   setEditingRecurring]   = useState(null);
  const [recForm, setRecForm] = useState({ startDate: '', endDate: '', frequency: 'monthly', category: 'fees', amount: '', note: '' });
  const [recError, setRecError] = useState('');
  const [savingRec, setSavingRec] = useState(false);

  // Timeline
  const [showTimeline,    setShowTimeline]    = useState(false);
  const [timelineData,    setTimelineData]    = useState(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [spendMode,       setSpendMode]       = useState('monthly'); // 'monthly' | 'cumulative'
  const [visibleStats,    setVisibleStats]    = useState(['killsPerGame']);

  const headers = { Authorization: `Bearer ${token}` };
  const player  = claimedPlayers[selPlayerIdx] || null;

  // ── Loaders ─────────────────────────────────────────────────────────────
  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const res  = await fetch(`${API_URL}/api/roi/claimed-players`, { headers });
      const data = await res.json();
      setClaimedPlayers(data.players || []);
    } catch { setError('Failed to load players'); }
    finally { setLoadingPlayers(false); }
  }, [token]);

  const loadExpenses = useCallback(async (p, month) => {
    if (!p) return;
    setLoadingExpenses(true);
    try {
      const y  = month.getFullYear();
      const mo = month.getMonth();
      const [mRes, aRes] = await Promise.all([
        fetch(`${API_URL}/api/roi/expenses?playerId=${p._id}&year=${y}&month=${mo}`, { headers }),
        fetch(`${API_URL}/api/roi/expenses?playerId=${p._id}`, { headers }),
      ]);
      const mData = await mRes.json();
      const aData = await aRes.json();
      setExpenses(mData.expenses   || []);
      setAllExpenses(aData.expenses || []);
    } catch { setError('Failed to load expenses'); }
    finally { setLoadingExpenses(false); }
  }, [token]);

  const loadRecurring = useCallback(async (p) => {
    if (!p) return;
    try {
      const res  = await fetch(`${API_URL}/api/roi/recurring?playerId=${p._id}`, { headers });
      const data = await res.json();
      setRecurringTemplates(data.templates || []);
    } catch {}
  }, [token]);

  const loadTimeline = useCallback(async (p) => {
    if (!p) return;
    setLoadingTimeline(true);
    try {
      const res  = await fetch(`${API_URL}/api/roi/timeline?playerId=${p._id}`, { headers });
      const data = await res.json();
      setTimelineData(data);
    } catch {}
    finally { setLoadingTimeline(false); }
  }, [token]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  useEffect(() => {
    if (player) {
      loadExpenses(player, currentMonth);
      loadRecurring(player);
      setSelectedDay(null);
    }
  }, [player?._id, currentMonth]);

  useEffect(() => {
    if (showTimeline && player && !timelineData && !loadingTimeline) {
      loadTimeline(player);
    }
  }, [showTimeline, player?._id]);

  // ── Calendar data ────────────────────────────────────────────────────────
  const y         = currentMonth.getFullYear();
  const m         = currentMonth.getMonth();
  const totalDays = daysInMonth(y, m);
  const startDay  = firstDayOf(y, m);
  const today     = new Date();
  const todayKey  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const virtualForMonth = expandRecurringForMonth(recurringTemplates, y, m);

  const byDay = {};
  [...expenses, ...virtualForMonth].forEach(e => {
    const k = dayKey(e.date);
    (byDay[k] = byDay[k] || []).push(e);
  });

  // ── Dashboard metrics ────────────────────────────────────────────────────
  const monthActual    = expenses.reduce((s, e) => s + e.amount, 0);
  const monthRecurring = virtualForMonth.reduce((s, e) => s + e.amount, 0);
  const monthTotal     = monthActual + monthRecurring;
  const allTotal       = allExpenses.reduce((s, e) => s + e.amount, 0);
  const catTotals      = {};
  allExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const topCat  = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const aStats  = player?.aggregatedStats || null;

  const monthlyFixedRate = recurringTemplates.reduce((sum, t) => {
    const mul = { weekly: 52/12, biweekly: 26/12, monthly: 1, yearly: 1/12 }[t.frequency] || 1;
    return sum + t.amount * mul;
  }, 0);

  // ── Expense actions ──────────────────────────────────────────────────────
  const openAdd = (dateStr) => {
    setEditingExpense(null);
    setFormData({ date: dateStr || new Date().toISOString().split('T')[0], category: 'training', amount: '', note: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (exp) => {
    setEditingExpense(exp);
    setFormData({ date: dayKey(exp.date), category: exp.category, amount: String(exp.amount), note: exp.note || '' });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.amount || isNaN(parseFloat(formData.amount))) { setError('Please enter a valid amount'); return; }
    setSaving(true); setError('');
    try {
      const body   = JSON.stringify({ ...formData, playerId: player._id, amount: parseFloat(formData.amount) });
      const url    = editingExpense ? `${API_URL}/api/roi/expenses/${editingExpense._id}` : `${API_URL}/api/roi/expenses`;
      const method = editingExpense ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('Save failed');
      setShowModal(false);
      await loadExpenses(player, currentMonth);
    } catch { setError('Failed to save expense'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await fetch(`${API_URL}/api/roi/expenses/${id}`, { method: 'DELETE', headers });
      await loadExpenses(player, currentMonth);
      setSelectedDay(null);
    } catch { setError('Failed to delete'); }
  };

  // ── Recurring actions ────────────────────────────────────────────────────
  const openAddRecurring = () => {
    setEditingRecurring(null);
    setRecForm({ startDate: new Date().toISOString().split('T')[0], endDate: '', frequency: 'monthly', category: 'fees', amount: '', note: '' });
    setRecError('');
    setShowRecurringModal(true);
  };

  const openEditRecurring = (t) => {
    setEditingRecurring(t);
    setRecForm({
      startDate: dayKey(t.startDate),
      endDate:   t.endDate ? dayKey(t.endDate) : '',
      frequency: t.frequency,
      category:  t.category,
      amount:    String(t.amount),
      note:      t.note || '',
    });
    setRecError('');
    setShowRecurringModal(true);
  };

  const handleSaveRecurring = async () => {
    if (!recForm.amount || isNaN(parseFloat(recForm.amount))) { setRecError('Please enter a valid amount'); return; }
    setSavingRec(true); setRecError('');
    try {
      const body   = JSON.stringify({ ...recForm, playerId: player._id, amount: parseFloat(recForm.amount), endDate: recForm.endDate || null });
      const url    = editingRecurring ? `${API_URL}/api/roi/recurring/${editingRecurring._id}` : `${API_URL}/api/roi/recurring`;
      const method = editingRecurring ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('Save failed');
      setShowRecurringModal(false);
      await loadRecurring(player);
    } catch { setRecError('Failed to save'); }
    finally { setSavingRec(false); }
  };

  const handleDeleteRecurring = async (id) => {
    if (!window.confirm('Delete this recurring charge?')) return;
    try {
      await fetch(`${API_URL}/api/roi/recurring/${id}`, { method: 'DELETE', headers });
      await loadRecurring(player);
    } catch { setError('Failed to delete recurring charge'); }
  };

  const dayExpenses = selectedDay ? [...expenses, ...virtualForMonth].filter(e => dayKey(e.date) === selectedDay) : [];

  // ── Gates ────────────────────────────────────────────────────────────────
  if (loadingPlayers) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading your players…</div>;
  }

  if (!hasPremium) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <p className="card-title" style={{ fontSize: 20 }}>VB Expense Tracker</p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Track every dollar you invest in your player's development — training, team fees, travel, tournaments, gear — and see it alongside their actual stats.
          </p>
          <div style={{ textAlign: 'left', marginBottom: 24 }}>
            {[
              '📅 Monthly calendar with expense logging',
              '🔁 Recurring charges (club fees, lessons) auto-fill every period',
              '📈 Trends chart: spend vs. stat growth over time',
              '📊 Stats pulled from real match data',
              '🔗 Tracks across all seasons & teams automatically',
            ].map(line => (
              <div key={line} style={{ fontSize: 14, padding: '5px 0', color: 'var(--text)' }}>{line}</div>
            ))}
          </div>
          <button className="primary-button" onClick={() => navigate('/profile')}>Subscribe to Unlock</button>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Upgrade on your Profile page</p>
        </div>
      </div>
    );
  }

  if (!claimedPlayers.length) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <div className="card">
          <p className="card-title">VB Expense Tracker</p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Log every dollar you invest in your player's development and watch it alongside their stats.
          </p>
          <button className="primary-button" onClick={() => navigate('/profile')}>Go to Profile → Claim Players</button>
        </div>
      </div>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 88 }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>VB Expense Tracker</h2>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Track your investment per player</p>
      </div>

      {/* Player tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {claimedPlayers.map((p, idx) => {
          const active = idx === selPlayerIdx;
          return (
            <button key={p._id} onClick={() => { setSelPlayerIdx(idx); setTimelineData(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 20,
                border: `2px solid ${active ? 'var(--primary,#3b82f6)' : 'var(--border,#e5e7eb)'}`,
                background: active ? 'var(--primary,#3b82f6)' : 'transparent',
                color: active ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.25)' : 'var(--primary,#3b82f6)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                {p.number || p.name?.[0] || '?'}
              </span>
              {p.name?.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Dashboard tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, padding: '8px 16px' }}>
        <Tile label="All-Time" value={fmt$(allTotal)} sub="actual logged" color="var(--primary,#3b82f6)" />
        <Tile label={MONTHS[m]} value={fmt$(monthTotal)} sub={monthRecurring > 0 ? `incl. ${fmt$(monthRecurring)} recurring` : 'this month'} color="#10b981" />
        <div className="card" style={{ margin: 0, textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Top Category</div>
          {topCat ? (
            <><div style={{ fontSize: 22 }}>{catInfo(topCat[0]).icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{catInfo(topCat[0]).label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt$(topCat[1])}</div></>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 8 }}>–</div>}
        </div>
        {monthlyFixedRate > 0 ? (
          <Tile label="Fixed/Month" value={fmt$(monthlyFixedRate)} sub="recurring rate" color="#f59e0b" />
        ) : (
          <div className="card" style={{ margin: 0, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Games Logged</div>
            {aStats
              ? <><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{aStats.gamesPlayed}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>all seasons</div></>
              : <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 8 }}>No stats yet</div>}
          </div>
        )}
      </div>

      {/* Stats strip */}
      {aStats && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {[
            { label: 'Kills/Gm',  value: aStats.killsPerGame   > 0 ? aStats.killsPerGame.toFixed(1)   : null },
            { label: 'Digs/Gm',   value: aStats.digsPerGame    > 0 ? aStats.digsPerGame.toFixed(1)    : null },
            { label: 'Aces/Gm',   value: aStats.acesPerGame    > 0 ? aStats.acesPerGame.toFixed(1)    : null },
            { label: 'Asst/Gm',   value: aStats.assistsPerGame > 0 ? aStats.assistsPerGame.toFixed(1) : null },
            { label: 'Hit%',       value: aStats.hittingPct != null ? (aStats.hittingPct * 100).toFixed(1) + '%' : null },
          ].filter(s => s.value !== null).map(s => (
            <div key={s.label} style={{ textAlign: 'center', background: 'var(--card-bg,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, padding: '6px 14px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trends toggle */}
      <div style={{ padding: '0 16px 8px' }}>
        <button
          onClick={() => {
            if (!showTimeline && !timelineData && !loadingTimeline) loadTimeline(player);
            setShowTimeline(v => !v);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20,
            border: `2px solid ${showTimeline ? 'var(--primary,#3b82f6)' : 'var(--border,#e5e7eb)'}`,
            background: showTimeline ? 'var(--primary,#3b82f6)' : 'transparent',
            color: showTimeline ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          📈 {showTimeline ? 'Hide Trends' : 'Show Trends'}
        </button>
      </div>

      {/* Trends section */}
      {showTimeline && (
        <div style={{ padding: '0 16px 12px' }}>
          {loadingTimeline && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Loading trend data…</div>}

          {timelineData && (
            <>
              {/* Spend chart card */}
              <div className="card" style={{ margin: '0 0 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Spend Over Time</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['monthly', 'cumulative'].map(mode => (
                      <button key={mode} onClick={() => setSpendMode(mode)}
                        style={{ padding: '3px 10px', borderRadius: 12, border: `1.5px solid ${spendMode === mode ? 'var(--primary,#3b82f6)' : 'var(--border,#e5e7eb)'}`,
                          background: spendMode === mode ? 'var(--primary,#3b82f6)' : 'transparent',
                          color: spendMode === mode ? '#fff' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {mode === 'monthly' ? 'Monthly' : 'Cumulative'}
                      </button>
                    ))}
                  </div>
                </div>
                <SpendChart spendData={timelineData.spendByMonth} mode={spendMode} dark={dark} />
              </div>

              {/* Stats chart card */}
              <div className="card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Performance Over Time</div>
                {/* Stat toggles */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {STAT_LINES.map(sl => {
                    const active  = visibleStats.includes(sl.key);
                    const clr     = dark ? sl.colorD : sl.colorL;
                    const hasData = timelineData.statsByMonth.some(d => d[sl.key] != null);
                    if (!hasData) return null;
                    return (
                      <button key={sl.key}
                        onClick={() => setVisibleStats(prev => active
                          ? prev.filter(k => k !== sl.key)
                          : prev.length < 3 ? [...prev, sl.key] : prev)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12,
                          border: `1.5px solid ${active ? clr : 'var(--border,#e5e7eb)'}`,
                          background: active ? clr + '18' : 'transparent',
                          color: active ? clr : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? clr : 'var(--border,#e5e7eb)', flexShrink: 0 }} />
                        {sl.label}
                      </button>
                    );
                  })}
                  {visibleStats.length >= 3 && <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Max 3 at once</span>}
                </div>
                <StatsChart statsData={timelineData.statsByMonth} visibleStats={visibleStats} dark={dark} />
              </div>
            </>
          )}

          {timelineData && !timelineData.spendByMonth?.length && !timelineData.statsByMonth?.length && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
              No trend data yet — start logging expenses and track some matches to see trends.
            </div>
          )}
        </div>
      )}

      {/* Calendar */}
      <div className="card" style={{ margin: '0 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={() => setCurrentMonth(new Date(y, m - 1, 1))} style={navBtn}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{MONTHS[m]} {y}</span>
          <button onClick={() => setCurrentMonth(new Date(y, m + 1, 1))} style={navBtn}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day     = i + 1;
            const cellKey = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayExps = byDay[cellKey] || [];
            const isToday = cellKey === todayKey;
            const isSel   = selectedDay === cellKey;

            return (
              <div key={day} onClick={() => setSelectedDay(isSel ? null : cellKey)}
                style={{ minHeight: 46, borderRadius: 8, padding: '4px 2px', cursor: 'pointer',
                  background: isSel ? 'var(--primary,#3b82f6)' : isToday ? 'var(--primary-light,#eff6ff)' : 'transparent',
                  border: isToday && !isSel ? '1px solid var(--primary,#3b82f6)' : '1px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'background 0.1s' }}>
                <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isSel ? '#fff' : 'var(--text)' }}>{day}</span>
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
                  {dayExps.slice(0, 3).map((e, j) => (
                    <div key={j} style={{
                      width: 6, height: 6, borderRadius: e.isRecurring ? 2 : '50%',
                      background: isSel ? 'rgba(255,255,255,0.8)' : catInfo(e.category).color,
                    }} />
                  ))}
                  {dayExps.length > 3 && <div style={{ fontSize: 7, color: isSel ? '#fff' : 'var(--text-muted)' }}>+{dayExps.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="card-title" style={{ margin: 0 }}>
                {(() => { const [sy,sm,sd] = selectedDay.split('-').map(Number); return new Date(sy,sm-1,sd).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}); })()}
              </span>
              <button className="primary-button" style={{ padding: '6px 12px', width: 'auto', fontSize: 13 }} onClick={() => openAdd(selectedDay)}>
                + Add
              </button>
            </div>
            {dayExpenses.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>No expenses on this day.</p>
              : dayExpenses.map(exp => (
                  <ExpenseRow key={exp._id} expense={exp} onEdit={openEdit} onDelete={handleDelete} />
                ))
            }
          </div>
        </div>
      )}

      {/* Month breakdown */}
      {!selectedDay && (expenses.length > 0 || virtualForMonth.length > 0) && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ margin: 0 }}>
            <p className="card-title">{MONTHS[m]} Breakdown</p>
            {CATEGORIES.map(cat => {
              const actTotal = expenses.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0);
              const recTotal = virtualForMonth.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0);
              const total    = actTotal + recTotal;
              if (!total) return null;
              return (
                <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{cat.label}{recTotal > 0 && actTotal === 0 ? ' 🔁' : ''}</div>
                    <div style={{ height: 4, borderRadius: 2, marginTop: 3, background: 'var(--border,#e5e7eb)' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: cat.color, width: `${Math.min(100, (total / monthTotal) * 100)}%` }} />
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: cat.color }}>{fmt$(total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!selectedDay && !loadingExpenses && expenses.length === 0 && virtualForMonth.length === 0 && (
        <div style={{ padding: '0 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          <p>No expenses logged for {MONTHS[m]}.</p>
          <p>Tap a day on the calendar or use the + button below.</p>
        </div>
      )}

      {/* Recurring section */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showRecurringSection ? 12 : 0 }}>
            <button onClick={() => setShowRecurringSection(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🔁 Recurring Charges</span>
              {recurringTemplates.length > 0 && (
                <span style={{ background: 'var(--primary,#3b82f6)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>
                  {recurringTemplates.length}
                </span>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{showRecurringSection ? '▲' : '▼'}</span>
            </button>
            {showRecurringSection && (
              <button type="button" className="primary-button"
                style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}
                onClick={openAddRecurring}>
                + Add
              </button>
            )}
          </div>

          {showRecurringSection && (
            <>
              {recurringTemplates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
                  Add recurring charges like club dues, private lessons, or gym memberships. They appear on the calendar automatically each period.
                </p>
              ) : (
                recurringTemplates.map(t => (
                  <RecurringRow key={t._id} template={t} onEdit={openEditRecurring} onDelete={handleDeleteRecurring} />
                ))
              )}
            </>
          )}
        </div>
      </div>

      {error && <p style={{ color: '#ef4444', textAlign: 'center', fontSize: 14, padding: '0 16px' }}>{error}</p>}

      {/* FAB */}
      <button onClick={() => openAdd(null)} title="Add expense"
        style={{ position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
          background: 'var(--primary,#3b82f6)', color: '#fff', fontSize: 28, border: 'none',
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(59,130,246,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        +
      </button>

      {showModal && (
        <ExpenseModal formData={formData} setFormData={setFormData} onSave={handleSave}
          onClose={() => setShowModal(false)} saving={saving} isEdit={!!editingExpense}
          error={error} setError={setError} />
      )}

      {showRecurringModal && (
        <RecurringModal formData={recForm} setFormData={setRecForm} onSave={handleSaveRecurring}
          onClose={() => setShowRecurringModal(false)} saving={savingRec} isEdit={!!editingRecurring}
          error={recError} />
      )}
    </div>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function SpendChart({ spendData, mode, dark }) {
  const [hovered, setHovered] = useState(null);
  if (!spendData?.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No spend data yet.</p>;
  }

  const spendColor = dark ? '#3987e5' : '#2a78d6';
  const W = 400, H = 140, ML = 50, MR = 8, MT = 12, MB = 28;
  const cW = W - ML - MR, cH = H - MT - MB;

  const plotData = mode === 'cumulative'
    ? spendData.reduce((acc, d, i) => { acc.push({ ...d, val: (i > 0 ? acc[i-1].val : 0) + d.total }); return acc; }, [])
    : spendData.map(d => ({ ...d, val: d.total }));

  const maxVal = Math.max(...plotData.map(d => d.val), 1);
  const n = plotData.length;
  const slotW = cW / n;
  const barW  = Math.min(22, slotW * 0.65);

  const getX = (i) => ML + slotW * i + slotW / 2;
  const getY = (v) => MT + cH - (v / maxVal) * cH;

  const yTicks = [0, maxVal * 0.5, maxVal].map(v => ({
    y: getY(v),
    label: v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Math.round(v)}`,
  }));

  const skipEvery = Math.ceil(n / 10);
  const labelMon = (month) => {
    const [yr, mo] = month.split('-').map(Number);
    return new Date(yr, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block' }}>
        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={ML} y1={t.y} x2={W - MR} y2={t.y} stroke="var(--border,#e5e7eb)" strokeWidth="1" />
            <text x={ML - 4} y={t.y + 4} textAnchor="end" fontSize="9" fill="var(--text-muted,#898781)">{t.label}</text>
          </g>
        ))}
        <line x1={ML} y1={MT + cH} x2={W - MR} y2={MT + cH} stroke="#c3c2b7" strokeWidth="1" />

        {mode === 'monthly' ? (
          plotData.map((d, i) => {
            const barH = Math.max(2, (d.val / maxVal) * cH);
            const bx   = getX(i) - barW / 2;
            const by   = MT + cH - barH;
            return (
              <g key={d.month}>
                <rect x={bx} y={by} width={barW} height={barH} rx="4"
                  fill={hovered === i ? (dark ? '#1c5cab' : '#256abf') : spendColor} />
                <rect x={ML + slotW * i} y={MT} width={slotW} height={cH} fill="transparent"
                  onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
              </g>
            );
          })
        ) : (
          <>
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={spendColor} stopOpacity="0.14" />
                <stop offset="100%" stopColor={spendColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path
              d={`M${getX(0)},${MT+cH} ${plotData.map((d,i)=>`L${getX(i)},${getY(d.val)}`).join(' ')} L${getX(n-1)},${MT+cH} Z`}
              fill="url(#sg)" />
            <path
              d={plotData.map((d,i)=>`${i===0?'M':'L'}${getX(i)},${getY(d.val)}`).join(' ')}
              fill="none" stroke={spendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {plotData.map((d, i) => (
              <circle key={d.month} cx={getX(i)} cy={getY(d.val)} r="4"
                fill={spendColor} stroke="var(--card-bg,#fff)" strokeWidth="2"
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            ))}
          </>
        )}

        {/* X labels */}
        {plotData.map((d, i) => {
          if (i % skipEvery !== 0 && i !== n - 1) return null;
          return (
            <text key={d.month} x={getX(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text-muted,#898781)">
              {labelMon(d.month)}
            </text>
          );
        })}
      </svg>

      {hovered !== null && plotData[hovered] && (
        <div style={{
          position: 'absolute',
          left: `${((getX(hovered) / W) * 100).toFixed(1)}%`,
          top: `${((getY(plotData[hovered].val) / H) * 100).toFixed(1)}%`,
          transform: 'translate(-50%, -130%)',
          background: 'var(--card-bg,#fff)', border: '1px solid var(--border,#e5e7eb)',
          borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 600,
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10,
        }}>
          {labelMon(plotData[hovered].month)}<br />
          <span style={{ color: spendColor }}>{fmt$(plotData[hovered].val)}</span>
          {mode === 'cumulative' ? ' cumulative' : ''}
        </div>
      )}
    </div>
  );
}

function StatsChart({ statsData, visibleStats, dark }) {
  const [hovered, setHovered] = useState(null); // { statKey, idx }

  if (!statsData?.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No stat data yet — stats are pulled from logged matches.</p>;
  }

  const W = 400, H = 130, ML = 40, MR = 8, MT = 12, MB = 28;
  const cW = W - ML - MR, cH = H - MT - MB;

  const statColor = (key) => {
    const sl = STAT_LINES.find(s => s.key === key);
    return sl ? (dark ? sl.colorD : sl.colorL) : '#6b7280';
  };

  // Compute y scale: 0 to max of visible, with special handling for hittingPct (show as %)
  const isHitPct = visibleStats.length === 1 && visibleStats[0] === 'hittingPct';
  const allVals = statsData.flatMap(d => visibleStats.map(k => {
    if (d[k] == null) return 0;
    return k === 'hittingPct' ? d[k] * 100 : d[k];
  }));
  const maxVal = Math.max(...allVals, 0.1);
  const n = statsData.length;
  const slotW = cW / Math.max(n, 1);

  const getX = (i) => ML + slotW * i + slotW / 2;
  const getY = (v) => MT + cH - (v / maxVal) * cH;

  const displayVal = (key, v) => {
    if (v == null) return null;
    if (key === 'hittingPct') return (v * 100).toFixed(1) + '%';
    return v.toFixed(1);
  };

  const yTicks = [0, maxVal * 0.5, maxVal].map(v => ({
    y: getY(v),
    label: isHitPct ? v.toFixed(0) + '%' : v.toFixed(1),
  }));

  const skipEvery = Math.ceil(n / 10);
  const labelMon = (month) => {
    const [yr, mo] = month.split('-').map(Number);
    return new Date(yr, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block' }}>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={ML} y1={t.y} x2={W - MR} y2={t.y} stroke="var(--border,#e5e7eb)" strokeWidth="1" />
              <text x={ML - 4} y={t.y + 4} textAnchor="end" fontSize="9" fill="var(--text-muted,#898781)">{t.label}</text>
            </g>
          ))}
          <line x1={ML} y1={MT + cH} x2={W - MR} y2={MT + cH} stroke="#c3c2b7" strokeWidth="1" />

          {visibleStats.map(statKey => {
            const clr = statColor(statKey);
            const pts = statsData.map((d, i) => {
              const raw = d[statKey];
              if (raw == null) return null;
              const v = statKey === 'hittingPct' ? raw * 100 : raw;
              return { x: getX(i), y: getY(v), raw, i };
            });

            // Build path segments (skip nulls)
            const segments = [];
            let seg = [];
            pts.forEach(p => {
              if (p == null) { if (seg.length) { segments.push(seg); seg = []; } }
              else seg.push(p);
            });
            if (seg.length) segments.push(seg);

            return (
              <g key={statKey}>
                {segments.map((s, si) => (
                  <path key={si}
                    d={s.map((p, j) => `${j===0?'M':'L'}${p.x},${p.y}`).join(' ')}
                    fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {pts.filter(Boolean).map(p => (
                  <circle key={p.i} cx={p.x} cy={p.y} r="4"
                    fill={clr} stroke="var(--card-bg,#fff)" strokeWidth="2"
                    onMouseEnter={() => setHovered({ statKey, idx: p.i })}
                    onMouseLeave={() => setHovered(null)} />
                ))}
              </g>
            );
          })}

          {/* X labels */}
          {statsData.map((d, i) => {
            if (i % skipEvery !== 0 && i !== n - 1) return null;
            return (
              <text key={d.month} x={getX(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text-muted,#898781)">
                {labelMon(d.month)}
              </text>
            );
          })}
        </svg>

        {hovered && statsData[hovered.idx] && (
          <div style={{
            position: 'absolute',
            left: `${((getX(hovered.idx) / W) * 100).toFixed(1)}%`,
            top: `${((getY((hovered.statKey === 'hittingPct' ? (statsData[hovered.idx][hovered.statKey] || 0) * 100 : statsData[hovered.idx][hovered.statKey] || 0)) / H) * 100).toFixed(1)}%`,
            transform: 'translate(-50%, -130%)',
            background: 'var(--card-bg,#fff)', border: '1px solid var(--border,#e5e7eb)',
            borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 600,
            pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10,
          }}>
            {labelMon(statsData[hovered.idx].month)}<br />
            <span style={{ color: statColor(hovered.statKey) }}>
              {STAT_LINES.find(s => s.key === hovered.statKey)?.label}: {displayVal(hovered.statKey, statsData[hovered.idx][hovered.statKey])}
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      {visibleStats.length > 1 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
          {visibleStats.map(k => {
            const sl = STAT_LINES.find(s => s.key === k);
            if (!sl) return null;
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-block', width: 16, height: 2, borderRadius: 1, background: dark ? sl.colorD : sl.colorL }} />
                {sl.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────
const navBtn = { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text)', padding: '4px 10px' };

function Tile({ label, value, sub, color }) {
  return (
    <div className="card" style={{ margin: 0, textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

function ExpenseRow({ expense, onEdit, onDelete }) {
  const cat = catInfo(expense.category);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
      <span style={{ width: 36, height: 36, borderRadius: 8, background: cat.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{cat.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {cat.label}{expense.isRecurring ? <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}> · 🔁 {expense.recurringFreq}</span> : ''}
        </div>
        {expense.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.note}</div>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt$(expense.amount)}</div>
      {!expense.isRecurring && (
        <>
          <button onClick={() => onEdit(expense)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }} title="Edit">✏️</button>
          <button onClick={() => onDelete(expense._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }} title="Delete">🗑️</button>
        </>
      )}
    </div>
  );
}

function RecurringRow({ template, onEdit, onDelete }) {
  const cat   = catInfo(template.category);
  const start = (() => { const [yr,mo,dy] = dayKey(template.startDate).split('-').map(Number); return new Date(yr,mo-1,dy); })();
  const end   = template.endDate ? (() => { const [yr,mo,dy] = dayKey(template.endDate).split('-').map(Number); return new Date(yr,mo-1,dy); })() : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
      <span style={{ width: 36, height: 36, borderRadius: 8, background: cat.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{cat.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{cat.label} · {FREQ_LABELS[template.frequency]}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          From {start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          {end ? ` → ${end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : '  · ongoing'}
        </div>
        {template.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.note}</div>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt$(template.amount)}</div>
      <button onClick={() => onEdit(template)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>✏️</button>
      <button onClick={() => onDelete(template._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>🗑️</button>
    </div>
  );
}

function ExpenseModal({ formData, setFormData, onSave, onClose, saving, isEdit, error, setError }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card-bg,#fff)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 -4px 24px rgba(0,0,0,0.2)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{isEdit ? 'Edit Expense' : 'Log Expense'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>}
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Date</label>
          <input type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Category</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} type="button" onClick={() => setFormData(f => ({ ...f, category: cat.key }))}
                style={{ padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${formData.category === cat.key ? cat.color : 'var(--border,#e5e7eb)'}`,
                  background: formData.category === cat.key ? cat.color + '18' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.1s' }}>
                <span style={{ fontSize: 22 }}>{cat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: formData.category === cat.key ? cat.color : 'var(--text-muted)' }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Amount</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, overflow: 'hidden', background: 'var(--input-bg,#f9fafb)' }}>
            <span style={{ padding: '10px 12px', fontWeight: 700, fontSize: 16, color: 'var(--text-muted)' }}>$</span>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={formData.amount}
              onChange={e => { setError(''); setFormData(f => ({ ...f, amount: e.target.value })); }}
              style={{ flex: 1, padding: '10px 12px 10px 0', border: 'none', fontSize: 18, fontWeight: 700, background: 'transparent', color: 'var(--text)', outline: 'none', width: '100%' }} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabel}>Note <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <input type="text" placeholder="e.g. Spring camp deposit" value={formData.note}
            onChange={e => setFormData(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
        </div>
        <button className="primary-button" onClick={onSave} disabled={saving} style={{ marginBottom: 8 }}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Expense'}
        </button>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', padding: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RecurringModal({ formData, setFormData, onSave, onClose, saving, isEdit, error }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card-bg,#fff)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 -4px 24px rgba(0,0,0,0.2)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{isEdit ? 'Edit Recurring' : 'Add Recurring Charge'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>}

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Category</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} type="button" onClick={() => setFormData(f => ({ ...f, category: cat.key }))}
                style={{ padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${formData.category === cat.key ? cat.color : 'var(--border,#e5e7eb)'}`,
                  background: formData.category === cat.key ? cat.color + '18' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 22 }}>{cat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: formData.category === cat.key ? cat.color : 'var(--text-muted)' }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Frequency</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {FREQ_OPTS.map(fo => (
              <button key={fo.key} type="button" onClick={() => setFormData(f => ({ ...f, frequency: fo.key }))}
                style={{ padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  border: `2px solid ${formData.frequency === fo.key ? 'var(--primary,#3b82f6)' : 'var(--border,#e5e7eb)'}`,
                  background: formData.frequency === fo.key ? 'var(--primary,#3b82f6)18' : 'transparent',
                  color: formData.frequency === fo.key ? 'var(--primary,#3b82f6)' : 'var(--text-muted)' }}>
                {fo.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Amount per occurrence</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, overflow: 'hidden', background: 'var(--input-bg,#f9fafb)' }}>
            <span style={{ padding: '10px 12px', fontWeight: 700, fontSize: 16, color: 'var(--text-muted)' }}>$</span>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={formData.amount}
              onChange={e => setFormData(f => ({ ...f, amount: e.target.value }))}
              style={{ flex: 1, padding: '10px 12px 10px 0', border: 'none', fontSize: 18, fontWeight: 700, background: 'transparent', color: 'var(--text)', outline: 'none', width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={fieldLabel}>Start date</label>
            <input type="date" value={formData.startDate} onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabel}>End date <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opt.)</span></label>
            <input type="date" value={formData.endDate} onChange={e => setFormData(f => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabel}>Note <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <input type="text" placeholder="e.g. Monthly club dues" value={formData.note}
            onChange={e => setFormData(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
        </div>

        <button className="primary-button" onClick={onSave} disabled={saving} style={{ marginBottom: 8 }}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Recurring Charge'}
        </button>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', padding: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const fieldLabel = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text)' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', fontSize: 15, background: 'var(--input-bg,#f9fafb)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' };
