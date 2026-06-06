import { useState, useCallback } from 'react';

const useActionLog = (initialLog = []) => {
  const [actionLog, setActionLog] = useState(initialLog);

  const addAction = useCallback((action, timestamp = new Date().toISOString()) => {
    setActionLog(prev => [
      ...prev,
      {
        action,
        timestamp,
      }
    ]);
  }, []);

  const addActionWithMeta = useCallback((action, meta = {}) => {
    setActionLog(prev => [
      ...prev,
      {
        action,
        timestamp: new Date().toISOString(),
        ...meta
      }
    ]);
  }, []);

  const removeLastAction = useCallback(() => {
    if (actionLog.length === 0) return null;
    
    const lastAction = actionLog[actionLog.length - 1];
    setActionLog(prev => prev.slice(0, -1));
    return lastAction;
  }, [actionLog]);

  const removeActionsFromIndex = useCallback((startIndex) => {
    setActionLog(prev => prev.slice(0, startIndex));
  }, []);

  const invalidateActionsFromIndex = useCallback((fromIndex) => {
    setActionLog(prev => prev.map((entry, index) =>
      index >= fromIndex ? { ...entry, invalid: true } : entry
    ));
  }, []);

  const addReplayAction = useCallback(() => {
    setActionLog(prev => [
      ...prev,
      { 
        action: "Referee Declared Replay", 
        timestamp: new Date().toISOString() 
      }
    ]);
  }, []);

  const clearLog = useCallback(() => {
    setActionLog([]);
  }, []);

  // Utility function to check if last action should show undo button
  const shouldShowUndoButton = useCallback(() => {
    if (!Array.isArray(actionLog) || actionLog.length === 0) return false;

    const last = actionLog[actionLog.length - 1];
    const action = last?.action?.toLowerCase() || "";

    // Show undo for kills or attack errors
    if (action.includes("kill") || action.includes("attack error")) {
      return true;
    }

    return true;
  }, [actionLog]);

  return {
    actionLog,
    setActionLog,
    addAction,
    addActionWithMeta,
    removeLastAction,
    removeActionsFromIndex,
    invalidateActionsFromIndex,
    addReplayAction,
    clearLog,
    shouldShowUndoButton
  };
};

export default useActionLog;