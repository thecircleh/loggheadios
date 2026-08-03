import React, { useMemo, useState, useRef, useEffect,useCallback } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ExpressStatLogger from './ExpressStatLogger';
import { useCollaborative } from './collaborative/CollaborativeProvider';



const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const ExpressStatPage = ({
  courtPlayers = [],
  updateCourtPositions,
  rotateCourtPositions,
  swapCourtPlayers,
  positionMapping = {},
  currentMatchId,
  match,
  setMatchSettings,
  actionLog = [],
  setActionLog,
  ourScore,
  opponentScore,
  onOurPoint,
  onOpponentPoint,
  teamStats,
  setTeamStats,
  openEndSetDialog,
  ballState,
  setBallState,
  ballSide,
  setBallSide,
  isMobile,
  isPortrait,
  isTouch,
  deactivatedPlayers,
  setDeactivatedPlayers,
  currentServeSide,
  setCurrentServeSide,
  saveMatchData,
  // NEW: Games played props
  maybeCreditGamesPlayed,
  scoreCooldownActive,
  scoreCooldownRemaining,
  token,
  autoJoinMatchIfPossible,
  // NEW: Libero tracking props
  allowedLiberoSubTarget,
  setAllowedLiberoSubTarget,
  slot5TargetId,
  setSlot5TargetId,
  benchPlayers = [],
  setBenchPlayers,
  // NEW: Substitution log props - ADD THESE
  substitutionLog = [],
  setSubstitutionLog,
  // Legacy props (remove if using shared state)
  updatePlayersOnCourt,
  setCourtPlayers,
  isMatchOwner,
  setOurScore,
  setOpponentScore,
}) => {
  const navigate = useNavigate();
  const [showCollaborativeWarning, setShowCollaborativeWarning] = useState(false);
  const [passGradingEnabled, setPassGradingEnabled] = useState(false);
const [setDistributionTrackingEnabled, setSetDistributionTrackingEnabled] = useState(false);
const [attackTypeTrackingEnabled, setAttackTypeTrackingEnabled] = useState(false);
  const [scoringEnabled, setScoringEnabled] = useState(true);
  const expressSettingsHydratedRef = useRef(false);
  
  // Scoreboard collapse state - default to collapsed on mobile
  const [scoreboardCollapsed, setScoreboardCollapsed] = useState(() => {
    const saved = localStorage.getItem('loggerhead_scoreboard_collapsed');
    return saved !== null ? JSON.parse(saved) : isMobile;
  });
  
   const {
    isConnected,
    collaborativeMode,
    isCollaborativeReady,
    joinMatch,
    leaveMatch,
    logStat: logCollaborativeStat,
    updateScore: updateCollaborativeScore,
    updateBallState: updateCollaborativeBallState,
    updateServeSide: updateCollaborativeServeSide,
    isAssignedToPlayer,
    getTrackingStatus,
    activeSessions,
    setCollaborativeModeState,
    restoreCollaborativeModeFromMatch,
    syncedGameState,
    registerStateCallbacks,
	loadAssignmentsFromBackend,
	playerAssignments,
	addNotification,
	syncCourtPlayers,
	socket
  } = useCollaborative();

  // Persist scoreboard collapse state
  useEffect(() => {
    localStorage.setItem('loggerhead_scoreboard_collapsed', JSON.stringify(scoreboardCollapsed));
  }, [scoreboardCollapsed]);

  // Toggle scoreboard collapse
  const toggleScoreboardCollapse = useCallback(() => {
    setScoreboardCollapsed(prev => !prev);
  }, []);

  // Keyboard shortcut to toggle scoreboard (C key)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only trigger if not typing in an input/textarea
      if (e.key === 'c' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        toggleScoreboardCollapse();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleScoreboardCollapse]);


  // Check if collaborative mode is enabled
  const isCollaborativeModeActive = match?.collaborativeMode?.enabled;
const matchMode = match?.mode || match?.matchMode || match?.loggingMode || '';

  
  // FIXED: Proper auto-join that uses context instead of window globals
  useEffect(() => {
    if (isCollaborativeModeActive && currentMatchId && !isConnected) {
      console.log('Express: Attempting to join collaborative match for set coordination');
      
      // Use the context's joinMatch method
      if (joinMatch) {
        joinMatch(currentMatchId)
          .then(success => {
            if (success) {
              console.log('Express: Successfully joined collaborative match');
            } else {
              console.warn('Express: Failed to join collaborative match');
            }
          })
          .catch(err => {
            console.error('Express: Error joining collaborative match:', err);
          });
      }
    }
  }, [isCollaborativeModeActive, currentMatchId, joinMatch, isConnected]);
  
