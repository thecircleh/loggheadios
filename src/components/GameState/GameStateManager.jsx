import React, { useState, useCallback } from 'react';

const GameStateManager = ({ children, initialState }) => {
  const [ballState, setBallState] = useState(initialState.ballState || "serve");
  const [ballSide, setBallSide] = useState(initialState.ballSide || "opponent");
  const [ballPosition, setBallPosition] = useState(initialState.ballPosition || {});
  const [touches, setTouches] = useState([]);
  const [currentServeSide, setCurrentServeSide] = useState(initialState.serveSide || "opponent");
  const [blockInfo, setBlockInfo] = useState(null);
  const [blockCirclesVisible, setBlockCirclesVisible] = useState(false);
  const [freeBallModifier, setFreeBallModifier] = useState(null);

  const resetBall = useCallback((newServeSide, position, shouldRotate = false) => {
    setBallState("serve");
    setCurrentServeSide(newServeSide);
    setBallPosition(position);
    setTouches([]);
    setFreeBallModifier(null);
    setBlockCirclesVisible(false);
    setBlockInfo(null);
  }, []);

  const resetRally = useCallback((wonBy) => {
    setBallState("serve");
    setCurrentServeSide(wonBy);
    setTouches([]);
    setFreeBallModifier(null);
    setBlockCirclesVisible(false);
    setBlockInfo(null);
  }, []);

  const gameState = {
    ballState, setBallState,
    ballSide, setBallSide,
    ballPosition, setBallPosition,
    touches, setTouches,
    currentServeSide, setCurrentServeSide,
    blockInfo, setBlockInfo,
    blockCirclesVisible, setBlockCirclesVisible,
    freeBallModifier, setFreeBallModifier,
    resetBall,
    resetRally
  };

  return children(gameState);
};

export default GameStateManager;