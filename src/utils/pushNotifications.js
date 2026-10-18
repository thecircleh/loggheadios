// Push notifications (iOS + Android via Firebase Cloud Messaging). Native apps only.
// Opt-in: nothing is requested until the user turns notifications on in Profile.
import axios from 'axios';
import { getApiUrl } from './getApiUrl';

const API_URL = getApiUrl();
const TOKEN_KEY = 'lh_push_token';
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });

// Never leave the button spinning: fail with a message the settings card can show.
const withTimeout = (promise, ms, message) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
]);

export const isPushSupported = () => !!window.Capacitor?.isNativePlatform?.();
const platform = () => window.Capacitor?.getPlatform?.(); // 'ios' | 'android'

// Loaded on demand so the web bundle never pulls in Firebase.
let pluginPromise = null;
const plugin = () => {
  if (!pluginPromise) pluginPromise = import('@capacitor-firebase/messaging').then(m => m.FirebaseMessaging);
  return pluginPromise;
};

const timezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
};
const savedToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const saveToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

// 'granted' | 'denied' | 'prompt' (or 'unsupported' on web).
export async function getPushPermission() {
  if (!isPushSupported()) return 'unsupported';
  const { receive } = await (await plugin()).checkPermissions();
  return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
}

async function registerToken(authToken, fcmToken) {
  await axios.post(`${API_URL}/api/push/devices`, { token: fcmToken, platform: platform(), timezone: timezone() }, auth(authToken));
  saveToken(fcmToken);
}

// Ask for permission (shows the OS prompt once) and register this device.
// Returns the resulting permission state.
export async function enablePush(authToken) {
  if (!isPushSupported()) return 'unsupported';
  const fm = await plugin();
  let { receive } = await fm.checkPermissions();
  if (receive !== 'granted' && receive !== 'denied') ({ receive } = await fm.requestPermissions());
  if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'prompt';
  // On iPhone this waits for Apple to issue a push token; if the build lacks push permission
  // Apple never does, so give up after 20s instead of hanging.
  const { token } = await withTimeout(fm.getToken(), 20000,
    "Couldn't get a push token from Apple/Google. Please update the app and try again.");
  try {
    await registerToken(authToken, token);
  } catch (err) {
    throw new Error(err?.response?.status === 404 || err?.response?.status === 503
      ? 'Notifications are not available on the server yet. Please try again later.'
      : "Couldn't reach Loggerhead to finish turning on notifications. Check your connection and try again.");
  }
  return 'granted';
}

// Turn notifications off for this device (also used on logout).
export async function disablePush(authToken) {
  const t = savedToken();
  saveToken(null);
  if (!isPushSupported()) return;
  try { if (t && authToken) await axios.delete(`${API_URL}/api/push/devices`, { ...auth(authToken), data: { token: t } }); } catch {}
  try { await (await plugin()).deleteToken(); } catch {}
}

// Push is "on" for this device if permission is granted and we've registered a token.
export const isPushEnabledHere = async () => (await getPushPermission()) === 'granted' && !!savedToken();

// Call once after login. Refreshes the registration if the user already opted in, keeps the
// token current, and opens the right screen when a notification is tapped.
export async function initPush(authToken, navigate) {
  if (!isPushSupported() || !authToken) return () => {};
  const fm = await plugin();
  const handles = [];

  if (platform() === 'android') {
    // Must match the channelId the server sends with.
    try { await fm.createChannel({ id: 'default', name: 'Loggerhead', description: 'Match summaries and reminders', importance: 4 }); } catch {}
  }

  handles.push(await fm.addListener('tokenReceived', ({ token }) => {
    if (savedToken()) registerToken(authToken, token).catch(() => {});
  }));
  handles.push(await fm.addListener('notificationActionPerformed', ({ notification }) => {
    const url = notification?.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) navigate(url);
  }));

  // Already opted in on this device: re-register so the server has a fresh token + time zone.
  if (savedToken() && (await getPushPermission()) === 'granted') {
    try {
      const { token } = await fm.getToken();
      await registerToken(authToken, token);
    } catch (err) {
      console.warn('Push re-register failed:', err?.message);
    }
  }
  return () => handles.forEach(h => h?.remove?.());
}

export const getPushPrefs = async (authToken) =>
  (await axios.get(`${API_URL}/api/push/prefs`, auth(authToken))).data;
export const savePushPrefs = async (authToken, prefs) =>
  (await axios.put(`${API_URL}/api/push/prefs`, prefs, auth(authToken))).data;
export const sendTestPush = async (authToken) =>
  (await axios.post(`${API_URL}/api/push/test`, {}, auth(authToken))).data;
