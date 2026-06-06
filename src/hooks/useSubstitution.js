import { useState, useCallback } from 'react';

const useSubstitutions = (maxSubsPerSet = 99) => {
  const [substitutionLog, setSubstitutionLog] = useState([]);
  const [substitutionCount, setSubstitutionCount] = useState(0);

  const addSubstitution = useCallback((playerIn, playerOut, ourScore = 0, opponentScore = 0) => {
    // Only log if the match or set has started
    if (ourScore > 0 || opponentScore > 0) {
      const newSub = {
        in: playerIn,
        out: playerOut,
        timestamp: new Date().toISOString(),
      };

      setSubstitutionLog(prev => [...prev, newSub]);
      setSubstitutionCount(prev => prev + 1);
      
      return newSub;
    }
    return null;
  }, []);

  const undoLastSubstitution = useCallback(() => {
    if (substitutionLog.length === 0) {
      return { success: false, message: "No substitution to undo." };
    }

    const lastSub = substitutionLog[substitutionLog.length - 1];
    if (!lastSub.in || !lastSub.out) {
      return { success: false, message: "Invalid substitution record." };
    }

    setSubstitutionLog(prev => prev.slice(0, -1));
    setSubstitutionCount(prev => Math.max(0, prev - 1));
    
    return { success: true, substitution: lastSub };
  }, [substitutionLog]);

  const wasLastActionASub = useCallback(() => {
    if (substitutionLog.length === 0) return false;
    const lastSub = substitutionLog[substitutionLog.length - 1];
    return lastSub?.in && lastSub?.out;
  }, [substitutionLog]);

  const canMakeSubstitution = substitutionCount < maxSubsPerSet;

  const clearSubstitutions = useCallback(() => {
    setSubstitutionLog([]);
    setSubstitutionCount(0);
  }, []);

  const getSubstitutionInfo = useCallback(() => ({
    total: substitutionCount,
    remaining: maxSubsPerSet - substitutionCount,
    canSub: canMakeSubstitution,
    lastSub: substitutionLog[substitutionLog.length - 1] || null
  }), [substitutionCount, maxSubsPerSet, canMakeSubstitution, substitutionLog]);

  return {
    substitutionLog,
    setSubstitutionLog,
    substitutionCount,
    addSubstitution,
    undoLastSubstitution,
    wasLastActionASub,
    canMakeSubstitution,
    clearSubstitutions,
    getSubstitutionInfo
  };
};

export default useSubstitutions;