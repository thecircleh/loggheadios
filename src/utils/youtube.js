// Connect YouTube / Connect Facebook: the server (routes/youtubeRoutes.js, routes/facebookRoutes.js)
// keeps the sign-in and talks to YouTube or Facebook, so the phone can create, start and end its
// own live streams. `service` is 'youtube' (default) or 'facebook'; both answer the same way.
import axios from 'axios';
import { getApiUrl } from './getApiUrl';

const API_URL = getApiUrl();
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
const api = (service, path) => `${API_URL}/api/${service === 'facebook' ? 'facebook' : 'youtube'}${path}`;

export const SERVICE_LABEL = { youtube: 'YouTube', facebook: 'Facebook' };

export const YT_PRIVACY = {
  unlisted: 'Unlisted (only people with the link)',
  public: 'Public (anyone can find it)',
  private: 'Private (only you)',
};

// YouTube: { connected, channelTitle }. Facebook: { connected, name, pages: [{ id, name }], pageId, pageName }.
export async function youtubeStatus(token, service = 'youtube') {
  const { data } = await axios.get(api(service, '/status'), auth(token));
  return data;
}

// Opens the sign-in. Google and Facebook don't allow it inside the app's own web view, so on phones
// it opens in the in-app browser (Safari / Chrome). onClosed runs when that browser is closed.
export async function connectYouTube(token, onClosed, service = 'youtube') {
  const { data } = await axios.post(api(service, '/connect-url'), { from: isNative() ? 'app' : 'web' }, auth(token));
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
    window.location.assign(data.url); // comes back to /profile?youtube=connected (or ?facebook=)
  }
}

export async function disconnectYouTube(token, service = 'youtube') {
  await axios.post(api(service, '/disconnect'), {}, auth(token));
}

// Facebook only: which Page streams go to. Returns the new status.
export async function setFacebookPage(token, pageId) {
  const { data } = await axios.post(api('facebook', '/page'), { pageId }, auth(token));
  return data;
}

// { broadcastId, url, key, watchUrl, title, privacy, service }
export async function createBroadcast(token, { title, privacy }, service = 'youtube') {
  const { data } = await axios.post(api(service, '/broadcasts'), { title, privacy }, auth(token));
  return { ...data, service };
}

// created | ready | testing | liveStarting | live | complete | revoked | deleted
export async function broadcastStatus(token, id, service = 'youtube') {
  const { data } = await axios.get(api(service, `/broadcasts/${id}`), auth(token));
  return data.status;
}

export async function endBroadcast(token, id, service = 'youtube') {
  const { data } = await axios.post(api(service, `/broadcasts/${id}/end`), {}, auth(token));
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
