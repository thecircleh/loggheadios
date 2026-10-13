// Ask for an App Store / Play Store rating after good moments (a finished match, a won
// Brain Break level). Uses the OS's own rating sheet, which the OS also rate-limits
// (iOS shows it at most 3 times a year). Native apps only.
const KEY = 'lh_review_state';
const MIN_MOMENTS = 3;                    // good moments before the first ask
const MIN_DAYS_INSTALLED = 3;             // don't ask brand-new users
const MIN_DAYS_BETWEEN_ASKS = 120;
const DAY = 86400000;

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
};
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

// Record when the app was first used, so new installs aren't asked right away.
export function noteAppOpened() {
  const s = load();
  if (!s.firstSeen) { s.firstSeen = Date.now(); save(s); }
}

// Call after something went well. Shows the rating sheet when the user is ready for it.
export async function noteHappyMoment() {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  const s = load();
  const now = Date.now();
  s.firstSeen = s.firstSeen || now;
  s.moments = (s.moments || 0) + 1;
  const ready = s.moments >= MIN_MOMENTS
    && now - s.firstSeen >= MIN_DAYS_INSTALLED * DAY
    && (!s.lastAsked || now - s.lastAsked >= MIN_DAYS_BETWEEN_ASKS * DAY);
  if (ready) {
    s.lastAsked = now;
    s.moments = 0;
  }
  save(s);
  if (!ready) return;
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch (err) {
    console.warn('Review prompt failed:', err?.message);
  }
}
