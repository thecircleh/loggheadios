// shared/utils/courtHelpers.js
import { EMPTY_PLAYER, POSITION_LABELS } from "../constants/matchConstants";

/**
 * Rotate court positions (sideout rotation)
 * Takes current court and rotates positions: [3,0,1,4,5,2]
 */
export const rotateCourt = (oldCourt) => {
  const c = [...oldCourt];
  return [c[3], c[0], c[1], c[4], c[5], c[2]];
};

/**
 * Get position label for a court index
 */
export const getPositionLabel = (index) => {
  return POSITION_LABELS[index] || "?";
};

/**
 * Check if a player is empty/placeholder
 */
export const isEmptyPlayer = (player) => {
  return !player || player.name === "?" || !player._id;
};

/**
 * Get safe court array with 6 slots
 */
export const getSafeCourt = (courtPlayers) => {
  const c = Array.isArray(courtPlayers) ? [...courtPlayers] : [];
  while (c.length < 6) c.push({ ...EMPTY_PLAYER });
  return c.slice(0, 6);
};

/**
 * Filter out empty players from court
 */
export const getActivePlayers = (court) => {
  return court.filter((p) => !isEmptyPlayer(p));
};

/**
 * Check if all court slots are filled
 */
export const isCourtFull = (court) => {
  const safeCourt = getSafeCourt(court);
  return safeCourt.every((p) => !isEmptyPlayer(p));
};