useEffect(() => {
  const expressSettings = match?.expressSettings || {};

  setPassGradingEnabled(!!expressSettings.passGradingEnabled);
  setSetDistributionTrackingEnabled(!!expressSettings.setDistributionTrackingEnabled);
  setAttackTypeTrackingEnabled(!!expressSettings.attackTypeTrackingEnabled);
  setScoringEnabled(expressSettings.scoringEnabled !== false);

  expressSettingsHydratedRef.current = true;
}, [match?._id, match?.expressSettings]);

useEffect(() => {
  if (!setMatchSettings) return;
  if (!expressSettingsHydratedRef.current) return;

  setMatchSettings(prev => ({
    ...prev,
    expressSettings: {
      ...(prev?.expressSettings || {}),
      passGradingEnabled,
      setDistributionTrackingEnabled,
      attackTypeTrackingEnabled,
      scoringEnabled,
    },
  }));
}, [
  passGradingEnabled,
  setDistributionTrackingEnabled,
  attackTypeTrackingEnabled,
  scoringEnabled,
  setMatchSettings,
]);
  
const handleDirectScoreAdjustment = useCallback((team, delta) => {
  // Validate inputs
  if (team !== 'our' && team !== 'opponent') return;
  if (!Number.isFinite(delta) || delta === 0) return;

  // Build message once
  const teamLabel = team === 'our' ? 'Our' : 'Opponent';
  const message = `Manual score adjustment: ${teamLabel} ${delta > 0 ? '+' : ''}${delta} (no stats affected)`;

  // Update scores locally using functional setters to avoid stale closures
  let nextOur, nextOpp;

  setOurScore(prev => {
    const val = team === 'our' ? Math.max(0, prev + delta) : prev;
    nextOur = val;
    return val;
  });

  setOpponentScore(prev => {
    const val = team === 'opponent' ? Math.max(0, prev + delta) : prev;
    nextOpp = val;
    return val;
  });
  
  


  // UI feedback + log
 // showActionToast(message, 'info')

  // Collaborative path: let the server broadcast the authoritative update
  if (collaborativeMode && isConnected) {
    updateCollaborativeScore(team, delta, 'manual_adjustment');
    return;
  }

  // Non-collaborative: persist directly (fire-and-forget)
  if (currentMatchId && token) {
    axios.put(
      `${API_URL}/api/matches/${currentMatchId}`,
      { ourScore: nextOur, opponentScore: nextOpp },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      }
    ).catch(err => {
      console.error('Failed to save score:', err)
    });
  }
}, [
  collaborativeMode,
  isConnected,
  updateCollaborativeScore,
  currentMatchId,
  token,
   setOurScore,
  setOpponentScore
]);
 

