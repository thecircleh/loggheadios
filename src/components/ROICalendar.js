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

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmt$ = (n) => '$' + Number(n || 0).toFixed(2).replace(/\.00$/, '');

function catInfo(key) { return CATEGORIES.find(c => c.key === key) || CATEGORIES[5]; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOf(y, m)  { return new Date(y, m, 1).getDay(); }
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}
function dayKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function ROICalendar() {
  const { token } = useAuth();
  const navigate  = useNavigate();

  const [claimedPlayers,    setClaimedPlayers]    = useState([]);
  const [selPlayerIdx,      setSelPlayerIdx]      = useState(0);
  const [expenses,          setExpenses]          = useState([]);   // current month
  const [allExpenses,       setAllExpenses]       = useState([]);   // all time for player
  const [currentMonth,      setCurrentMonth]      = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay,       setSelectedDay]       = useState(null);
  const [showModal,         setShowModal]         = useState(false);
  const [editingExpense,    setEditingExpense]    = useState(null);
  const [formData,          setFormData]          = useState({ date: '', category: 'training', amount: '', note: '' });
  const [loadingPlayers,    setLoadingPlayers]    = useState(true);
  const [loadingExpenses,   setLoadingExpenses]   = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState('');

  const headers = { Authorization: `Bearer ${token}` };
  const player  = claimedPlayers[selPlayerIdx] || null;

  // ── Load claimed players ────────────────────────────────────────────────
  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const res  = await fetch(`${API_URL}/api/roi/claimed-players`, { headers });
      const data = await res.json();
      setClaimedPlayers(data.players || []);
    } catch { setError('Failed to load players'); }
    finally { setLoadingPlayers(false); }
  }, [token]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  // ── Load expenses ───────────────────────────────────────────────────────
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

  useEffect(() => {
    if (player) {
      loadExpenses(player, currentMonth);
      setSelectedDay(null);
    }
  }, [player?._id, currentMonth]);

  // ── Calendar data ───────────────────────────────────────────────────────
  const byDay = {};
  expenses.forEach(e => {
    const k = dayKey(e.date);
    (byDay[k] = byDay[k] || []).push(e);
  });

  const y          = currentMonth.getFullYear();
  const m          = currentMonth.getMonth();
  const totalDays  = daysInMonth(y, m);
  const startDay   = firstDayOf(y, m);
  const today      = new Date();

  // ── Dashboard metrics ───────────────────────────────────────────────────
  const monthTotal   = expenses.reduce((s, e) => s + e.amount, 0);
  const allTotal     = allExpenses.reduce((s, e) => s + e.amount, 0);
  const catTotals    = {};
  allExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const topCat       = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const stats        = player?.seasonStats || {};
  const killsPG      = stats?.attacking?.killsPerGame ?? stats?.attacking?.kills ?? null;
  const hitPct       = stats?.attacking?.hittingPercentage ?? null;

  // ── Expense actions ─────────────────────────────────────────────────────
  const openAdd = (day) => {
    const dateStr = day
      ? `${y}-${String(m + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      : new Date().toISOString().split('T')[0];
    setEditingExpense(null);
    setFormData({ date: dateStr, category: 'training', amount: '', note: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (exp) => {
    setEditingExpense(exp);
    setFormData({
      date:     new Date(exp.date).toISOString().split('T')[0],
      category: exp.category,
      amount:   String(exp.amount),
      note:     exp.note || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.amount || isNaN(parseFloat(formData.amount))) {
      setError('Please enter a valid amount');
      return;
    }
    setSaving(true);
    setError('');
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

  const dayExpenses = selectedDay ? expenses.filter(e => sameDay(new Date(e.date), selectedDay)) : [];

  // ── Empty state ─────────────────────────────────────────────────────────
  if (loadingPlayers) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading your players…</div>;
  }

  if (!claimedPlayers.length) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <div className="card">
          <p className="card-title">ROI Calendar</p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Log every dollar you invest in your player's development — training, fees, travel, tournaments, gear — and watch it alongside their stats.
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            To get started, claim your player(s) from your Profile page.
          </p>
          <button className="primary-button" onClick={() => navigate('/profile')}>
            Go to Profile → Claim Players
          </button>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 88 }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ROI Calendar</h2>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Track your investment per player</p>
      </div>

      {/* Player tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {claimedPlayers.map((p, idx) => {
          const active = idx === selPlayerIdx;
          return (
            <button
              key={p._id}
              onClick={() => setSelPlayerIdx(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', borderRadius: 20, border: `2px solid ${active ? 'var(--primary,#3b82f6)' : 'var(--border,#e5e7eb)'}`,
                background: active ? 'var(--primary,#3b82f6)' : 'transparent',
                color: active ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: '50%',
                background: active ? 'rgba(255,255,255,0.25)' : 'var(--primary,#3b82f6)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12,
              }}>
                {p.number || p.name?.[0] || '?'}
              </span>
              {p.name?.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Dashboard tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '8px 16px' }}>
        <Tile label="All-Time" value={fmt$(allTotal)} sub="total invested" color="var(--primary,#3b82f6)" />
        <Tile label={MONTHS[m]} value={fmt$(monthTotal)} sub="this month" color="#10b981" />
        <div className="card" style={{ margin: 0, textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Top Category</div>
          {topCat ? (
            <>
              <div style={{ fontSize: 22 }}>{catInfo(topCat[0]).icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{catInfo(topCat[0]).label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt$(topCat[1])}</div>
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 8 }}>–</div>}
        </div>
        <div className="card" style={{ margin: 0, textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Key Stat</div>
          {killsPG !== null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{Number(killsPG).toFixed(1)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>kills / game</div>
            </>
          ) : hitPct !== null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{(hitPct * 100).toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>hitting %</div>
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 8 }}>No stats yet</div>}
        </div>
      </div>

      {/* Calendar */}
      <div className="card" style={{ margin: '0 16px 12px' }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={() => setCurrentMonth(new Date(y, m - 1, 1))} style={navBtn}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{MONTHS[m]} {y}</span>
          <button onClick={() => setCurrentMonth(new Date(y, m + 1, 1))} style={navBtn}>›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day      = i + 1;
            const cellDate = new Date(y, m, day);
            const key      = dayKey(cellDate);
            const dayExps  = byDay[key] || [];
            const isToday  = sameDay(cellDate, today);
            const isSel    = selectedDay && sameDay(cellDate, selectedDay);

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(isSel ? null : cellDate)}
                style={{
                  minHeight: 46, borderRadius: 8, padding: '4px 2px', cursor: 'pointer',
                  background: isSel ? 'var(--primary,#3b82f6)' : isToday ? 'var(--primary-light,#eff6ff)' : 'transparent',
                  border: isToday && !isSel ? '1px solid var(--primary,#3b82f6)' : '1px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isSel ? '#fff' : 'var(--text)' }}>{day}</span>
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
                  {dayExps.slice(0, 3).map((e, j) => (
                    <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,0.8)' : catInfo(e.category).color }} />
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
                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              <button className="primary-button" style={{ padding: '6px 12px', width: 'auto', fontSize: 13 }} onClick={() => openAdd(selectedDay.getDate())}>
                + Add
              </button>
            </div>
            {dayExpenses.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>No expenses on this day.</p>
              : dayExpenses.map(exp => <ExpenseRow key={exp._id} expense={exp} onEdit={openEdit} onDelete={handleDelete} />)
            }
          </div>
        </div>
      )}

      {/* Month category breakdown */}
      {!selectedDay && expenses.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ margin: 0 }}>
            <p className="card-title">{MONTHS[m]} Breakdown</p>
            {CATEGORIES.map(cat => {
              const total = expenses.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0);
              if (!total) return null;
              return (
                <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{cat.label}</div>
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

      {!selectedDay && !loadingExpenses && expenses.length === 0 && (
        <div style={{ padding: '0 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          <p>No expenses logged for {MONTHS[m]}.</p>
          <p>Tap a day on the calendar or use the + button below.</p>
        </div>
      )}

      {error && <p style={{ color: '#ef4444', textAlign: 'center', fontSize: 14, padding: '0 16px' }}>{error}</p>}

      {/* FAB */}
      <button
        onClick={() => openAdd(null)}
        title="Add expense"
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
          background: 'var(--primary,#3b82f6)', color: '#fff', fontSize: 28, border: 'none',
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(59,130,246,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}
      >+</button>

      {/* Expense modal */}
      {showModal && (
        <ExpenseModal
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          saving={saving}
          isEdit={!!editingExpense}
          error={error}
          setError={setError}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────
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
        <div style={{ fontSize: 14, fontWeight: 600 }}>{cat.label}</div>
        {expense.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.note}</div>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt$(expense.amount)}</div>
      <button onClick={() => onEdit(expense)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }} title="Edit">✏️</button>
      <button onClick={() => onDelete(expense._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }} title="Delete">🗑️</button>
    </div>
  );
}

function ExpenseModal({ formData, setFormData, onSave, onClose, saving, isEdit, error, setError }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--card-bg,#fff)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 -4px 24px rgba(0,0,0,0.2)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{isEdit ? 'Edit Expense' : 'Log Expense'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>}

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
            style={inputStyle}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Category</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setFormData(f => ({ ...f, category: cat.key }))}
                style={{
                  padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${formData.category === cat.key ? cat.color : 'var(--border,#e5e7eb)'}`,
                  background: formData.category === cat.key ? cat.color + '18' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.1s',
                }}
              >
                <span style={{ fontSize: 22 }}>{cat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: formData.category === cat.key ? cat.color : 'var(--text-muted)' }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Amount</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border,#e5e7eb)', borderRadius: 8, overflow: 'hidden', background: 'var(--input-bg,#f9fafb)' }}>
            <span style={{ padding: '10px 12px', fontWeight: 700, fontSize: 16, color: 'var(--text-muted)' }}>$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={e => { setError(''); setFormData(f => ({ ...f, amount: e.target.value })); }}
              style={{ flex: 1, padding: '10px 12px 10px 0', border: 'none', fontSize: 18, fontWeight: 700, background: 'transparent', color: 'var(--text)', outline: 'none', width: '100%' }}
            />
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabel}>Note <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
          <input
            type="text"
            placeholder="e.g. Spring camp deposit"
            value={formData.note}
            onChange={e => setFormData(f => ({ ...f, note: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <button className="primary-button" onClick={onSave} disabled={saving} style={{ marginBottom: 8 }}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Expense'}
        </button>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', padding: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const fieldLabel = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text)' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', fontSize: 15, background: 'var(--input-bg,#f9fafb)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' };
