// Stream quality log: for each stream, how the connection looked before going live and how the
// stream held up. Saved with the stream's usage row, shown on the admin page. Used to decide
// whether SRT (helps long delays and lost packets) or bonding (adds cellular when the Wi-Fi runs
// out of bandwidth) would be worth building.
import { QUALITIES } from './streamCheck';

const MAX_GAP_MS = 5000; // health readings come every second; ignore longer gaps (app in background)

/**
 * plan: { quality, picked: 'auto' | 'manual', check: connection check result or null, network }
 * Feed it the camera's 'live' and 'health' events; summary() is what gets saved.
 */
export function createStreamLog(plan) {
  const startedAt = Date.now();
  const log = {
    quality: plan.quality || 'medium',
    picked: plan.picked || 'auto',
    network: plan.network || 'unknown',
    check: plan.check
      ? {
        uploadMbps: plan.check.uploadMbps,
        rttMs: plan.check.rttMs,
        jitterMs: plan.check.jitterMs ?? null,
        pingLoss: plan.check.pingLoss ?? null,
      }
      : null,
    reachedLive: false,
    connectMs: null, // tapping go live to first frame on YouTube
    liveMs: 0,
    offlineMs: 0, // reconnecting or dropped, after first going live
    reconnects: 0,
    goodMs: 0,
    fairMs: 0,
    poorMs: 0,
    hotMs: 0,
    avgKbps: 0,
    minKbps: null,
    targetKbps: Math.round((QUALITIES[plan.quality]?.mbps || 1.5) * 1000),
    endedAs: 'open',
  };
  let state = 'connecting';
  let stateAt = startedAt;
  let lastHealthAt = null;
  let kbpsSum = 0;
  let kbpsN = 0;

  const closeState = (now) => {
    const dt = now - stateAt;
    if (state === 'live') log.liveMs += dt;
    else if (log.reachedLive && (state === 'reconnecting' || state === 'failed')) log.offlineMs += dt;
    stateAt = now;
  };

  return {
    onLive(next) {
      const now = Date.now();
      closeState(now);
      if (next === 'live' && !log.reachedLive) {
        log.reachedLive = true;
        log.connectMs = now - startedAt;
      }
      if (next === 'reconnecting' && state === 'live') log.reconnects += 1;
      if (next === 'ended' || next === 'failed') log.endedAs = next;
      if (next === 'live') log.endedAs = 'open';
      state = next;
      lastHealthAt = null;
    },
    onHealth({ sentBps, level, hot }) {
      const now = Date.now();
      const dt = lastHealthAt ? Math.min(now - lastHealthAt, MAX_GAP_MS) : 1000;
      lastHealthAt = now;
      if (level === 'good') log.goodMs += dt;
      else if (level === 'fair') log.fairMs += dt;
      else log.poorMs += dt;
      if (hot) log.hotMs += dt;
      const kbps = Math.round((sentBps || 0) / 1000);
      kbpsSum += kbps;
      kbpsN += 1;
      log.avgKbps = Math.round(kbpsSum / kbpsN);
      log.minKbps = log.minKbps === null ? kbps : Math.min(log.minKbps, kbps);
    },
    /** A copy to save. Counts time up to now for the current state. */
    summary() {
      const now = Date.now();
      closeState(now);
      return { ...log, check: log.check && { ...log.check } };
    },
    get state() { return state; },
  };
}
