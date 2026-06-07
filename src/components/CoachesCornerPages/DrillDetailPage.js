// client/src/components/CoachesCornerPages/DrillDetailPage.js
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getDrillById, rateDrill } from "./coachDrillsApi";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const isNative = !!(window.Capacitor?.isNativePlatform?.());

const savePDF = async (doc, filename) => {
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const base64 = doc.output('datauristring').split(',')[1];
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      const fileUri = await Filesystem.getUri({
        directory: Directory.Cache,
        path: filename,
      });
      await Share.share({ title: filename, url: fileUri.uri });
    } catch (err) {
      console.error('PDF share failed:', err);
      doc.save(filename);
    }
  } else {
    doc.save(filename);
  }
};

const styles = {
  page: { padding: 16, maxWidth: 980, margin: "0 auto" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  h1: { margin: 0, fontSize: 22 },
  meta: { marginTop: 6, fontSize: 12, color: "#666", lineHeight: 1.35 },
  btn: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "#33ba35ff",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  btnSecondary: {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "white",
    color: "#33ba35ff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  card: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  pre: {
    whiteSpace: "pre-wrap",
    background: "rgba(0,0,0,0.03)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 1.45,
  },
  starsRow: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  starBtn: {
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 999,
    padding: "8px 10px",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
  },
};

function metaLine(d) {
  const age = d?.inputs?.ageGroup || "--";
  const level = d?.inputs?.skillLevel || "--";
  const mins = d?.inputs?.durationMinutes || "--";
  const goal = d?.goal || "--";
  return `Age: ${age} • Level: ${level} • ${mins} min • Goal: ${goal}`;
}

export default function DrillDetailPage() {
  const { token } = useAuth();
  const { drillId } = useParams();

  const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [drill, setDrill] = useState(null);
  const [myRating, setMyRating] = useState(0);
  const [msg, setMsg] = useState("");
  
  
const exportDrillPDF = async () => {
  if (!drill?.drillText) {
    setMsg("No drill text to export.");
    return;
  }

  const loggerheadGreen = [46, 125, 50];
  const lightGreen = [232, 245, 233];
  const darkGray = [66, 66, 66];

  const doc = new jsPDF();
  const img = new Image();
  img.src = "/web-app-manifest-512x512.png";

  const safe = (v, fallback = "--") => {
    const s = (v ?? "").toString().trim();
    return s ? s : fallback;
  };

const normalizePdfText = (s) => {
  return (s || "")
    // arrows
    .replace(/\u2192/g, "->")        // →
    .replace(/\u21D2/g, "=>")        // ⇒
    .replace(/\u2190/g, "<-")        // ←

    // math symbols (these are breaking your PDF)
    .replace(/\u2248/g, "~")         // ≈  -> ~
    .replace(/\u2265/g, ">=")        // ≥  -> >=
    .replace(/\u2264/g, "<=")        // ≤  -> <=
    .replace(/\u00D7/g, "x")         // ×  -> x
    .replace(/\u2212/g, "-")         // −  -> -

    // dashes
    .replace(/\u2013|\u2014/g, "-")  // – —

    // quotes
    .replace(/\u2018|\u2019/g, "'")  // ‘ ’
    .replace(/\u201C|\u201D/g, '"')  // “ ”

    // spaces
    .replace(/\u00A0/g, " ")         // NBSP
    .replace(/\u2009|\u202F/g, " "); // thin spaces
};



  const buildBody = () => {
    const cleaned = normalizePdfText(safe(drill.drillText, ""))
  .replace(/\r\n/g, "\n")
  .trim();
    const parts = cleaned
      ? cleaned.split(/\n(?=\d+\s*[).]\s)/g).map((p) => p.trim()).filter(Boolean)
      : [];

    return parts.length
      ? parts.map((chunk) => {
          const lines = chunk.split("\n");
          const header = (lines[0] || "Section").replace(/^\d+\s*[).]\s*/, "");
          const rest = lines.slice(1).join("\n").trim() || "--";
          return [header, rest];
        })
      : [["Drill", cleaned || "--"]];
  };

  img.onload = async () => {
    // Logo + brand header
    doc.addImage(img, "PNG", 14, 10, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...loggerheadGreen);
    doc.text("LOGGERHEAD.APP", 38, 18);

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(...darkGray);
    doc.text("COACHES' CORNER — PRACTICE DRILL", 38, 24);

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Exported: ${new Date().toLocaleString()}`, 195, 12, { align: "right" });

    // Green banner
    doc.setFillColor(...loggerheadGreen);
    doc.rect(0, 35, 210, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text(safe(drill.title, "PRACTICE DRILL").toUpperCase(), 105, 47, { align: "center" });

    // Context box (using saved drill.inputs if present)
    let y = 60;
    doc.setDrawColor(...loggerheadGreen);
    doc.setLineWidth(0.5);
    doc.rect(14, y - 6, 182, 30);

    doc.setFontSize(9);
    doc.setTextColor(...darkGray);
    doc.setFont(undefined, "bold");
    doc.text("DRILL CONTEXT", 14, y);

    const leftX = 18;
    const rightX = 110;

    doc.setFont(undefined, "bold");
    doc.text("Age:", leftX, y + 7);
    doc.text("Skill:", leftX, y + 12);
    doc.text("Players:", leftX, y + 17);
    doc.text("Duration:", leftX, y + 22);

    doc.setFont(undefined, "normal");
    doc.text(safe(drill.inputs?.ageGroup), leftX + 18, y + 7);
    doc.text(safe(drill.inputs?.skillLevel), leftX + 18, y + 12);
    doc.text(safe(drill.inputs?.totalParticipants), leftX + 18, y + 17);
    doc.text(`${safe(drill.inputs?.durationMinutes)} min`, leftX + 18, y + 22);

    doc.setFont(undefined, "bold");
    doc.text("Goal:", rightX, y + 7);
    doc.text("Constraints:", rightX, y + 12);

    doc.setFont(undefined, "normal");
    doc.text(safe(drill.goal).slice(0, 35), rightX + 18, y + 7);
    doc.text(safe(drill.inputs?.constraints).slice(0, 35), rightX + 22, y + 12);

    y += 34;
	
	const tableBody = buildBody();

   autoTable(doc, {
  startY: y,
  head: [["SECTION", "DETAILS"]],
  body: tableBody,
  theme: "grid",

  styles: {
    font: "courier",
    fontSize: 9,
    cellPadding: 4,
    valign: "top",
    overflow: "linebreak",        
    cellWidth: "wrap",           
    textColor: darkGray,
  },

  headStyles: {
    fillColor: loggerheadGreen,
    textColor: [255, 255, 255],
    fontStyle: "bold",
  },

  columnStyles: {
    0: {
      cellWidth: 55,
      fontStyle: "bold",
      fillColor: lightGreen,
    },
    1: {
      cellWidth: 125,
    },
  },

  didDrawPage: () => {
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      "© Loggerhead.app — Coaches Corner",
      105,
      pageHeight - 10,
      { align: "center" }
    );
  },
});


    // Personal notes, if present
    if ((drill.notes || "").trim()) {
      const notesY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : y + 10;
      doc.setFontSize(11);
      doc.setTextColor(...darkGray);
      doc.setFont(undefined, "bold");
      doc.text("Personal Notes", 14, notesY);

      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      const lines = doc.splitTextToSize(drill.notes, 180);
      doc.text(lines, 14, notesY + 6);
    }

    const safeTitle = safe(drill.title, "drill").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40);
    await savePDF(doc, `Loggerhead_CoachesCorner_${safeTitle}.pdf`);
  };

  img.onerror = async () => {
    // Fallback: still branded, no logo
    doc.setFontSize(14);
    doc.text("Loggerhead — Coaches' Corner Drill", 14, 18);
    doc.setFontSize(10);
    doc.text(`Exported: ${new Date().toLocaleString()}`, 14, 26);
    const lines = doc.splitTextToSize(drill.drillText, 180);
    doc.text(lines, 14, 40);
    await savePDF(doc, "Loggerhead_CoachesCorner_Drill.pdf");
  };
};


  const ratingText = useMemo(() => {
    if (!drill) return "";
    return `Rating: ${Number(drill.averageRating || 0).toFixed(1)} (${drill.ratingsCount || 0})`;
  }, [drill]);

  useEffect(() => {
    const run = async () => {
      setMsg("");
      setLoading(true);
      try {
        const d = await getDrillById(token, drillId);
        setDrill(d);
      } catch (e) {
        setMsg(e?.response?.data?.message || e?.message || "Failed to load drill.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token, drillId]);

const onRate = async (r) => {
  setMyRating(r); // ✅ highlight immediately
  try {
    const updated = await rateDrill(token, drillId, r);
    setDrill(updated);
  } catch (e) {
    setMsg(e?.response?.data?.message || e?.message || "Failed to rate.");
  }
};

  if (loading) return <div style={styles.page}>Loading…</div>;
  if (!drill) return <div style={styles.page}>{msg || "Drill not found."}</div>;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>{drill.title || "Untitled Drill"}</h1>
          <div style={styles.meta}>{metaLine(drill)}</div>
          <div style={styles.meta}>{ratingText}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/coaches-corner/drills" style={styles.btnSecondary}>Saved Drills</Link>
          <Link to={`/coaches-corner/drills/${drillId}/edit`} style={styles.btnSecondary}>Edit</Link>
          <Link to="/coaches-corner" style={styles.btnSecondary}>Generate</Link>
        </div>
      </div>

      {msg ? <div style={{ marginTop: 10, color: "#b00020" }}>{msg}</div> : null}

      <div style={styles.card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Rate this drill</div>
        <div style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((r) => (
            <button
  key={r}
  style={{
    ...styles.starBtn,
    background: myRating === r ? "green" : "white",
    color: myRating === r ? "white" : "#111",
  }}
  onClick={() => onRate(r)}
>
  {r}★
</button>

          ))}
		<div style={{ marginTop: 10 }}>
  <button style={styles.btnSecondary} onClick={exportDrillPDF}>Export PDF</button>
</div>
        </div>

        <div style={{ marginTop: 12, fontWeight: 800 }}>Drill</div>
        <div style={styles.pre}>{drill.drillText || "(no drill text saved)"}</div>
{(drill.notes || "").trim() ? (
  <>
    <div style={{ marginTop: 12, fontWeight: 800 }}>Personal Notes</div>
    <div style={styles.pre}>{drill.notes}</div>
  </>
) : null}
      </div>
    </div>
  );
}