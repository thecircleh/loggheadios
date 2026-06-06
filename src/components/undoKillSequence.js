// In undoKillSequence.js, replace the existing function with this improved version:

export const undoKillSequence = ({
  actionLog,
  courtPlayers,
  undoPlayerStats,
  setPlayerStats,
  currentMatchId
}) => {
  const updatedLog = [...actionLog];

  // 1️⃣ Search backwards for the most recent assist and attack entries
  let assistIdx = -1;
  let attackTouchIdx = -1;
  let setTouchEntry = null;

  // Search backwards through the log to find the most recent relevant entries
  for (let i = updatedLog.length - 1; i >= 0; i--) {
    const entry = updatedLog[i];
    const action = entry.action?.toLowerCase() || "";

    // Find the most recent assist (if we haven't found one yet)
    if (assistIdx === -1 && action.includes("assist credited")) {
      assistIdx = i;
    }

    // Find the most recent attack touch (if we haven't found one yet)
    if (attackTouchIdx === -1 && action.includes("touched ball (attack)")) {
      attackTouchIdx = i;
    }

    // Find the most recent set touch (if we haven't found one yet)
    if (!setTouchEntry && action.includes("touched ball (set)")) {
      setTouchEntry = entry;
    }

    // Stop searching if we've found everything we need
    if (assistIdx !== -1 && attackTouchIdx !== -1 && setTouchEntry) {
      break;
    }
  }

  console.log("🔍 Found entries to undo:", {
    assistIdx,
    attackTouchIdx,
    setTouchEntry: setTouchEntry?.action
  });

  // 2️⃣ Undo stats and remove assist entry
  if (assistIdx !== -1) {
    const assistAction = updatedLog[assistIdx];
    const assistMatch = assistAction.action.match(/assist credited to (.+?) \(#(\d+)\)/i);
    if (assistMatch) {
      const [_, name, number] = assistMatch;
      const player = courtPlayers.find(
        p =>
          p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
          String(p.number) === number
      );
      if (player) {
        console.log("↩️ Undoing assist stat for", player.name);
        undoPlayerStats({
          playerId: player._id,
          playerName: player.name,
          statKeys: ["assists"],
          teamId: player.teamId,
          setPlayerStats,
          currentMatchId
        });
      }
    }
    // Remove the assist entry
    updatedLog.splice(assistIdx, 1);
    
    // Adjust attackTouchIdx if it comes after the removed assist
    if (attackTouchIdx > assistIdx) {
      attackTouchIdx--;
    }
  }

  // 3️⃣ Undo stats and remove attack touch entry
  if (attackTouchIdx !== -1) {
    const attackAction = updatedLog[attackTouchIdx];
    const match = attackAction.action.match(/^(.+?) \(#(\d+)\) touched ball \(attack\)/i);
    if (match) {
      const [_, name, number] = match;
      const player = courtPlayers.find(
        p =>
          p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
          String(p.number) === number
      );
      if (player) {
        console.log("↩️ Undoing attack stat for", player.name);
        undoPlayerStats({
          playerId: player._id,
          playerName: player.name,
          statKeys: ["attacks"],
          teamId: player.teamId,
          setPlayerStats,
          currentMatchId
        });
      }
    }
    // Remove the attack touch entry
    updatedLog.splice(attackTouchIdx, 1);
  }

  // 4️⃣ Return updated log + setter touch (if available)
  let setterTouch = null;
  if (setTouchEntry) {
    const match = setTouchEntry.action.match(/^(.+?) \(#(\d+)\) touched ball \(set\)/i);
    if (match) {
      const [_, name, number] = match;
      const player = courtPlayers.find(
        p =>
          p.name?.trim().toLowerCase() === name.trim().toLowerCase() &&
          String(p.number) === number
      );
      if (player) {
        const slotIndex = courtPlayers.findIndex(p => p._id === player._id);
        if (slotIndex !== -1) {
          setterTouch = {
            slotIndex,
            role: "Set",
            side: "our"
          };
        }
      }
    }
  }

  console.log("✅ Kill sequence undo complete:", {
    removedEntries: {
      assist: assistIdx !== -1,
      attackTouch: attackTouchIdx !== -1
    },
    setterTouch,
    remainingLogEntries: updatedLog.length
  });

  return {
    updatedLog,
    setterTouch
  };
};