// src/components/YouTubeViewer.js
import React, { useMemo } from "react";

function extractYouTubeVideoId(url) {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  // Handles:
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
  // https://www.youtube.com/shorts/VIDEO_ID
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  try {
    const parsed = new URL(trimmed);
    const v = parsed.searchParams.get("v");
    if (v && v.length === 11) return v;
  } catch (err) {
    return null;
  }

  return null;
}

export default function YouTubeMatchViewer({
  url,
  title = "Match Video",
  height = 160,
  width="100%",
  autoplay = false,
  start = 0,
}) {
  const embedUrl = useMemo(() => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) return null;

    const params = new URLSearchParams({
      controls: "0",
      rel: "0",
      modestbranding: "1",
      autoplay: autoplay ? "1" : "0",
      start: String(start || 0),
    });

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }, [url, autoplay, start]);

  if (!url) {
    return (
      <div style={styles.empty}>
        Paste a YouTube URL to show the match here.
      </div>
    );
  }

  if (!embedUrl) {
    return (
      <div style={styles.error}>
        That does not look like a valid YouTube URL.
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>{title}</div>

      <div style={styles.playerShell}>
        <iframe
          title={title}
          src={embedUrl}
          style={{ ...styles.iframe, height, width }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: "30%",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  header: {
    padding: "12px 16px",
    fontSize: "16px",
    fontWeight: 700,
    borderBottom: "1px solid #ececec",
    color: "#111827",
  },
  playerShell: {
    width: "100%",
    background: "#000",
  },
  iframe: {
    width: "100%",
    border: "none",
    display: "block",
  },
  empty: {
    width: "100%",
    padding: "24px",
    borderRadius: "16px",
    background: "#f8fafc",
    color: "#475569",
    textAlign: "center",
  },
  error: {
    width: "100%",
    padding: "24px",
    borderRadius: "16px",
    background: "#fff1f2",
    color: "#be123c",
    textAlign: "center",
  },
};