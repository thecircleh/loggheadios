import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import axios from "axios";

/**
 * Team selector with:
 * 1. Existing teams dropdown
 * 2. Searchable team_holding lookup
 */
const TeamSelector = ({
  teams,
  selectedTeam,
  onSelectTeam,
  isLoading,
  apiBaseUrl = "",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [holdingResults, setHoldingResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const normalizedTeams = useMemo(() => {
    return Array.isArray(teams) ? teams.filter(Boolean) : [];
  }, [teams]);

  useEffect(() => {
    const trimmed = searchTerm.trim();

    if (trimmed.length < 2) {
      setHoldingResults([]);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

    const runSearch = async () => {
      try {
        setIsSearching(true);
        setSearchError("");

        const response = await axios.get(
          `${apiBaseUrl}/api/team-holdings`,
          {
            params: {
              q: trimmed,
              limit: 15,
            },
            signal: controller.signal,
          }
        );

        setHoldingResults(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        if (
          err.name === "CanceledError" ||
          err.name === "AbortError" ||
          axios.isCancel?.(err)
        ) {
          return;
        }

        console.error("Failed searching team holdings:", err);
        setSearchError("Unable to search team directory.");
        setHoldingResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeout = setTimeout(runSearch, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchTerm, apiBaseUrl]);

  const handlePickHoldingTeam = (teamDoc) => {
    if (!teamDoc?.displayName) return;
    onSelectTeam(teamDoc.displayName);
    setSearchTerm(teamDoc.displayName);
    setHoldingResults([]);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.section}>
        <label style={styles.label}>Existing Teams</label>
        <select
          value={normalizedTeams.includes(selectedTeam) ? selectedTeam : ""}
          onChange={(e) => onSelectTeam(e.target.value)}
          disabled={isLoading}
          style={styles.select}
        >
          <option value="">Select existing team</option>
          {normalizedTeams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.divider}>or</div>

      <div style={styles.section}>
        <label style={styles.label}>Search Team Directory</label>
        <input
          type="text"
          value={searchTerm}
          placeholder="Search by team, club, or team code"
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={isLoading}
          style={styles.input}
        />

        {(isSearching || isLoading) && (
          <div style={styles.helperText}>Searching...</div>
        )}

        {!!searchError && (
          <div style={styles.errorText}>{searchError}</div>
        )}

        {!isSearching && holdingResults.length > 0 && (
          <div style={styles.resultsBox}>
            {holdingResults.map((teamDoc) => (
              <button
                key={teamDoc._id}
                type="button"
                onClick={() => handlePickHoldingTeam(teamDoc)}
                style={styles.resultButton}
              >
                <div style={styles.resultTitle}>
                  {teamDoc.displayName}
                </div>
                <div style={styles.resultMeta}>
                  {teamDoc.club} • {teamDoc.teamCode}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedTeam && (
        <div style={styles.selectedBox}>
          Selected: <strong>{selectedTeam}</strong>
        </div>
      )}
    </div>
  );
};

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontWeight: 600,
    fontSize: 14,
  },
  select: {
    height: 40,
    borderRadius: 8,
    border: "1px solid #ccc",
    padding: "0 10px",
    fontSize: 14,
  },
  input: {
    height: 40,
    borderRadius: 8,
    border: "1px solid #ccc",
    padding: "0 10px",
    fontSize: 14,
  },
  divider: {
    fontSize: 13,
    color: "#777",
    textAlign: "center",
  },
  helperText: {
    fontSize: 13,
    color: "#666",
  },
  errorText: {
    fontSize: 13,
    color: "#b00020",
  },
  resultsBox: {
    border: "1px solid #ddd",
    borderRadius: 10,
    maxHeight: 240,
    overflowY: "auto",
    background: "#fff",
  },
  resultButton: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: 12,
    border: "none",
    borderBottom: "1px solid #eee",
    background: "#fff",
    cursor: "pointer",
  },
  resultTitle: {
    fontWeight: 600,
    fontSize: 14,
    marginBottom: 4,
  },
  resultMeta: {
    fontSize: 12,
    color: "#666",
  },
  selectedBox: {
    fontSize: 14,
    color: "#222",
    background: "#f7f7f7",
    borderRadius: 8,
    padding: 10,
  },
};

TeamSelector.propTypes = {
  teams: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedTeam: PropTypes.string,
  onSelectTeam: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  apiBaseUrl: PropTypes.string,
};

TeamSelector.defaultProps = {
  teams: [],
  selectedTeam: "",
  isLoading: false,
  apiBaseUrl: "",
};

export default TeamSelector;