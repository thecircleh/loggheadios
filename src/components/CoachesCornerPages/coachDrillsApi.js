// client/src/components/CoachesCornerPages/coachDrillsApi.js
import axios from "axios";

export const getApiUrl = () => {
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h.startsWith("10.")) {
      return `http://${h}:3000`;
    }
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

export const API_URL = getApiUrl();

export const authHeaders = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

export async function listMyDrills(token) {
  const res = await axios.get(`${API_URL}/api/coaches-corner/drills`, authHeaders(token));
  return res.data || [];
}

export async function getDrillById(token, id) {
  const res = await axios.get(`${API_URL}/api/coaches-corner/drills/${id}`, authHeaders(token));
  return res.data;
}

export async function updateDrill(token, id, payload) {
  const res = await axios.put(`${API_URL}/api/coaches-corner/drills/${id}`, payload, authHeaders(token));
  return res.data;
}

export async function deleteDrill(token, id) {
  await axios.delete(`${API_URL}/api/coaches-corner/drills/${id}`, authHeaders(token));
  return true;
}

export async function rateDrill(token, id, rating) {
  const res = await axios.post(
    `${API_URL}/api/coaches-corner/drills/${id}/rate`,
    { rating },
    authHeaders(token)
  );
  return res.data;
}
