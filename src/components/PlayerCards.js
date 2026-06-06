import React from 'react';
import PropTypes from 'prop-types';
import { STYLES } from '../../constants/statDefinitions';

/**
 * Component for displaying player selection cards
 */
const PlayerCards = ({ players, selectedPlayerIds, onSelectPlayer, isLoading }) => {
  if (isLoading) {
    return (
      <div>
        <label>Players:</label>
        <div style={STYLES.cardContainer}>
          <div style={{ padding: '10px' }}>Loading players...</div>
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div>
        <label>Players:</label>
        <div style={STYLES.cardContainer}>
          <div style={{ padding: '10px' }}>No players available</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label>Players:</label>
      <div style={STYLES.cardContainer}>
        {players.map((player) => {
          const isSelected = selectedPlayerIds.includes(player._id);
          return (
            <div
              key={player._id}
              onClick={() => onSelectPlayer(player._id)}
              style={{
                ...STYLES.card,
                ...(isSelected ? STYLES.cardSelected : STYLES.cardUnselected)
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 'bold' }}>
                # {player.number || 'N/A'}
              </div>
              <div style={{ fontWeight: 'bold' }}>
                {(player.name || '').slice(0, 9)}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {player.position || '–'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

PlayerCards.propTypes = {
  players: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      number: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      position: PropTypes.string
    })
  ).isRequired,
  selectedPlayerIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onSelectPlayer: PropTypes.func.isRequired,
  isLoading: PropTypes.bool
};

PlayerCards.defaultProps = {
  players: [],
  selectedPlayerIds: [],
  isLoading: false
};

export default PlayerCards;