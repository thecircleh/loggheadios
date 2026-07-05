// client/src/components/CoachesCorner.js
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Link, useNavigate } from "react-router-dom";
import stripePrices from "./stripePrices";

const getApiUrl = () => {
  if (typeof window === "undefined") return "https://api.loggerhead.app";
  if (window.Capacitor?.isNativePlatform?.()) return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === "localhost" || h === "127.0.0.1" || h.startsWith("10."))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const POSITION_LABELS = {
  setters: { label: "Setters", hint: "S" },
  middles: { label: "Middles", hint: "MB" },
  outsides: { label: "Outsides", hint: "OH" },
  rightSides: { label: "Right Sides", hint: "RS / Opp" },
  liberosDS: { label: "Liberos / DS", hint: "L / DS" },
};

function formatParticipantsByPosition(pbp) {
  if (!pbp || typeof pbp !== "object") return "(unknown)";
  const parts = Object.entries(POSITION_LABELS)
    .map(([key, meta]) => {
      const v = Number(pbp[key] || 0);
      return v > 0 ? `${v} ${meta.label}` : null;
    })
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "(unknown)";
}

function buildPrompt(inputs) {
  const {
    title,
    ageGroup,
    totalParticipants,
    participantsByPosition,
    skillLevel,
    goal,
    durationMinutes,
    constraints,
    otherDetails,
  } = inputs;

  const pos = formatParticipantsByPosition(participantsByPosition);
  const mins = durationMinutes || "(unknown)";

  return `You are a volleyball coach. Create ONE practical practice drill.

Context:
- Drill title idea: ${title || "(none)"}
- Age group: ${ageGroup || "(unknown)"}
- Total participants: ${totalParticipants || "(unknown)"}
- Participants by position: ${pos}
- Skill level: ${skillLevel || "(unknown)"}
- Primary goal of drill: ${goal || "(unknown)"}
- Planned duration (minutes): ${mins}
- Constraints (court space, balls, nets, etc.): ${constraints || "(none)"}
- Other details: ${otherDetails || "(none)"}

Non-negotiable requirements:
- Provide ONE drill only. No drill menu. No alternatives.
- Not a generic scrimmage.
- Make it runnable with the constraints.
- Use concrete reps and coach actions.
- You MUST include a Schematic section. It cannot be blank.
- The schematic MUST be ASCII only (no Unicode). Use "->" for arrows (NOT "→").
- Max width 60 characters. No tabs. Monospace-friendly.
- The schematic MUST show: NET, a Tosser/Server, at least 6 player start spots,
  and at least one ball path using "->".

Output format (use these headings exactly, in this order):
1) Drill name
2) Setup (court layout + equipment)
3) Schematic
4) How it works (step-by-step)
5) Coach cues (3-6 bullets)
6) Scoring / success criteria
7) Common mistakes + quick fixes
8) Progression (harder)
9) Regression (easier)
10) Time plan for ${mins} minutes

Schematic format rules:
- Put the schematic inside a code block using triple backticks.
- Keep it <= 60 characters wide.
- Use only these symbols/labels: | - + [ ] ( ) . X O S T NET and arrows "->".
- Label the net explicitly as "NET".

If you cannot comply with the schematic rules, rewrite the schematic until you can.
Do not omit it.

Keep it safe, realistic, and beginner-coach friendly.`;
}

const parseDrillSections = (text) => {
  const cleaned = (text || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const parts = cleaned.split(/\n(?=\d+\s*[).]\s)/g);

  return parts
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n");
      const headerLine = lines[0] || "";
      const match = headerLine.match(/^(\d+)\s*[).]\s*(.+)$/);

      const sectionName = match ? match[2].trim() : "Drill";
      const body = lines.slice(1).join("\n").trim();

      return { section: sectionName, body: body || "--" };
    });
};

const cardBase = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
};

const styles = {
  page: { padding: 16, maxWidth: 980, margin: "0 auto" },

  countdownOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    backdropFilter: "blur(2px)",
  },

  countdownBox: {
    background: "#fff",
    borderRadius: 16,
    padding: 40,
    textAlign: "center",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
  },

  countdownText: {
    fontSize: 48,
    fontWeight: 700,
    color: "#33ba35ff",
    margin: "0 0 16px 0",
    fontVariantNumeric: "tabular-nums",
  },

  countdownLabel: {
    fontSize: 16,
    color: "#666",
    margin: 0,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    flexWrap: "wrap",
  },
  h1: { margin: 0, fontSize: 22 },
  sub: { margin: "6px 0 0", color: "#666", fontSize: 13 },

  // iOS Safari-safe: constrain layout height; internal scroll only
  pageBody: {
    height: "calc(100dvh - 140px)",
    maxHeight: "calc(100dvh - 140px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "row",
    gap: 20,
    marginTop: 14,
  },

