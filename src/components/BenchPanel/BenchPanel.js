// 1. components/BenchPanel/BenchPanel.jsx
import React from 'react';
import DraggableBenchCard from './DraggableBenchCard';

const BenchPanel = React.memo(({ 
  benchPlayers,
  ballState,
  playersOnCourtIds,
  slot5TargetId,
  allowedLiberoSubTarget,
  currentServeSide,
  setShowServeZoneOverlay,
  isMobile,
  benchPanelStyle,
  benchTitleStyle,
  benchGridStyle,
  benchCardStyle
}) => {
  return (
    <div style={benchPanelStyle}>
      <h3 style={benchTitleStyle}>Bench</h3>
      <div style={benchGridStyle}>
        {benchPlayers
          ?.filter((player) => !player.isOnCourt)
          .map((player, i) => (
            <DraggableBenchCard
              key={`bench-${player._id || i}`}
              player={player}
              benchCardStyle={benchCardStyle}
              canSub={ballState === "serve" && !playersOnCourtIds.has(player._id)}
              slot5TargetId={slot5TargetId}
              allowedLiberoSubTarget={allowedLiberoSubTarget}
              currentServeSide={currentServeSide}
              setShowServeZoneOverlay={setShowServeZoneOverlay}
            />
          ))}
      </div>
    </div>
  );
});

export default BenchPanel;