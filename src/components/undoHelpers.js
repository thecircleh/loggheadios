// In undoHelpers.js - Complete improved restoreStateAfterUndo function:

export const restoreStateAfterUndo = (
  {
    removedAction,
    actionLog,
    setBallState,
    setBallSide,
    setBallPosition,
    setTouches,
    serverSlotPosition,
    opponentServePosition,
    inPlayPosition,
    setBlockCirclesVisible,
    onRemovePoint,
    undoPlayerStats,
    ourScore,
    opponentScore,
    setPlayerStats,
    currentMatchId,
    setCurrentServeSide,
    setShowServeZoneOverlay,
  },
  courtPlayers
) => {
  const awardedTo = removedAction?.meta?.awardedPointTo;
  if (awardedTo) {
    onRemovePoint?.(awardedTo, 1);
  }

  console.log("📜 Remaining actionLog:", actionLog);

  // 1️⃣ PRIORITY: Check if this was a serve action - if so, return to serve position
  const removedActionText = removedAction?.action?.toLowerCase() || "";
  
  if (removedActionText.includes("serv")) {
    console.log("🏐 Undoing serve action:", removedAction.action);
    
    // 🎾 Serve receive undo → return to opponent serve (they were serving)
    if (removedActionText.includes("serve received") || removedActionText.includes("touched ball (servereceive)")) {
      setBallState("serve");
      setBallSide("opponent");
      setCurrentServeSide?.("opponent");
      setBallPosition(opponentServePosition);
      setTouches([]);
      setBlockCirclesVisible(false);
      setShowServeZoneOverlay?.(false);
      console.log("✅ Serve Receive Undo: Restored to opponent serve position");
      return;
    }
    
    if (removedActionText.includes("service")) {
      // Undoing opponent serve action → return to opponent serve
      setBallState("serve");
      setBallSide("opponent");
      setCurrentServeSide?.("opponent");
      setBallPosition(opponentServePosition);
      setTouches([]);
      setBlockCirclesVisible(false);
      setShowServeZoneOverlay?.(false);
      console.log("✅ Serve Undo: Restored to opponent serve position");
      return;
    } else {
      // Undoing our serve action → return to our serve
      setBallState("serve");
      setBallSide("our");
      setCurrentServeSide?.("our");
      setBallPosition(serverSlotPosition);
      setTouches([]);
      setBlockCirclesVisible(false);
      setShowServeZoneOverlay?.(true);
      console.log("✅ Serve Undo: Restored to our serve position");
      return;
    }
  }

  // 2️⃣ Try restoring rally from touches (for non-serve actions)
  const touchEntries = actionLog.filter(entry =>
    typeof entry.action === "string" &&
    entry.action.toLowerCase().includes("touched ball")
  );

  const allowedRoles = ["Dig", "Set", "Attack", "ServeReceive"];

  const reconstructedTouches = touchEntries.map(entry => {
    const match = entry.action.match(/^(.+?) \(#(\d+)\) touched ball \((.+?)\)/i);
    if (!match) return null;

    const [_, name, number, rawRole] = match;
    const role = allowedRoles.includes(rawRole) ? rawRole : "Unknown";

    const player = courtPlayers.find(
      p =>
        p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
        String(p.number) === number
    );
    if (!player) return null;

    const slotIndex = courtPlayers.findIndex(p => p._id === player._id);
    if (slotIndex === -1) return null;

    return {
      role,
      side: "our",
      slotIndex,
    };
  }).filter(Boolean);

  if (reconstructedTouches.length > 0) {
    const lastTouch = reconstructedTouches[reconstructedTouches.length - 1];
    console.log("✅ Touch Reconstruction: Restoring from last valid touch:", lastTouch);
    setTouches([lastTouch]);
    setBallState("inplay");
    setBallSide(lastTouch.side);
    setBallPosition(`slot-${lastTouch.slotIndex}`);
    setBlockCirclesVisible(lastTouch.side === "opponent");
    setShowServeZoneOverlay?.(false);
    return;
  }

  // 3️⃣ Touch reconstruction failed — fallback to serve logic based on last scoring action
  const lastAction = [...actionLog].reverse().find(a =>
    typeof a.action === "string"
  );

  const lastActionText = lastAction?.action?.toLowerCase() || "";

  if (lastActionText.includes("kill") && !lastActionText.includes("opponent")) {
    setBallState("serve");
    setBallSide("our");
    setCurrentServeSide?.("our");
    setBallPosition(serverSlotPosition);
    setTouches([]);
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay?.(true);
    console.log("✅ Fallback: our kill → our serve");
    return;
  }

  if (lastActionText.includes("opponent kill") || lastActionText.includes("opponent service ace")) {
    setBallState("serve");
    setBallSide("opponent");
    setCurrentServeSide?.("opponent");
    setBallPosition(opponentServePosition);
    setTouches([]);
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay?.(false);
    console.log("✅ Fallback: opponent kill or ace → opponent serve");
    return;
  }

  if (lastActionText.includes("opponent error") || lastActionText.includes("opponent service error")) {
    setBallState("serve");
    setBallSide("our");
    setCurrentServeSide?.("our");
    setBallPosition(serverSlotPosition);
    setTouches([]);
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay?.(true);
    console.log("✅ Fallback: opponent error → our serve");
    return;
  }

  if (lastActionText.includes("error")) {
    setBallState("serve");
    setBallSide("opponent");
    setCurrentServeSide?.("opponent");
    setBallPosition(opponentServePosition);
    setTouches([]);
    setBlockCirclesVisible(false);
    setShowServeZoneOverlay?.(false);
    console.log("✅ Fallback: our error → opponent serve");
    return;
  }

  // 4️⃣ Nothing matched — default reset
  console.warn("🟥 No valid context — defaulting to our serve.");
  setBallState("serve");
  setBallSide("our");
  setCurrentServeSide?.("our");
  setBallPosition(serverSlotPosition);
  setTouches([]);
  setBlockCirclesVisible(false);
  setShowServeZoneOverlay?.(true);
};