// Logging phone side of "Film a Match": share a camera code for the current match and send
// each score change to the server, which relays it to the filming phone(s).
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getApiUrl } from './getApiUrl';

const API_URL = getApiUrl();
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
const storageKey = (matchId) => `lh_camera_code_${matchId}`;
const CHANGED = 'lh-camera-link-changed';
const PLAY_EVENT = 'lh-camera-play';

// Highlight plays shown on the camera screen ("KILL · #12 Ava"). Assists only show with a kill.
const PLAY_CAPTIONS = {
  Kill: 'KILL',
  'Service Ace': 'ACE',
  'Solo Block': 'BLOCK',
  'Block Assist': 'BLOCK',
  'Block Kill': 'BLOCK',
  Dig: 'DIG',
};
const PLAY_ORDER = ['KILL', 'ACE', 'BLOCK', 'DIG'];

// Called by Stat Book and Classic when a player stat is logged.
export function announcePlay({ label, name, number }) {
  if (!PLAY_CAPTIONS[label] && label !== 'Assist') return;
  try {
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: { label, name: name || '', number } }));
  } catch {}
}

const playerName = ({ name, number }) => {
  if (name.startsWith('#')) return name;
  const hasNumber = number !== undefined && number !== null && number !== '' && number !== '?';
  return `${hasNumber ? `#${number} ` : ''}${name}`.trim();
};

// One line for stats logged together (e.g. an assist and a kill from one tap).
export function playText(plays) {
  const main = plays
    .filter((p) => PLAY_CAPTIONS[p.label])
    .sort((a, b) => PLAY_ORDER.indexOf(PLAY_CAPTIONS[a.label]) - PLAY_ORDER.indexOf(PLAY_CAPTIONS[b.label]))[0];
  if (!main) return '';
  const caption = PLAY_CAPTIONS[main.label];
  const assist = caption === 'KILL' ? plays.find((p) => p.label === 'Assist') : null;
  return [caption, playerName(main), assist ? `set by ${playerName(assist)}` : ''].filter(Boolean).join(' · ');
}

export const savedCameraCode = (matchId) => {
  try { return matchId ? localStorage.getItem(storageKey(matchId)) : null; } catch { return null; }
};
const saveCode = (matchId, code) => {
  try { code ? localStorage.setItem(storageKey(matchId), code) : localStorage.removeItem(storageKey(matchId)); } catch {}
  window.dispatchEvent(new Event(CHANGED));
};

// Returns { code, watchers }.
export async function createCameraLink(token, matchId) {
  const { data } = await axios.post(`${API_URL}/api/camera/links`, { matchId }, auth(token));
  saveCode(matchId, data.code);
  return data;
}

export async function cameraLinkStatus(token, code) {
  const { data } = await axios.get(`${API_URL}/api/camera/links/${code}/status`, auth(token));
  return data;
}

export async function stopCameraLink(token, matchId) {
  const code = savedCameraCode(matchId);
  saveCode(matchId, null);
  if (code) {
    try { await axios.delete(`${API_URL}/api/camera/links/${code}`, auth(token)); } catch {}
  }
}

// While this match has a camera code, send the score whenever it changes (and once when the
// code is created, so a camera that joins starts in sync), with the latest highlight play.
export function useCameraScoreFeed({ token, matchId, us, them, set, ourSets, oppSets, serving, teamName, opponentName }) {
  const [code, setCode] = useState(() => savedCameraCode(matchId));
  const lastSent = useRef('');
  const [play, setPlay] = useState(null); // { id, text }
  const pendingPlays = useRef([]);

  useEffect(() => {
    const refresh = () => setCode(savedCameraCode(matchId));
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [matchId]);

  // Collect stats logged within a moment of each other into one play.
  useEffect(() => {
    setPlay(null);
    pendingPlays.current = [];
    if (!code) return undefined;
    let timer;
    const onPlay = (e) => {
      pendingPlays.current.push(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const text = playText(pendingPlays.current);
        pendingPlays.current = [];
        if (text) setPlay({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text });
      }, 400);
    };
    window.addEventListener(PLAY_EVENT, onPlay);
    return () => {
      window.removeEventListener(PLAY_EVENT, onPlay);
      clearTimeout(timer);
    };
  }, [code]);

  useEffect(() => {
    if (!code || !token || !matchId) return undefined;
    const score = { us, them, set, ourSets, oppSets, serving, teamName, opponentName, play };
    const key = JSON.stringify([code, score]);
    if (key === lastSent.current) return undefined;
    // Short wait so a point and its side-out / set change go as one update.
    const id = setTimeout(() => {
      lastSent.current = key;
      axios.post(`${API_URL}/api/camera/links/${code}/score`, score, auth(token)).catch((err) => {
        if (err?.response?.status === 404) saveCode(matchId, null); // code expired
        else lastSent.current = ''; // retry on the next change
      });
    }, 150);
    return () => clearTimeout(id);
  }, [code, token, matchId, us, them, set, ourSets, oppSets, serving, teamName, opponentName, play]);
}
