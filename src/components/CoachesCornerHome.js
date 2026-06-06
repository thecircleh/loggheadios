import React from 'react';
import { useNavigate } from 'react-router-dom';
import './CoachesCornerHome.css';
 
const CoachesCornerHome = () => {
  const navigate = useNavigate();
 
  const features = [
    {
      title: '⚡ My Drills',
      description: 'Generate drills tailored to your specifications and access your saved practice drills.',
      path: '/coaches-corner/drills',
      icon: '🤖',
      color: '#4CAF50'
    },
    {
      title: '🏐 Practice Assist',
      description: 'Plan your drills, take attendance, review stats +  making your practices more organized and valuable',
      path: '/coaches-corner/practice',
      icon: '📚',
      color: '#2196F3'
    },
    {
      title: '🎁 Referrals',
      description: 'Invite other coaches and parents to earn rewards for growing the community, up to unlimited access to Coaches Corner',
      path: '/coaches-corner/referrals',
      icon: '💝',
      color: '#FF9800'
    }
  ];
 
  return (
    <div className="coaches-corner-home">
      <div className="hero-section">
        <h1 className="hero-title">🏆 Coaches Corner</h1>
        <p className="hero-subtitle">
          Your complete toolkit for volleyball coaching excellence
        </p>
      </div>
 
      <div className="features-grid">
        {features.map((feature, index) => (
          <div 
            key={index}
            className="feature-card"
            onClick={() => navigate(feature.path)}
            style={{ borderTopColor: feature.color }}
          >
            <div className="feature-icon" style={{ backgroundColor: `${feature.color}15` }}>
              {feature.icon}
            </div>
            <h2 className="feature-title">{feature.title}</h2>
            <p className="feature-description">{feature.description}</p>
            <button 
              className="feature-button"
              style={{ backgroundColor: feature.color }}
            >
              Get Started →
            </button>
          </div>
        ))}
      </div>
 
      <div className="info-section">
        <h3>What is Coaches Corner?</h3>
        <p>
          Coaches Corner is your premium suite of tools designed to make volleyball 
          coaching easier and more effective. From AI-powered practice planning to 
          drill libraries and community rewards, we've got everything you need to 
          elevate your coaching game.
        </p>
      </div>
    </div>
  );
};
 
export default CoachesCornerHome;