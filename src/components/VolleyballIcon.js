import React, { useState, useRef, useEffect } from "react";
import SportsVolleyballIcon from "@mui/icons-material/SportsVolleyball";

const VolleyballIcon = ({
  serveSide,
  serverSlotPosition,
  netPosition,
  inPlayPosition,
  ballState,
  ballPosition,
  containerRef,
}) => {
  const [position, setPosition] = useState(ballPosition);
  const iconRef = useRef(null);

  useEffect(() => {
    setPosition(ballPosition);
  }, [ballPosition]);

  return (
    <div
      ref={iconRef}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      <SportsVolleyballIcon style={{ fontSize: 40, color: "blue" }} />
    </div>
  );
};

export default VolleyballIcon;