import React from 'react';
import PropTypes from 'prop-types';

/**
 * Component for selecting a match
 */
const MatchSelector = ({ matches, selectedMatchId, onSelectMatch, isLoading }) => {
  return (
    <div>
      <label>Match: </label>
      <select 
        value={selectedMatchId} 
        onChange={(e) => onSelectMatch(e.target.value)}
        disabled={isLoading}
      >
        <option value="all">All Matches</option>
        {matches.map(match => (
          <option key={match._id} value={match._id}>
            {match.opponentName} – {new Date(match.timestamp).toLocaleDateString()}
          </option>
        ))}
      </select>
      {isLoading && <span style={{ marginLeft: 8, fontSize: 14, color: '#666' }}>Loading...</span>}
    </div>
  );
};

MatchSelector.propTypes = {
  matches: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string.isRequired,
      opponentName: PropTypes.string.isRequired,
      timestamp: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]).isRequired
    })
  ).isRequired,
  selectedMatchId: PropTypes.string,
  onSelectMatch: PropTypes.func.isRequired,
  isLoading: PropTypes.bool
};

MatchSelector.defaultProps = {
  matches: [],
  selectedMatchId: 'all',
  isLoading: false
};

export default MatchSelector;