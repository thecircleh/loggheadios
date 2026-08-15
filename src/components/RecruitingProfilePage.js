import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getApiUrl = () => {
  const h = window.location.hostname;
  if (
    !window.Capacitor?.isNativePlatform?.() &&
    (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))
  ) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || 'https://api.loggerhead.app';
};
const API_URL = getApiUrl();

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 80px)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1C1C1E',
    minHeight: '100dvh',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1C1C1E',
    margin: 0,
  },
  saveBtn: {
    background: '#34C759',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '8px 18px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  saveBtnDisabled: {
    background: '#C7C7CC',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '8px 18px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'default',
  },
  playerSelector: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    overflowX: 'auto',
    paddingBottom: 4,
    WebkitOverflowScrolling: 'touch',
  },
  playerChip: (active) => ({
    flexShrink: 0,
    padding: '7px 16px',
    borderRadius: 20,
    border: active ? '2px solid #34C759' : '2px solid #E5E5EA',
    background: active ? 'rgba(52,199,89,0.1)' : '#F2F2F7',
    color: active ? '#1C7A38' : '#3C3C43',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  }),
  tabs: {
    display: 'flex',
    gap: 0,
    marginBottom: 20,
    borderBottom: '1.5px solid #E5E5EA',
  },
  tab: (active) => ({
    flex: 1,
    padding: '10px 4px',
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    color: active ? '#34C759' : '#8E8E93',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2.5px solid #34C759' : '2.5px solid transparent',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    textAlign: 'center',
    letterSpacing: '-0.2px',
    marginBottom: -2,
  }),
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: '16px 14px',
    marginBottom: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 10,
    marginTop: 0,
  },
  row: {
    display: 'flex',
    gap: 10,
    marginBottom: 10,
  },
  fieldWrap: (flex = 1) => ({
    flex,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  }),
  label: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '9px 11px',
    border: '1.5px solid #E5E5EA',
    borderRadius: 9,
    fontSize: 15,
    color: '#1C1C1E',
    background: '#F9F9FB',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    padding: '9px 11px',
    border: '1.5px solid #E5E5EA',
    borderRadius: 9,
    fontSize: 15,
    color: '#1C1C1E',
    background: '#F9F9FB',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    minHeight: 72,
    fontFamily: 'inherit',
  },
  select: {
    width: '100%',
    padding: '9px 11px',
    border: '1.5px solid #E5E5EA',
    borderRadius: 9,
    fontSize: 15,
    color: '#1C1C1E',
    background: '#F9F9FB',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
    appearance: 'none',
    WebkitAppearance: 'none',
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(52,199,89,0.1)',
    color: '#34C759',
    border: 'none',
    borderRadius: 8,
    padding: '7px 13px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    marginTop: 6,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#FF3B30',
    fontSize: 18,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
  },
  swotBox: (color) => ({
    flex: 1,
    minWidth: 0,
    background: color,
    borderRadius: 10,
    padding: 12,
  }),
  swotTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 6,
    marginTop: 0,
  },
  swotList: {
    margin: 0,
    padding: '0 0 0 16px',
    fontSize: 13,
    lineHeight: 1.5,
  },
  generateBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '12px',
    background: 'linear-gradient(135deg, #34C759 0%, #30B854 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    marginBottom: 16,
  },
  statsRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  statPill: {
    background: '#F2F2F7',
    borderRadius: 8,
    padding: '6px 12px',
    textAlign: 'center',
  },
  statVal: {
    fontSize: 17,
    fontWeight: 700,
    color: '#1C1C1E',
    display: 'block',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    display: 'block',
    marginTop: 1,
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '14px',
    background: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    marginTop: 8,
  },
  previewCard: {
    background: '#fff',
    border: '2px solid #E5E5EA',
    borderRadius: 14,
    padding: '20px 18px',
    marginBottom: 16,
  },
  previewName: {
    fontSize: 22,
    fontWeight: 800,
    color: '#1C1C1E',
    margin: '0 0 2px',
  },
  previewSub: {
    fontSize: 14,
    color: '#8E8E93',
    margin: '0 0 12px',
  },
  divider: {
    height: 1,
    background: '#E5E5EA',
    margin: '12px 0',
  },
  previewSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#34C759',
    margin: '0 0 6px',
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  chipRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  chip: (bg) => ({
    background: bg || '#F2F2F7',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 12,
    fontWeight: 500,
  }),
};

// ─── VB Position options ───────────────────────────────────────────────────────
const VB_POSITIONS = [
  'Outside Hitter', 'Middle Blocker', 'Right Side / Opposite',
  'Setter', 'Libero', 'Defensive Specialist',
];

