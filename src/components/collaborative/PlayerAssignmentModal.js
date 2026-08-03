import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useCollaborative } from './CollaborativeProvider';
import { useAuth } from '../AuthContext';

const PlayerAssignmentModal = ({ 
  isOpen, 
  onClose, 
  courtPlayers = [], 
  benchPlayers = [],
  matchId, 
  teamName 
}) => {
  const { activeSessions, playerAssignments, assignPlayer, currentUser, loadAssignmentsFromBackend } = useCollaborative();
  const [assignments, setAssignments] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [fetchingMembers, setFetchingMembers] = useState(false);
  const { token } = useAuth();

  const getApiUrl = () => {
    const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
      return `http://${h}:3000`;
    }
    return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
  };

  const API_URL = getApiUrl();

  // Fetch team members when modal opens
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!isOpen || !teamName) return;
      
      console.log('🔍 Fetching team members for:', teamName);
      setFetchingMembers(true);
      
      try {
        const url = `${getApiUrl()}/api/users/teams/${encodeURIComponent(teamName)}/members`;
        console.log('📡 API URL:', url);
        
        const response = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          withCredentials: true
        });
        console.log('✅ Team members response:', response.data);
        console.log('📊 Found', response.data?.length || 0, 'team members');
        
        setTeamMembers(response.data || []);
      } catch (error) {
        console.error('❌ Error fetching team members:', error);
        console.error('📋 Error details:', {
          status: error.response?.status,
          data: error.response?.data,
          teamName: teamName
        });
        setTeamMembers([]);
      } finally {
        setFetchingMembers(false);
      }
    };

    fetchTeamMembers();
  }, [isOpen, teamName, token]);

  // Online user IDs based only on userId (no session complexity)
  const onlineUserIds = useMemo(() => {
    if (!activeSessions || !Array.isArray(activeSessions)) return new Set();
    
    const online = activeSessions.filter(s => s?.isOnline && s?.userId);
    console.log('👥 Active online users:', online.map(s => ({ userId: s.userId, username: s.username })));
    return new Set(online.map(s => s.userId));
  }, [activeSessions]);

  // Get all team members (both online and offline) - now from state
  const allTeamMembers = useMemo(() => {
    if (!teamMembers || !Array.isArray(teamMembers)) return [];
    
    // Team members already come with isOnline from the API, but we can also cross-check with activeSessions
    return teamMembers.map(member => ({
      ...member,
      isOnline: member.isOnline || onlineUserIds.has(member.userId)
    })).sort((a, b) => {
      if (a.isOnline !== b.isOnline) {
        return b.isOnline - a.isOnline; // Online users first
      }
      return (a.username || '').localeCompare(b.username || '');
    });
  }, [teamMembers, onlineUserIds]);

  // Fixed: Deduplicate players by _id to prevent duplicates
  const allPlayers = useMemo(() => {
    // Combine and filter players
    const combined = [
      ...(courtPlayers?.filter(p => p && p._id && p.name !== "?") || []),
      ...(benchPlayers?.filter(p => p && p._id) || [])
    ];
    
    // Deduplicate by _id
    const uniquePlayers = combined.reduce((acc, player) => {
      // Only add if we haven't seen this _id before
      if (!acc.some(existing => existing._id === player._id)) {
        acc.push(player);
      }
      return acc;
    }, []);
    
    return uniquePlayers;
  }, [courtPlayers, benchPlayers]);

  // NEW: Backend assignment function that always persists
 const saveAssignmentToBackend = useCallback(async (playerId, playerName, assignToUserId, assignToUsername) => {
  try {
    console.log(`💾 Saving assignment to backend: ${playerName} -> ${assignToUsername}`);
    
    const response = await axios.post(`${API_URL}/api/matches/${matchId}/assign-player`, {
      playerId,
      playerName,
      assignedToUserId: assignToUserId,
      assignedToUsername: assignToUsername,
      forceReassignment: true // 🔥 NEW: Allow reassignments from modal
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      withCredentials: true
    });

    console.log('✅ Assignment saved to backend:', response.data);
    
    // 🔥 NEW: Show reassignment message if applicable
    if (response.data.wasReassignment) {
      console.log(`🔄 Player was reassigned: ${response.data.message}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to save assignment to backend:', error);
    throw error;
  }
}, [API_URL, matchId, token]);

  // NEW: Backend unassignment function
  const removeAssignmentFromBackend = useCallback(async (playerId) => {
    try {
      console.log(`🗑️ Removing assignment from backend for player: ${playerId}`);
      
      await axios.delete(`${API_URL}/api/matches/${matchId}/assignments/${playerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        withCredentials: true
      });

      console.log('✅ Assignment removed from backend');
    } catch (error) {
      console.error('❌ Failed to remove assignment from backend:', error);
      throw error;
    }
  }, [API_URL, matchId, token]);

  // Function to send email notification for offline assignments
 const sendAssignmentEmail = useCallback(async (assignmentData) => {
  try {
    const response = await fetch(`${API_URL}/api/users/assignment-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        recipientEmail: assignmentData.userEmail,
        recipientName: assignmentData.username,
        assignedByName: currentUser?.username || 'A teammate',
        players: assignmentData.players, // 🔥 Now sending array of players
        matchId: matchId,
        matchUrl: `https://www.loggerhead.app/express/match/${matchId}`
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send email notification: ${response.status} ${response.statusText}`);
    }
    
    console.log(`📧 Email sent successfully to ${assignmentData.userEmail}`);
  } catch (error) {
    console.error('Error sending assignment email:', error);
    // Don't throw here - we don't want email failures to prevent assignments
  }
}, [matchId, currentUser, API_URL, token]);

  // Memoize the assignment handler to prevent re-renders
  const handleAssignment = useCallback((playerId, userId, username, userEmail) => {
    setAssignments(prev => ({
      ...prev,
      [playerId]: { userId, username, userEmail }
    }));
  }, []);

  // ENHANCED: Save function that ALWAYS persists to backend + uses socket for real-time updates
 const saveAssignments = useCallback(async () => {
  setIsLoading(true);
  try {
    const emailPromises = [];
    const assignmentPromises = [];
    
    // Group assignments by user for email consolidation
    const userAssignments = new Map();
    
    // Process each assignment
    for (const [playerId, assignment] of Object.entries(assignments)) {
      const player = allPlayers.find(p => p._id === playerId);
      
      if (player && assignment?.userId) {
        console.log(`👤 Processing assignment: ${player.name} -> ${assignment.username} (ID: ${assignment.userId})`);
        
        // ALWAYS save to backend first (this makes it persistent)
        const backendPromise = saveAssignmentToBackend(
          playerId, 
          player.name, 
          assignment.userId, 
          assignment.username
        ).then(() => {
          console.log(`✅ Backend assignment saved: ${player.name} -> ${assignment.username}`);
          return { success: true, playerId, assignment, player, method: 'backend' };
        }).catch((error) => {
          console.error(`❌ Backend assignment failed for ${player.name}:`, error);
          return { success: false, playerId, assignment, player, error, method: 'backend' };
        });

        assignmentPromises.push(backendPromise);

        // ALSO try socket assignment for real-time updates (for online users)
        const isUserOnline = onlineUserIds.has(assignment.userId);
        if (isUserOnline) {
          console.log(`📡 Attempting real-time socket assignment for online user ${assignment.username}`);
          
          // Socket assignment is supplementary - don't wait for it
          setTimeout(() => {
            try {
              assignPlayer(
                playerId, 
                player.name, 
                assignment.userId, 
                assignment.username
              );
            } catch (socketError) {
              console.warn(`⚠️ Socket assignment failed but backend succeeded:`, socketError);
            }
          }, 100);
        }

        // 🔥 NEW: Group assignments by user for email consolidation
        const teamMember = allTeamMembers.find(m => m.userId === assignment.userId);
        if (!isUserOnline && assignment.userEmail && teamMember?.hasEmailConsent) {
          console.log(`📧 Grouping assignment for ${assignment.userEmail}: player ${player.name}`);
          
          if (!userAssignments.has(assignment.userId)) {
            userAssignments.set(assignment.userId, {
              userEmail: assignment.userEmail,
              username: assignment.username,
              players: []
            });
          }
          
          userAssignments.get(assignment.userId).players.push({
            playerName: player.name,
            playerNumber: player.number
          });
        } else if (!isUserOnline && assignment.userEmail && !teamMember?.hasEmailConsent) {
          console.log(`⚠️ Not sending email to ${assignment.userEmail} - no email consent`);
        }
      } else if (player && !assignment?.userId) {
        // Handle unassignment (remove from backend)
        console.log(`🗑️ Unassigning player: ${player.name}`);
        
        const unassignPromise = removeAssignmentFromBackend(playerId)
          .then(() => {
            console.log(`✅ Player ${player.name} unassigned from backend`);
            return { success: true, playerId, player, method: 'unassign' };
          }).catch((error) => {
            console.error(`❌ Failed to unassign ${player.name}:`, error);
            return { success: false, playerId, player, error, method: 'unassign' };
          });

        assignmentPromises.push(unassignPromise);
      }
    }
    
    // 🔥 NEW: Create one email per user (instead of one per assignment)
    if (userAssignments.size > 0) {
      console.log(`📤 Sending ${userAssignments.size} consolidated assignment emails`);
      
      for (const [userId, userData] of userAssignments) {
        emailPromises.push(
          sendAssignmentEmail({
            userEmail: userData.userEmail,
            username: userData.username,
            players: userData.players // 🔥 Now sending array of players
          })
        );
      }
    }
    
    // Wait for all backend assignments to complete
    const assignmentResults = await Promise.allSettled(assignmentPromises);
    
    // Process results
    let successCount = 0;
    let errorCount = 0;
    
    assignmentResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { success, playerId, player, error, method } = result.value;
        
        if (success) {
          successCount++;
          console.log(`✅ ${method} assignment successful for ${player?.name}`);
        } else {
          errorCount++;
          console.error(`❌ ${method} assignment failed for ${player?.name}: ${error?.message || 'Unknown error'}`);
        }
      } else {
        errorCount++;
        console.error('❌ Assignment promise rejected:', result.reason);
      }
    });
    
    // Send all emails concurrently (don't block on this)
    if (emailPromises.length > 0) {
      console.log(`📤 Sending ${emailPromises.length} consolidated assignment emails`);
      Promise.allSettled(emailPromises).then((emailResults) => {
        emailResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            console.log(`✅ Email ${index + 1} sent successfully`);
          } else {
            console.error(`❌ Email ${index + 1} failed:`, result.reason);
          }
        });
      });
    }

    // Refresh assignments from backend to ensure UI is in sync
    if (loadAssignmentsFromBackend) {
      console.log('🔄 Refreshing assignments from backend...');
      await loadAssignmentsFromBackend();
    }
    
    // Show success/error summary
    if (successCount > 0) {
      console.log(`✅ Successfully processed ${successCount} assignments`);
    }
    if (errorCount > 0) {
      console.error(`❌ ${errorCount} assignments failed`);
      alert(`${errorCount} assignments failed. Please check the console and try again.`);
    }
    
    // Clear assignments and close modal only if all succeeded
    if (errorCount === 0) {
      setAssignments({});
      onClose();
    }

  } catch (error) {
    console.error('❌ Critical error saving assignments:', error);
    alert('There was a critical error saving assignments. Please try again.');
  } finally {
    setIsLoading(false);
  }
}, [
  assignments, 
  allPlayers, 
  saveAssignmentToBackend, 
  removeAssignmentFromBackend,
  assignPlayer, 
  onClose, 
  onlineUserIds, 
  sendAssignmentEmail, 
  allTeamMembers,
  loadAssignmentsFromBackend
]);

  if (!isOpen) return null;

  return (
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
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '20px',
        maxWidth: '600px',
        width: '95%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
          Assign Players to Trackers
        </h3>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
            {fetchingMembers ? (
              <>
                Loading team members... 
                <div style={{ 
                  display: 'inline-block', 
                  marginLeft: '10px',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #ddd',
                  borderTop: '2px solid #007AFF',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              </>
            ) : (
                 <>
      Team Members ({allTeamMembers.length}):
      <span style={{ marginLeft: '10px', color: '#28a745' }}>
        🟢 {allTeamMembers.filter(m => m.isOnline).length} online
      </span>
      <span style={{ marginLeft: '10px', color: '#007AFF' }}>
        🔵 {allTeamMembers.filter(m => m.isInMatch).length} in matches
      </span>
      <span style={{ marginLeft: '10px', color: '#ffc107' }}>
        🟡 {allTeamMembers.filter(m => m.isOnline && !m.isInMatch).length} available
      </span>
      <span style={{ marginLeft: '10px', color: '#007AFF' }}>
        📧 {allTeamMembers.filter(m => m.hasEmailConsent).length} can receive emails
      </span>
    </>
        )}
</div>
          <div style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            marginBottom: '20px'
          }}>
            {fetchingMembers ? (
              <div style={{ color: '#666', fontStyle: 'italic' }}>Loading...</div>
            ) : allTeamMembers.length === 0 ? (
              <div style={{ 
                color: '#dc3545', 
                fontStyle: 'italic',
                padding: '10px',
                backgroundColor: '#f8d7da',
                borderRadius: '4px',
                border: '1px solid #dc3545'
              }}>
                No team members found for "{teamName}". Make sure users have joined this team.
              </div>
            ) : (
             allTeamMembers.map(member => (
                <div
                  key={`user-${member.userId}`}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: member.isOnline ? '#e8f5e8' : '#f8f9fa',
                    borderRadius: '20px',
                    fontSize: '12px',
                    border: member.isOnline ? '1px solid #28a745' : '1px solid #6c757d',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {/* Enhanced status indicators */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {/* Global online status */}
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: member.isOnline ? '#28a745' : '#6c757d'
                      }}
                      title={member.isOnline ? 'Online in system' : 'Offline'}
                    />
                    {/* Match participation status */}
                    {member.isOnline && (
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: member.isInMatch ? '#007AFF' : '#ffc107',
                          marginLeft: '2px'
                        }}
                        title={member.isInMatch ? 'Active in a match' : 'Online but not in match'}
                      />
                    )}
                  </div>
                  
                  {member.username || 'Unknown User'}
                  {member.hasEmailConsent && (
                    <span style={{ fontSize: '10px', color: '#007AFF' }}>📧</span>
                  )}
                  
                  {/* Status text for clarity */}
                  <span style={{ 
                    fontSize: '10px', 
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    {member.isOnline ? (
                      member.isInMatch ? '(in match)' : '(available)'
                    ) : '(offline)'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>
            Player Assignments:
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '15px', 
            fontStyle: 'italic',
            padding: '8px 12px',
            backgroundColor: '#e7f3ff',
            borderRadius: '6px',
            border: '1px solid #007AFF'
          }}>
            ✨ Assignments are now persistent! All assignments are saved to the database and will be visible to all team members.
            Offline users with email consent (📧) will receive email notifications.
          </div>
          
          {allPlayers.map(player => {
            // Find current assignment by userId only (no session dependency)
            const currentAssignment = playerAssignments?.find(a => 
              a.playerId === player._id && a.isActive
            );
            
            const selectedUserId = assignments[player._id]?.userId || 
                                 currentAssignment?.assignedTo?.userId || '';

            return (
              <div
                key={`player-${player._id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px',
                  borderBottom: '1px solid #eee',
                  minHeight: '50px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>
                    {player.name} (#{player.number})
                  </div>
                  {currentAssignment && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Currently: {currentAssignment.assignedTo?.username || 'Unknown'}
                    </div>
                  )}
                </div>

                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    const userId = e.target.value;
                    const member = allTeamMembers.find(m => m.userId === userId);
                    if (userId === '') {
                      // Handle unassignment
                      handleAssignment(player._id, '', '', '');
                    } else if (member) {
                      console.log(`🎯 Selecting ${member.username} (${userId}) for player ${player.name}`);
                      handleAssignment(player._id, userId, member.username, member.email);
                    }
                  }}
                  disabled={fetchingMembers || allTeamMembers.length === 0}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '12px',
                    minWidth: '180px',
                    opacity: fetchingMembers || allTeamMembers.length === 0 ? 0.6 : 1,
                    cursor: fetchingMembers || allTeamMembers.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">
                    {fetchingMembers ? 'Loading...' : allTeamMembers.length === 0 ? 'No members available' : 'Unassigned'}
                  </option>
                  {!fetchingMembers && allTeamMembers.map(member => (
                    <option 
                      key={`option-${member.userId}`} 
                      value={member.userId}
                    >
                      {member.isOnline ? '🟢' : '🟡'} {member.username || 'Unknown User'}
                      {member.hasEmailConsent ? ' 📧' : ''}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          borderTop: '1px solid #eee',
          paddingTop: '15px'
        }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={saveAssignments}
            disabled={isLoading || fetchingMembers}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLoading || fetchingMembers ? '#ccc' : '#007AFF',
              color: '#fff',
              cursor: isLoading || fetchingMembers ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isLoading && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #fff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {isLoading ? 'Saving...' : 'Save Assignments'}
          </button>
        </div>
      </div>
      
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export { PlayerAssignmentModal };