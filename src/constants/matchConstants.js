// shared/constants/matchConstants.js

// Position labels for volleyball court (Index 0..5 => positions: 4,3,2,5,6,1)
export const POSITION_LABELS = ["4", "3", "2", "5", "6", "1"];

// Roman numerals for empty player display
export const ROMAN_NUMERALS = ["IV", "III", "II", "V", "VI", "I"];

// Empty player placeholder
export const EMPTY_PLAYER = { name: "?", number: "?" };

// Serve side constants
export const SERVE_SIDE = {
  OUR: "our",
  THEIR: "their",
};

// Server position
export const SERVER_SLOT_INDEX = 5; // position "1" is index 5

// Sub count limits
export const SUB_LIMITS = {
  MIN: 15,
  MAX: 18,
};

// Default team colors
export const DEFAULT_TEAM_COLORS = {
  OUR: "#34C759",
  OPPONENT: "#FF3B30",
};

// Analytics types
export const POINT_TYPE = {
  EARNED: "earned",
  ERROR: "error",
};

// Libero constants
export const LIBERO = {
  DEFAULT_POSITION: 3, // Position where libero typically rotates off
};

// Mobile breakpoint
export const BREAKPOINTS = {
  MOBILE: 480,
};
