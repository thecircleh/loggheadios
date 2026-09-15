import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import jsPDF from 'jspdf';

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

// ─── Image compression helper ─────────────────────────────────────────────────
const compressImage = (file, maxW, maxH, quality = 0.82) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

// ─── PhotoUpload component ────────────────────────────────────────────────────
const PhotoUpload = ({ value, onChange, label, w = 110, h = 130 }) => {
  const ref = React.useRef();
  const handle = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file, w * 2, h * 2);
    onChange(compressed);
    e.target.value = '';
  };
  return (
    <div style={{ display: 'inline-block' }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handle} />
      <div
        onClick={() => ref.current.click()}
        style={{
          width: w, height: h,
          borderRadius: 10,
          border: value ? '2px solid #E5E5EA' : '2px dashed #C7C7CC',
          background: '#F2F2F7',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          WebkitTapHighlightColor: 'transparent',
          flexShrink: 0,
        }}
      >
        {value ? (
          <>
            <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.45)', color: '#fff',
              fontSize: 11, textAlign: 'center', padding: '4px 0',
            }}>
              Change
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: 26 }}>📷</span>
            <span style={{ fontSize: 11, color: '#8E8E93', marginTop: 5, textAlign: 'center', padding: '0 6px' }}>{label}</span>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Empty profile factory ─────────────────────────────────────────────────────
const emptyProfile = (playerId, userId) => ({
  playerId, userId,
  headshotUrl: '', actionPhotoUrl: '',
  bio: '', graduationYear: '', positions: [],
  dob: '', jerseyNumber: '', dominantHand: '', cityState: '',
  teamName: '', teamColorHex: '#8B1A1A',
  heightFt: '', heightIn: '', verticalJump: '', armSpan: '', weight: '',
  schoolName: '', gpa: '', satScore: '', actScore: '', intendedMajor: '',
  involvement: '',
  ncaaStatus: '', naiaStatus: '',
  clubTeamName: '', clubCoachName: '', clubCoachContact: '',
  hsCoachName: '', hsCoachPhone: '', hsCoachEmail: '',
  hudlUrl: '', highlightUrl: '',
  playerEmail: '', playerPhone: '',
  parentName: '', parentEmail: '', parentPhone: '',
  parent2Name: '', parent2Email: '', parent2Phone: '',
  awards: [],
  targetSchools: [],
  upcomingEvents: [],
  tournamentSchedule: [],
  swot: null,
});

// ─── Circular-crop a data-URL or URL onto a canvas, return PNG data URL ──────
const clipToCircle = (url, size) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