leftColumn: {
  flex: "0 0 420px",
  minWidth: 320,
  maxWidth: 520,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,        // ✅ critical for flex scrolling
  overflowY: "auto",   // ✅ scroll the left pane
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
},

  card: { ...cardBase },

  drillCard: {
    ...cardBase,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0, // critical for flex overflow
    overflow: "hidden",
  },

  drillContent: {
    flex: 1,
    minHeight: 0, // critical for flex overflow
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  },

  label: { display: "block", fontSize: 12, color: "#666", marginBottom: 6 },

  input: {
    width: "100%",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },

  textarea: { minHeight: 92, resize: "vertical" },

  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },

  buttonRow: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },

  btn: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "#33ba35ff",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },

  btnSecondary: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "white",
    color: "#33ba35ff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  muted: { color: "#666", fontSize: 12, marginTop: 10, lineHeight: 1.4 },

  pre: {
    whiteSpace: "pre",
    overflowX: "auto",
    overflowY: "auto",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    background: "rgba(0,0,0,0.03)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 12,
    margin: 0,
    fontSize: 13,
    lineHeight: 1.45,
  },

  // Positions UI
  positionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 6,
  },
  posField: {
    display: "grid",
    gridTemplateColumns: "1fr 90px",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.02)",
  },
  posLabel: { fontSize: 13, fontWeight: 600, color: "#111" },
  posHint: { fontSize: 11, color: "#666", marginTop: 2 },
  posInput: {
    width: "100%",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 10,
    padding: "10px 10px",
    fontSize: 14,
    outline: "none",
    textAlign: "center",
    boxSizing: "border-box",
    background: "#fff",
  },
};

