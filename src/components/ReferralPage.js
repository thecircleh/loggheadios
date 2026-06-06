// components/ReferralPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import './ReferralPage.css';

const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const ReferralPage = () => {
  const { token } = useAuth();
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const [codeRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/referral/code`, { headers }),
        axios.get(`${API_URL}/api/referral/stats`, { headers })
      ]);
      
      setReferralCode(codeRes.data.referralCode);
      setReferralLink(codeRes.data.referralLink);
      setStats(statsRes.data.stats);
      setReferrals(statsRes.data.referrals);
    } catch (error) {
      console.error('Error fetching referral data:', error);
      setError(error.response?.data?.error || error.message || 'Failed to load referral data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyRewards = async () => {
    try {
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const res = await axios.post(`${API_URL}/api/referral/apply-reward`, {}, { headers });
      alert(`Applied ${res.data.daysApplied} days to your subscription!`);
      fetchReferralData();
    } catch (error) {
      alert(error.response?.data?.error || 'Error applying rewards');
    }
  };

  const freeAccessDaysRemaining = stats 
    ? stats.freeAccessDaysEarned - stats.freeAccessDaysUsed 
    : 0;

  if (loading) {
    return (
      <div className="referral-page">
        <div className="loading-spinner">Loading your referral info...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="referral-page">
        <div className="error-message">
          <h2>⚠️ Error</h2>
          <p>{error}</p>
          <button onClick={fetchReferralData} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="referral-page">
      <div className="page-header">
	     <svg 
      width="64" 
      height="64" 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ marginBottom: '1rem' }}
    >
      {/* Left person */}
      <circle cx="16" cy="20" r="8" fill="#667eea" opacity="0.8"/>
      <path 
        d="M8 36C8 31.5817 11.5817 28 16 28C20.4183 28 24 31.5817 24 36V44H8V36Z" 
        fill="#667eea" 
        opacity="0.8"
      />
      
      {/* Center person (referrer - larger) */}
      <circle cx="32" cy="16" r="10" fill="#667eea"/>
      <path 
        d="M20 36C20 30.4772 24.4772 26 30 26H34C39.5228 26 44 30.4772 44 36V48H20V36Z" 
        fill="#667eea"
      />
      
      {/* Right person */}
      <circle cx="48" cy="20" r="8" fill="#667eea" opacity="0.8"/>
      <path 
        d="M40 36C40 31.5817 43.5817 28 48 28C52.4183 28 56 31.5817 56 36V44H40V36Z" 
        fill="#667eea" 
        opacity="0.8"
      />
      
      {/* Connection lines */}
      <line x1="24" y1="22" x2="42" y2="18" stroke="#667eea" strokeWidth="2" strokeLinecap="round"/>
      <line x1="42" y1="22" x2="24" y2="18" stroke="#667eea" strokeWidth="2" strokeLinecap="round"/>
      
      {/* Gift/reward icon */}
      <circle cx="32" cy="54" r="6" fill="#FFD700" opacity="0.9"/>
      <path 
        d="M29 54L32 51L35 54L32 57L29 54Z" 
        fill="#FFA500"
      />
    </svg>
        <h1>Referral Program</h1>
        <p className="subtitle">Share Loggerhead and earn free access to Coaches' Corner!</p>
      </div>

      {/* How It Works Section */}
      <div className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Share Your Link</h3>
            <p>Copy your unique referral link below and share it with coaches and players</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>They Subscribe</h3>
            <p>When someone registers using your link and subscribes, you earn up to a month free!</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Enjoy Free Access, forever?</h3>
            <p>Infinitely apply your earned days to extend your subscription for free</p>
          </div>
        </div>
      </div>

      {/* Rewards Summary */}
      <div className="rewards-summary">
        <h2>Your Rewards</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <h3>{stats?.totalReferrals || 0}</h3>
            <p>Total Referrals</p>
          </div>
          <div className="stat-card highlight">
            <div className="stat-icon">🎯</div>
            <h3>{freeAccessDaysRemaining}</h3>
            <p>Free Days Available</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏰</div>
            <h3>{Math.floor(freeAccessDaysRemaining / 365)}</h3>
            <p>Years Earned</p>
          </div>
        </div>
        
        {freeAccessDaysRemaining > 0 && (
          <button onClick={applyRewards} className="apply-btn">
            ✨ Apply {freeAccessDaysRemaining} Days to Subscription
          </button>
        )}
      </div>

      {/* Referral Link */}
      <div className="referral-link-section">
        <h2>Your Unique Referral Link</h2>
        <p className="section-description">
          Share this link with anyone interested in Loggerhead. When they sign up and subscribe, you'll automatically earn rewards!
        </p>
        
        <div className="referral-code-display">
          <label>Your Referral Code:</label>
          <div className="code">{referralCode}</div>
        </div>
        
        <div className="link-container">
          <input 
            type="text" 
            value={referralLink} 
            readOnly 
            className="referral-input"
            onClick={(e) => e.target.select()}
          />
          <button onClick={copyToClipboard} className="copy-btn">
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
        </div>
        
        <div className="rewards-info">
          <h3>💰 Earn Free Access:</h3>
          <ul>
            <li>
              <span className="reward-icon">🏐</span>
              <strong>Coach subscribes to Coaches Corner</strong> 
              <span className="reward-amount">→ 7 days of full Coaches' Corner free</span>
            </li>
            <li>
              <span className="reward-icon">📊</span>
              <strong>Anyone subscribes to Monthly/Six Month/Yearly</strong> 
              <span className="reward-amount">→ 30 days of full Coaches' Corner free</span>
            </li>
            <li>
              <span className="reward-icon">♾️</span>
              <strong>Unlimited stacking</strong> 
              <span className="reward-amount">→ Earn YEARS of free Coaches' Corner service!</span>
            </li>
          </ul>
          
          <div className="sharing-tips">
            <h4>💡 Sharing Tips:</h4>
            <ul>
              <li>Share with your volleyball team's coaching staff</li>
              <li>Post in volleyball Facebook groups or forums</li>
              <li>Send to tournament directors and club administrators</li>
              <li>Add to your email signature</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Referral History */}
      <div className="referral-history">
        <h2>Your Referrals ({referrals.length})</h2>
        {referrals.length === 0 ? (
          <div className="empty-state">
            <p>📭 No referrals yet.</p>
            <p>Share your link above to start earning free access!</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Type</th>
                  <th>Reward</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((ref, idx) => (
                  <tr key={idx}>
                    <td>{ref.email}</td>
                    <td>
                      <span className={`badge ${ref.type}`}>
                        {ref.type === 'coaches_corner' 
                          ? '🏐 Coaches Corner' 
                          : '📊 Subscription'}
                      </span>
                    </td>
                    <td className="reward-cell">+{ref.rewardDays} days</td>
                    <td>{new Date(ref.signupDate).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferralPage;