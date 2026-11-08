// Connect YouTube: the server (routes/youtubeRoutes.js) keeps the Google sign-in and talks to
// YouTube, so the phone can create, start and end its own live broadcasts.
import axios from 'axios';
import { getApiUrl } from './getApiUrl';

const API_URL = getApiUrl();
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });

export const YT_PRIVACY = {
  unlisted: 'Unlisted (only people with the link)',
  public: 'Public (anyone can find it)',
  private: 'Private (only you)',
};

export async function youtubeStatus(token) {
  const { data } = await axios.get(`${API_URL}/api/youtube/status`, auth(token));
  return data; // { connected, channelTitle }
}

// Opens Google's sign-in. Google doesn't allow it inside the app's own web view, so on phones it
// opens in the in-app browser (Safari / Chrome). onClosed runs when that browser is closed.
export async function connectYouTube(token, onClosed) {
  const { data } = await axios.post(`${API_URL}/api/youtube/connect-url`, { from: isNative() ? 'app' : 'web' }, auth(token));
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    if (onClosed) {
      const handle = await Browser.addListener('browserFinished', () => {
        handle.remove();
        onClosed();
      });
    }
    await Browser.open({ url: data.url });
  } else {
    window.location.assign(data.url); // comes back to /profile?youtube=connected
  }
}

export async function disconnectYouTube(token) {
  await axios.post(`${API_URL}/api/youtube/disconnect`, {}, auth(token));
}

// { broadcastId, url, key, watchUrl, title, privacy }
export async function createBroadcast(token, { title, privacy }) {
  const { data } = await axios.post(`${API_URL}/api/youtube/broadcasts`, { title, privacy }, auth(token));
  return data;
}

// created | ready | testing | liveStarting | live | complete | revoked | deleted
export async function broadcastStatus(token, id) {
  const { data } = await axios.get(`${API_URL}/api/youtube/broadcasts/${id}`, auth(token));
  return data.status;
}

export async function endBroadcast(token, id) {
  const { data } = await axios.post(`${API_URL}/api/youtube/broadcasts/${id}/end`, {}, auth(token));
  return data.status;
}

export async function shareLink(url, title) {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text: `Watch live: ${title}`, url, dialogTitle: 'Share the stream' });
      return 'shared';
    } catch (e) {
      if (String(e?.message || '').toLowerCase().includes('cancel')) return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