export default function CoachesCorner() {
  const { token, user, hasCoachesCorner, isSubscriber, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const isDevUi =
    typeof window !== "undefined" &&
    !window.Capacitor?.isNativePlatform?.() &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.startsWith("10."));

  const [llmProvider, setLlmProvider] = useState(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("coachCorner_llmProvider")
        : null;
    return saved || "chatgpt";
  });

  useEffect(() => {
    if (isDevUi && typeof window !== "undefined") {
      window.localStorage.setItem("coachCorner_llmProvider", llmProvider);
    }
  }, [llmProvider, isDevUi]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0) return;
    
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // responsive: stack columns on narrow screens
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  });

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [inputs, setInputs] = useState({
    title: "",
    ageGroup: "",
    totalParticipants: "",
    participantsByPosition: {
      setters: 0,
      middles: 0,
      outsides: 0,
      rightSides: 0,
      liberosDS: 0,
    },
    skillLevel: "Beginner",
    goal: "",
    durationMinutes: 15,
    constraints: "",
    otherDetails: "",
  });

  const [prompt, setPrompt] = useState("");
  const [drillText, setDrillText] = useState("");

  const paywalled = useMemo(() => {
    const isAdmin = !!user?.isAdmin || user?.role === "admin";
    const isCoachSubscriber = isSubscriber || hasCoachesCorner || !!user?.isCoachSubscriber;
    // User is paywalled if: not admin, not subscriber, AND has used their 1 free drill
    return !(isAdmin || isCoachSubscriber) && (user?.coachCornerFreeDrillsUsed || 0) >= 1;
  }, [user, isSubscriber, hasCoachesCorner]);

  useEffect(() => {
    setPrompt(buildPrompt(inputs));
  }, [inputs]);

  const update = (key) => (e) => {
    const value = e?.target?.value;
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  // Position input UX:
  // - shows 0 by default
  // - focus: if 0 -> clears so user can type
  // - blur: if blank -> becomes 0
  const handlePosFocus = (key) => (e) => {
    const current = inputs.participantsByPosition?.[key];
    const num = Number(current || 0);

    if (num === 0) {
      setInputs((p) => ({
        ...p,
        participantsByPosition: {
          ...(p.participantsByPosition || {}),
          [key]: "",
        },
      }));
      return;
    }

    try {
      e.target.select();
    } catch {}
  };

  const handlePosBlur = (key) => (e) => {
    const raw = String(e.target.value || "").trim();
    if (raw === "") {
      setInputs((p) => ({
        ...p,
        participantsByPosition: {
          ...(p.participantsByPosition || {}),
          [key]: 0,
        },
      }));
    }
  };
  
function extractAiDrillName(text) {
  const t = (text || "").replace(/\r\n/g, "\n");

  // Matches:
  // 1) Drill name
  // <name>
  // OR
  // 1) Drill name: <name>
  const m = t.match(
    /(^|\n)\s*1\s*[).]\s*Drill\s*name\s*:?\s*(.*?)(\n|$)([\s\S]*?)(?=\n\s*\d+\s*[).]\s|\s*$)/i
  );

  if (!m) return "";

  // If "1) Drill name: XYZ"
  const inline = (m[2] || "").trim();
  if (inline) return inline;

  // Otherwise, first non-empty line after the heading
  const after = (m[4] || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0];

  return (after || "").trim();
}

  const updatePosition = (posKey) => (e) => {
    const raw = e?.target?.value;

    // allow blank while editing
    if (raw === "") {
      setInputs((prev) => ({
        ...prev,
        participantsByPosition: {
          ...(prev.participantsByPosition || {}),
          [posKey]: "",
        },
      }));
      return;
    }

    const v = Math.max(0, Number(raw || 0));
    setInputs((prev) => ({
      ...prev,
      participantsByPosition: {
        ...(prev.participantsByPosition || {}),
        [posKey]: Number.isFinite(v) ? v : 0,
      },
    }));
  };

  const startCoachesCornerCheckout = async () => {
    try {
      const res = await axios.post(
        `${API_URL}/api/billing/create-checkout-session`,
        { priceId: stripePrices.coachCorner, mode: "subscription" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      window.location.href = res.data.url;
    } catch (err) {
      console.error("Checkout error", err);
      setMessage("Unable to start checkout. Please try again.");
    }
  };

const generate = async () => {
  setMessage("");
  setDrillText("");
  setShowUpgrade(false);
  setGenerating(true);
  setCountdown(30);

  try {
    const res = await axios.post(
      `${API_URL}/api/coaches-corner/generate`,
      {
        ...inputs,
        llmProvider: isDevUi ? llmProvider : undefined,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const drill = res.data?.drill || "";
    if (drill) {
      setDrillText(drill);
      setCountdown(0);

      const aiName = extractAiDrillName(drill);
      if (aiName) {
        setInputs((prev) => ({ ...prev, title: aiName }));
      }
    } else {
      setMessage("No drill text returned.");
      setCountdown(0);
    }
  } catch (err) {
    const code = err?.response?.data?.code;

    if (code === "COACH_CORNER_PAYWALL") {
      setMessage(
        err?.response?.data?.message ||
          "Your free drill has been used. Subscribe to Coaches Corner for unlimited drills."
      );
      setShowUpgrade(true);
      setCountdown(0);
      return;
    }

    setMessage(err?.response?.data?.error || err?.message || "Failed to generate.");
    setCountdown(0);
  } finally {
    setGenerating(false);
  }
};

  const exportDrillPDF = async () => {
    if (!drillText) {
      setMessage("Generate a drill first.");
      return;
    }

    // Save drill first if not already saved
    if (!drillText) {
      setMessage("Generate a drill first.");
      return;
    }

    try {
      // Save the drill to database
      const response = await axios.post(
        `${API_URL}/api/coaches-corner/drills`,
        {
          title: (inputs.title || extractAiDrillName(drillText) || inputs.goal || "Coach Drill").trim(),
          goal: inputs.goal || "",
          inputs,
          prompt,
          drillText,
          notes: "",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Refresh user to get updated coachCornerFreeDrillsUsed
      await refreshUser();

      setMessage("Saved & Exporting…");
    } catch (err) {
      console.error("Save drill failed", err);
      setMessage("Failed to save drill before export.");
      return;
    }

    const normalizePdfText = (s) =>
      (s || "")
        .replace(/\u2192/g, "->")
        .replace(/\u21D2/g, "=>")
        .replace(/\u2190/g, "<-")
        .replace(/\u2248/g, "~")
        .replace(/\u2265/g, ">=")
        .replace(/\u2264/g, "<=")
        .replace(/\u00D7/g, "x")
        .replace(/\u2212/g, "-")
        .replace(/\u2013|\u2014/g, "-")
        .replace(/\u2018|\u2019/g, "'")
        .replace(/\u201C|\u201D/g, '"')
        .replace(/\u00A0/g, " ")
        .replace(/\u2009|\u202F/g, " ");

    const loggerheadGreen = [46, 125, 50];
    const lightGreen = [232, 245, 233];
    const darkGray = [66, 66, 66];

    const doc = new jsPDF();
    const img = new Image();
    img.src = "/web-app-manifest-512x512.png";

    img.onload = () => {
      doc.addImage(img, "PNG", 14, 10, 20, 20);

      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.setTextColor(...loggerheadGreen);
      doc.text("LOGGERHEAD.APP", 38, 18);

      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.setTextColor(...darkGray);
      doc.text("COACHES' CORNER — PRACTICE DRILL", 38, 24);

      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 195, 12, { align: "right" });

      doc.setFillColor(...loggerheadGreen);
      doc.rect(0, 35, 210, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont(undefined, "bold");
      doc.text(normalizePdfText(inputs.goal || "Practice Drill").toUpperCase(), 105, 47, {
        align: "center",
      });

      let y = 60;

      doc.setDrawColor(...loggerheadGreen);
      doc.setLineWidth(0.5);
      doc.rect(14, y - 6, 182, 30);

      doc.setFontSize(9);
      doc.setTextColor(...darkGray);
      doc.setFont(undefined, "bold");
      doc.text("DRILL CONTEXT", 14, y);

      doc.setFont(undefined, "bold");
      doc.text("Age:", 18, y + 7);
      doc.text("Skill:", 18, y + 12);
      doc.text("Players:", 18, y + 17);
      doc.text("Duration:", 18, y + 22);

      doc.setFont(undefined, "normal");
      doc.text(normalizePdfText(inputs.ageGroup || "--"), 36, y + 7);
      doc.text(normalizePdfText(inputs.skillLevel || "--"), 36, y + 12);
      doc.text(normalizePdfText(String(inputs.totalParticipants || "--")), 36, y + 17);
      doc.text(normalizePdfText(`${inputs.durationMinutes || "--"} min`), 36, y + 22);

      doc.setFont(undefined, "bold");
      doc.text("Positions:", 110, y + 7);
      doc.text("Constraints:", 110, y + 12);
      doc.text("Notes:", 110, y + 17);

      doc.setFont(undefined, "normal");
      doc.text(normalizePdfText(formatParticipantsByPosition(inputs.participantsByPosition)).slice(0, 45), 132, y + 7);
      doc.text(normalizePdfText(inputs.constraints || "--").slice(0, 30), 132, y + 12);
      doc.text(normalizePdfText(inputs.otherDetails || "--").slice(0, 30), 132, y + 17);

      y += 34;

      const cleanedDrillText = normalizePdfText(drillText);
      const sections = parseDrillSections(cleanedDrillText);

      const tableBody = sections.length
        ? sections.map((s) => [normalizePdfText(s.section), normalizePdfText(s.body || "--")])
        : [["Drill", cleanedDrillText]];

      autoTable(doc, {
        startY: y,
        head: [["SECTION", "DETAILS"]],
        body: tableBody,
        styles: {
          font: "courier",
          overflow: "linebreak",
          cellWidth: "wrap",
          fontSize: 9,
          cellPadding: 3,
          textColor: darkGray,
          valign: "top",
          lineColor: [220, 220, 220],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: loggerheadGreen,
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold", fillColor: lightGreen },
          1: { cellWidth: 127 },
        },
        theme: "grid",
        didDrawPage: () => {
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.setFont(undefined, "normal");
          doc.text("© Loggerhead.app — Coaches Corner", 105, pageHeight - 10, { align: "center" });
        },
      });

      const safeGoal = normalizePdfText(inputs.goal || "drill")
        .toString()
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .slice(0, 35);

      const safeAge = normalizePdfText(inputs.ageGroup || "age")
        .toString()
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .slice(0, 12);

      doc.save(`Loggerhead_CoachesCorner_${safeAge}_${safeGoal}.pdf`);
    };

    img.onerror = () => {
      const fallback = new jsPDF();
      fallback.setFontSize(14);
      fallback.text("Loggerhead — Coaches' Corner Drill", 14, 18);
      fallback.setFontSize(10);
      fallback.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
      const lines = fallback.splitTextToSize(drillText, 180);
      fallback.text(lines, 14, 40);
      fallback.save("Loggerhead_CoachesCorner_Drill.pdf");
    };
  };

  const saveDrill = async () => {
    setSaving(true);
    setMessage("");

    try {
      const response = await axios.post(
        `${API_URL}/api/coaches-corner/drills`,
        {
          title: (inputs.title || extractAiDrillName(drillText) || inputs.goal || "Coach Drill").trim(),
          goal: inputs.goal || "",
          inputs,
          prompt,
          drillText,
          notes: "",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const savedId = response?.data?._id;

      setMessage("Saved.");

      // Refresh user to get updated coachCornerFreeDrillsUsed
      await refreshUser();

      if (savedId) navigate(`/coaches-corner/drills/${savedId}`);
    } catch (err) {
      console.error("Save drill failed", err);
      setMessage("Failed to save drill.");
    } finally {
      setSaving(false);
    }
  };

  const pageBodyStyle = useMemo(() => {
    if (!isNarrow) return styles.pageBody;
    // stack on narrow screens so it feels native on iPhone
    return {
      ...styles.pageBody,
      flexDirection: "column",
      height: "auto",
      maxHeight: "none",
      overflow: "visible",
    };
  }, [isNarrow]);

  const leftColumnStyle = useMemo(() => {
    if (!isNarrow) return styles.leftColumn;
    return { ...styles.leftColumn, flex: "none", maxWidth: "none", minWidth: 0 };
  }, [isNarrow]);

  const drillCardStyle = useMemo(() => {
    if (!isNarrow) return styles.drillCard;
    // on mobile, let the drill card be normal flow (page scroll), but still internal pre scroll works
    return { ...styles.drillCard, height: "auto", minHeight: 0 };
  }, [isNarrow]);

  return (
    <div style={styles.page}>
      {countdown > 0 && (
        <div style={styles.countdownOverlay}>
          <div style={styles.countdownBox}>
            <div style={styles.countdownText}>{countdown}</div>
            <p style={styles.countdownLabel}>Generating your drill…</p>
          </div>
        </div>
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>Coaches' Corner</h1>
          <div style={styles.sub}>Answer a few questions. Get a practice drill you can run today.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ color: "#666", fontSize: 12 }}>
            {hasCoachesCorner || isSubscriber ? "Unlocked: Unlimited Drills" : paywalled ? "Locked ($3.99/mo)" : "Free Trial"}
          </div>

          {isDevUi ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#666" }}>LLM:</div>
              <select
                style={{
                  ...styles.input,
                  width: 150,
                  padding: "8px 10px",
                  borderRadius: 999,
                  fontSize: 13,
                }}
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
                title="Dev only"
              >
                <option value="chatgpt">ChatGPT</option>
                <option value="kimi">KIMI</option>
                <option value="claude">Claude</option>
              </select>
            </div>
          ) : null}

          <Link to="/coaches-corner/drills" style={styles.btnSecondary}>
            My Saved Drills
          </Link>
        </div>
      </div>

      <div style={pageBodyStyle}>
        {/* LEFT */}
        <div style={leftColumnStyle}>
          <div style={styles.card}>
            <div style={styles.row}>
              <div>
                <label style={styles.label}>Age group</label>
                <input
                  style={styles.input}
                  value={inputs.ageGroup}
                  onChange={update("ageGroup")}
                  placeholder="e.g., 12U, JV, Varsity"
                />
              </div>

              <div>
                <label style={styles.label}>Skill level</label>
                <select style={styles.input} value={inputs.skillLevel} onChange={update("skillLevel")}>
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>Drill title idea (optional)</label>
              <input
                style={styles.input}
                value={inputs.title}
                onChange={update("title")}
                placeholder="e.g., Read & React Defense"
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>Overall goal</label>
              <input
                style={styles.input}
                value={inputs.goal}
                onChange={update("goal")}
                placeholder="e.g., serve receive, out-of-system setting, transition offense"
              />
            </div>

            <div style={{ ...styles.row, marginTop: 10 }}>
              <div>
                <label style={styles.label}>Total participants</label>
                <input
                  style={styles.input}
                  value={inputs.totalParticipants}
                  onChange={update("totalParticipants")}
                  placeholder="e.g., 10"
                />
              </div>

              <div>
                <label style={styles.label}>Duration (minutes)</label>
                <input
                  style={styles.input}
                  type="number"
                  value={inputs.durationMinutes}
                  onChange={(e) =>
                    setInputs((p) => ({ ...p, durationMinutes: Number(e.target.value || 0) }))
                  }
                />
              </div>
            </div>

            {/* Positions */}
            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>Participants by position (optional)</label>

              <div style={styles.positionsGrid}>
                {Object.entries(POSITION_LABELS).map(([key, meta]) => (
                  <div key={key} style={styles.posField}>
                    <div>
                      <div style={styles.posLabel}>{meta.label}</div>
                      <div style={styles.posHint}>{meta.hint}</div>
                    </div>

                    <input
                      style={styles.posInput}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={inputs.participantsByPosition?.[key] ?? 0}
                      onChange={updatePosition(key)}
                      onFocus={handlePosFocus(key)}
                      onBlur={handlePosBlur(key)}
                      aria-label={meta.label}
                    />
                  </div>
                ))}
              </div>

              <div style={styles.muted}>
                This saves as structured counts (Setters, Middles, Outsides, Right Sides, Liberos/DS) so drills can be filtered later.
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>Constraints (optional)</label>
              <input
                style={styles.input}
                value={inputs.constraints}
                onChange={update("constraints")}
                placeholder="e.g., half court, 1 net, 6 balls, no jump serving"
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>Other details (optional)</label>
              <textarea
                style={{ ...styles.input, ...styles.textarea }}
                value={inputs.otherDetails}
                onChange={update("otherDetails")}
                placeholder="Anything else you want the drill to include…"
              />
            </div>

            <div style={styles.buttonRow}>
              <button 
                style={{
                  ...styles.btn,
                  ...(paywalled ? { opacity: 0.5, cursor: "not-allowed" } : {})
                }} 
                onClick={generate} 
                disabled={generating || paywalled}
                title={paywalled ? "You've used your free drill. Subscribe to Coaches' Corner for unlimited drills." : ""}
              >
                {generating ? "Generating…" : "Generate Drill"}
              </button>

              <button style={styles.btnSecondary} onClick={saveDrill} disabled={saving || !drillText}>
                {saving ? "Saving…" : "Save Drill"}
              </button>

              <button
                style={styles.btnSecondary}
                onClick={exportDrillPDF}
                disabled={!drillText || saving}
                title={!drillText ? "Generate a drill first" : "Save drill and export as PDF"}
              >
                {saving ? "Saving & Exporting…" : "Export PDF"}
              </button>
            </div>

            {message ? (
              <div style={{ marginTop: 10 }}>
                <div style={styles.muted}>{message}</div>

                {showUpgrade && stripePrices.coachCorner && (
                  <button
                    onClick={startCoachesCornerCheckout}
                    style={{
                      marginTop: 10,
                      padding: "10px 16px",
                      borderRadius: 999,
                      border: "none",
                      background: "#007AFF",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Unlock Coaches' Corner – $3.99/mo
                  </button>
                )}
              </div>
            ) : paywalled ? (
              <div style={{ marginTop: 10, padding: 12, background: "rgba(0,122,255,0.08)", borderRadius: 10 }}>
                <div style={{ ...styles.muted, marginTop: 0, color: "#007AFF", fontWeight: 600 }}>
                  ✓ You've used your free drill
                </div>
                <div style={{ ...styles.muted, marginTop: 6 }}>
                  Unlock unlimited drills for $3.99/month. Subscribe anytime, cancel anytime.
                </div>
                {stripePrices.coachCorner && (
                  <button
                    onClick={startCoachesCornerCheckout}
                    style={{
                      marginTop: 10,
                      padding: "10px 16px",
                      borderRadius: 999,
                      border: "none",
                      background: "#007AFF",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Unlock Coaches' Corner – $3.99/mo
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT */}
        <div style={drillCardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Generated Drill</div>

          <div style={styles.drillContent}>
            {drillText ? (
              <pre style={styles.pre}>{drillText}</pre>
            ) : (
              <div style={styles.muted}>Generate a drill to see results here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}