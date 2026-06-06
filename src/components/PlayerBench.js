// client/src/PlayerBench.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import PlayerIcon from "./PlayerIcon";

const PlayerBench = ({
  players = [],
  courtPlayers = [], // current players on court
  onCreatePlayer,
  onResetBench,      // function to wipe the bench (should be confirmed first)
  onRecallBench,     // new prop: function to recall bench players & clear the court
  onDeletePlayer,
  getAllPlayers,
  addPlayerToCourt,
  maxLiberos // maximum allowed liberos (e.g. 2)
}) => {
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("");

  // Responsive: determine if the device is mobile (width < 480px)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 480);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Compute total liberos from bench and court on every render.
  const benchLiberoCount = players.filter((p) => p.isLibero).length;
  const courtLiberoCount = courtPlayers.filter((p) => p.isLibero).length;
  const totalLiberoCount = benchLiberoCount + courtLiberoCount;

  // Create a new player on the bench (isOnCourt defaults to false)
  const handleCreatePlayer = async (e) => {
    e.preventDefault();
    if (!newPlayerName || !newPlayerNumber) {
      return console.error("Name/Number is required");
    }
    try {
      await onCreatePlayer({
        name: newPlayerName,
        number: parseInt(newPlayerNumber, 10)
      });
      setNewPlayerName("");
      setNewPlayerNumber("");
      getAllPlayers();
    } catch (error) {
      console.error("Error creating player:", error);
    }
  };

  // Toggle libero status for a bench player.
  const handleToggleLibero = async (player, currentStatus) => {
    // If turning ON libero and limit already reached, alert and return.
    if (!currentStatus && totalLiberoCount >= maxLiberos) {
      alert("Maximum 2 liberos allowed.");
      return;
    }
    try {
      await axios.put(`/api/players/${player._id}`, { isOnCourt: player.isOnCourt, isLibero: !currentStatus });
      getAllPlayers();
    } catch (error) {
      console.error("Error updating libero status:", error);
    }
  };

  // Move player from bench to court.
  const handleMoveToCourt = async (playerId) => {
    try {
      // Set player's isOnCourt flag to true.
      await axios.put(`/api/players/${playerId}`, { isOnCourt: true });
      const player = players.find((p) => p._id === playerId);
      if (player) {
        addPlayerToCourt(player);
      }
      getAllPlayers();
      console.log("Moved player to the court!");
    } catch (error) {
      console.error("Error moving player to court:", error);
    }
  };

  // Delete a bench player entirely.
  const handleDelete = async (playerId) => {
    if (!window.confirm("Are you sure you want to delete this player?")) {
      return;
    }
    try {
      await onDeletePlayer(playerId);
      getAllPlayers();
    } catch (error) {
      console.error("Error deleting player:", error);
    }
  };

  // New: Save the current bench to the database tied to our team.
  const handleSaveBench = async () => {
    if (!window.confirm("Are you sure you want to save the current bench? This will tie these players to your team.")) {
      return;
    }
    try {
      // Assumes a new endpoint exists to save the bench.
      await axios.post("/api/players/bench/save", { players });
      alert("Bench saved successfully!");
    } catch (error) {
      console.error("Error saving bench:", error);
    }
  };

  return (
    <div style={{ border: "2px solid #888", padding: "10px" }}>
      <h2>Bench</h2>
      {/* Responsive grid: 3 columns on mobile, 7 columns on larger screens */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${isMobile ? 3 : 7}, 1fr)`,
          gap: "10px",
          marginBottom: "10px"
        }}
      >
        {players.map((player) => (
          <div key={player._id} style={{ border: "1px solid #ccc", padding: "5px" }}>
            <PlayerIcon
              playerId={player._id}
              playerName={player.name}
              playerNumber={player.number}
              isLibero={player.isLibero}
            />
            <div style={{ marginTop: "5px" }}>
              <label>
                <input
                  type="checkbox"
                  checked={player.isLibero || false}
                  onChange={() => handleToggleLibero(player, player.isLibero || false)}
                  // Disable if not already a libero and limit is reached.
                  disabled={!player.isLibero && totalLiberoCount >= maxLiberos}
                />
                Libero
              </label>
            </div>
            <button onClick={() => handleMoveToCourt(player._id)}>Move to Court</button>
            <button onClick={() => handleDelete(player._id)}>Delete</button>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: "10px" }}>
        <button
          style={{
            padding: "5px 10px",
            backgroundColor: "#d9534f",
            color: "white",
            border: "none",
            cursor: "pointer",
            marginRight: "5px"
          }}
          onClick={() => {
            if (window.confirm("Are you sure you want to reset the bench? This will wipe all bench players.")) {
              onResetBench();
            }
          }}
        >
          Reset Bench
        </button>
        <button
          style={{
            padding: "5px 10px",
            backgroundColor: "#5bc0de",
            color: "white",
            border: "none",
            cursor: "pointer",
            marginRight: "5px"
          }}
          onClick={handleSaveBench}
        >
          Save Bench
        </button>
        <button
          style={{
            padding: "5px 10px",
            backgroundColor: "#5cb85c",
            color: "white",
            border: "none",
            cursor: "pointer"
          }}
          onClick={onRecallBench}
        >
          Recall Bench
        </button>
      </div>
      <h3>Add Player</h3>
      <form onSubmit={handleCreatePlayer}>
        <input
          type="text"
          placeholder="Name"
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
        />
        <input
          type="number"
          placeholder="Number"
          value={newPlayerNumber}
          onChange={(e) => setNewPlayerNumber(e.target.value)}
        />
        <button type="submit">Create</button>
      </form>
    </div>
  );
};

export default PlayerBench;
