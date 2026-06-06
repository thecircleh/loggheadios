// 4. components/Statistics/StatsManager.jsx
import React, { useState, useCallback } from 'react';

const StatsManager = ({ children, initialTeamStats }) => {
  const [playerStats, setPlayerStats] = useState({});
  const [teamStats, setTeamStats] = useState(initialTeamStats || {
    ourEarned: 0,
    ourError: 0,
    oppEarned: 0,
    oppError: 0
  });

  const updateTeamStats = useCallback((actionType, isOurPoint) => {
    setTeamStats(prev => {
      let updates = {};
      
      if (isOurPoint) {
        if (actionType === 'earned') {
          updates.ourEarned = prev.ourEarned + 1;
        } else if (actionType === 'error') {
          updates.oppError = prev.oppError + 1;
        }
      } else {
        if (actionType === 'earned') {
          updates.oppEarned = prev.oppEarned + 1;
        } else if (actionType === 'error') {
          updates.ourError = prev.ourError + 1;
        }
      }
      
      return { ...prev, ...updates };
    });
  }, []);

  const statsState = {
    playerStats, setPlayerStats,
    teamStats, setTeamStats,
    updateTeamStats
  };

  return children(statsState);
};

export default StatsManager;