// ─── PDF Generator ────────────────────────────────────────────────────────────
const generatePDF = async (player, profile, stats, knownTeams = []) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PW  = 612;
  const PH  = 792;

  // ── Color helpers ─────────────────────────────────────────────────────────
  const hexToRgb = (hex) => {
    const h = (hex || '#8B1A1A').replace('#', '');
    return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
  };
  const PRIMARY = hexToRgb(profile.teamColorHex || '#8B1A1A');
  const WHITE   = [255,255,255];
  const DARK    = [28,28,30];
  const MID     = [110,110,115];
  const LGRAY   = [230,230,235];

  const sf = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const sd = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  const st = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

  const playerName = (player?.name || 'Player Name').toUpperCase();
  const nameParts  = playerName.trim().split(/\s+/);
  const firstName  = nameParts[0] || '';
  const lastName   = nameParts.slice(1).join(' ') || '';

  // ── Layout ────────────────────────────────────────────────────────────────
  const SB_W    = 72;   // sidebar width
  const HDR_H   = 200;  // header band height
  const PH_D    = 112;  // action photo diameter
  const PH_CX   = SB_W + (PW - SB_W) / 2;   // photo center X (mid of content area)
  const PH_CY   = HDR_H - 8;                  // photo center Y (overlaps header bottom)
  const CT_X    = SB_W + 16;                  // content left edge
  const CT_W    = PW - CT_X - 20;             // content width
  const COL_W   = (CT_W - 14) / 2;
  const COL2_X  = CT_X + COL_W + 14;
  const CT_Y    = PH_CY + PH_D / 2 + 18;     // content top (below photo)

  // Pre-render photos as circular PNGs via canvas
  const HS_R  = 34;              // headshot radius (68pt diameter)
  const HS_CX = SB_W + 52;
  const HS_CY = 155;
  const CANVAS_PX = 256;        // canvas resolution for crisp rendering
  const [headshotCircle, actionCircle] = await Promise.all([
    profile.headshotUrl  ? clipToCircle(profile.headshotUrl,  CANVAS_PX) : Promise.resolve(null),
    profile.actionPhotoUrl ? clipToCircle(profile.actionPhotoUrl, CANVAS_PX) : Promise.resolve(null),
  ]);

  const fmt   = v => (v == null || isNaN(+v)) ? '—' : Number(v).toFixed(1);
  const fmtP  = v => (v == null || isNaN(+v)) ? '—' : (Number(v) * 100).toFixed(1) + '%';

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Section header: colored label + underline rule
  const secHdr = (x, w, label, y) => {
    font('bold', 8);
    st(PRIMARY);
    doc.text(label.toUpperCase(), x, y);
    sd(PRIMARY);
    doc.setLineWidth(0.75);
    doc.line(x, y + 2.5, x + w, y + 2.5);
    return y + 14;
  };

  // Field: small bold label on its own line, value below
  const field = (x, y, label, value, w = COL_W) => {
    if (!value) return y;
    font('bold', 7.5);
    st(MID);
    doc.text(label.toUpperCase(), x, y);
    y += 9;
    font('normal', 8.5);
    st(DARK);
    const lines = doc.splitTextToSize(String(value), w - 2);
    doc.text(lines.slice(0, 3), x, y);
    return y + Math.min(lines.length, 3) * 10.5 + 2;
  };

  // Inline label: value on the same line, bold label
  const inlineField = (x, y, label, value, w = COL_W) => {
    if (!value) return y;
    font('bold', 8.5);
    st(DARK);
    doc.text(label + ': ', x, y);
    const lw = doc.getTextWidth(label + ': ');
    font('normal', 8.5);
    doc.text(String(value), x + lw, y);
    return y + 12;
  };

  const para = (x, y, text, w = COL_W, maxLines = 8) => {
    font('normal', 8.5);
    st(DARK);
    const lines = doc.splitTextToSize(text, w);
    doc.text(lines.slice(0, maxLines), x, y);
    return y + Math.min(lines.length, maxLines) * 11;
  };

  // ── 1. Sidebar ────────────────────────────────────────────────────────────
  sf(PRIMARY);
  doc.rect(0, 0, SB_W, PH, 'F');

  // Tournament schedule table in sidebar
  const sched = (profile.tournamentSchedule || []).filter(t => t.dates || t.tournament);
  if (sched.length > 0) {
    const sTitle = new Date().getFullYear() + ' Club Tournament';
    font('bold', 6.5);
    st(WHITE);
    doc.text(sTitle.toUpperCase(), SB_W / 2, 22, { align: 'center' });
    // Table header
    let ty = 32;
    sf([...PRIMARY.map(c => Math.max(0, c - 25))]);
    doc.rect(3, ty - 7, SB_W - 6, 9, 'F');
    font('bold', 6);
    doc.text('Dates', 5, ty - 1);
    doc.text('Tournament', 28, ty - 1);
    ty += 5;
    sched.slice(0, 7).forEach((t, i) => {
      if (i % 2 === 0) {
        sf([...PRIMARY.map(c => Math.min(255, c + 15))]);
        doc.rect(3, ty - 7, SB_W - 6, 9, 'F');
      }
      font('normal', 5.5);
      st(WHITE);
      doc.text(t.dates || '', 5, ty - 1, { maxWidth: 22 });
      doc.text(t.tournament || '', 28, ty - 1, { maxWidth: 38 });
      ty += 10;
    });
  }

  // Rotated player name + number going upward from bottom
  const sideLabel = `${lastName || playerName}${profile.jerseyNumber ? '  #' + profile.jerseyNumber : ''}`;
  font('bold', 22);
  st(WHITE);
  doc.text(sideLabel, SB_W / 2, PH - 28, { angle: 90, align: 'left' });

  // ── 2. Header band ────────────────────────────────────────────────────────
  sf(PRIMARY);
  doc.rect(SB_W, 0, PW - SB_W, HDR_H, 'F');

  // Left portion: mascot placeholder + team name
  const hx = SB_W + 12;
  if (profile.teamName) {
    font('bold', 13);
    st(WHITE);
    doc.text(profile.teamName.toUpperCase(), hx, 36, { maxWidth: (PW - SB_W) / 2 - 10 });
  }
  if (profile.schoolName) {
    font('normal', 8.5);
    st([...WHITE]);
    doc.setTextColor(210, 210, 220);
    doc.text(profile.schoolName.toUpperCase(), hx, sched.length > 0 ? 52 : 50, { maxWidth: (PW - SB_W) / 2 - 10 });
  }

  // Right portion: player name large stacked
  const nameX = SB_W + (PW - SB_W) * 0.68;
  font('bold', 44);
  st(WHITE);
  doc.text(firstName, nameX, 68, { align: 'center' });
  font('bold', 38);
  doc.text(lastName, nameX, 112, { align: 'center' });

  // Sub-info below name
  const subParts = [
    profile.graduationYear ? `CLASS OF ${profile.graduationYear}` : null,
    profile.cityState ? profile.cityState.toUpperCase() : null,
  ].filter(Boolean);
  if (subParts.length) {
    font('bold', 9.5);
    st([200, 200, 210]);
    doc.text(subParts.join('   ·   '), nameX, 136, { align: 'center' });
  }

  // ── 2b. Headshot — lower-left of header band ─────────────────────────────
  // HS_R / HS_CX / HS_CY declared above with the canvas pre-processing
  // White border ring
  sf(WHITE);
  doc.ellipse(HS_CX, HS_CY, HS_R + 4, HS_R + 4, 'F');
  if (headshotCircle) {
    try {
      doc.addImage(headshotCircle, 'PNG', HS_CX - HS_R, HS_CY - HS_R, HS_R * 2, HS_R * 2);
    } catch (_) {}
  } else {
    // Placeholder circle
    sf([...PRIMARY.map(c => Math.max(0, c - 30))]);
    doc.ellipse(HS_CX, HS_CY, HS_R, HS_R, 'F');
    font('bold', 6.5);
    st(WHITE);
    doc.text('HEADSHOT', HS_CX, HS_CY - 3, { align: 'center' });
    font('normal', 5.5);
    doc.text('Add in profile', HS_CX, HS_CY + 5, { align: 'center' });
  }

  // ── 3. Action photo ───────────────────────────────────────────────────────
  // White border ring
  sf(WHITE);
  doc.ellipse(PH_CX, PH_CY, PH_D / 2 + 5, PH_D / 2 + 5, 'F');

  if (actionCircle) {
    try {
      const r = PH_D / 2;
      doc.addImage(actionCircle, 'PNG', PH_CX - r, PH_CY - r, PH_D, PH_D);
    } catch (_) {}
  } else {
    sf(LGRAY);
    doc.ellipse(PH_CX, PH_CY, PH_D / 2, PH_D / 2, 'F');
    font('bold', 8);
    st(MID);
    doc.text('ACTION PHOTO', PH_CX, PH_CY + 3, { align: 'center' });
  }

  // ── 4. Content ────────────────────────────────────────────────────────────

  // ─ LEFT column ─────────────────────────────────────────────────────────────
  let ly = CT_Y;

  // Personal Goals (bio)
  if (profile.bio) {
    ly = secHdr(CT_X, COL_W, 'Personal Goals', ly);
    ly = para(CT_X, ly, profile.bio, COL_W, 6) + 8;
  }

  // Player Information
  ly = secHdr(CT_X, COL_W, 'Player Information', ly);
  ly = inlineField(CT_X, ly, 'Phone',  profile.playerPhone);
  ly = inlineField(CT_X, ly, 'Email',  profile.playerEmail);
  ly = inlineField(CT_X, ly, 'DOB',    profile.dob);
  const ht = profile.heightFt ? `${profile.heightFt}'${profile.heightIn || 0}"` : '';
  ly = inlineField(CT_X, ly, 'Height', ht);
  ly += 8;

  // Parent Contact
  ly = secHdr(CT_X, COL_W, 'Parent Contact', ly);
  if (profile.parentName) {
    font('bold', 8.5); st(DARK); doc.text(profile.parentName, CT_X, ly); ly += 11;
    ly = inlineField(CT_X, ly, 'Phone', profile.parentPhone);
    ly = inlineField(CT_X, ly, 'Email', profile.parentEmail);
  }
  if (profile.parent2Name) {
    ly += 4;
    font('bold', 8.5); st(DARK); doc.text(profile.parent2Name, CT_X, ly); ly += 11;
    ly = inlineField(CT_X, ly, 'Phone', profile.parent2Phone);
    ly = inlineField(CT_X, ly, 'Email', profile.parent2Email);
  }
  ly += 8;

  // Coach Contact
  ly = secHdr(CT_X, COL_W, 'Coach Contact', ly);
  if (profile.hsCoachName) {
    font('bold', 8); st(PRIMARY); doc.text('HIGH SCHOOL COACH', CT_X, ly); ly += 10;
    font('bold', 8.5); st(DARK); doc.text(profile.hsCoachName, CT_X, ly); ly += 11;
    ly = inlineField(CT_X, ly, 'Phone', profile.hsCoachPhone);
    ly = inlineField(CT_X, ly, 'Email', profile.hsCoachEmail);
    ly += 4;
  }
  if (profile.clubCoachName) {
    font('bold', 8); st(PRIMARY); doc.text('TRAVEL TEAM COACH', CT_X, ly); ly += 10;
    font('bold', 8.5); st(DARK); doc.text(profile.clubCoachName, CT_X, ly); ly += 11;
    if (profile.clubCoachContact) {
      font('normal', 8.5); doc.text(profile.clubCoachContact, CT_X, ly); ly += 11;
    }
  }

  // ─ RIGHT column ────────────────────────────────────────────────────────────
  let ry = CT_Y;

  // Academics
  ry = secHdr(COL2_X, COL_W, 'Academics', ry);

  // Scores row
  const scores = [
    profile.gpa      ? `GPA: ${profile.gpa}` : null,
    profile.satScore ? `SAT: ${profile.satScore}` : null,
    profile.actScore ? `ACT: ${profile.actScore}` : null,
  ].filter(Boolean);
  if (scores.length) {
    font('bold', 8.5); st(DARK);
    doc.text(scores.join('   '), COL2_X, ry); ry += 13;
  }

  // Involvement
  if (profile.involvement) {
    font('bold', 7.5); st(MID); doc.text('INVOLVEMENT', COL2_X, ry); ry += 9;
    font('normal', 8.5); st(DARK);
    const il = doc.splitTextToSize(profile.involvement, COL_W);
    doc.text(il.slice(0, 3), COL2_X, ry); ry += Math.min(il.length, 3) * 11 + 4;
  }

  // Awards & Accomplishments (first batch)
  const awards = profile.awards || [];
  if (awards.length) {
    font('bold', 7.5); st(MID); doc.text('AWARDS & ACCOMPLISHMENTS', COL2_X, ry); ry += 9;
    awards.slice(0, 4).forEach(a => {
      font('normal', 8.5); st(DARK);
      const al = doc.splitTextToSize(a, COL_W);
      doc.text(al[0] || '', COL2_X, ry); ry += 11;
    });
    ry += 6;
  }

  // On the Court
  ry = secHdr(COL2_X, COL_W, 'On the Court', ry);
  if (profile.positions?.length) ry = inlineField(COL2_X, ry, 'Position',       profile.positions.join(' / '));
  if (profile.dominantHand)       ry = inlineField(COL2_X, ry, 'Dominant Hand',  profile.dominantHand);
  if (stats.killsPerGame   != null) ry = inlineField(COL2_X, ry, 'Avg. Kills per Game',   fmt(stats.killsPerGame));
  if (stats.assistsPerGame != null) ry = inlineField(COL2_X, ry, 'Avg. Assists per Game', fmt(stats.assistsPerGame));
  if (stats.digsPerGame    != null) ry = inlineField(COL2_X, ry, 'Avg. Digs per Game',    fmt(stats.digsPerGame));
  ry += 8;

  // Additional awards (spill-over)
  if (awards.length > 4) {
    ry = secHdr(COL2_X, COL_W, 'Awards & Accomplishments', ry);
    awards.slice(4).forEach(a => {
      font('normal', 8.5); st(DARK);
      doc.text(a, COL2_X, ry); ry += 11;
    });
    ry += 6;
  }

  // NCAA / NAIA Clearing House
  if (profile.ncaaStatus || profile.naiaStatus) {
    ry = secHdr(COL2_X, COL_W, 'Clearing House', ry);
    if (profile.ncaaStatus) {
      font('bold', 8.5); st(DARK); doc.text('NCAA CLEARING HOUSE', COL2_X, ry);
      font('normal', 8.5);
      const sw = doc.getTextWidth('NCAA CLEARING HOUSE ');
      doc.text(profile.ncaaStatus, COL2_X + sw, ry); ry += 12;
    }
    if (profile.naiaStatus) {
      font('bold', 8.5); st(DARK); doc.text('NAIA CLEARING HOUSE', COL2_X, ry);
      font('normal', 8.5);
      const sw = doc.getTextWidth('NAIA CLEARING HOUSE ');
      doc.text(profile.naiaStatus, COL2_X + sw, ry); ry += 12;
    }
  }

  // ── 5. Footer ─────────────────────────────────────────────────────────────
  sf(PRIMARY);
  doc.rect(SB_W, PH - 26, PW - SB_W, 26, 'F');
  font('bold', 8.5);
  st(WHITE);
  doc.text('Loggerhead.app  ·  Recruiting Profile', SB_W + 12, PH - 10);
  font('normal', 8);
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  doc.text(dateStr, PW - 12, PH - 10, { align: 'right' });

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = (player?.name || 'player').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`${safeName}-recruiting-card.pdf`);
};

