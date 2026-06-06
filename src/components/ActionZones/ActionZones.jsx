import React from 'react';

const ActionZone = React.memo(({ label, zoneAction, ballSide, isOpponentBall, onClick }) => (
  <button 
    onClick={() => onClick(zoneAction)} 
    style={{
      backgroundColor: isOpponentBall ? "#007AFF" : "#34C759",
      // ... other button styles
    }}
  >
    {label}
  </button>
));

const ActionZones = React.memo(({ 
  ballState, 
  currentServeSide, 
  blockInfo, 
  ballSide, 
  touches, 
  onActionDrop 
}) => {
  const isOpponentBall = ballSide === "opponent" || currentServeSide === "opponent";
  
  const getActionButtons = () => {
    if (blockInfo) {
      return [
        { label: "Block Kill", zoneAction: "Kill" },
        { label: "Block Error", zoneAction: "Error" },
        { label: "Block In Play", zoneAction: "InPlay" }
      ];
    }
    
    if (ballState === "serve") {
      if (currentServeSide === "our") {
        return [
          { label: "Service Ace", zoneAction: "Ace" },
          { label: "Service Error", zoneAction: "Error" },
          { label: "In Play", zoneAction: "InPlay" }
        ];
      } else {
        return [
          { label: "Opp Serve Error", zoneAction: "Error" },
          { label: "Opponent Ace", zoneAction: "Ace" }
        ];
      }
    }
    
    // ... rest of action button logic
    return [];
  };

  const actionButtons = getActionButtons();

  return (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "5px" }}>
      {actionButtons.map(({ label, zoneAction }) => (
        <ActionZone
          key={zoneAction}
          label={label}
          zoneAction={zoneAction}
          ballSide={ballSide}
          isOpponentBall={isOpponentBall}
          onClick={onActionDrop}
        />
      ))}
    </div>
  );
});

export default ActionZones;