const handleEndSetClick = useCallback(() => {
  const winner = ourScore >= opponentScore ? 'our' : 'opponent';

  openEndSetDialog({
    winner,
    ourScore,
    opponentScore,
  });
}, [openEndSetDialog, ourScore, opponentScore]);  

 // Auto-save when important state changes
  useEffect(() => {
    if (saveMatchData && currentMatchId) {
      const timeoutId = setTimeout(() => {
        saveMatchData(false); // Auto-save without alert
      }, 2000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [actionLog, courtPlayers, positionMapping, saveMatchData, currentMatchId]); 

  // Handle navigation to court mode with collaborative check
  const handleNavigateToCourtMode = () => {
    if (isCollaborativeModeActive) {
      setShowCollaborativeWarning(true);
    } else {
      navigate('/classic');
    }
  };

  // Handle user's choice from the warning modal
  const handleCollaborativeWarningChoice = (proceed) => {
    setShowCollaborativeWarning(false);
    if (proceed) {
      navigate('/');
    }
    // If they cancel, just close the modal and stay here
  };

  // Helper function to get volleyball position for any slot
  const getVolleyballPosition = (slotIndex) => {
    if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex > 5) {
      return '?';
    }
    return positionMapping[slotIndex] || '?';
  };

  // Find current server info

const [showMiniDiagram, setShowMiniDiagram] = useState(false);

const orderedNumbers = React.useMemo(() => {
  if (!Array.isArray(courtPlayers)) return ['–','–','–','–','–','–'];
  
  // Display order for the diagram: [Pos4, Pos3, Pos2, Pos5, Pos6, Pos1]
  const displayOrder = ['4', '3', '2', '5', '6', '1'];
  
  // Find players by their expressPosition and arrange them in display order
  return displayOrder.map(pos => {
    const player = courtPlayers.find(p => p?.expressPosition === pos);
    return player?.number ?? '–';
  });
}, [courtPlayers]);

  const pageStyle = {
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
    padding: isMobile ? '12px 0' : '20px 0',
    paddingTop: isMobile ? 'calc(12px + env(safe-area-inset-top, 0px))' : 'calc(20px + env(safe-area-inset-top, 0px))'
  };

  const headerStyle = {
    maxWidth: '1200px',
    margin: isMobile ? '0 auto 12px auto' : '0 auto 20px auto',
    padding: isMobile ? '0 12px' : '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: isMobile ? '12px' : '16px'
  };

  const titleStyle = {
    fontSize: isMobile ? '20px' : '28px',
    fontWeight: '700',
    color: '#333',
    margin: 0,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  };

  const navButtonStyle = {
    padding: isMobile ? '8px 14px' : '10px 20px',
    backgroundColor: '#007AFF',
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: isMobile ? '13px' : '14px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease'
  };

  const StatBox = ({ label, value, color }) => (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: isMobile ? '6px' : '8px',
      padding: isMobile ? '6px 10px' : '8px 12px',
      textAlign: 'center',
      minWidth: isMobile ? '60px' : '80px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: `2px solid ${color}`
    }}>
      <div style={{ 
        fontSize: isMobile ? '16px' : '18px', 
        fontWeight: '700', 
        color: '#333',
        lineHeight: '1.2'
      }}>
        {value}
      </div>
      <div style={{ 
        fontSize: isMobile ? '10px' : '11px', 
        color: '#666',
        fontWeight: '500',
        marginTop: '2px'
      }}>
        {label}
      </div>
    </div>
  );

  const matchInfoStyle = {
    maxWidth: '1200px',
    margin: isMobile ? '0 auto 12px auto' : '0 auto 20px auto',
    padding: isMobile ? '12px 16px' : '16px 20px',
    backgroundColor: '#ffffff',
    borderRadius: isMobile ? '10px' : '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: isMobile ? '12px' : '16px'
  };

  const matchDetailStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  };

  const labelStyle = {
    fontSize: '12px',
    color: '#666',
    fontWeight: '500',
    textTransform: 'uppercase'
  };

  const valueStyle = {
    fontSize: '16px',
    color: '#333',
    fontWeight: '600'
  };

  const scoreBoxStyle = {
    display: 'flex',
    gap: '16px',
    alignItems: 'center'
  };

  const scoreStyle = {
    fontSize: '32px',
    fontWeight: '700',
    color: '#333',
    minWidth: '40px',
    textAlign: 'center'
  };

  const vsStyle = {
    fontSize: '16px',
    color: '#666',
    fontWeight: '500'
  };

  function rotateCourtArray(oldCourt) {
    const newCourt = [...oldCourt];

    // libero edge case (mirrors your court's behavior)
    if (oldCourt[3]?.isLibero && oldCourt[3]?.replacedPlayer) {
      newCourt[0] = oldCourt[3].replacedPlayer;
    } else {
      newCourt[0] = oldCourt[3];
    }

    newCourt[1] = oldCourt[0];
    newCourt[2] = oldCourt[1];
    newCourt[3] = oldCourt[4];
    newCourt[4] = oldCourt[5];
    newCourt[5] = oldCourt[2];

    return newCourt;
  }

  if (!match || !currentMatchId) {
  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Stat Book Logger</h1>
        <Link to="/" style={navButtonStyle}>
          Back to Match
        </Link>
      </div>
      
      <div style={{ 
        maxWidth: '1200px',
        margin: isMobile ? '20px auto' : '40px auto',
        padding: isMobile ? '20px 12px' : '40px 20px',
        textAlign: "center", 
        fontSize: isMobile ? '16px' : '18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: isMobile ? '300px' : '400px',
        backgroundColor: '#f8f9fa',
        borderRadius: isMobile ? '10px' : '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ marginBottom: isMobile ? '16px' : '20px', fontSize: isMobile ? '48px' : '64px' }}>🎯</div>
        <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', marginBottom: isMobile ? '12px' : '16px', color: '#333' }}>
          No Active Match Found
        </div>
        <div style={{ color: '#666', marginBottom: isMobile ? '24px' : '32px', maxWidth: '500px', lineHeight: '1.6', fontSize: isMobile ? '14px' : '16px' }}>
          You don't have an active match in progress. Get started by creating a new match or resuming a previously saved match.
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '12px' : '16px', 
          flexWrap: 'wrap', 
          justifyContent: 'center',
          marginBottom: isMobile ? '16px' : '24px'
        }}>
          <Link 
            to="/settings" 
            style={{
              display: 'inline-block',
              padding: isMobile ? '10px 18px' : '12px 24px',
              backgroundColor: '#007AFF',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: isMobile ? '10px' : '12px',
              fontWeight: '600',
              fontSize: isMobile ? '14px' : '16px',
              boxShadow: '0 2px 6px rgba(0,122,255,0.3)',
              transition: 'transform 0.2s ease',
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Start New Match
          </Link>
          
          <Link 
            to="/stats" 
            style={{
              display: 'inline-block',
              padding: isMobile ? '10px 18px' : '12px 24px',
              backgroundColor: '#34C759',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: isMobile ? '10px' : '12px',
              fontWeight: '600',
              fontSize: isMobile ? '14px' : '16px',
              boxShadow: '0 2px 6px rgba(52,199,89,0.3)',
              transition: 'transform 0.2s ease',
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            View Past Matches
          </Link>
        </div>
		
		

        <div style={{
          backgroundColor: '#fff',
          padding: isMobile ? '16px' : '20px',
          borderRadius: isMobile ? '6px' : '8px',
          border: '1px solid #e0e0e0',
          maxWidth: '500px',
          fontSize: isMobile ? '13px' : '14px',
          color: '#666'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '8px', color: '#333' }}>Quick Start Guide:</div>
          <div style={{ textAlign: 'left', lineHeight: '1.5' }}>
            <div>1. Go to Settings to configure your team</div>
            <div>2. Add players to your roster</div>
            <div>3. Set match details (opponent, location, etc.)</div>
            <div>4. Start logging your match!</div>
          </div>
        </div>
      </div>
    </div>
  );
}


  return (
    <div style={pageStyle}>
      {/* Modern Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 24px auto',
        padding: '0 20px'
      }}>
        {/* Title Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '800',
            color: '#1a1a1a',
            margin: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
            letterSpacing: '-0.5px'
          }}>
            Stat Book Logger
          </h1>
        </div>
        </div>
        


      {/* Collaborative Mode Warning Modal */}
      {showCollaborativeWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: isMobile ? '16px' : '0'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: isMobile ? '10px' : '12px',
            padding: isMobile ? '20px' : '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            maxHeight: isMobile ? '85vh' : 'auto',
            overflowY: isMobile ? 'auto' : 'visible'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: isMobile ? '16px' : '20px',
              gap: isMobile ? '8px' : '12px'
            }}>
              <div style={{
                fontSize: isMobile ? '24px' : '32px',
                color: '#ff9500'
              }}>
                ⚠️
              </div>
              <h3 style={{
                margin: 0,
                fontSize: isMobile ? '18px' : '20px',
                fontWeight: '600',
                color: '#333'
              }}>
                Collaborative Mode Warning
              </h3>
            </div>
            
            <div style={{
              marginBottom: isMobile ? '20px' : '24px',
              fontSize: isMobile ? '14px' : '16px',
              lineHeight: '1.5',
              color: '#555'
            }}>
              <p style={{ margin: '0 0 12px 0' }}>
                This match is currently in <strong>collaborative mode</strong> with multi-user logging enabled.
              </p>
              <p style={{ margin: '0 0 12px 0' }}>
                The regular Court Mode interface does <strong>not support collaborative logging</strong> and switching to it could lead to:
              </p>
              <ul style={{
                margin: '0 0 12px 0',
                paddingLeft: '20px',
                color: '#d32f2f',
                fontSize: isMobile ? '13px' : '14px'
              }}>
                <li>Out-of-sync data between users</li>
                <li>Lost stat entries from other collaborators</li>
                <li>Conflicting match states</li>
              </ul>
              <p style={{ margin: 0, fontWeight: '500' }}>
                Are you sure you want to proceed to Court Mode?
              </p>
            </div>
            
            <div style={{
              display: 'flex',
              gap: isMobile ? '8px' : '12px',
              justifyContent: 'flex-end',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => handleCollaborativeWarningChoice(false)}
                style={{
                  padding: isMobile ? '10px 18px' : '12px 24px',
                  borderRadius: '8px',
                  border: '2px solid #007AFF',
                  backgroundColor: '#ffffff',
                  color: '#007AFF',
                  fontWeight: '600',
                  fontSize: isMobile ? '13px' : '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flex: isMobile ? '1 1 auto' : '0 0 auto'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#f0f8ff';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#ffffff';
                }}
              >
                Stay in Express Mode
              </button>
              
              <button
                onClick={() => handleCollaborativeWarningChoice(true)}
                style={{
                  padding: isMobile ? '10px 18px' : '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#ff9500',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: isMobile ? '13px' : '14px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  flex: isMobile ? '1 1 auto' : '0 0 auto'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#e6851a';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#ff9500';
                }}
              >
                Proceed to Court Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Info Card - Collapsible Design */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? '0 12px 12px 12px' : '0 20px 20px 20px'
      }}>
      
      {scoreboardCollapsed ? (
        // COLLAPSED VIEW - Single row with essential info
        <div 
          onClick={toggleScoreboardCollapse}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: isMobile ? '12px' : '16px',
            padding: isMobile ? '12px 16px' : '16px 20px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
            border: '1px solid #f0f0f0',
            marginBottom: isMobile ? '12px' : '20px',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.borderColor = '#007AFF';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = '#f0f0f0';
          }}
        >
          {/* Score Display - Compact */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '12px' : '16px',
            flex: '1 1 auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '8px' : '12px'
            }}>
              <div style={{
                fontSize: isMobile ? '20px' : '28px',
                fontWeight: '800',
                color: '#1f2937',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {ourScore || 0}
              </div>
              <div style={{
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: '600',
                color: '#9ca3af',
                textTransform: 'uppercase'
              }}>
                vs
              </div>
              <div style={{
                fontSize: isMobile ? '20px' : '28px',
                fontWeight: '800',
                color: '#1f2937',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {opponentScore || 0}
              </div>
            </div>
            
            {/* Set Info */}
            <div style={{
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              paddingLeft: isMobile ? '8px' : '12px',
              borderLeft: '2px solid #e5e7eb'
            }}>
              Set {match.currentSet || 1}/{match.totalSets || 3}
            </div>
          </div>
          
          {/* Expand Icon with hint */}
          <div style={{
            fontSize: isMobile ? '16px' : '20px',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ 
              fontSize: isMobile ? '10px' : '11px', 
              fontWeight: '600', 
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {isMobile ? 'Tap' : (
                <>
                  Click or press 
                  <kbd style={{
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: '700',
                    color: '#374151',
                    fontFamily: 'monospace'
                  }}>C</kbd>
                </>
              )}
            </span>
            <span style={{ 
              transition: 'transform 0.3s ease',
              display: 'inline-block'
            }}>▼</span>
          </div>
        </div>
      ) : (
        // EXPANDED VIEW - Full scoreboard
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: isMobile ? '12px' : '16px',
          padding: isMobile ? '16px' : '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
          border: '1px solid #f0f0f0',
          marginBottom: isMobile ? '12px' : '20px',
          position: 'relative'
        }}>
          {/* Collapse Button */}
          <button
            onClick={toggleScoreboardCollapse}
            style={{
              position: 'absolute',
              top: isMobile ? '12px' : '16px',
              right: isMobile ? '12px' : '16px',
              background: 'transparent',
              border: '1px solid #e5e7eb',
              cursor: 'pointer',
              padding: isMobile ? '6px 10px' : '6px 12px',
              borderRadius: '8px',
              color: '#6b7280',
              fontSize: isMobile ? '10px' : '11px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '4px' : '6px',
              transition: 'all 0.2s ease',
              zIndex: 10,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = '#007AFF';
              e.currentTarget.style.color = '#007AFF';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#6b7280';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            }}
          >
            <span>Minimize</span>
            {!isMobile && (
              <kbd style={{
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '3px',
                padding: '1px 4px',
                fontSize: '9px',
                fontWeight: '700',
                fontFamily: 'monospace'
              }}>C</kbd>
            )}
            <span>▲</span>
          </button>
          
          {/* Top Row: Teams and Event */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: isMobile ? '12px' : '20px',
          marginBottom: isMobile ? '16px' : '24px',
          paddingBottom: isMobile ? '12px' : '20px',
          borderBottom: '1px solid #f0f0f0'
        }}>
          {/* Teams */}
          <div>
            <div style={{
              fontSize: isMobile ? '10px' : '11px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: isMobile ? '4px' : '8px'
            }}>
              Teams
            </div>
            <div style={{
              fontSize: isMobile ? '14px' : '16px',
              fontWeight: '600',
              color: '#1f2937',
              lineHeight: '1.4'
            }}>
              {match.teamName || 'Our Team'} vs {match.opponentName || 'Opponent'}
            </div>
          </div>

          {/* Event */}
          <div>
            <div style={{
              fontSize: isMobile ? '10px' : '11px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: isMobile ? '4px' : '8px'
            }}>
              Event
            </div>
            <div style={{
              fontSize: isMobile ? '14px' : '16px',
              fontWeight: '600',
              color: '#1f2937',
              lineHeight: '1.4'
            }}>
              {match.eventName || match.location || 'Volleyball Match'}
            </div>
          </div>
        </div>

        {/* Score Section */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: isMobile ? '20px' : '32px',
          flexWrap: 'wrap',
          marginBottom: isMobile ? '16px' : '24px'
        }}>
          {/* Our Team Score */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            minWidth: isMobile ? '100px' : '140px'
          }}>
            <div style={{
              fontSize: isMobile ? '11px' : '13px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {match.teamName || 'Us'}
            </div>
            
            {scoringEnabled && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? '8px' : '12px'
              }}>
                <button
                  onClick={() => handleDirectScoreAdjustment('our', 1)}
                  style={{
                    width: isMobile ? '32px' : '36px',
                    height: isMobile ? '32px' : '36px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#f0fdf4',
                    color: '#16a34a',
                    fontSize: isMobile ? '18px' : '20px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#dcfce7';
                    e.target.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = '#f0fdf4';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  +
                </button>
                
                <div style={{
                  fontSize: isMobile ? '36px' : '48px',
                  fontWeight: '800',
                  color: '#1f2937',
                  minWidth: isMobile ? '50px' : '60px',
                  textAlign: 'center',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {ourScore || 0}
                </div>
                
                <button
                  onClick={() => handleDirectScoreAdjustment('our', -1)}
                  disabled={ourScore === 0}
                  style={{
                    width: isMobile ? '32px' : '36px',
                    height: isMobile ? '32px' : '36px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: ourScore === 0 ? '#f5f5f5' : '#fef2f2',
                    color: ourScore === 0 ? '#9ca3af' : '#dc2626',
                    fontSize: isMobile ? '18px' : '20px',
                    fontWeight: '700',
                    cursor: ourScore === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseOver={(e) => {
                    if (ourScore > 0) {
                      e.target.style.backgroundColor = '#fee2e2';
                      e.target.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = ourScore === 0 ? '#f5f5f5' : '#fef2f2';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  −
                </button>
              </div>
            )}
            
            {!scoringEnabled && (
              <div style={{
                fontSize: isMobile ? '36px' : '48px',
                fontWeight: '800',
                color: '#9ca3af',
                minWidth: isMobile ? '50px' : '60px',
                textAlign: 'center'
              }}>
                −
              </div>
            )}
          </div>

          {/* VS Divider */}
          <div style={{
            fontSize: isMobile ? '14px' : '18px',
            fontWeight: '700',
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            vs
          </div>

          {/* Opponent Score */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            minWidth: isMobile ? '100px' : '140px'
          }}>
            <div style={{
              fontSize: isMobile ? '11px' : '13px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {match.opponentName || 'Them'}
            </div>
			
            
            {scoringEnabled && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? '8px' : '12px'
              }}>
                <button
                  onClick={() => handleDirectScoreAdjustment('opponent', 1)}
                  style={{
                    width: isMobile ? '32px' : '36px',
                    height: isMobile ? '32px' : '36px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#f0fdf4',
                    color: '#16a34a',
                    fontSize: isMobile ? '18px' : '20px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#dcfce7';
                    e.target.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = '#f0fdf4';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  +
                </button>
                
                <div style={{
                  fontSize: isMobile ? '36px' : '48px',
                  fontWeight: '800',
                  color: '#1f2937',
                  minWidth: isMobile ? '50px' : '60px',
                  textAlign: 'center',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {opponentScore || 0}
                </div>
                
                <button
                  onClick={() => handleDirectScoreAdjustment('opponent', -1)}
                  disabled={opponentScore === 0}
                  style={{
                    width: isMobile ? '32px' : '36px',
                    height: isMobile ? '32px' : '36px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: opponentScore === 0 ? '#f5f5f5' : '#fef2f2',
                    color: opponentScore === 0 ? '#9ca3af' : '#dc2626',
                    fontSize: isMobile ? '18px' : '20px',
                    fontWeight: '700',
                    cursor: opponentScore === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseOver={(e) => {
                    if (opponentScore > 0) {
                      e.target.style.backgroundColor = '#fee2e2';
                      e.target.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = opponentScore === 0 ? '#f5f5f5' : '#fef2f2';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  −
                </button>
              </div>
            )}
            
            {!scoringEnabled && (
              <div style={{
                fontSize: isMobile ? '36px' : '48px',
                fontWeight: '800',
                color: '#9ca3af',
                minWidth: isMobile ? '50px' : '60px',
                textAlign: 'center'
              }}>
                −
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Set Info and Server */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: isMobile ? '16px' : '24px',
          flexWrap: 'wrap',
          paddingTop: isMobile ? '12px' : '20px',
          borderTop: '1px solid #f0f0f0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              fontSize: isMobile ? '16px' : '20px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Set {match.currentSet || 1} of {match.totalSets || 3}
            </div>
          </div>
          

          

        </div>
        
        {/* Toggle switches - iOS style */}
        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '16px' : '24px', 
          flexWrap: 'wrap', 
          justifyContent: 'center',
          alignItems: 'center',
          padding: isMobile ? '12px 0' : '16px 0'
        }}>
          {/* Pass Grading Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            minWidth: isMobile ? '140px' : '160px'
          }}>
            <label style={{ 
              fontSize: isMobile ? '12px' : '13px', 
              fontWeight: '600', 
              color: '#1f2937',
              flex: '1',
              cursor: 'pointer',
              userSelect: 'none'
            }} onClick={() => setPassGradingEnabled(prev => !prev)}>
              Pass Grading
            </label>
            <div
              onClick={() => setPassGradingEnabled(prev => !prev)}
              style={{
                position: 'relative',
                width: isMobile ? '44px' : '51px',
                height: isMobile ? '26px' : '31px',
                backgroundColor: passGradingEnabled ? '#34C759' : '#E5E5EA',
                borderRadius: '100px',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: passGradingEnabled ? (isMobile ? '20px' : '23px') : '2px',
                width: isMobile ? '22px' : '27px',
                height: isMobile ? '22px' : '27px',
                backgroundColor: '#FFFFFF',
                borderRadius: '50%',
                transition: 'left 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }} />
            </div>
          </div>

          {/* Set Tracking Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            minWidth: isMobile ? '140px' : '160px'
          }}>
            <label style={{ 
              fontSize: isMobile ? '12px' : '13px', 
              fontWeight: '600', 
              color: '#1f2937',
              flex: '1',
              cursor: 'pointer',
              userSelect: 'none'
            }} onClick={() => setSetDistributionTrackingEnabled(prev => !prev)}>
              Set Tracking
            </label>
            <div
              onClick={() => setSetDistributionTrackingEnabled(prev => !prev)}
              style={{
                position: 'relative',
                width: isMobile ? '44px' : '51px',
                height: isMobile ? '26px' : '31px',
                backgroundColor: setDistributionTrackingEnabled ? '#34C759' : '#E5E5EA',
                borderRadius: '100px',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: setDistributionTrackingEnabled ? (isMobile ? '20px' : '23px') : '2px',
                width: isMobile ? '22px' : '27px',
                height: isMobile ? '22px' : '27px',
                backgroundColor: '#FFFFFF',
                borderRadius: '50%',
                transition: 'left 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }} />
            </div>
          </div>

          {/* Attack Tracking Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            minWidth: isMobile ? '140px' : '160px'
          }}>
            <label style={{ 
              fontSize: isMobile ? '12px' : '13px', 
              fontWeight: '600', 
              color: '#1f2937',
              flex: '1',
              cursor: 'pointer',
              userSelect: 'none'
            }} onClick={() => setAttackTypeTrackingEnabled(prev => !prev)}>
              Attack Tracking
            </label>
            <div
              onClick={() => setAttackTypeTrackingEnabled(prev => !prev)}
              style={{
                position: 'relative',
                width: isMobile ? '44px' : '51px',
                height: isMobile ? '26px' : '31px',
                backgroundColor: attackTypeTrackingEnabled ? '#34C759' : '#E5E5EA',
                borderRadius: '100px',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: attackTypeTrackingEnabled ? (isMobile ? '20px' : '23px') : '2px',
                width: isMobile ? '22px' : '27px',
                height: isMobile ? '22px' : '27px',
                backgroundColor: '#FFFFFF',
                borderRadius: '50%',
                transition: 'left 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }} />
            </div>
          </div>

          {/* Scoring Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            minWidth: isMobile ? '140px' : '160px'
          }}>
            <label style={{ 
              fontSize: isMobile ? '12px' : '13px', 
              fontWeight: '600', 
              color: '#1f2937',
              flex: '1',
              cursor: 'pointer',
              userSelect: 'none'
            }} onClick={() => setScoringEnabled(prev => !prev)}>
              Scoring
            </label>
            <div
              onClick={() => setScoringEnabled(prev => !prev)}
              style={{
                position: 'relative',
                width: isMobile ? '44px' : '51px',
                height: isMobile ? '26px' : '31px',
                backgroundColor: scoringEnabled ? '#34C759' : '#E5E5EA',
                borderRadius: '100px',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: scoringEnabled ? (isMobile ? '20px' : '23px') : '2px',
                width: isMobile ? '22px' : '27px',
                height: isMobile ? '22px' : '27px',
                backgroundColor: '#FFFFFF',
                borderRadius: '50%',
                transition: 'left 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }} />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{  display: 'flex', gap: isMobile ? '8px' : '12px', flexWrap: 'wrap', justifyContent: 'center', paddingTop: isMobile ? '8px' : '12px' }}>
  <button
    onClick={handleEndSetClick}
    style={{
      padding: isMobile ? '10px 14px' : '12px 18px',
      borderRadius: isMobile ? '10px' : '12px',
      border: 'none',
      backgroundColor: '#FF9500',
      color: '#fff',
      fontWeight: '700',
      fontSize: isMobile ? '13px' : '14px',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      minWidth: isMobile ? '100px' : '120px',
      textAlign: 'center'
    }}
  >
    End Set
  </button>


          
          <Link to="/stats" style={{
            ...navButtonStyle,
            padding: isMobile ? '8px 14px' : '10px 20px',
            fontSize: isMobile ? '13px' : '14px',
            minWidth: isMobile ? '100px' : '120px',
            textAlign: 'center',
            display: 'inline-block'
          }}>
            View Stats
          </Link>
          
          {saveMatchData && (
            <button
              onClick={() => saveMatchData(true)}
              style={{
                ...navButtonStyle,
                backgroundColor: '#28a745',
                padding: isMobile ? '8px 14px' : '10px 20px',
                fontSize: isMobile ? '13px' : '14px',
                minWidth: isMobile ? '100px' : '120px',
                textAlign: 'center'
              }}
            >
              Save Match
            </button>
          )}
        </div>
		{scoringEnabled && (
  <div style={{
    marginTop: isMobile ? '8px' : '10px',
    textAlign: 'center',
    fontSize: isMobile ? '11px' : '13px',
    fontWeight: '600',
    color: '#92400e',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: isMobile ? '10px' : '12px',
    padding: isMobile ? '8px 10px' : '10px 14px',
    maxWidth: '640px',
    marginLeft: 'auto',
    marginRight: 'auto'
  }}>
    {isMobile ? 'Manual scoring - use score buttons' : 'Scoring is fully manual in Stat Book mode. Use the score buttons to award every point.'}
  </div>
)}
      </div>
      )}
      </div>
	  
	  
      {/* Express Stat Logger */}
      <DndProvider backend={HTML5Backend}>
        <ExpressStatLogger
		  passGradingEnabled={passGradingEnabled}
		  setPassGradingEnabled={setPassGradingEnabled}
		  setDistributionTrackingEnabled={setDistributionTrackingEnabled}
		  setSetDistributionTrackingEnabled={setSetDistributionTrackingEnabled}
		  attackTypeTrackingEnabled={attackTypeTrackingEnabled}
		  setAttackTypeTrackingEnabled={setAttackTypeTrackingEnabled}
		  scoringEnabled={scoringEnabled}
          setScoringEnabled={setScoringEnabled}
          courtPlayers={courtPlayers}
          rotateCourtArray={rotateCourtArray}
          swapCourtPlayers={swapCourtPlayers}
          positionMapping={positionMapping}
          currentMatchId={currentMatchId}
          match={match}
		  setMatchSettings={setMatchSettings}
          actionLog={actionLog}
          setActionLog={setActionLog}
          onOurPoint={onOurPoint}
          onOpponentPoint={onOpponentPoint}
		  isMobile={isMobile}
		  isPortrait={isPortrait}
		  isTouch={isTouch}
          scoringEnabled={scoringEnabled}
          teamStats={teamStats}
          setTeamStats={setTeamStats}
          saveMatchData={saveMatchData}
		   deactivatedPlayers={deactivatedPlayers}
          setDeactivatedPlayers={setDeactivatedPlayers}
          // Games played props
          maybeCreditGamesPlayed={maybeCreditGamesPlayed}
          token={token}
		   scoreCooldownActive={scoreCooldownActive}
          scoreCooldownRemaining={scoreCooldownRemaining}
          // Libero tracking props
          allowedLiberoSubTarget={allowedLiberoSubTarget}
          setAllowedLiberoSubTarget={setAllowedLiberoSubTarget}
          slot5TargetId={slot5TargetId}
          setSlot5TargetId={setSlot5TargetId}
          benchPlayers={benchPlayers}
          setBenchPlayers={setBenchPlayers}
			substitutionLog={substitutionLog}
			setSubstitutionLog={setSubstitutionLog}
			setCourtPlayers={setCourtPlayers}
			autoJoinMatchIfPossible={autoJoinMatchIfPossible}
			isMatchOwner={isMatchOwner}
			ourScore={ourScore}
			opponentScore={opponentScore}
			setOurScore={setOurScore}  
			setOpponentScore={setOpponentScore}  
		  
        />
      </DndProvider>

      

    </div>
  );
};

export default ExpressStatPage;