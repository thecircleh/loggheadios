import React from "react";
import { motion } from "framer-motion";

const PlayerIcon = ({ playerId, playerName, playerNumber, isLibero, position }) => {
  const handleDragStart = (e) => {
    e.dataTransfer.setData("playerId", playerId);
    e.dataTransfer.setData(
      "playerData",
      JSON.stringify({ _id: playerId, name: playerName, number: playerNumber, isLibero })
    );
  };

  // Prevent text selection on touch devices
  const handleTouchStart = (e) => {
    e.preventDefault();
  };

  return (
    <motion.div
      draggable
      onDragStart={handleDragStart}
      onTouchStart={handleTouchStart}
      className="ios-player-icon"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        msUserSelect: "none",
        touchAction: "manipulation"
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
    >
      <strong>{(playerName || "Player").slice(0, 10)}</strong>
      <br />
      #{playerNumber}
	  {position && <div style={{ fontSize: '0.7rem', color: '#666' }}>{position}</div>}
      {isLibero && <span className="ios-libero">Libero</span>}
    </motion.div>
  );
};

export default PlayerIcon;
