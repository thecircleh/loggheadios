// Microsoft Clarity, for the website only (ui.loggerhead.app). Never in the iPhone/Android apps:
// starting it in the app's web view once caused a blank screen on launch, and the App Store
// treats it as tracking.
//
// Safe by design: nothing runs while the page loads; it starts after the first render, and the
// library is only downloaded when this really is the website.
import { Capacitor } from '@capacitor/core';

const CLARITY_ID = 'x4h28kex3q';
let clarity = null; // the library once started

function isWebsite() {
  if (process.env.NODE_ENV === 'development') return false;
  try {
    if (Capacitor.isNativePlatform() || window.Capacitor?.isNativePlatform?.()) return false;
  } catch {
    return false;
  }
  // The apps run at capacitor://localhost (iPhone) or https://localhost (Android).
  const { protocol, hostname } = window.location;
  if (protocol !== 'https:' && protocol !== 'http:') return false;
  return hostname !== 'localhost' && hostname !== '127.0.0.1';
}

export async function startClarity() {
  if (clarity || !isWebsite()) return;
  try {
    const mod = await import('@microsoft/clarity');
    const lib = mod.default || mod;
    lib.init(CLARITY_ID);
    clarity = lib;
  } catch (err) {
    console.warn('Clarity did not start:', err);
  }
}

// Ties the session to the signed-in user, so it can be found on the Clarity dashboard.
export function identifyClarityUser(user) {
  if (!clarity || !user) return;
  try {
    clarity.identify(String(user.id || user._id), undefined, undefined, user.email || '');
  } catch {}
}
