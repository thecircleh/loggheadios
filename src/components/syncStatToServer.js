import axios from "axios";

 const API_URL = process.env.REACT_APP_API_URL || "https://api.loggerhead.app";

export const syncStatToServer = async (playerId, updatedFields) => {
  try {
    await axios.put(`${API_URL}/api/stats/update/${playerId}`, updatedFields);
	console.log("Sending stat update", playerId, updatedFields);
    console.log(`✅ Synced stats for player ${playerId}`, updatedFields);
  } catch (err) {
    console.error(`❌ Failed to sync stats for player ${playerId}:`, err.message);
  }
};