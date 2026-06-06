import React from 'react';
import PropTypes from 'prop-types';
import { POSITIONS } from '../../constants/statDefinitions';

/**
 * Component for filtering players by position
 */
const PositionFilter = ({ selectedPosition, onSelectPosition }) => {
  return (
    <div>
      <label>Position: </label>
      <select 
        value={selectedPosition} 
        onChange={(e) => onSelectPosition(e.target.value)}
      >
        {POSITIONS.map(position => (
          <option key={position.value} value={position.value}>
            {position.label}
          </option>
        ))}
      </select>
    </div>
  );
};

PositionFilter.propTypes = {
  selectedPosition: PropTypes.string.isRequired,
  onSelectPosition: PropTypes.func.isRequired
};

PositionFilter.defaultProps = {
  selectedPosition: 'All'
};

export default PositionFilter;