/* ─── legacy body removed ──────────────────────────────────────────────────── */
const _deadCode_start = null; const _deadCode_start2 = null; if (false) {
  const playerName = '';

  // Section label: thin green left bar + spaced green caps
  // Returns the y where body content should start (label height + gap below it)
  const secLabel = (x, label, yPos) => {
    doc.setFillColor(...GREEN);
    doc.rect(x, yPos, 3, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GREEN);
    doc.text(label.toUpperCase(), x + 9, yPos + 8.5);
    return yPos + 22;   // 10pt label + 12pt gap before content
  };

  const para = (x, text, yPos, w = COL, size = 9.5, color = DARK) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, w);
    doc.text(lines, x, yPos);
    return yPos + lines.length * (size * 1.35);
  };

  const bullets = (x, items, yPos, w = COL) => {
    let cy = yPos;
    (items || []).forEach(item => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      const lines = doc.splitTextToSize(`• ${item}`, w - 4);
      doc.text(lines, x, cy);
      cy += lines.length * 13;
    });
    return cy;
  };

  // ── Header ───────────────────────────────────────────────────────────────────
  // Thin green rule at very top
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 4, 'F');

  // Headshot — top-right of header if available
  const PHOTO_SIZE = 72;
  const PHOTO_X    = W - MR - PHOTO_SIZE;
  const PHOTO_Y    = 10;
  if (profile.headshotUrl) {
    try {
      doc.addImage(profile.headshotUrl, 'JPEG', PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE);
      // thin border
      doc.setDrawColor(...LGRAY);
      doc.setLineWidth(0.75);
      doc.rect(PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE);
    } catch (_) { /* skip if image fails */ }
  }

  // Text content shifts left to avoid the photo
  const textMaxX = profile.headshotUrl ? PHOTO_X - 12 : W - MR;
  const textW    = textMaxX - ML;

  let y = 52;   // start below top rule with breathing room

  // Player name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...DARK);
  doc.text(playerName, ML, y);
  y += 30;   // 26pt font + line gap

  // Row 2: Position · Class of YYYY · School Name
  const position = profile.positions?.length
    ? profile.positions.join(' / ')
    : (player?.position && player.position !== '?' ? player.position : null);
  const subParts = [
    position,
    profile.graduationYear ? `Class of ${profile.graduationYear}` : null,
    profile.schoolName     ? String(profile.schoolName) : null,
  ].filter(Boolean);
  if (subParts.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...MID);
    const subLines = doc.splitTextToSize(subParts.join('   ·   '), textW);
    doc.text(subLines, ML, y);
    y += subLines.length * 15;
  }

  // Row 3: GPA · SAT · ACT · Height
  const acadParts = [
    profile.gpa      ? `GPA ${profile.gpa}` : null,
    profile.satScore ? `SAT ${profile.satScore}` : null,
    profile.actScore ? `ACT ${profile.actScore}` : null,
    profile.heightFt ? `${profile.heightFt}'${profile.heightIn || 0}"` : null,
    profile.verticalJump ? `Vert ${profile.verticalJump}` : null,
  ].filter(Boolean);
  if (acadParts.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    const acadLines = doc.splitTextToSize(acadParts.join('   ·   '), textW);
    doc.text(acadLines, ML, y);
    if (profile.intendedMajor && !profile.headshotUrl) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...MID);
      doc.text(profile.intendedMajor, W - MR, y, { align: 'right' });
    }
    y += acadLines.length * 14;
  }

  y += 10;  // padding before divider

  // Hairline divider
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.75);
  doc.line(ML, y, W - MR, y);
  y += 16;

  // ── Stats strip ──────────────────────────────────────────────────────────────
  const statItems = [
    { label: 'Games',      val: stats.gamesPlayed != null ? String(stats.gamesPlayed) : '—' },
    { label: 'Kills/GM',   val: fmt(stats.killsPerGame) },
    { label: 'Hitting %',  val: fmtPct(stats.hittingPct) },
    { label: 'Aces/GM',    val: fmt(stats.acesPerGame) },
    { label: 'Digs/GM',    val: fmt(stats.digsPerGame) },
    { label: 'Assists/GM', val: fmt(stats.assistsPerGame) },
  ];
  const SW = CW / statItems.length;
  const SH = 42;

  doc.setFillColor(...BGSTAT);
  doc.roundedRect(ML, y, CW, SH, 5, 5, 'F');

  statItems.forEach((st, i) => {
    const sx = ML + i * SW;
    // vertical divider between columns
    if (i > 0) {
      doc.setDrawColor(...LGRAY);
      doc.setLineWidth(0.5);
      doc.line(sx, y + 8, sx, y + SH - 8);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...DARK);
    doc.text(st.val, sx + SW / 2, y + 17, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MID);
    doc.text(st.label, sx + SW / 2, y + 30, { align: 'center' });
  });
  y += SH + 18;

  // ── Two-column body ───────────────────────────────────────────────────────────
  const LX = ML;
  const RX = ML + COL + GAP;
  let ly = y;
  let ry = y;
  const SP = 11; // inter-section spacing

  // ── LEFT: Bio
  if (profile.bio) {
    ly = secLabel(LX, 'About', ly);
    ly = para(LX, profile.bio, ly);
    ly += SP;
  }

  // ── LEFT: Contact
  const contactLines = [
    profile.playerEmail ? profile.playerEmail : null,
    profile.playerPhone ? profile.playerPhone : null,
    profile.parentName  ? `Parent: ${profile.parentName}` : null,
    profile.parentEmail ? profile.parentEmail : null,
    profile.parentPhone ? profile.parentPhone : null,
  ].filter(Boolean);
  if (contactLines.length) {
    ly = secLabel(LX, 'Contact', ly);
    ly = bullets(LX, contactLines, ly);
    ly += SP;
  }

  // ── LEFT: Club team
  if (profile.clubTeamName) {
    ly = secLabel(LX, 'Club Team', ly);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(profile.clubTeamName, LX, ly);
    ly += 14;
    const clubSubs = [
      profile.clubCoachName    ? `Coach: ${profile.clubCoachName}` : null,
      profile.clubCoachContact ? profile.clubCoachContact : null,
    ].filter(Boolean);
    clubSubs.forEach(s => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MID);
      doc.text(s, LX, ly);
      ly += 12;
    });
    ly += SP - 4;
  }

  // ── LEFT: Teams on record
  if (knownTeams.length) {
    ly = secLabel(LX, 'Teams on Record', ly);
    knownTeams.forEach((t, i) => {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      const seasonStr = t.season ? `  (${t.season})` : '';
      doc.text(`${t.team}${seasonStr}`, LX, ly);
      ly += 13;
    });
    ly += SP;
  }

  // ── LEFT: Video
  if (profile.hudlUrl || profile.highlightUrl) {
    ly = secLabel(LX, 'Video', ly);
    [
      profile.hudlUrl       ? `Hudl: ${profile.hudlUrl}` : null,
      profile.highlightUrl  ? `Highlights: ${profile.highlightUrl}` : null,
    ].filter(Boolean).forEach(link => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MID);
      const lines = doc.splitTextToSize(link, COL);
      doc.text(lines, LX, ly);
      ly += lines.length * 12;
    });
    ly += SP;
  }

  // ── LEFT: Awards
  if (profile.awards?.length) {
    ly = secLabel(LX, 'Awards & Honors', ly);
    ly = bullets(LX, profile.awards, ly);
    ly += SP;
  }

  // ── LEFT: SWOT strengths + growth
  if (profile.swot?.strengths?.length) {
    ly = secLabel(LX, 'Strengths', ly);
    ly = bullets(LX, profile.swot.strengths, ly);
    ly += SP;
    ly = secLabel(LX, 'Areas for Growth', ly);
    ly = bullets(LX, profile.swot.weaknesses, ly);
    ly += SP;
  }

  // ── RIGHT: Physical vitals
  const physParts = [
    profile.heightFt     ? `${profile.heightFt}'${profile.heightIn || 0}"` : null,
    profile.weight       ? `${profile.weight} lbs` : null,
    profile.verticalJump ? `Vert: ${profile.verticalJump}` : null,
    profile.armSpan      ? `Arm span: ${profile.armSpan}` : null,
  ].filter(Boolean);
  if (physParts.length) {
    ry = secLabel(RX, 'Physical Profile', ry);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    const physLine = doc.splitTextToSize(physParts.join('   ·   '), COL);
    doc.text(physLine, RX, ry);
    ry += physLine.length * 13 + SP;
  }

  // ── RIGHT: Target schools
  const filledSchools = (profile.targetSchools || []).filter(s => s.name?.trim());
  if (filledSchools.length) {
    ry = secLabel(RX, 'Target Schools', ry);
    filledSchools.forEach(school => {
      const committed = school.status === 'committed';
      doc.setFont('helvetica', committed ? 'bold' : 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...(committed ? GREEN : DARK));
      const divStr = school.division ? ` (${school.division})` : '';
      const prefix = committed ? '✓ ' : '';
      doc.text(`${prefix}${school.name}${divStr}`, RX, ry);
      ry += 13;
      if (school.status && school.status !== 'interested') {
        const label = STATUS_OPTIONS.find(o => o.value === school.status)?.label || '';
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...MID);
        doc.text(label, RX + 6, ry);
        ry += 12;
      }
    });
    ry += SP;
  }

  // ── RIGHT: SWOT opportunities + watch for
  if (profile.swot?.opportunities?.length) {
    ry = secLabel(RX, 'Opportunities', ry);
    ry = bullets(RX, profile.swot.opportunities, ry);
    ry += SP;
    ry = secLabel(RX, 'Watch For', ry);
    ry = bullets(RX, profile.swot.threats, ry);
    ry += SP;
  }

  // ── RIGHT: Upcoming events
  const filledEvents = (profile.upcomingEvents || []).filter(ev => ev.name?.trim());
  if (filledEvents.length) {
    ry = secLabel(RX, 'Upcoming Events', ry);
    filledEvents.forEach(ev => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.text(ev.name.trim(), RX, ry);
      ry += 13;
      const detail = [ev.date, ev.location].filter(Boolean).join(' — ');
      if (detail) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...MID);
        doc.text(detail, RX + 4, ry);
        ry += 12;
      }
    });
    ry += SP;
  }

  // ── RIGHT: Intended major
  if (profile.intendedMajor) {
    ry = secLabel(RX, 'Intended Major', ry);
    ry = para(RX, profile.intendedMajor, ry);
    ry += SP;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(1);
  doc.line(ML, H - 28, W - MR, H - 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  const footerLeft  = `Loggerhead.app — Recruiting Card for ${playerName}`;
  const footerRight = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(footerLeft,  ML,      H - 14);
  doc.text(footerRight, W - MR,  H - 14, { align: 'right' });

} // end dead code block

// ─── Dev gate removed — feature is now live ───────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

const RecruitingProfilePage = ({ isNative }) => {
  const { token, user } = useAuth();

  // Feature gate lifted — Recruiting Card is now live.

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
  const [knownTeams, setKnownTeams]         = useState([]);

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

  // ── Load profile + known teams when player changes ──────────────────────────
  useEffect(() => {
    if (!claimedPlayers[selectedIdx]) return;
    const p = claimedPlayers[selectedIdx];
    setLoading(true);
    setError('');
    setKnownTeams([]);

    Promise.all([
      axios.get(`${API_URL}/api/roi/recruiting-profile/${p._id}`, { headers }),
      axios.get(`${API_URL}/api/roi/player-teams/${p._id}`, { headers }),
    ]).then(([profileRes, teamsRes]) => {
      const data = profileRes.data.empty
        ? emptyProfile(p._id, user?.id)
        : profileRes.data;
      setProfile(data);
      setDraft(JSON.parse(JSON.stringify(data)));
      setDirty(false);
      setKnownTeams(teamsRes.data.teams || []);
    }).catch(() => {
      setError('Could not load recruiting profile.');
    }).finally(() => {
      setLoading(false);
    });
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
              {/* Photos */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Photos</p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ ...s.label, marginBottom: 6 }}>Headshot</div>
                    <PhotoUpload
                      value={draft.headshotUrl}
                      onChange={v => set('headshotUrl', v)}
                      label="Tap to add"
                      w={110} h={130}
                    />
                  </div>
                  <div>
                    <div style={{ ...s.label, marginBottom: 6 }}>Action Photo</div>
                    <PhotoUpload
                      value={draft.actionPhotoUrl}
                      onChange={v => set('actionPhotoUrl', v)}
                      label="Tap to add"
                      w={150} h={130}
                    />
                  </div>
                </div>
              </div>

              {/* Personal */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Personal Info</p>
                <div style={s.fieldWrap()}>
                  <label style={s.label}>Bio / Personal Goals Statement</label>
                  <textarea
                    style={s.textarea}
                    value={draft.bio}
                    onChange={e => set('bio', e.target.value)}
                    placeholder="Why you want to play at the collegiate level, your values as a player and person…"
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
                    <label style={s.label}>Date of Birth</label>
                    <input
                      style={s.input}
                      type="date"
                      value={draft.dob}
                      onChange={e => set('dob', e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ ...s.row, marginTop: 8 }}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Jersey Number</label>
                    <input
                      style={s.input}
                      value={draft.jerseyNumber}
                      onChange={e => set('jerseyNumber', e.target.value)}
                      placeholder="#14"
                    />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Dominant Hand</label>
                    <select
                      style={s.select}
                      value={draft.dominantHand}
                      onChange={e => set('dominantHand', e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="Right">Right</option>
                      <option value="Left">Left</option>
                    </select>
                  </div>
                </div>
                <div style={{ ...s.row, marginTop: 8 }}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>City, State</label>
                    <input
                      style={s.input}
                      value={draft.cityState}
                      onChange={e => set('cityState', e.target.value)}
                      placeholder="Indianapolis, IN"
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

              {/* Team / Card Appearance */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Team & Card Appearance</p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Team Name (shown on PDF)</label>
                    <input
                      style={s.input}
                      value={draft.teamName}
                      onChange={e => set('teamName', e.target.value)}
                      placeholder="Indianapolis Lady Bears"
                    />
                  </div>
                </div>
                <div style={{ ...s.row, marginTop: 8, alignItems: 'center' }}>
                  <div style={s.fieldWrap(1)}>
                    <label style={s.label}>Card Color</label>
                    <input
                      type="color"
                      value={draft.teamColorHex || '#8B1A1A'}
                      onChange={e => set('teamColorHex', e.target.value)}
                      style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #E5E5EA', cursor: 'pointer', padding: 2 }}
                    />
                  </div>
                  <div style={s.fieldWrap(3)}>
                    <label style={s.label}>Hex Value</label>
                    <input
                      style={s.input}
                      value={draft.teamColorHex || '#8B1A1A'}
                      onChange={e => set('teamColorHex', e.target.value)}
                      placeholder="#8B1A1A"
                    />
                  </div>
                </div>
                <p style={{ fontSize: 12, color: '#8E8E93', margin: '6px 0 0' }}>
                  The sidebar, header band, and footer on the PDF use this color.
                </p>
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
                <div style={{ ...s.fieldWrap(), marginTop: 10 }}>
                  <label style={s.label}>Involvement (clubs, leadership, activities)</label>
                  <input
                    style={s.input}
                    value={draft.involvement}
                    onChange={e => set('involvement', e.target.value)}
                    placeholder="Student Council President, Volleyball Team Captain, Honor Roll"
                  />
                </div>
              </div>

              {/* NCAA / NAIA Clearing House */}
              <div style={s.card}>
                <p style={s.sectionTitle}>NCAA / NAIA Clearing House</p>
                <p style={{ fontSize: 12, color: '#8E8E93', marginTop: -4, marginBottom: 10 }}>
                  Your eligibility status with the NCAA and NAIA clearing houses.
                </p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>NCAA Clearing House Status</label>
                    <select
                      style={s.select}
                      value={draft.ncaaStatus}
                      onChange={e => set('ncaaStatus', e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="Registered">Registered</option>
                      <option value="Certified">Certified</option>
                      <option value="Pending">Pending</option>
                      <option value="Not Registered">Not Registered</option>
                    </select>
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>NAIA Clearing House Status</label>
                    <select
                      style={s.select}
                      value={draft.naiaStatus}
                      onChange={e => set('naiaStatus', e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="Registered">Registered</option>
                      <option value="Certified">Certified</option>
                      <option value="Pending">Pending</option>
                      <option value="Not Registered">Not Registered</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Teams on record */}
              {knownTeams.length > 0 && (
                <div style={s.card}>
                  <p style={s.sectionTitle}>Teams on Record</p>
                  <p style={{ fontSize: 12, color: '#8E8E93', marginTop: -4, marginBottom: 10 }}>
                    From {player?.name}'s logged match history
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {knownTeams.map((t, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          background: '#F9F9FB',
                          borderRadius: 8,
                          border: '1px solid #E5E5EA',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E' }}>{t.team}</span>
                          {t.season ? (
                            <span style={{ fontSize: 12, color: '#8E8E93', marginLeft: 8 }}>{t.season}</span>
                          ) : null}
                          {t.position && t.position !== '?' ? (
                            <span style={{ fontSize: 12, color: '#8E8E93', marginLeft: 6 }}>· {t.position}</span>
                          ) : null}
                        </div>
                        <button
                          style={{
                            background: 'none',
                            border: '1px solid #34C759',
                            borderRadius: 6,
                            color: '#34C759',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 10px',
                            cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                          onClick={() => set('clubTeamName', t.team)}
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Club / Travel Team */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Travel / Club Team</p>
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
                    <label style={s.label}>Travel Team Coach Name</label>
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

                <p style={{ fontSize: 12, fontWeight: 600, color: '#3C3C43', margin: '10px 0 6px' }}>Parent / Guardian 1</p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Name</label>
                    <input style={s.input} value={draft.parentName} onChange={e => set('parentName', e.target.value)} placeholder="First Last" />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Email</label>
                    <input style={s.input} value={draft.parentEmail} onChange={e => set('parentEmail', e.target.value)} />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Phone</label>
                    <input style={s.input} value={draft.parentPhone} onChange={e => set('parentPhone', e.target.value)} />
                  </div>
                </div>

                <p style={{ fontSize: 12, fontWeight: 600, color: '#3C3C43', margin: '12px 0 6px' }}>Parent / Guardian 2 <span style={{ fontWeight: 400, color: '#8E8E93' }}>(optional)</span></p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Name</label>
                    <input style={s.input} value={draft.parent2Name} onChange={e => set('parent2Name', e.target.value)} placeholder="First Last" />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Email</label>
                    <input style={s.input} value={draft.parent2Email} onChange={e => set('parent2Email', e.target.value)} />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Phone</label>
                    <input style={s.input} value={draft.parent2Phone} onChange={e => set('parent2Phone', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* High School Coach */}
              <div style={s.card}>
                <p style={s.sectionTitle}>High School Coach</p>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Coach Name</label>
                    <input style={s.input} value={draft.hsCoachName} onChange={e => set('hsCoachName', e.target.value)} placeholder="First Last" />
                  </div>
                </div>
                <div style={s.row}>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Coach Phone</label>
                    <input style={s.input} value={draft.hsCoachPhone} onChange={e => set('hsCoachPhone', e.target.value)} />
                  </div>
                  <div style={s.fieldWrap()}>
                    <label style={s.label}>Coach Email</label>
                    <input style={s.input} value={draft.hsCoachEmail} onChange={e => set('hsCoachEmail', e.target.value)} />
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

              {/* Tournament Schedule — appears in PDF sidebar */}
              <div style={s.card}>
                <p style={s.sectionTitle}>Club Tournament Schedule</p>
                <p style={{ fontSize: 12, color: '#8E8E93', marginTop: -4, marginBottom: 10 }}>
                  Shown in the sidebar of your PDF — lets college coaches know where to see you play.
                </p>
                {(draft.tournamentSchedule || []).map((t, i) => (
                  <div key={i} style={{ ...s.row, alignItems: 'center', marginBottom: 8 }}>
                    <div style={s.fieldWrap(1)}>
                      <label style={s.label}>Dates</label>
                      <input
                        style={s.input}
                        value={t.dates}
                        onChange={e => setNested('tournamentSchedule', i, 'dates', e.target.value)}
                        placeholder="May 23-24"
                      />
                    </div>
                    <div style={s.fieldWrap(2)}>
                      <label style={s.label}>Tournament Name</label>
                      <input
                        style={s.input}
                        value={t.tournament}
                        onChange={e => setNested('tournamentSchedule', i, 'tournament', e.target.value)}
                        placeholder="Memorial Open"
                      />
                    </div>
                    <button style={s.removeBtn} onClick={() => removeItem('tournamentSchedule', i)}>✕</button>
                  </div>
                ))}
                <button
                  style={s.addBtn}
                  onClick={() => addItem('tournamentSchedule', { dates: '', tournament: '' })}
                >
                  + Add Tournament
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
                onClick={() => generatePDF(player, draft, stats, knownTeams)}
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
