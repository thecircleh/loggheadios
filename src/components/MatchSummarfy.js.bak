import React from 'react';
import PropTypes from 'prop-types';

/**
 * Component for displaying match score summary
 */
const MatchSummary = ({ match }) => {
  if (!match?.setScores?.length) return null;

  return (
    <div style={{ 
      margin: '20px 0', 
      textAlign: 'center', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif' 
    }}>
      <h4 style={{ 
        marginBottom: 8, 
        fontSize: '18px', 
        fontWeight: 600, 
        color: '#1C1C1E' 
      }}>
        Match Summary
      </h4>
      <div style={{
        display: 'inline-block',
        border: '2px solid #007AFF',
        borderRadius: '12px',
        padding: '16px',
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
      }}>
        <table style={{ 
          borderCollapse: 'collapse', 
          backgroundColor: '#ffffff', 
          fontSize: '16px', 
          fontWeight: 500, 
          color: '#1C1C1E' 
        }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 12px' }}></th>
              {match.setScores.map((_, i) => (
                <th key={i} style={{
                  padding: '6px 12px',
                  borderBottom: '2px solid #007AFF',
                  fontWeight: '600',
                  fontSize: '16px',
                }}>
                  Set {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: '600', padding: '8px 12px', textAlign: 'right' }}>
                {match.opponentName}
              </td>
              {match.setScores.map((set, i) => (
                <td key={i} style={{
                  textAlign: 'center',
                  padding: '8px 12px',
                  fontWeight: set.opponentScore > set.ourScore ? '600' : '500',
                  color: set.opponentScore > set.ourScore ? '#007AFF' : '#1C1C1E',
                }}>
                  {set.opponentScore}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: '600', padding: '8px 12px', textAlign: 'right' }}>
                {match.teamName}
              </td>
              {match.setScores.map((set, i) => (
                <td key={i} style={{
                  textAlign: 'center',
                  padding: '8px 12px',
                  fontWeight: set.ourScore > set.opponentScore ? '600' : '500',
                  color: set.ourScore > set.opponentScore ? '#007AFF' : '#1C1C1E',
                }}>
                  {set.ourScore}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

MatchSummary.propTypes = {
  match: PropTypes.shape({
    teamName: PropTypes.string.isRequired,
    opponentName: PropTypes.string.isRequired,
    setScores: PropTypes.arrayOf(
      PropTypes.shape({
        ourScore: PropTypes.number.isRequired,
        opponentScore: PropTypes.number.isRequired
      })
    ).isRequired
  })
};

export default MatchSummary;