// Tells the server when someone uses a video feature, for the admin page.
// Never blocks or breaks the feature: failures are ignored.
import axios from 'axios';
import { getApiUrl } from './getApiUrl';

const API_URL = getApiUrl();

const platform = () => {
  const p = window.Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
};

// feature: 'stream' | 'film' | 'highlight' | 'stitch'. Resolves to the usage id (or null).
export async function trackFeature(token, feature, { durationMs = 0, detail = '' } = {}) {
  if (!token) return null;
  try {
    const { data } = await axios.post(`${API_URL}/api/users/feature-usage`,
      { feature, platform: platform(), durationMs, detail },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    return data?.id || null;
  } catch {
    return null;
  }
}

// Sets the length (and, for a stream, its quality log) on an earlier row.
export function trackFeatureLength(token, usageId, durationMs, stats) {
  if (!token || !usageId) return;
  axios.patch(`${API_URL}/api/users/feature-usage/${usageId}`, { durationMs, ...(stats ? { stats } : {}) },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }).catch(() => {});
}
