/**
 * Definitions and explanations for volleyball statistics
 */

export const STAT_EXPLANATIONS = {
  K: "Kills",
  E: "Attack Errors",
  TA: "Total Attack Attempts",
  "PCT.": "Hitting Percentage = (K - E) / TA",
  A: "Assists",
  SA: "Service Aces",
  SE: "Service Errors",
  RE: "Reception Errors",
  DIG: "Digs",
  BS: "Block Solo",
  BA: "Block Assist",
  BE: "Block Errors",
  BHE: "Ball Handling Errors",
  PTS: "Points = K + SA + BS + 0.5 × BA"
};

export const POSITIONS = [
  { value: "All", label: "All Positions" },
  { value: "OH", label: "Outside Hitter" },
  { value: "MB", label: "Middle Blocker" },
  { value: "S", label: "Setter" },
  { value: "DS", label: "Defensive Specialist" },
  { value: "L", label: "Libero" },
  { value: "OPP", label: "Opposite" }
];

// Styles for components
export const STYLES = {
  card: {
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    userSelect: 'none',
    width: 100,
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardSelected: {
    border: '2px solid #007AFF',
    backgroundColor: '#e6f0ff'
  },
  cardUnselected: {
    border: '1px solid #ccc',
    backgroundColor: '#fff'
  },
  cardContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  },
  tableCell: {
    border: "1px solid #ccc",
    padding: "6px",
    textAlign: "center",
  },
  tableHeader: {
    backgroundColor: "#f9f9f9", 
    borderBottom: "2px solid #ccc"
  },
  tableHeaderCell: {
    padding: "8px",
    cursor: "pointer",
    fontWeight: "bold"
  },
  tableTeamTotals: {
    backgroundColor: "#f0f8ff", 
    fontWeight: "bold"
  },
  button: {
    padding: "8px 16px",
    marginRight: 12,
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },
  primaryButton: {
    background: "#007AFF",
    color: "white"
  },
  successButton: {
    background: "#34C759",
    color: "white"
  },
  dangerButton: {
    background: "#FF3B30",
    color: "white"
  },
  insightButton: {
    background: "#5E5CE6",
    color: "white"
  },
  neutralButton: {
    background: "#ccc",
    color: "#111"
  },
  insightsContainer: {
    marginTop: 20,
    backgroundColor: "#f5f5f7",
    border: "2px solid #5E5CE6",
    padding: "16px",
    borderRadius: "12px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    color: "#1C1C1E",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)"
  },
  statExplanation: {
    marginBottom: 12,
    padding: "12px 16px",
    backgroundColor: "#e0f7e9",
    border: "2px solid #34C759",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#1c1c1e",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
    transition: "all 0.2s ease-in-out"
  }
};