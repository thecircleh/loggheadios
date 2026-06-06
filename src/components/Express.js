import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import logAndSyncStat from "./logAndSyncStat";
import { isMobile } from "react-device-detect";

const romanNumerals = ["","I", "II", "III", "IV", "V", "VI"];
const displayOptions = ["Name + Pos", "Number + Pos", "Name + Number + Pos"];

const ExpressStatPage = ({ courtPlayers = [], currentMatchId, match, setActionLog, actionLog, setPlayerStats }) => {
  const [displayFormat, setDisplayFormat] = useState("Name + Pos");
  const [activeCell, setActiveCell] = useState(null);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const { user } = useAuth();

  if (user?.email !== "hscholl1972@yahoo.com") {
    return (
      <div style={{ padding: 20, fontSize: 16, textAlign: "center" }}>
        Access Denied
      </div>
    );
  }

  const getPlayerLabel = (player) => {
    if (!player) return "-";
    const name = player.name || "?";
    const number = player.number || "?";
    const pos = player.position || "-";
    switch (displayFormat) {
      case "Name + Pos": return `${name} (${pos})`;
      case "Number + Pos": return `#${number} (${pos})`;
      case "Name + Number + Pos": return `${name} #${number} (${pos})`;
      default: return name;
    }
  };

  const statTypes = [
    { label: "Dig", statKeys: ["digs"], color: "#007AFF" },
    { label: "Receive", statKeys: ["receptions"], color: "#5AC8FA" },
    { label: "Set", statKeys: ["sets"], color: "#FF9500" },
    { label: "Assist", statKeys: ["assists"], color: "#AF52DE" },
    { label: "inPlay", statKeys: ["attacks", "zeroAttacks"], color: "#FF3B30" },
    { label: "Kill", statKeys: ["kills", "points", "attacks"], color: "#34C759" },
    { label: "Error", statKeys: ["errors"], color: "#8E8E93" },
  ];

  const handleLog = (player, label, statKeys, colIndex, rowIndex) => {
    if (hapticsEnabled && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
    if (!player) return;
    setActiveCell(`${colIndex}-${rowIndex}`);
    setTimeout(() => setActiveCell(null), 300);
    logAndSyncStat({
      playerId: player._id,
      playerName: player.name,
      label,
      statKeys,
      setActionLog,
      currentMatchId,
      teamId: match?.teamName,
    });
  };

  const positionToRowIndex = { "5": 4, "2": 1, "1": 0, "6": 5, "4": 3, "3": 2 };
  const rowPlayers = Array(6).fill(null);
  courtPlayers.forEach((player, index) => {
    const label = ["4", "3", "2", "5", "6", "1"][index];
    const rowIndex = positionToRowIndex[label];
    if (rowIndex !== undefined) rowPlayers[rowIndex] = player;
  });

  return (
    <div style={styles.wrapper}>
      <h2 style={styles.header}>Express Logging</h2>
      <div style={{ ...styles.displayToggle, marginBottom: 6 }}>
        <label style={{ fontSize: 13, marginRight: 8 }}>
          <input type="checkbox" checked={hapticsEnabled} onChange={(e) => setHapticsEnabled(e.target.checked)} /> Haptics
        </label>
        {displayOptions.map(option => (
          <button
            key={option}
            onClick={() => setDisplayFormat(option)}
            style={displayFormat === option ? styles.buttonActive : styles.button}
          >
            {option}
          </button>
        ))}
      </div>
      <div style={{ ...styles.table, flexDirection: isMobile ? "column" : "row" }}>
        <div style={styles.leftCol}>
          {romanNumerals.map((r, i) => (
            <div key={i} style={{ ...styles.cell, minHeight: 60 }}>{r}</div>
          ))}
        </div>
        {[
          ["Dig", "Receive", "Error"],
          ["Set", "Assist", "Error"],
          ["inPlay", "Kill", "Error"]
        ].map((labels, colIndex) => (
          <div key={colIndex} style={styles.column}>
            <div style={{ ...styles.cell, fontWeight: 700, justifyContent: 'center' , fontSize: 30, height:60  }}>{["Dig/Receive", "Set", "Attack"][colIndex]}</div>
            {rowPlayers.map((player, rowIndex) => {
              const key = `${colIndex}-${rowIndex}`;
              const isActive = activeCell === key;
              const options = statTypes.filter(s => labels.includes(s.label));

              return (
                <div
                  key={player?._id || rowIndex}
                  style={{
                    ...styles.cell,
                    backgroundColor: isActive ? "rgba(209, 247, 214, 0.6)" : "white",
                    position: "relative",
                    padding: 6,
                    width: isMobile ? "100%" : "auto"
                  }}
                >
                  <div>{getPlayerLabel(player)}</div>
                  <div style={styles.zoneGrid}>
                    {options.map(s => (
                      <div
                        key={s.label}
                        style={{ ...styles.zoneOption, backgroundColor: s.color }}
                        onClick={() => handleLog(player, s.label, s.statKeys, colIndex, rowIndex)}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  wrapper: {
    padding: 16,
    fontFamily: "-apple-system, Helvetica Neue, Arial, sans-serif",
    backgroundColor: "#F2F2F7",
  },
  header: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
  displayToggle: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap"
  },
  button: {
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: 10,
    background: "white",
    cursor: "pointer",
  },
  buttonActive: {
    padding: "8px 12px",
    border: "1px solid #007AFF",
    borderRadius: 10,
    background: "#007AFF",
    color: "white",
    cursor: "pointer",
  },
  table: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  leftCol: {
    display: "flex",
    flexDirection: "column",
	top: 30,
	height: 20,
    gap: 8,
    justifyContent: "flex-start",
    marginRight: 8,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: 1,
    minWidth: 120,
  },
  cell: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 8,
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 14,
    transition: "background-color 0.3s ease",
  },
  zoneGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "4px",
    marginTop: "6px",
    width: "100%",
  },
  zoneOption: {
    padding: "6px",
    borderRadius: "6px",
    fontSize: "12px",
    textAlign: "center",
    fontWeight: 600,
    color: "white",
    cursor: "pointer",
    transition: "background 0.2s ease",
  },
};

export default ExpressStatPage;
