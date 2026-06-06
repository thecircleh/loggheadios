// src/components/MatchSummaryPage.js
import React, { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import "./matchSummary.css";

export default function MatchSummaryPage() {
  const { matchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedSet, setExpandedSet] = useState(0); // Expand first set by default

  // Get data from navigation state
  const matchData = location.state?.matchData;
  const winner = location.state?.winner;
  const winnerName = location.state?.winnerName || "Winner";
  const finalSetsWon = location.state?.finalSetsWon || { our: 0, opponent: 0 };

  // Validate data
  if (!matchData) {
    return (
      <div className="match-summary-error">
        <h2>❌ Error Loading Match</h2>
        <p>Could not load match summary. The match data is missing.</p>
        <button onClick={() => navigate("/coaches-corner/stats")}>
          View Matches
        </button>
        <button onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const {
    matchStats = {},
    playerAggregates = [],
    rotationAggregates = [],
    validation = {},
    completedSets = [],
  } = matchData;

  // Sort players by +/- descending
  const sortedPlayers = [...playerAggregates].sort(
    (a, b) => (b.totalPlusMinus || 0) - (a.totalPlusMinus || 0)
  );

  // Calculate match duration
  const calculateMatchDuration = () => {
    let totalMs = 0;
    completedSets.forEach((set) => {
      if (set.startedAt && set.endedAt) {
        totalMs += new Date(set.endedAt) - new Date(set.startedAt);
      }
    });
    const minutes = Math.floor(totalMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const matchDuration = calculateMatchDuration();

  // Format set duration
  const formatSetDuration = (startedAt, endedAt) => {
    if (!startedAt || !endedAt) return "N/A";
    const ms = new Date(endedAt) - new Date(startedAt);
    const minutes = Math.round(ms / 60000);
    return `${minutes}m`;
  };

  return (
    <div className="match-summary-page">
      {/* HEADER: Match Result */}
      <div
        className={`match-result-header ${winner === "our" ? "our-win" : "their-win"}`}
      >
        <h1 className="result-title">🏆 MATCH COMPLETE 🏆</h1>
        <p className="result-winner">{winnerName} Wins!</p>
        <div className="result-score">
          <span className="score-number">{finalSetsWon.our}</span>
          <span className="score-separator">-</span>
          <span className="score-number">{finalSetsWon.opponent}</span>
        </div>
        <p className="result-meta">Duration: {matchDuration}</p>
      </div>

      {/* VALIDATION ALERT (if missing analytics) */}
      {!validation.allSetsHaveAnalytics && (
        <div className="validation-alert">
          <h3>⚠️ Incomplete Analytics</h3>
          <p>The following sets are missing detailed analytics:</p>
          <ul>
            {validation.warnings?.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
          <p>Match completed successfully. Available stats shown below.</p>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="match-summary-content">
        {/* MATCH STATISTICS */}
        <section className="stats-section">
          <h2>Match Statistics</h2>
          <div className="stats-grid">
            <StatCard
              label="Total Points"
              value={matchStats.totalPoints || 0}
            />
            <StatCard label="Our Earned" value={matchStats.ourEarned || 0} />
            <StatCard label="Our Errors" value={matchStats.ourErrors || 0} />
            <StatCard
              label="Opponent Earned"
              value={matchStats.opponentEarned || 0}
            />
            <StatCard
              label="Opponent Errors"
              value={matchStats.opponentErrors || 0}
            />
            <StatCard
              label="Total Substitutions"
              value={matchStats.totalSubstitutions || 0}
            />
            <StatCard
              label="Serving %"
              value={matchStats.servingPercentage || "0%"}
            />
            <StatCard
              label="Avg Set Duration"
              value={matchStats.averageSetDuration || "0m"}
            />
          </div>
        </section>

        {/* PLAYER PERFORMANCE */}
        <section className="players-section">
          <h2>Player Performance</h2>
          {sortedPlayers.length === 0 ? (
            <p className="no-data">No player data available.</p>
          ) : (
            <div className="players-table-container">
              <table className="players-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Sets</th>
                    <th>+/-</th>
                    <th>Subs</th>
                    <th className="libero-col">L</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player, idx) => (
                    <tr
                      key={player.playerId || idx}
                      className={`player-row ${
                        player.totalPlusMinus > 0
                          ? "positive"
                          : player.totalPlusMinus < 0
                          ? "negative"
                          : ""
                      } ${idx === 0 ? "top-player" : ""}`}
                    >
                      <td className="player-name">
                        {player.name}{" "}
                        <span className="player-number">#{player.number}</span>
                      </td>
                      <td className="player-sets">{player.setsPlayed}</td>
                      <td
                        className={`player-pm ${
                          player.totalPlusMinus > 0
                            ? "pm-positive"
                            : player.totalPlusMinus < 0
                            ? "pm-negative"
                            : "pm-neutral"
                        }`}
                      >
                        {player.totalPlusMinus > 0 ? "+" : ""}
                        {player.totalPlusMinus}
                      </td>
                      <td className="player-subs">
                        {player.substitutionsMade}
                      </td>
                      <td className="player-libero">
                        {player.isLibero ? (
                          <span className="libero-badge">L</span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ROTATION PERFORMANCE (if available) */}
        {rotationAggregates && rotationAggregates.length > 0 && (
          <section className="rotations-section">
            <h2>Rotation Performance</h2>
            <div className="rotations-grid">
              {rotationAggregates.map((rot, idx) => (
                <RotationCard key={idx} rotation={rot} rotationNum={idx + 1} />
              ))}
            </div>
          </section>
        )}

        {/* SET-BY-SET BREAKDOWN */}
        <section className="sets-section">
          <h2>Set-by-Set Breakdown</h2>
          <div className="sets-container">
            {completedSets.map((set, idx) => (
              <SetAccordion
                key={set._id || idx}
                set={set}
                isExpanded={expandedSet === idx}
                onToggle={() =>
                  setExpandedSet(expandedSet === idx ? -1 : idx)
                }
                hasBlankAnalytics={validation.blankAnalyticsSets?.includes(
                  set.setNumber
                )}
              />
            ))}
          </div>
        </section>
      </div>

      {/* ACTION BUTTONS */}
      <div className="action-buttons">
        <button
          className="btn btn-primary"
          onClick={() =>
  navigate(`/coaches-corner/stats?matchId=${matchId}`, {
    state: { matchId, matchData },
  })
}
        >
          📊 Deep Analytics
        </button>
        <button
          className="btn btn-success"
          onClick={() => navigate("/settings")}
        >
          ➕ Start New Match
        </button>
      </div>
    </div>
  );
}

// ============= SUBCOMPONENTS =============

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function RotationCard({ rotation, rotationNum }) {
  const avgPM = parseFloat(rotation.avgPlusMinus) || 0;

  return (
    <div
      className={`rotation-card ${
        avgPM > 0 ? "positive" : avgPM < 0 ? "negative" : ""
      }`}
    >
      <div className="rotation-title">Rotation {rotationNum}</div>
      <div className="rotation-total">
        {rotation.totalPlusMinus > 0 ? "+" : ""}
        {rotation.totalPlusMinus}
      </div>
      <div className="rotation-meta">
        across {rotation.appearances} set{rotation.appearances !== 1 ? "s" : ""}
      </div>
      <div className="rotation-avg">avg: {avgPM > 0 ? "+" : ""}{avgPM}</div>
    </div>
  );
}

function SetAccordion({
  set,
  isExpanded,
  onToggle,
  hasBlankAnalytics,
}) {
  const winnerName = set.winner === "our" ? "Our Team" : "Opponent";
  const setDuration =
    set.startedAt && set.endedAt
      ? Math.round((new Date(set.endedAt) - new Date(set.startedAt)) / 60000) +
        "m"
      : "N/A";

  return (
    <div className="set-accordion">
      <button className="set-header" onClick={onToggle}>
        <span className="set-toggle">{isExpanded ? "▼" : "▶"}</span>
        <span className="set-title">Set {set.setNumber}</span>
        <span className="set-score">
          {set.setScore?.our || 0} - {set.setScore?.their || 0}
        </span>
        <span className="set-winner">{set.winner === "our" ? "✓" : "✓"}</span>
        <span className="set-duration">({setDuration})</span>
      </button>

      {isExpanded && (
        <div className="set-content">
          {hasBlankAnalytics ? (
            <div className="blank-analytics-warning">
              <p>⚠️ MISSING ANALYTICS</p>
              <p>
                This set has a final score but no detailed analytics (rotations,
                players, substitutions).
              </p>
            </div>
          ) : (
            <>
              <div className="set-detail">
                <span className="detail-label">Points Earned:</span>
                <span className="detail-value">
                  Our {set.analytics?.ourPointsEarned || 0} vs{" "}
                  {set.analytics?.theirPointsEarned || 0} Opponent
                </span>
              </div>
              <div className="set-detail">
                <span className="detail-label">Points by Errors:</span>
                <span className="detail-value">
                  Our {set.analytics?.ourPointsByTheirErrors || 0} vs{" "}
                  {set.analytics?.theirPointsByOurErrors || 0} Opponent
                </span>
              </div>
              {set.playerPlusMinus && set.playerPlusMinus.length > 0 && (
                <div className="set-detail">
                  <span className="detail-label">Top Performer:</span>
                  <span className="detail-value">
                    {set.playerPlusMinus.reduce((max, p) =>
                      (p.plusMinus || 0) > (max.plusMinus || 0) ? p : max
                    )?.name || "N/A"}{" "}
                    (
                    {set.playerPlusMinus.reduce((max, p) =>
                      (p.plusMinus || 0) > (max.plusMinus || 0) ? p : max
                    )?.plusMinus || 0}
                    )
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}