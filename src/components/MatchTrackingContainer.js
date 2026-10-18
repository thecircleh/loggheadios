import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import MatchModeSelector from './MatchModeSelector';
import { calculateMatchAge } from './MatchSelectorUtils';
import CoachCourt from './coachCourt';

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

/**
 * MatchTrackingContainer - Wraps CoachCourt with MatchModeSelector
 * 
 * Manages match selection for Match Tracking (Coach) mode
 * Replaces the old CoachQuickStart pattern
 */
export default function MatchTrackingContainer({
  // Match state
  currentMatchId,
  setCurrentMatchId,
  matchSettings,
  setMatchSettings,
  
  // Court and player state
  courtPlayers,
  benchPlayers,
  updatePlayersOnCourt,
  refreshBench,
  
  // Score state
  ourScore,
  opponentScore,
  setOurScore,
  setOpponentScore,
  ourSetsWon,
  opponentSetsWon,
  
  // Coach-specific state
  slot5TargetId,
  allowedLiberoSubTarget,
  setSlot5TargetId,
  setAllowedLiberoSubTarget,
  isSetComplete,
  setIsSetComplete,
  coachSetEndingDecision,
  isSetEndingInProgress,
  
  // Functions
  onAddPoint,
  saveMatchData,
  processCoachSetEnding,
  ensureMatchIsFinalAndNavigate,
  isMobile,
  isPortrait,
  isTouch,
  
  // Refs
  matchFinalizedRef,
  setEndingInProgressRef,

  // Match restore state
  isRestoringMatch,
  
  // Other props
  coachCourtKey,
}) {
  const { user, token } = useAuth();
  const [currentMatchAge, setCurrentMatchAge] = useState(0);
  
    const compatibleModes = ["Match", "Coach"];
const isCompatibleMatch =
  !currentMatchId ||
  !matchSettings?.mode ||
  compatibleModes.includes(matchSettings.mode);

  // Calculate match age whenever match data updates
  useEffect(() => {
    if (matchSettings?.updatedAt) {
      const age = calculateMatchAge(matchSettings.updatedAt);
      setCurrentMatchAge(age);
      
      // Update age every minute
      const interval = setInterval(() => {
        const newAge = calculateMatchAge(matchSettings.updatedAt);
        setCurrentMatchAge(newAge);
      }, 60000);
      
      return () => clearInterval(interval);
    }
  }, [matchSettings?.updatedAt]);
  


  /**
   * Handle starting a new Match Tracking match
   * Replaces the old onStartCoachMatch callback pattern
   */
  const handleStartNewMatch = useCallback(async (config) => {
    console.log('🚀 MatchTracking: Starting new match with config:', config);
    
    try {
      // Fetch the full match data from API
      const response = await axios.get(`${API_URL}/api/matches/${config.matchId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const matchData = response.data;
      console.log('📥 MatchTracking: Loaded new match data:', matchData);

      // Update match state - use a delay to let iOS state batch process (from original pattern)
      setTimeout(() => {
        setCurrentMatchId(config.matchId);
      }, 100);
      
      setMatchSettings((prev) => ({
        ...prev,
        mode: config.mode,
        teamName: config.teamName,
        opponentName: config.opponentName,
        totalSets: config.sets,
        pointsNonDeciding: config.points,
        pointsDeciding: config.decidingSetPoints,
        playAllSets: config.playAllSets,
        beachMode: config.beachMode || false,
      }));

      // Reset scores for new match
      if (setOurScore) setOurScore(0);
      if (setOpponentScore) setOpponentScore(0);

      // Reset Coach-specific state
      if (setIsSetComplete) setIsSetComplete(false);
      if (setSlot5TargetId) setSlot5TargetId(null);
      if (setAllowedLiberoSubTarget) setAllowedLiberoSubTarget(null);

      console.log('✅ MatchTracking: New match initialized successfully');
    } catch (error) {
      console.error('❌ MatchTracking: Failed to initialize new match:', error);
      alert('Failed to load match data. Please try again.');
    }
  }, [
    token, 
    setCurrentMatchId, 
    setMatchSettings, 
    setOurScore, 
    setOpponentScore,
    setIsSetComplete,
    setSlot5TargetId,
    setAllowedLiberoSubTarget
  ]);

  /**
   * Handle resuming an existing Match Tracking match
   */
  const handleResumeMatch = useCallback((config) => {
    console.log('🔄 MatchTracking: Resuming match with config:', config);

    // App's match loader restores everything (sets won, set scores, current set, court,
    // logs, libero targets). It skips matches whose settings are already loaded, so don't
    // pre-fill matchSettings with this match's data here — only switch the id.
    if (setIsSetComplete) setIsSetComplete(false);
    setMatchSettings((prev) => ({ ...prev, mode: config.mode }));
    // Delay for iOS state batching (same as new-match flow)
    setTimeout(() => {
      setCurrentMatchId(config.matchId);
    }, 100);
  }, [setCurrentMatchId, setMatchSettings, setIsSetComplete]);

  return (
    <>
      {/* Match Mode Selector - shows when needed */}
      <MatchModeSelector
        currentPage="match"
        currentMatchId={currentMatchId}
        currentMatchMode={matchSettings?.mode}
        currentMatchAge={currentMatchAge}
        onStartNewMatch={handleStartNewMatch}
        onResumeMatch={handleResumeMatch}
        isRestoringMatch={isRestoringMatch}
      />

      {/* CoachCourt - only render when we have a match */}
      {/* Wait until App has loaded this match, so the court never runs on another match's sets/score */}
      {currentMatchId && matchSettings && isCompatibleMatch && String(matchSettings._id) === String(currentMatchId) && (
        <CoachCourt
          key={coachCourtKey}
          matchSettings={matchSettings}
          setMatchSettings={setMatchSettings}
          currentMatchId={currentMatchId}
          saveMatchData={saveMatchData}
          courtPlayers={courtPlayers}
          benchPlayers={benchPlayers}
		  isMobile={isMobile}
	      isPortrait={isPortrait}
	      isTouch={isTouch}
          updatePlayersOnCourt={updatePlayersOnCourt}
          refreshBench={refreshBench}
          ourScore={ourScore}
          opponentScore={opponentScore}
          setOurScore={setOurScore}
          setOpponentScore={setOpponentScore}
          onAddPoint={onAddPoint}
          teamName={matchSettings?.teamName || "Our Team"}
          opponentName={matchSettings?.opponentName || "Opponent"}
          ourSetsWon={ourSetsWon}
          opponentSetsWon={opponentSetsWon}
          slot5TargetId={slot5TargetId}
          allowedLiberoSubTarget={allowedLiberoSubTarget}
          setSlot5TargetId={setSlot5TargetId}
          setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
          isSetComplete={isSetComplete}
          setIsSetComplete={setIsSetComplete}
          setEndingDecision={coachSetEndingDecision}
          onSetEndingConfirm={processCoachSetEnding}
          ensureMatchIsFinalAndNavigate={ensureMatchIsFinalAndNavigate}
          matchFinalizedRef={matchFinalizedRef}
          onSetEndingCancel={() => {
            console.log("🛑 COACH: Set ending cancelled by user");
            // Clear the decision state
            if (setEndingInProgressRef) {
              setEndingInProgressRef.current = false;
            }
          }}
          setEndingInProgressRef={setEndingInProgressRef}
          isSetEndingInProgress={isSetEndingInProgress}
        />
      )}
    </>
  );
}