const DIVISION_OPTIONS = ['', 'D1', 'D2', 'D3', 'NAIA', 'JUCO'];
const STATUS_OPTIONS = [
  { value: 'interested',    label: 'Interested' },
  { value: 'contacted',     label: 'Contacted' },
  { value: 'visited',       label: 'Visited' },
  { value: 'applied',       label: 'Applied' },
  { value: 'committed',     label: 'Committed ✓' },
  { value: 'not_interested', label: 'Not Pursuing' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, digits = 2) =>
  n != null ? parseFloat(n).toFixed(digits) : '—';
const fmtPct = (n) =>
  n != null ? (n * 100).toFixed(1) + '%' : '—';

// ─── Empty profile factory ─────────────────────────────────────────────────────
const emptyProfile = (playerId, userId) => ({
  playerId, userId,
  headshotUrl: '', actionPhotoUrl: '',
  bio: '', graduationYear: '', positions: [],
  heightFt: '', heightIn: '', verticalJump: '', armSpan: '', weight: '',
  schoolName: '', gpa: '', satScore: '', actScore: '', intendedMajor: '',
  clubTeamName: '', clubCoachName: '', clubCoachContact: '',
  hudlUrl: '', highlightUrl: '',
  playerEmail: '', playerPhone: '',
  parentName: '', parentEmail: '', parentPhone: '',
  awards: [],
  targetSchools: [],
  upcomingEvents: [],
  swot: null,
});

// ─── PDF Generator ────────────────────────────────────────────────────────────
const generatePDF = (player, profile, stats) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 48;
  const col = (W - margin * 2) / 2;
  const green = [52, 199, 89];
  const dark = [28, 28, 30];
  const mid = [142, 142, 147];
  const light = [242, 242, 247];

  let y = margin;

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...green);
  doc.roundedRect(margin, y, W - margin * 2, 72, 8, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  const name = player?.name || 'Player';
  doc.text(name, margin + 16, y + 28);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const subLine = [
    profile.positions?.length ? profile.positions.join(' / ') : null,
    profile.heightFt ? `${profile.heightFt}'${profile.heightIn || 0}"` : null,
    profile.graduationYear ? `Class of ${profile.graduationYear}` : null,
    profile.schoolName || null,
  ].filter(Boolean).join('  ·  ');
  doc.text(subLine || '', margin + 16, y + 50);

  // GPA / SAT / ACT top right
  const academicStr = [
    profile.gpa ? `GPA ${profile.gpa}` : null,
    profile.satScore ? `SAT ${profile.satScore}` : null,
    profile.actScore ? `ACT ${profile.actScore}` : null,
  ].filter(Boolean).join('   ');
  if (academicStr) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(academicStr, W - margin - 16, y + 50, { align: 'right' });
  }

  y += 90;

  // ── Stats row ───────────────────────────────────────────────────────────────
  const statCols = [
    { label: 'Games Played', val: stats.gamesPlayed != null ? String(stats.gamesPlayed) : '—' },
    { label: 'Kills/GM',     val: fmt(stats.killsPerGame) },
    { label: 'Hitting %',    val: fmtPct(stats.hittingPct) },
    { label: 'Aces/GM',      val: fmt(stats.acesPerGame) },
    { label: 'Digs/GM',      val: fmt(stats.digsPerGame) },
    { label: 'Assists/GM',   val: fmt(stats.assistsPerGame) },
  ];

  const statW = (W - margin * 2) / statCols.length;
  statCols.forEach((sc, i) => {
    const x = margin + i * statW;
    doc.setFillColor(...(i % 2 === 0 ? [245, 245, 250] : [255, 255, 255]));
    doc.rect(x, y, statW, 40, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...dark);
    doc.text(sc.val, x + statW / 2, y + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...mid);
    doc.text(sc.label, x + statW / 2, y + 30, { align: 'center' });
  });

  y += 52;

  // ── Left column start ────────────────────────────────────────────────────────
  const leftX  = margin;
  const rightX = margin + col + 12;
  let ly = y;
  let ry = y;

  const sectionHeader = (x, label, yPos) => {
    doc.setFillColor(...green);
    doc.roundedRect(x, yPos, col, 18, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(label.toUpperCase(), x + 8, yPos + 12);
    return yPos + 24;
  };

  const bodyText = (x, text, yPos, maxWidth) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    const lines = doc.splitTextToSize(text, maxWidth || col - 4);
    doc.text(lines, x + 4, yPos);
    return yPos + lines.length * 13;
  };

  const bulletList = (x, items, yPos) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    let cy = yPos;
    (items || []).forEach(item => {
      const lines = doc.splitTextToSize(`• ${item}`, col - 8);
      doc.text(lines, x + 4, cy);
      cy += lines.length * 13;
    });
    return cy;
  };

  // ── LEFT: Bio ────────────────────────────────────────────────────────────────
  if (profile.bio) {
    ly = sectionHeader(leftX, 'About', ly);
    ly = bodyText(leftX, profile.bio, ly, col - 4);
    ly += 8;
  }

  // ── LEFT: Contact ────────────────────────────────────────────────────────────
  ly = sectionHeader(leftX, 'Contact', ly);
  const contactLines = [
    profile.playerEmail  ? `Player: ${profile.playerEmail}` : null,
    profile.playerPhone  ? `Phone: ${profile.playerPhone}` : null,
    profile.parentName   ? `Parent: ${profile.parentName}` : null,
    profile.parentEmail  ? `${profile.parentEmail}` : null,
    profile.parentPhone  ? `${profile.parentPhone}` : null,
  ].filter(Boolean);
  ly = bulletList(leftX, contactLines, ly);
  ly += 8;

  // ── LEFT: Club ───────────────────────────────────────────────────────────────
  if (profile.clubTeamName || profile.clubCoachName) {
    ly = sectionHeader(leftX, 'Club Team', ly);
    const clubLines = [
      profile.clubTeamName ? `Team: ${profile.clubTeamName}` : null,
      profile.clubCoachName ? `Coach: ${profile.clubCoachName}` : null,
      profile.clubCoachContact ? profile.clubCoachContact : null,
    ].filter(Boolean);
    ly = bulletList(leftX, clubLines, ly);
    ly += 8;
  }

  // ── LEFT: Video ──────────────────────────────────────────────────────────────
  if (profile.hudlUrl || profile.highlightUrl) {
    ly = sectionHeader(leftX, 'Video & Links', ly);
    const linkLines = [
      profile.hudlUrl ? `Hudl: ${profile.hudlUrl}` : null,
      profile.highlightUrl ? `Highlights: ${profile.highlightUrl}` : null,
    ].filter(Boolean);
    ly = bulletList(leftX, linkLines, ly);
    ly += 8;
  }

  // ── LEFT: Awards ─────────────────────────────────────────────────────────────
  if (profile.awards?.length) {
    ly = sectionHeader(leftX, 'Awards & Honors', ly);
    ly = bulletList(leftX, profile.awards, ly);
    ly += 8;
  }

  // ── SWOT ────────────────────────────────────────────────────────────────────
  if (profile.swot?.strengths?.length) {
    ly = sectionHeader(leftX, 'Strengths', ly);
    ly = bulletList(leftX, profile.swot.strengths, ly);
    ly += 8;
    ly = sectionHeader(leftX, 'Areas for Growth', ly);
    ly = bulletList(leftX, profile.swot.weaknesses, ly);
    ly += 8;
  }

  // ── RIGHT: Target Schools ────────────────────────────────────────────────────
  if (profile.targetSchools?.length) {
    ry = sectionHeader(rightX, 'Target Schools', ry);
    profile.targetSchools.forEach(school => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...dark);
      const divStr = school.division ? ` (${school.division})` : '';
      const status = STATUS_OPTIONS.find(o => o.value === school.status)?.label || school.status || '';
      doc.text(`${school.name}${divStr}`, rightX + 4, ry);
      ry += 13;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...mid);
      doc.text(status, rightX + 12, ry);
      ry += 14;
    });
    ry += 4;
  }

  // ── RIGHT: Opportunities & Threats from SWOT ─────────────────────────────────
  if (profile.swot?.opportunities?.length) {
    ry = sectionHeader(rightX, 'Opportunities', ry);
    ry = bulletList(rightX, profile.swot.opportunities, ry);
    ry += 8;
    ry = sectionHeader(rightX, 'Watch For', ry);
    ry = bulletList(rightX, profile.swot.threats, ry);
    ry += 8;
  }

  // ── RIGHT: Upcoming Events ───────────────────────────────────────────────────
  if (profile.upcomingEvents?.length) {
    ry = sectionHeader(rightX, 'Upcoming Events', ry);
    profile.upcomingEvents.forEach(ev => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...dark);
      doc.text(ev.name || 'Event', rightX + 4, ry);
      ry += 13;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...mid);
      const detail = [ev.date, ev.location].filter(Boolean).join(' — ');
      if (detail) {
        doc.text(detail, rightX + 12, ry);
        ry += 13;
      }
    });
    ry += 4;
  }

  // ── RIGHT: Academic Details ──────────────────────────────────────────────────
  if (profile.intendedMajor) {
    ry = sectionHeader(rightX, 'Academic Interests', ry);
    ry = bodyText(rightX, `Intended Major: ${profile.intendedMajor}`, ry, col - 4);
    ry += 8;
  }

  // ── Physical Details (right column) ─────────────────────────────────────────
  const physLines = [
    profile.heightFt ? `Height: ${profile.heightFt}'${profile.heightIn || 0}"` : null,
    profile.weight   ? `Weight: ${profile.weight}` : null,
    profile.verticalJump ? `Vertical: ${profile.verticalJump}` : null,
    profile.armSpan  ? `Arm Span: ${profile.armSpan}` : null,
  ].filter(Boolean);
  if (physLines.length > 0) {
    ry = sectionHeader(rightX, 'Physical Profile', ry);
    ry = bulletList(rightX, physLines, ry);
    ry += 8;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...light);
  doc.rect(0, pageH - 32, W, 32, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...mid);
  const footerLeft = `Loggerhead Volleyball — Recruiting Card for ${name}`;
  const footerRight = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(footerLeft, margin, pageH - 12);
  doc.text(footerRight, W - margin, pageH - 12, { align: 'right' });

  // Save
  const safeName = (player?.name || 'player').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`${safeName}-recruiting-card.pdf`);
};

