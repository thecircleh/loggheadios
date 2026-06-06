import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';

const GlobalTeamStatus = ({ teamName, showInModal = false }) => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    const fetchTeamStatus = async () => {
      if (!teamName) return;
      
      setLoading(true);
      try {
        const response = await axios.get(`/api/users/teams/${encodeURIComponent(teamName)}/members`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        });
        setTeamMembers(response.data || []);
      } catch (error) {
        console.error('Failed to fetch team status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchTeamStatus, 30000);
    return () => clearInterval(interval);
  }, [teamName, token]);

  if (!teamName || loading) return null;

  const onlineCount = teamMembers.filter(m => m.isOnline).length;
  const inMatchCount = teamMembers.filter(m => m.isInMatch).length;
  const availableCount = teamMembers.filter(m => m.isOnline && !m.isInMatch).length;

  return (
    <div style={{
      padding: '8px 12px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      fontSize: '12px',
      color: '#666',
      border: '1px solid #e9ecef'
    }}>
      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
        Team {teamName} Status:
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <span>🟢 {onlineCount} online</span>
        <span>🔵 {inMatchCount} in matches</span>
        <span>🟡 {availableCount} available</span>
      </div>
    </div>
  );
};

export { GlobalTeamStatus };