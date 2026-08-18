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
const generatePDF = (player, profile, stats, knownTeams = []) => {
  const doc  = new jsPDF({ unit: 'pt', format: 'letter' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const ML   = 48;
  const MR   = 48;
  const CW   = W - ML - MR;   // full content width
  const GAP  = 16;
  const COL  = (CW - GAP) / 2;

  const GREEN = [52, 199, 89];
  const DARK  = [22, 22, 24];
  const MID   = [100, 100, 105];
  const LGRAY = [210, 210, 215];
  const BGSTAT= [246, 246, 249];
  // ── Helpers ──────────────────────────────────────────────────────────────────
  const playerName = player?.name || 'Player';

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

  // Save
  const safeName = playerName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`${safeName}-recruiting-card.pdf`);
};

// ─── Dev gate ─────────────────────────────────────────────────────────────────
// The recruiting card feature is still in development.
// Gate it so it only renders in local dev builds; show a placeholder everywhere else.
const IS_DEV = process.env.NODE_ENV === 'development';

// ─── Main Component ───────────────────────────────────────────────────────────

const RecruitingProfilePage = ({ isNative }) => {
  const { token, user } = useAuth();

  // Feature gate — remove once the server-side persistence is deployed and
  // the UI has gone through QA.
  if (!IS_DEV) {
    return (
      <div style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: '32px 24px',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏐</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1C1E', marginBottom: 8 }}>
          Recruiting Card
        </h2>
        <p style={{ fontSize: 15, color: '#8E8E93', lineHeight: 1.5 }}>
          This feature is coming soon. We're putting the finishing touches on your
          personalized recruiting card — check back shortly!
        </p>
      </div>
    );
  }

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
