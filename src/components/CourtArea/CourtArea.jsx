import React from 'react';
import CourtSlot from './CourtSlot';
import VolleyballIcon from './VolleyballIcon';
import ActionZones from './ActionZones';
import BlockAreas from './BlockAreas';

const CourtArea = React.memo(({
  match,
  courtPlayers,
  containerRef,
  slot2Ref,
  handlePlayerDrop,
  registerTouch,
  flashSlots,
  ballState,
  currentServeSide,
  ballPosition,
  handleActionDrop,
  blockCirclesVisible,
  renderBlockAreas,
  renderActionZones,
  freeBallStyle,
  freeBallModifier,
  handleFreeBallClick,
  handleReplayClick,
  actionZoneFlash,
  isMobile,
  deviceInfo,
  courtAreaStyle,
  courtTitleStyle,
  rowStyle,
  getNetLabelStyle,
  getNetBanner
}) => {
  return (
    <div ref={containerRef} style={courtAreaStyle}>
      <h2 style={courtTitleStyle}>
        {match?.location?.trim() ? match.location : "Court"}
      </h2>

      {/* Replay Button */}
      <button
        onClick={handleReplayClick}
        style={{
          position: "absolute",
          top: isMobile ? "12%" : "12%",
          left: isMobile ? "0%" : "0%",
          width: "50px",
          height: "50px",
          borderRadius: "12px",
          backgroundColor: "#FFF",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0px 2px 4px rgba(0,0,0,0.15)",
        }}
        title="Referee Declared Replay"
      >
        <img
          src={`${process.env.PUBLIC_URL}/greenthumbs.png`}
          alt="Replay"
          style={{ width: "40px", height: "40px", objectFit: "contain" }}
        />
      </button>

      <div style={getNetLabelStyle()}>
        {getNetBanner(match?.eventName)}
      </div>

      {/* Court Rows */}
      <div style={rowStyle}>
        {courtPlayers.slice(0, 3).map((player, idx) => (
          <CourtSlot
            key={idx}
            player={player}
            index={idx}
            flash={flashSlots[idx]}
            ref={idx === 2 ? slot2Ref : null}
            onPlayerDrop={handlePlayerDrop}
            onTouch={registerTouch}
          />
        ))}
      </div>
      
      <div style={rowStyle}>
        {courtPlayers.slice(3, 6).map((player, idx) => (
          <CourtSlot
            key={idx + 3}
            player={player}
            index={idx + 3}
            flash={flashSlots[idx + 3]}
            onPlayerDrop={handlePlayerDrop}
            onTouch={registerTouch}
          />
        ))}
      </div>

      <VolleyballIcon
        serveSide={currentServeSide}
        ballState={ballState}
        ballPosition={ballPosition}
        containerRef={containerRef}
      />
      
      {/* Free Ball Button */}
      {ballState === "inplay" && freeBallStyle && (
        <button onClick={handleFreeBallClick} style={{...freeBallStyle, /* styles */}}>
          Free Ball
        </button>
      )}

      {actionZoneFlash && (
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          backgroundColor: "rgba(255,165,0,0.2)", pointerEvents: "none"
        }} />
      )}

      <ActionZones onActionDrop={handleActionDrop} />
      {renderBlockAreas()}
    </div>
  );
});

export default CourtArea;