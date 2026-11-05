import axios from 'axios';
import { GameCamera } from 'loggerhead-game-camera';

// Checks before filming or going live: is the connection good enough to stream, and does the
// phone have the battery, space and temperature for a whole match?

export const QUALITIES = {
  high: { label: 'High (720p)', mbps: 2.5 },
  medium: { label: 'Medium (720p, less data)', mbps: 1.5 },
  low: { label: 'Low (480p, weak connections)', mbps: 0.8 },
};

const isAndroid = () => window.Capacitor?.getPlatform?.() === 'android';
const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Upload needs headroom over the stream's bitrate (audio, overhead, Wi-Fi dips), and a long
// round trip slows TCP down, so step down a level when the delay is high.
export function pickQuality(uploadMbps, rttMs) {
  let q = uploadMbps >= 4.5 ? 'high' : uploadMbps >= 2.6 ? 'medium' : uploadMbps >= 1.4 ? 'low' : 'too-slow';
  if (rttMs > 400) q = q === 'high' ? 'medium' : q === 'medium' ? 'low' : q;
  return q;
}

/**
 * Measures the delay to the Loggerhead server and the upload speed (about 6 seconds).
 * Returns { uploadMbps, rttMs, quality }, or null if the check couldn't run.
 */
export async function checkConnection(apiUrl, token) {
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const rtts = [];
    for (let i = 0; i < 5; i += 1) {
      const t = performance.now();
      // eslint-disable-next-line no-await-in-loop
      await axios.get(`${apiUrl}/api/camera/ping`, { headers, timeout: 5000 });
      rtts.push(performance.now() - t);
    }
    const rttMs = Math.round(median(rtts));

    // Random bytes, so nothing along the way can compress them.
    const chunk = new Uint8Array(1024 * 1024);
    for (let i = 0; i < chunk.length; i += 65536) crypto.getRandomValues(chunk.subarray(i, i + 65536));
    let bytes = 0;
    const start = performance.now();
    for (let n = 0; n < 8 && performance.now() - start < 6000; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await axios.post(`${apiUrl}/api/camera/speedtest`, chunk, {
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        timeout: 20000,
      });
      bytes += chunk.length;
    }
    const seconds = (performance.now() - start) / 1000;
    const uploadMbps = Math.round(((bytes * 8) / seconds / 1e6) * 10) / 10;
    return { uploadMbps, rttMs, quality: pickQuality(uploadMbps, rttMs), at: Date.now() };
  } catch {
    return null;
  }
}

/** Battery, free space and heat. Returns a list of warnings (empty when all is well). */
export async function deviceWarnings() {
  let status;
  try {
    status = await GameCamera.deviceStatus();
  } catch {
    return [];
  }
  const warnings = [];
  if (status.battery >= 0 && status.battery < 0.4 && !status.charging) {
    warnings.push(`Battery is at ${Math.round(status.battery * 100)}%. Filming a match uses a lot of battery: plug in a power bank.`);
  }
  if (status.freeBytes >= 0) {
    // About 1 GB per 17 minutes of 1080p; Android needs room to convert the file at the end too.
    const minutes = Math.floor(status.freeBytes / 60e6 / (isAndroid() ? 2 : 1));
    if (minutes < 120) {
      warnings.push(`Only ${(status.freeBytes / 1e9).toFixed(1)} GB free: about ${minutes} minutes of video fits. Delete old videos or apps for a full match.`);
    }
  }
  if (status.thermal === 'serious' || status.thermal === 'critical') {
    warnings.push('This phone is already hot. Take it out of its case and out of the sun; it will lower the stream quality to cool down.');
  }
  return warnings;
}
