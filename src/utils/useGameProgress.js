// Shared Brain Break progress hook: local cache + account sync + recording wins.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthContext';
import {
  loadLocalProgress, saveLocalProgress, mergeProgress,
  syncGameProgress, recordLevelResult, saveGameSettings,
} from './gameProgress';

export function useGameProgress(gameId, storeKey, { onSettings } = {}) {
  const { token } = useAuth();
  const [progress, setProgress] = useState(() => loadLocalProgress(storeKey));
  const onSettingsRef = useRef(onSettings);
  onSettingsRef.current = onSettings;

  // Merge local progress with the account's server copy (also uploads offline solves).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    syncGameProgress(gameId, token, loadLocalProgress(storeKey))
      .then(({ levels, settings }) => {
        if (cancelled) return;
        setProgress(prev => {
          const merged = mergeProgress(prev, levels);
          saveLocalProgress(storeKey, merged);
          return merged;
        });
        onSettingsRef.current?.(settings || {});
      })
      .catch(err => console.warn(`${gameId} progress sync failed:`, err?.message));
    return () => { cancelled = true; };
  }, [token, gameId, storeKey]);

  // Record a completed level. Keeps the best time (lower) and best score (higher).
  const recordWin = useCallback((level, { time, score } = {}) => {
    setProgress(prevAll => {
      const prev = prevAll[level] || {};
      const next = {
        ...prevAll,
        [level]: {
          ...prev,
          ...(time != null && { bestTime: prev.bestTime == null ? time : Math.min(prev.bestTime, time) }),
          ...(score != null && { bestScore: prev.bestScore == null ? score : Math.max(prev.bestScore, score) }),
          solves: (prev.solves || 0) + 1,
        },
      };
      saveLocalProgress(storeKey, next);
      return next;
    });
    // Local copy is kept either way; the next sync uploads it if this fails.
    if (token) {
      recordLevelResult(gameId, token, level, { time, score })
        .catch(err => console.warn(`${gameId} result save failed:`, err?.message));
    }
  }, [token, gameId, storeKey]);

  const saveSettings = useCallback((settings) => {
    if (token) saveGameSettings(gameId, token, settings).catch(() => {});
  }, [token, gameId]);

  return { progress, recordWin, saveSettings };
}
