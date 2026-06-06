/**
 * Utility functions for the PlayerStatsPage component
 */

/**
 * Determines the API URL based on the environment
 * @returns {string} The API URL
 */
export const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

/**
 * Formats a date as MM-DD-YY
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  return date.toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: '2-digit' 
  }).replace(/\//g, '');
};

/**
 * Sanitizes a string for use in a filename
 * @param {string} name - The string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeFileName = (name) => {
  return (name || '').replace(/\s+/g, '').replace(/[^\w\d-]/g, '');
};

/**
 * Calculates hitting percentage
 * @param {number} kills - Number of kills
 * @param {number} errors - Number of errors
 * @param {number} attempts - Number of attempts
 * @returns {string} Hitting percentage as string
 */
export const calculateHittingPercentage = (kills, errors, attempts) => {
  if (!attempts || attempts === 0) return "-";
  return ((kills - errors) / attempts).toFixed(2);
};

/**
 * Formats JSON AI insights into readable format
 * @param {Object|string} parsedJson - JSON data or string to format
 * @returns {React.ReactNode} Formatted insights
 */
export const formatAiInsightsAsNarrative = (parsedJson) => {
  if (typeof parsedJson === "string") {
    try {
      parsedJson = JSON.parse(parsedJson);
    } catch (err) {
      return { rawText: parsedJson };
    }
  }

  const { playerStats = {}, insights = [] } = parsedJson;

  // Format player contributions
  const playerContributions = Object.entries(playerStats)
    .map(([name, stats]) => {
      const statItems = Object.entries(stats)
        .filter(([_, val]) => val > 0)
        .map(([key, val]) => {
          const label = getStatLabel(key);
          return `${val} ${label}`;
        });

      if (statItems.length === 0) return null;

      const statText =
        statItems.length === 1
          ? statItems[0]
          : statItems.slice(0, -1).join(", ") + ", and " + statItems.slice(-1);

      return `${name} contributed with ${statText}.`;
    })
    .filter(Boolean);

  return {
    playerContributions,
    insights
  };
};

/**
 * Gets a human-readable label for a stat key
 * @param {string} key - The stat key
 * @returns {string} Human-readable label
 */
const getStatLabel = (key) => {
  const labels = {
    kills: "kills",
    attacks: "attacks",
    attackErrors: "attack errors",
    sets: "sets",
    assists: "assists",
    digs: "digs",
    touches: "touches",
    serveAces: "serve aces",
    serveErrors: "serve errors",
    serveInPlay: "serves in play",
    serveReceivedAttempts: "serve receive attempts"
  };
  
  return labels[key] || key;
};