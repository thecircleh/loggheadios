import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import MatchModeSelector from './MatchModeSelector';
import { calculateMatchAge } from './MatchSelectorUtils';
import VolleyballCourt from './VolleyballCourt';

const getApiUrl = () => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith("10.")) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

/**
 * ClassicContainer - Wraps VolleyballCourt with MatchModeSelector
 * 
 * Manages match selection for Classic/Gameflow mode
 */
export default function ClassicContainer({
  // Match state
  currentMatchId,
  setCurrentMatchId,
  matchSettings,
  setMatchSettings,
  isMobile,
  isPortrait,
  isTouch,
  // Court and player state
  courtPlayers,
  benchPlayers,
  setBenchPlayers,
  setCourtPlayers,
  updateCourtPositions,
  positionMapping,
  rotateCourtPositions,
  swapCourtPlayers,
  
  // Score state
  serveSide,
  setServeSide,
  opponentName,
  setOpponentName,
  ourScore,
  opponentScore,
  ourSetsWon,
  opponentSetsWon,
  
  // Action and substitution logs
  actionLog,
  setActionLog,
  substitutionLog,
  setSubstitutionLog,
  
  // Libero tracking
  allowedLiberoSubTarget,
  slot5TargetId,
  setAllowedLiberoSubTarget,
  setSlot5TargetId,
  
  // Functions
  onAddPoint,
  onRemovePoint,
  removeGamesPlayedCredit,
  refreshBenchPlayers,
  refreshCourtPlayers,
  syncMatchState,
  saveMatchData,
  
  // Team stats
  teamStats,
  setTeamStats,
  
  // UI state
  showHeader,
  setShowHeader,
  ballState,
  setBallState,
  ballSide,
  setBallSide,
  currentServeSide,
  setCurrentServeSide,
  
  // Games played
  maybeCreditGamesPlayed,
  creditedPlayersThisSet,
  creditedPlayersThisSetRef,
  creditInitialCourtPlayers,
  
  // UI preferences
  cardDisplayMode,
  setCardDisplayMode,

  // Match restore state
  isRestoringMatch,
  
  // Other functions
  onOurPoint,
  onOpponentPoint,
  updatePlayersOnCourt,
}) {
  const { user, token } = useAuth();
  const [currentMatchAge, setCurrentMatchAge] = useState(0);
  
  const compatibleModes = ["Classic", "Gameflow"];
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
   * Handle starting a new Classic match
   */
  const handleStartNewMatch = useCallback(async (config) => {
    console.log('🚀 Classic: Starting new match with config:', config);
    
    try {
      // Fetch the full match data from API
      const response = await axios.get(`${API_URL}/api/matches/${config.matchId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const matchData = response.data;
      console.log('📥 Classic: Loaded new match data:', matchData);

      // Update match state with explicit mode from config
      setCurrentMatchId(config.matchId);
      setMatchSettings({
        ...matchData,
        mode: config.mode, // Explicitly set mode from config
      });

      // Set opponent name
      if (setOpponentName) {
        setOpponentName(config.opponentName);
      }

      // Reset scores for new match (these are handled by parent state in App.js)
      // The parent component manages these, so we don't set them here

      // Clear action logs for new match
      if (setActionLog) setActionLog([]);
      if (setSubstitutionLog) setSubstitutionLog([]);

      // Reset libero tracking
      if (setAllowedLiberoSubTarget) setAllowedLiberoSubTarget(null);
      if (setSlot5TargetId) setSlot5TargetId(null);

      console.log('✅ Classic: New match initialized successfully');
    } catch (error) {
      console.error('❌ Classic: Failed to initialize new match:', error);
      alert('Failed to load match data. Please try again.');
    }
  }, [
    token, 
    setCurrentMatchId, 
    setMatchSettings, 
    setOpponentName,
    setActionLog,
    setSubstitutionLog,
    setAllowedLiberoSubTarget,
    setSlot5TargetId
  ]);

  /**
   * Handle resuming an existing Classic match
   */
  const handleResumeMatch = useCallback(async (config) => {
    console.log('🔄 Classic: Resuming match with config:', config);
    
    try {
      // Fetch the full match data including all saved state
      const response = await axios.get(`${API_URL}/api/matches/${config.matchId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const matchData = response.data;
      console.log('📥 Classic: Loaded resumed match data:', matchData);

      // Update match state with explicit mode from config
      setCurrentMatchId(config.matchId);
      setMatchSettings({
        ...matchData,
        mode: config.mode, // Explicitly set mode from config
      });

      // Restore opponent name
      if (setOpponentName && matchData.opponentName) {
        setOpponentName(matchData.opponentName);
      }

      // Restore action logs if available
      if (setActionLog && matchData.actionLog) {
        setActionLog(matchData.actionLog);
      }
      if (setSubstitutionLog && matchData.substitutionLog) {
        setSubstitutionLog(matchData.substitutionLog);
      }

      // Restore court players if available
      if (setCourtPlayers && matchData.courtPlayers) {
        setCourtPlayers(matchData.courtPlayers);
      }

      // Restore bench players if available
      if (setBenchPlayers && matchData.benchPlayers) {
        setBenchPlayers(matchData.benchPlayers);
      }

      // Restore team stats if available
      if (setTeamStats && matchData.teamStats) {
        setTeamStats(matchData.teamStats);
      }

      // Restore libero tracking if available
      if (setAllowedLiberoSubTarget && matchData.liberoSubTargets?.allowedLiberoSubTarget) {
        setAllowedLiberoSubTarget(matchData.liberoSubTargets.allowedLiberoSubTarget);
      }
      if (setSlot5TargetId && matchData.liberoSubTargets?.slot5TargetId) {
        setSlot5TargetId(matchData.liberoSubTargets.slot5TargetId);
      }

      console.log('✅ Classic: Match resumed successfully');
    } catch (error) {
      console.error('❌ Classic: Failed to resume match:', error);
      alert('Failed to load match data. Please try again.');
    }
  }, [
    token, 
    setCurrentMatchId, 
    setMatchSettings, 
    setOpponentName,
    setActionLog,
    setSubstitutionLog,
    setCourtPlayers,
    setBenchPlayers,
    setTeamStats,
    setAllowedLiberoSubTarget,
    setSlot5TargetId
  ]);

  return (
    <>
      {/* Match Mode Selector - shows when needed */}
      <MatchModeSelector
        currentPage="classic"
        currentMatchId={currentMatchId}
        currentMatchMode={matchSettings?.mode}
        currentMatchAge={currentMatchAge}
        onStartNewMatch={handleStartNewMatch}
        onResumeMatch={handleResumeMatch}
        isRestoringMatch={isRestoringMatch}
      />

      {/* VolleyballCourt - only render when we have a match */}
      {currentMatchId && matchSettings && isCompatibleMatch && (
        <VolleyballCourt
          courtPlayers={courtPlayers}
          benchPlayers={benchPlayers}
          setBenchPlayers={setBenchPlayers}
          setCourtPlayers={setCourtPlayers}
		  isMobile={isMobile}
		  isPortrait={isPortrait}
		  isTouch={isTouch}
          updateCourtPositions={updateCourtPositions}
          updatePlayersOnCourt={updateCourtPositions}
          positionMapping={positionMapping}
          rotateCourtPositions={rotateCourtPositions}
          swapCourtPlayers={swapCourtPlayers}
          removeGamesPlayedCredit={removeGamesPlayedCredit}
          refreshBenchPlayers={refreshBenchPlayers}
          refreshCourtPlayers={refreshCourtPlayers}
          serveSide={serveSide}
          opponentName={matchSettings?.opponentName || "Opponent"}
          setOpponentName={setOpponentName}
          onOurPoint={onOurPoint}
          onOpponentPoint={onOpponentPoint}
          ourScore={ourScore}
          saveMatchData={saveMatchData}
          opponentScore={opponentScore}
          ourSets={ourSetsWon}
          opponentSets={opponentSetsWon}
          match={matchSettings}
          onAddPoint={onAddPoint}
          onRemovePoint={onRemovePoint}
          currentMatchId={currentMatchId}
          setServeSide={setServeSide}
          actionLog={actionLog}
          setActionLog={setActionLog}
          substitutionLog={substitutionLog}
          setSubstitutionLog={setSubstitutionLog}
          allowedLiberoSubTarget={allowedLiberoSubTarget}
          slot5TargetId={slot5TargetId}
          setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
          setSlot5TargetId={setSlot5TargetId}
          syncMatchState={syncMatchState}
          teamStats={teamStats}
          setTeamStats={setTeamStats}
          showHeader={showHeader}
          setShowHeader={setShowHeader}
          ballState={ballState}
          setBallState={setBallState}
          ballSide={ballSide}
          setBallSide={setBallSide}
          currentServeSide={currentServeSide}
          setCurrentServeSide={setCurrentServeSide}
          maybeCreditGamesPlayed={maybeCreditGamesPlayed}
          creditedPlayersThisSet={creditedPlayersThisSet}
          creditedPlayersThisSetRef={creditedPlayersThisSetRef}
          creditInitialCourtPlayers={creditInitialCourtPlayers}
          cardDisplayMode={cardDisplayMode}
          setCardDisplayMode={setCardDisplayMode}
        />
      )}
    </>
  );
}