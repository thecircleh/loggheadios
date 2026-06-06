// components/VolleyballCourt/VolleyballCourt.jsx
import React, { useRef, useCallback, useMemo } from 'react';
import { isMobile } from "react-device-detect";

// Component imports
import GameStateManager from '../GameState/GameStateManager';
import VoiceCommandHandler from '../Voice/VoiceCommandHandler';
import ModalManager from '../Modals/ModalManager';
import StatsManager from '../Statistics/StatsManager';
import BenchPanel from '../BenchPanel/BenchPanel';
import CourtArea from '../CourtArea/CourtArea';
import LogsPanel from '../LogsPanel/LogsPanel';
import ActionHandler from '../Actions/ActionHandler';

// Hooks
import { useAuth } from '../../AuthContext';
import useDeviceInfo from '../../hooks/useDeviceInfo';
import useActionLog from '../../hooks/useActionLog';
import useSubstitutions from '../../hooks/useSubstitutions';

const VolleyballCourt = ({
  courtPlayers,
  benchPlayers,
  setBenchPlayers,
  updatePlayersOnCourt,
  setCourtPlayers,
  serveSide,
  opponentName,
  onServeError,
  onOurPoint,
  onOpponentPoint,
  ourScore,
  opponentScore,
  ourSets,
  opponentSets,
  match,
  onAddPoint,
  onRemovePoint,
  currentMatchId,
  // ... other props
}) => {
  // Refs
  const containerRef = useRef(null);
  const slot2Ref = useRef(null);

  // Hooks
  const { user, isSubscriber } = useAuth();
  const deviceInfo = useDeviceInfo();
  
  // Memoized styles to prevent recalculation
  const styles = useMemo(() => ({
    mainContainer: {
      display: "flex",
      flexDirection: "row",
      width: "100%",
      maxWidth: "1000px",
      margin: "0 auto",
      backgroundColor: "#fff",
      borderRadius: "10px",
      boxShadow: "0 3px 8px rgba(0,0,0,0.1)",
      padding: isMobile ? "10px" : "15px",
      gap: isMobile ? "10px" : "15px",
      minHeight: "450px",
      position: "relative",
    },
    // ... other memoized styles
  }), [isMobile]);

  return (
    <GameStateManager initialState={{ serveSide, ballState: "serve" }}>
      {(gameState) => (
        <StatsManager initialTeamStats={{ ourEarned: 0, ourError: 0, oppEarned: 0, oppError: 0 }}>
          {(statsState) => (
            <VoiceCommandHandler
              courtPlayers={courtPlayers}
              isSubscriber={isSubscriber}
              user={user}
              gameState={gameState}
              onVoiceCommand={(cmd) => console.log('Voice command:', cmd)}
            >
              {(voiceState) => (
                <ModalManager
                  courtPlayers={courtPlayers}
                  match={match}
                  isMobile={isMobile}
                  deviceInfo={deviceInfo}
                  showHeader={true}
                >
                  {(modalState) => (
                    <ActionHandler
                      gameState={gameState}
                      statsState={statsState}
                      courtPlayers={courtPlayers}
                      match={match}
                      onOurPoint={onOurPoint}
                      onOpponentPoint={onOpponentPoint}
                    >
                      {(actionHandlers) => (
                        <VolleyballCourtUI
                          gameState={gameState}
                          statsState={statsState}
                          voiceState={voiceState}
                          modalState={modalState}
                          actionHandlers={actionHandlers}
                          courtPlayers={courtPlayers}
                          benchPlayers={benchPlayers}
                          match={match}
                          ourScore={ourScore}
                          opponentScore={opponentScore}
                          ourSets={ourSets}
                          opponentSets={opponentSets}
                          containerRef={containerRef}
                          slot2Ref={slot2Ref}
                          styles={styles}
                          deviceInfo={deviceInfo}
                          isSubscriber={isSubscriber}
                        />
                      )}
                    </ActionHandler>
                  )}
                </ModalManager>
              )}
            </VoiceCommandHandler>
          )}
        </StatsManager>
      )}
    </GameStateManager>
  );
};

// Separated UI component for better performance
const VolleyballCourtUI = React.memo(({
  gameState,
  statsState,
  voiceState,
  modalState,
  actionHandlers,
  courtPlayers,
  benchPlayers,
  match,
  ourScore,
  opponentScore,
  ourSets,
  opponentSets,
  containerRef,
  slot2Ref,
  styles,
  deviceInfo,
  isSubscriber
}) => {
  // Memoized handlers to prevent re-renders
  const handlePlayerDrop = useCallback((player, slotIndex) => {
    actionHandlers.handlePlayerDrop(player, slotIndex);
  }, [actionHandlers]);

  const handlePlayerTouch = useCallback((slotIndex) => {
    actionHandlers.registerTouch(slotIndex);
  }, [actionHandlers]);

  const handleActionDrop = useCallback((action) => {
    actionHandlers.handleActionDrop(action);
  }, [actionHandlers]);

  // Memoized values to prevent unnecessary re-renders
  const playersOnCourtIds = useMemo(() => 
    new Set(courtPlayers.map(p => p._id).filter(Boolean)), 
    [courtPlayers]
  );

  const benchProps = useMemo(() => ({
    benchPlayers,
    ballState: gameState.ballState,
    playersOnCourtIds,
    // ... other bench props
  }), [benchPlayers, gameState.ballState, playersOnCourtIds]);

  const courtProps = useMemo(() => ({
    courtPlayers,
    match,
    containerRef,
    slot2Ref,
    handlePlayerDrop,
    handlePlayerTouch,
    handleActionDrop,
    gameState,
    // ... other court props
  }), [courtPlayers, match, handlePlayerDrop, handlePlayerTouch, handleActionDrop, gameState]);

  return (
    <div style={styles.mainContainer}>
      {/* Scoreboard and Bench */}
      <div style={styles.leftColumn}>
        <ScoreboardSection
          match={match}
          ourScore={ourScore}
          opponentScore={opponentScore}
          ourSets={ourSets}
          opponentSets={opponentSets}
        />
        <BenchPanel {...benchProps} />
      </div>

      {/* Court Area */}
      <CourtArea {...courtProps} />

      {/* Logs Panel */}
      <LogsPanel
        actionLog={actionHandlers.actionLog}
        substitutionLog={actionHandlers.substitutionLog}
        onUndo={actionHandlers.handleUndoLastAction}
        gameState={gameState}
        styles={styles}
      />

      {/* Voice Interface */}
      <VoiceInterface voiceState={voiceState} />
    </div>
  );
});

export default VolleyballCourt;