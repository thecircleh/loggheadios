// Brain Break game progress: server-backed (/api/games), with localStorage as an
// offline cache. Shape per level: { bestTime?, bestScore?, solves? }.
import axios from 'axios';
import { getApiUrl } from './getApiUrl';

const API_URL = getApiUrl();
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export const loadLocalProgress = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
};
export const saveLocalProgress = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
};

// Keep the better result from either side for every level.
export const mergeProgress = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [lv, r] of Object.entries(b)) {
    const cur = out[lv];
    if (!cur) { out[lv] = r; continue; }
    const pick = (x, y, better) => (x == null ? y : y == null ? x : better(x, y));
    out[lv] = {
      ...cur,
      bestTime: pick(cur.bestTime, r.bestTime, Math.min),
      bestScore: pick(cur.bestScore, r.bestScore, Math.max),
      solves: pick(cur.solves, r.solves, Math.max),
    };
  }
  return out;
};

// Push local progress up and get the merged server copy back.
export const syncGameProgress = async (game, token, localLevels) => {
  const levels = {};
  for (const [lv, r] of Object.entries(localLevels || {})) {
    levels[lv] = { time: r.bestTime, score: r.bestScore };
  }
  const { data } = await axios.post(`${API_URL}/api/games/${game}/sync`, { levels }, auth(token));
  return data; // { game, levels, settings }
};

export const recordLevelResult = (game, token, level, { time, score } = {}) =>
  axios.post(`${API_URL}/api/games/${game}/levels/${level}`, { time, score }, auth(token));

export const saveGameSettings = (game, token, settings) =>
  axios.patch(`${API_URL}/api/games/${game}/settings`, settings, auth(token));

// Every game's progress for the current user: [{ game, levels, settings }]
export const fetchAllGameProgress = async (token) => {
  const { data } = await axios.get(`${API_URL}/api/games`, auth(token));
  return data;
};
