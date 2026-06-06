import React from "react";
import { Link } from "react-router-dom";
import SubscriptionButtons from "./SubscriptionButtons";

export default function CoachesCornerSoon() {
  const container = {
    minHeight: "calc(100vh - 60px)",
    backgroundColor: "#F2F2F7",
    padding: "16px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif",
  };

  const card = {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "16px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
    marginBottom: "14px",
  };

  const h1 = {
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 6px 0",
    color: "#1C1C1E",
  };

  const sub = {
    margin: "0 0 12px 0",
    fontSize: "15px",
    lineHeight: 1.35,
    color: "#3A3A3C",
  };

  const pillRow = {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "10px",
  };

  const pill = {
    borderRadius: "999px",
    padding: "8px 10px",
    fontSize: "13px",
    fontWeight: "600",
    background: "#E5E5EA",
    color: "#1C1C1E",
  };

  const callout = {
    borderRadius: "14px",
    padding: "14px",
    background: "rgba(0,122,255,0.10)",
    border: "1px solid rgba(0,122,255,0.18)",
  };

  const calloutTitle = {
    margin: "0 0 6px 0",
    fontSize: "16px",
    fontWeight: "700",
    color: "#0A84FF",
  };

  const list = {
    margin: "10px 0 0 0",
    paddingLeft: "18px",
    color: "#1C1C1E",
    lineHeight: 1.35,
    fontSize: "15px",
  };

  const buttonRow = {
    display: "flex",
    gap: "10px",
    marginTop: "14px",
    flexWrap: "wrap",
  };

  const primaryBtn = {
    display: "inline-block",
    padding: "12px 14px",
    borderRadius: "14px",
    backgroundColor: "#007AFF",
    color: "#fff",
    fontWeight: "700",
    textDecoration: "none",
  };

  const secondaryBtn = {
    display: "inline-block",
    padding: "12px 14px",
    borderRadius: "14px",
    backgroundColor: "#E5E5EA",
    color: "#1C1C1E",
    fontWeight: "700",
    textDecoration: "none",
  };

  return (
    <div style={container}>
      <div style={card}>
        <h1 style={h1}>Coaches' Corner</h1>
        <p style={sub}>
          Smarter practice planning.
          <br />
          Built for real gyms, real time limits, and real rosters.
        </p>

        <div style={pillRow}>
          <div style={pill}>Practice drill builder</div>
          <div style={pill}>Age + skill aware</div>
          <div style={pill}>Constraints friendly</div>
          <div style={pill}>Coach-first</div>
        </div>
      </div>

      <div style={card}>
        <div style={callout}>
          <div style={calloutTitle}>Coming soon</div>
          <div style={{ ...sub, margin: 0 }}>
            Coaches' Corner is in active development and will roll out soon inside Loggerhead.
          </div>
        </div>

        <ul style={list}>
          <li>Generate one drill or a full practice plan</li>
          <li>Tailor drills by roster size, positions, and court space</li>
          <li>Clear setup + step-by-step instructions</li>
          <li>Progressions and regressions that make sense</li>
        </ul>

        <div style={buttonRow}>
          <Link to="/profile" style={primaryBtn}>
            Check email settings
          </Link>
          <Link to="/" style={secondaryBtn}>
            Back to match
          </Link>
        </div>

        <div style={{ marginTop: "12px", fontSize: "13px", color: "#8E8E93" }}>
          Subscribers will get first access.
        </div>
<div style={{ marginTop: "16px" }}>
  <SubscriptionButtons />
</div>
      </div>
	  <div
  style={{
    marginTop: "14px",
    borderRadius: "14px",
    padding: "14px",
    background: "rgba(52,199,89,0.12)",
    border: "1px solid rgba(52,199,89,0.25)",
  }}
>

<div
  style={{
    fontSize: "26px",
    fontWeight: "800",
    color: "#248A3D",
    marginBottom: "8px",
  }}
>
  Win 6 months of FREE access to Coaches’ Corner 🎉
</div>

<div
  style={{
    fontSize: "20px",
    lineHeight: 1.4,
    color: "#1C1C1E",
  }}
>
  Coaches’ Corner is launching soon — and we’re giving one coach early access.
  <br />
  <br />
  We’re holding a drawing on <strong>February 15</strong>.
  <br />
  <br />
  👉 <strong>Enter in under 60 seconds:</strong>  
  <br />
  Answer one quick survey to be entered to win.
  <br />
  <a
    href="https://forms.gle/XDoJmc1xog8YrwL28"
    target="_blank"
    rel="noreferrer"
    style={{ color: "#248A3D", fontWeight: 700 }}
  >
    Take the survey →
  </a>
  <br />
  <br />
  <strong>One winner receives 6 months of free Coaches’ Corner access.</strong>
  <br />
  <span style={{ fontSize: "13px", color: "#3A3A3C" }}>
    ($23.94 value • No catch • Just feedback)
  </span>
</div>

  <div
    style={{
      fontSize: "24px",
      fontWeight: "700",
      color: "#248A3D",
      marginBottom: "6px",
    }}
  >
    Lil Big South coaches
  </div>

  <div
    style={{
      fontSize: "20px",
      lineHeight: 1.35,
      color: "#1C1C1E",
    }}
  >
    Did you receive a printed drill in your ball cart at <strong>Lil Big South</strong>?
    <br />
    <br />
    Snap a photo of it and send a short review of the drill to{" "}
    <strong>admin@loggerhead.app</strong>.
    <br />
    <br />
    You’ll receive <strong>1 year of free access to Coaches Corner</strong>
    <br />
    <span style={{ fontSize: "13px", color: "#3A3A3C" }}>
      (A $47.88 value)
    </span>
  </div>
</div>
    </div>
  );
}