// ─── Main Component ───────────────────────────────────────────────────────────

const RecruitingProfilePage = ({ isNative }) => {
  const { token, user } = useAuth();

  const [claimedPlayers, setClaimedPlayers] = useState([]);
  const [selectedIdx, setSelectedIdx]       = useState(0);
  const [profile, setProfile]               = useState(null);
  const [draft, setDraft]                   = useState(null);   // editable copy
  const [activeTab, setActiveTab]           = useState('profile');
  const [saving, setSaving]                 = useState(false);
  const [swotLoading, setSwotLoading]       = useState(false);
  const [loading, setLoading]               = useState(true);
  const [dirty, setDirty]                   = useState(false);
  const [savedMsg, setSavedMsg]             = useState('');
  const [error, setError]                   = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  // ── Load players ────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/roi/claimed-players`, { headers });
        setClaimedPlayers(res.data.players || []);
      } catch (e) {
        setError('Could not load your claimed players.');
      } finally {
        setLoading(false);
      }
    };
    loadPlayers();
  }, [token]);

  // ── Load profile when player changes ────────────────────────────────────────
  useEffect(() => {
    if (!claimedPlayers[selectedIdx]) return;
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const p = claimedPlayers[selectedIdx];
        const res = await axios.get(
          `${API_URL}/api/roi/recruiting-profile/${p._id}`,
          { headers }
        );
        const data = res.data.empty
          ? emptyProfile(p._id, user?.id)
          : res.data;
        setProfile(data);
        setDraft(JSON.parse(JSON.stringify(data)));
        setDirty(false);
      } catch (e) {
        setError('Could not load recruiting profile.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [selectedIdx, claimedPlayers, token]);

  // ── Draft helpers ────────────────────────────────────────────────────────────
  const set = useCallback((field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  const setNested = useCallback((arrField, idx, subField, value) => {
    setDraft(prev => {
      const arr = [...(prev[arrField] || [])];
      arr[idx] = { ...arr[idx], [subField]: value };
      return { ...prev, [arrField]: arr };
    });
    setDirty(true);
  }, []);

  const addItem = useCallback((arrField, blank) => {
    setDraft(prev => ({ ...prev, [arrField]: [...(prev[arrField] || []), blank] }));
    setDirty(true);
  }, []);

  const removeItem = useCallback((arrField, idx) => {
    setDraft(prev => {
      const arr = [...(prev[arrField] || [])];
      arr.splice(idx, 1);
      return { ...prev, [arrField]: arr };
    });
    setDirty(true);
  }, []);

  const togglePosition = useCallback((pos) => {
    setDraft(prev => {
      const cur = prev.positions || [];
      const next = cur.includes(pos) ? cur.filter(p => p !== pos) : [...cur, pos];
      return { ...prev, positions: next };
    });
    setDirty(true);
  }, []);

  const setAward = useCallback((idx, val) => {
    setDraft(prev => {
      const arr = [...(prev.awards || [])];
      arr[idx] = val;
      return { ...prev, awards: arr };
    });
    setDirty(true);
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      const p = claimedPlayers[selectedIdx];
      const res = await axios.put(
        `${API_URL}/api/roi/recruiting-profile/${p._id}`,
        draft,
        { headers }
      );
      setProfile(res.data);
      setDraft(JSON.parse(JSON.stringify(res.data)));
      setDirty(false);
      setSavedMsg('Saved ✓');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (e) {
      setError('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Generate SWOT ────────────────────────────────────────────────────────────
  const generateSwot = async () => {
    if (swotLoading) return;
    const p = claimedPlayers[selectedIdx];
    setSwotLoading(true);
    setError('');
    try {
      const stats = p.aggregatedStats || {};
      const res = await axios.post(
        `${API_URL}/api/roi/recruiting-profile/${p._id}/swot`,
        { stats },
        { headers }
      );
      setDraft(prev => ({ ...prev, swot: res.data }));
      setDirty(true);
    } catch (e) {
      setError('AI generation failed — please try again.');
    } finally {
      setSwotLoading(false);
    }
  };

  // ── No claimed players ───────────────────────────────────────────────────────
  if (!loading && claimedPlayers.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.title}>🏐 Recruiting Card</h1>
        </div>
        <div style={{ ...s.card, textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: '0 0 8px' }}>
            No Players Claimed
          </p>
          <p style={{ fontSize: 14, color: '#8E8E93', margin: 0 }}>
            Go to your Profile and claim a player to unlock the Recruiting Card feature.
          </p>
        </div>
      </div>
    );
  }

  const player    = claimedPlayers[selectedIdx];
  const stats     = player?.aggregatedStats || {};
  const positions = draft?.positions || [];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>🏐 Recruiting Card</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {savedMsg && (
            <span style={{ fontSize: 14, color: '#34C759', fontWeight: 600 }}>{savedMsg}</span>
          )}
          <button
            style={dirty && !saving ? s.saveBtn : s.saveBtnDisabled}
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,59,48,0.1)', color: '#FF3B30', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Player selector */}
      {claimedPlayers.length > 1 && (
        <div style={s.playerSelector}>
          {claimedPlayers.map((p, i) => (
            <button
              key={p._id}
              style={s.playerChip(i === selectedIdx)}
              onClick={() => { if (i !== selectedIdx) setSelectedIdx(i); }}
            >
              {p.name}
              {p.number ? ` #${p.number}` : ''}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#8E8E93' }}>Loading…</div>
      ) : draft ? (
        <>
          {/* Tabs */}
          <div style={s.tabs}>
            {[
              { key: 'profile', label: 'Profile' },
              { key: 'schools', label: 'Schools' },
              { key: 'swot',    label: 'AI SWOT' },
              { key: 'preview', label: 'Preview' },
            ].map(t => (
              <button key={t.key} style={s.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB: Profile Info ─────────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <>
              {/* Photo URLs */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Photos</p>
                <div style={s.fieldWrap()}>
                  <label style={s.label}>Headshot URL (paste a hosted image link)</label>
                  <input
                    style={s.input}
                    value={draft.headshotUrl}
                    onChange={e => set('headshotUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                {draft.headshotUrl ? (
                  <img
                    src={draft.headshotUrl}
                    alt="Headshot preview"
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, marginTop: 8 }}
                  />
                ) : null}
                <div style={{ ...s.fieldWrap(), marginTop: 10 }}>
                  <label style={s.label}>Action Photo URL</label>
                  <input
                    style={s.input}
                    value={draft.actionPhotoUrl}
                    onChange={e => set('actionPhotoUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>

              {/* Personal */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Personal Info</p>
                <div style={s.fieldWrap()}>
                  <label style={s.label}>Bio / Athlete Statement</label>
                  <textarea
                    style={s.textarea}
                    value={draft.bio}
                    onChange={e => set('bio', e.target.value)}
                    placeholder="A short statement about who you are as a player and person…"
                  />
                </div>
                <div style={{ ...s.row, marginTop: 10 }}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Graduation Year</label>
                    <input
                      style={s.input}
                      type="number"
                      value={draft.graduationYear}
                      onChange={e => set('graduationYear', e.target.value)}
                      placeholder="2026"
                    />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Weight (lbs)</label>
                    <input
                      style={s.input}
                      value={draft.weight}
                      onChange={e => set('weight', e.target.value)}
                      placeholder="140 lbs"
                    />
                  </div>
                </div>
                <div style={{ ...s.row, marginTop: 0 }}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Height (ft)</label>
                    <input
                      style={s.input}
                      type="number"
                      value={draft.heightFt}
                      onChange={e => set('heightFt', e.target.value)}
                      placeholder="5"
                    />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Height (in)</label>
                    <input
                      style={s.input}
                      type="number"
                      value={draft.heightIn}
                      onChange={e => set('heightIn', e.target.value)}
                      placeholder="10"
                    />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Vertical Jump</label>
                    <input
                      style={s.input}
                      value={draft.verticalJump}
                      onChange={e => set('verticalJump', e.target.value)}
                      placeholder='24"'
                    />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Arm Span</label>
                    <input
                      style={s.input}
                      value={draft.armSpan}
                      onChange={e => set('armSpan', e.target.value)}
                      placeholder='72"'
                    />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={s.label}>Position(s)</label>
                  <div style={{ ...s.chipRow, marginTop: 6 }}>
                    {VB_POSITIONS.map(pos => (
                      <button
                        key={pos}
                        onClick={() => togglePosition(pos)}
                        style={{
                          ...s.chip(positions.includes(pos) ? 'rgba(52,199,89,0.15)' : '#F2F2F7'),
                          color: positions.includes(pos) ? '#1C7A38' : '#3C3C43',
                          border: positions.includes(pos) ? '1.5px solid #34C759' : '1.5px solid #E5E5EA',
                          cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Academic */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Academic</p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>High School / Current School</label>
                    <input
                      style={s.input}
                      value={draft.schoolName}
                      onChange={e => set('schoolName', e.target.value)}
                      placeholder="Lincoln High School"
                    />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap(1)}>
                    <label style={s.label}>GPA</label>
                    <input
                      style={s.input}
                      value={draft.gpa}
                      onChange={e => set('gpa', e.target.value)}
                      placeholder="3.8"
                    />
                  </div>
                  <div style={s.fieldWrap(1)}>
                    <label style={s.label}>SAT Score</label>
                    <input
                      style={s.input}
                      type="number"
                      value={draft.satScore}
                      onChange={e => set('satScore', e.target.value)}
                      placeholder="1280"
                    />
                  </div>
                  <div style={s.fieldWrap(1)}>
                    <label style={s.label}>ACT Score</label>
                    <input
                      style={s.input}
                      type="number"
                      value={draft.actScore}
                      onChange={e => set('actScore', e.target.value)}
                      placeholder="28"
                    />
                  </div>
                </div>
                <div style={s.fieldWrap()}>
                  <label style={s.label}>Intended Major / Area of Study</label>
                  <input
                    style={s.input}
                    value={draft.intendedMajor}
                    onChange={e => set('intendedMajor', e.target.value)}
                    placeholder="Exercise Science / Pre-Med"
                  />
                </div>
              </div>

              {/* Club */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Club Team</p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Club Team Name</label>
                    <input
                      style={s.input}
                      value={draft.clubTeamName}
                      onChange={e => set('clubTeamName', e.target.value)}
                      placeholder="Metro VB Club 16U"
                    />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Club Coach Name</label>
                    <input
                      style={s.input}
                      value={draft.clubCoachName}
                      onChange={e => set('clubCoachName', e.target.value)}
                    />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Coach Email / Phone</label>
                    <input
                      style={s.input}
                      value={draft.clubCoachContact}
                      onChange={e => set('clubCoachContact', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Video */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Video & Links</p>
                <div style={s.fieldWrap()}>
                  <label style={s.label}>Hudl Profile URL</label>
                  <input
                    style={s.input}
                    value={draft.hudlUrl}
                    onChange={e => set('hudlUrl', e.target.value)}
                    placeholder="https://www.hudl.com/profile/..."
                  />
                </div>
                <div style={{ ...s.fieldWrap(), marginTop: 10 }}>
                  <label style={s.label}>Highlight Reel URL (YouTube, etc.)</label>
                  <input
                    style={s.input}
                    value={draft.highlightUrl}
                    onChange={e => set('highlightUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>

              {/* Contact */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Contact Info</p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Player Email</label>
                    <input style={s.input} value={draft.playerEmail} onChange={e => set('playerEmail', e.target.value)} placeholder="athlete@email.com" />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Player Phone</label>
                    <input style={s.input} value={draft.playerPhone} onChange={e => set('playerPhone', e.target.value)} />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Parent / Guardian Name</label>
                    <input style={s.input} value={draft.parentName} onChange={e => set('parentName', e.target.value)} />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Parent Email</label>
                    <input style={s.input} value={draft.parentEmail} onChange={e => set('parentEmail', e.target.value)} />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Parent Phone</label>
                    <input style={s.input} value={draft.parentPhone} onChange={e => set('parentPhone', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Awards */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Awards & Honors</p>
                {(draft.awards || []).map((award, i) => (
                  <div key={i} style={{ ...s.row, alignItems: 'center', marginBottom: 8 }}>
                    <div style={s.fieldWrap()}>
                      <input
                        style={s.input}
                        value={award}
                        onChange={e => setAward(i, e.target.value)}
                        placeholder="All-League 2024, MVP Tournament…"
                      />
                    </div>
                    <button style={s.removeBtn} onClick={() => removeItem('awards', i)}>✕</button>
                  </div>
                ))}
                <button style={s.addBtn} onClick={() => addItem('awards', '')}>+ Add Award</button>
              </div>
            </>
          )}

          {/* ── TAB: Schools & Events ─────────────────────────────────────────── */}
          {activeTab === 'schools' && (
            <>
              {/* Target Schools */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Target Schools</p>
                {(draft.targetSchools || []).map((school, i) => (
                  <div key={i} style={{ borderBottom: '1px solid #F2F2F7', paddingBottom: 12, marginBottom: 12 }}>
                    <div style={{ ...s.row, alignItems: 'flex-end' }}>
                      <div style={s.fieldWrap(3)}>
                        <label style={s.label}>School Name</label>
                        <input
                          style={s.input}
                          value={school.name}
                          onChange={e => setNested('targetSchools', i, 'name', e.target.value)}
                          placeholder="UCLA"
                        />
                      </div>
                      <div style={s.fieldWrap(1)}>
                        <label style={s.label}>Division</label>
                        <select
                          style={s.select}
                          value={school.division}
                          onChange={e => setNested('targetSchools', i, 'division', e.target.value)}
                        >
                          {DIVISION_OPTIONS.map(d => <option key={d} value={d}>{d || '—'}</option>)}
                        </select>
                      </div>
                      <button style={s.removeBtn} onClick={() => removeItem('targetSchools', i)}>✕</button>
                    </div>
                    <div style={{ ...s.row, marginTop: 6 }}>
                      <div style={s.fieldWrap()}>
                        <label style={s.label}>Status</label>
                        <select
                          style={s.select}
                          value={school.status}
                          onChange={e => setNested('targetSchools', i, 'status', e.target.value)}
                        >
                          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div style={s.fieldWrap(2)}>
                        <label style={s.label}>Notes</label>
                        <input
                          style={s.input}
                          value={school.notes}
                          onChange={e => setNested('targetSchools', i, 'notes', e.target.value)}
                          placeholder="Visited campus, email sent to coach…"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  style={s.addBtn}
                  onClick={() => addItem('targetSchools', { name: '', division: '', status: 'interested', notes: '' })}
                >
                  + Add School
                </button>
              </div>

              {/* Upcoming Events */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Upcoming Events & Tournaments</p>
                {(draft.upcomingEvents || []).map((ev, i) => (
                  <div key={i} style={{ borderBottom: '1px solid #F2F2F7', paddingBottom: 12, marginBottom: 12 }}>
                    <div style={{ ...s.row, alignItems: 'flex-end' }}>
                      <div style={s.fieldWrap(3)}>
                        <label style={s.label}>Event Name</label>
                        <input
                          style={s.input}
                          value={ev.name}
                          onChange={e => setNested('upcomingEvents', i, 'name', e.target.value)}
                          placeholder="NORCAL Qualifier"
                        />
                      </div>
                      <button style={s.removeBtn} onClick={() => removeItem('upcomingEvents', i)}>✕</button>
                    </div>
                    <div style={{ ...s.row, marginTop: 6 }}>
                      <div style={s.fieldWrap(1)}>
                        <label style={s.label}>Date</label>
                        <input
                          style={s.input}
                          type="date"
                          value={ev.date}
                          onChange={e => setNested('upcomingEvents', i, 'date', e.target.value)}
                        />
                      </div>
                      <div style={s.fieldWrap(2)}>
                        <label style={s.label}>Location</label>
                        <input
                          style={s.input}
                          value={ev.location}
                          onChange={e => setNested('upcomingEvents', i, 'location', e.target.value)}
                          placeholder="Sacramento Convention Center"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  style={s.addBtn}
                  onClick={() => addItem('upcomingEvents', { name: '', date: '', location: '', notes: '' })}
                >
                  + Add Event
                </button>
              </div>
            </>
          )}

          {/* ── TAB: AI SWOT ──────────────────────────────────────────────────── */}
          {activeTab === 'swot' && (
            <>
              {/* Stats summary */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Career Stats — {player?.name}</p>
                <div style={s.statsRow}>
                  {[
                    { label: 'Games', val: stats.gamesPlayed ?? '—' },
                    { label: 'Kills/GM', val: fmt(stats.killsPerGame) },
                    { label: 'Hitting %', val: fmtPct(stats.hittingPct) },
                    { label: 'Aces/GM', val: fmt(stats.acesPerGame) },
                    { label: 'Digs/GM', val: fmt(stats.digsPerGame) },
                    { label: 'Asst/GM', val: fmt(stats.assistsPerGame) },
                  ].map(stat => (
                    <div key={stat.label} style={s.statPill}>
                      <span style={s.statVal}>{stat.val}</span>
                      <span style={s.statLabel}>{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button style={s.generateBtn} onClick={generateSwot} disabled={swotLoading}>
                {swotLoading ? '✨ Generating…' : '✨ Generate AI SWOT Analysis'}
              </button>

              {draft.swot?.strengths?.length ? (
                <>
                  {draft.swot.generatedAt && (
                    <p style={{ fontSize: 12, color: '#8E8E93', textAlign: 'center', marginBottom: 12 }}>
                      Generated{' '}
                      {new Date(draft.swot.generatedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  )}

                  {/* SWOT grid */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <div style={s.swotBox('rgba(52,199,89,0.1)')}>
                      <p style={{ ...s.swotTitle, color: '#1C7A38' }}>💪 Strengths</p>
                      <ul style={s.swotList}>
                        {draft.swot.strengths.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                    <div style={s.swotBox('rgba(255,59,48,0.08)')}>
                      <p style={{ ...s.swotTitle, color: '#C0392B' }}>📈 Areas for Growth</p>
                      <ul style={s.swotList}>
                        {draft.swot.weaknesses.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={s.swotBox('rgba(0,122,255,0.08)')}>
                      <p style={{ ...s.swotTitle, color: '#0051A8' }}>🌟 Opportunities</p>
                      <ul style={s.swotList}>
                        {draft.swot.opportunities.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                    <div style={s.swotBox('rgba(255,149,0,0.1)')}>
                      <p style={{ ...s.swotTitle, color: '#9B5D00' }}>⚠️ Watch For</p>
                      <ul style={s.swotList}>
                        {draft.swot.threats.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: '#C7C7CC', textAlign: 'center', marginTop: 12 }}>
                    AI analysis based on logged stats. Save to keep it on your PDF.
                  </p>
                </>
              ) : (
                <div style={{ ...s.card, textAlign: 'center', color: '#8E8E93', padding: '32px 16px' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                  <p style={{ margin: 0 }}>
                    Tap Generate to create a SWOT analysis from{' '}
                    <strong>{player?.name}</strong>'s logged stats.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── TAB: Preview & Download ───────────────────────────────────────── */}
          {activeTab === 'preview' && (
            <>
              {/* Live preview card */}
              <div style={s.previewCard}>
                {/* Name / header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  {draft.headshotUrl && (
                    <img
                      src={draft.headshotUrl}
                      alt="Headshot"
                      style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <p style={s.previewName}>{player?.name || 'Player Name'}</p>
                    <p style={s.previewSub}>
                      {[
                        draft.positions?.join(' / ') || null,
                        draft.heightFt ? `${draft.heightFt}'${draft.heightIn || 0}"` : null,
                        draft.graduationYear ? `Class of ${draft.graduationYear}` : null,
                      ].filter(Boolean).join('  ·  ') || 'Position · Height · Class Year'}
                    </p>
                    {draft.schoolName && (
                      <p style={{ margin: 0, fontSize: 13, color: '#3C3C43' }}>{draft.schoolName}</p>
                    )}
                  </div>
                </div>

                {/* Academic strip */}
                {(draft.gpa || draft.satScore || draft.actScore) && (
                  <>
                    <div style={s.divider} />
                    <div style={s.chipRow}>
                      {draft.gpa && <span style={s.chip('rgba(52,199,89,0.12)')}>GPA {draft.gpa}</span>}
                      {draft.satScore && <span style={s.chip('#F2F2F7')}>SAT {draft.satScore}</span>}
                      {draft.actScore && <span style={s.chip('#F2F2F7')}>ACT {draft.actScore}</span>}
                      {draft.intendedMajor && <span style={s.chip('#F2F2F7')}>{draft.intendedMajor}</span>}
                    </div>
                  </>
                )}

                {/* Stats */}
                <div style={s.divider} />
                <p style={s.previewSectionTitle}>Career Stats</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { l: 'GP', v: stats.gamesPlayed ?? '—' },
                    { l: 'K/GM', v: fmt(stats.killsPerGame) },
                    { l: 'HIT%', v: fmtPct(stats.hittingPct) },
                    { l: 'ACE/GM', v: fmt(stats.acesPerGame) },
                    { l: 'DIG/GM', v: fmt(stats.digsPerGame) },
                    { l: 'AST/GM', v: fmt(stats.assistsPerGame) },
                  ].map(st => (
                    <div key={st.l} style={{ ...s.statPill, minWidth: 52 }}>
                      <span style={{ ...s.statVal, fontSize: 15 }}>{st.v}</span>
                      <span style={s.statLabel}>{st.l}</span>
                    </div>
                  ))}
                </div>

                {/* SWOT preview */}
                {draft.swot?.strengths?.length > 0 && (
                  <>
                    <div style={s.divider} />
                    <div style={s.previewGrid}>
                      <div>
                        <p style={s.previewSectionTitle}>Strengths</p>
                        <ul style={{ ...s.swotList, paddingLeft: 14, margin: 0 }}>
                          {draft.swot.strengths.slice(0, 2).map((x, i) => <li key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>{x}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p style={s.previewSectionTitle}>Opportunities</p>
                        <ul style={{ ...s.swotList, paddingLeft: 14, margin: 0 }}>
                          {draft.swot.opportunities.slice(0, 2).map((x, i) => <li key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>{x}</li>)}
                        </ul>
                      </div>
                    </div>
                  </>
                )}

                {/* Schools */}
                {draft.targetSchools?.length > 0 && (
                  <>
                    <div style={s.divider} />
                    <p style={s.previewSectionTitle}>Target Schools</p>
                    <div style={s.chipRow}>
                      {draft.targetSchools.slice(0, 6).map((school, i) => {
                        const committed = school.status === 'committed';
                        return (
                          <span key={i} style={s.chip(committed ? 'rgba(52,199,89,0.2)' : '#F2F2F7')}>
                            {committed ? '✓ ' : ''}{school.name}{school.division ? ` (${school.division})` : ''}
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Contact strip */}
                <div style={s.divider} />
                <p style={{ margin: 0, fontSize: 12, color: '#8E8E93' }}>
                  {[
                    draft.playerEmail,
                    draft.hudlUrl ? 'Hudl ↗' : null,
                    draft.highlightUrl ? 'Highlights ↗' : null,
                    draft.clubTeamName || null,
                  ].filter(Boolean).join('   ·   ')}
                </p>
              </div>

              {/* Download button */}
              {dirty && (
                <div style={{ background: 'rgba(255,149,0,0.12)', borderRadius: 10, padding: '9px 12px', marginBottom: 10, fontSize: 13, color: '#9B5D00' }}>
                  ⚠️ You have unsaved changes. Save first so your PDF includes the latest data.
                </div>
              )}
              <button
                style={s.downloadBtn}
                onClick={() => generatePDF(player, draft, stats)}
              >
                ⬇ Download Recruiting Card PDF
              </button>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#C7C7CC', marginTop: 8 }}>
                PDF opens in your device's share sheet — save, email, or print.
              </p>
            </>
          )}
        </>
      ) : null}
    </div>
  );
};

export default RecruitingProfilePage;
