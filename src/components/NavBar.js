import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import '../components/Navbar.css';

const NavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Helper function to check if a route is active
  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Don't show navbar on auth pages
  if (['/login', '/register', '/forgot-password', '/reset-password'].some(path => location.pathname.startsWith(path))) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsMenuOpen(false);
  };

  if (!token) {
    return (
      <nav className="navbar navbar-guest">
        <div className="navbar-container">
          <Link to="/" className="navbar-brand">
            <span className="navbar-logo">🏐</span>
            <span className="brand-text">Loggerhead</span>
          </Link>
          <div className="navbar-actions">
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/register" className="nav-link nav-link-primary">Sign Up</Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="navbar navbar-authenticated">
      <div className="navbar-container">
        {/* Brand/Logo */}
        <Link to="/" className="navbar-brand">
          <span className="navbar-logo">🏐</span>
          <span className="brand-text">Loggerhead</span>
        </Link>

        {/* Hamburger menu for mobile */}
        <button 
          className={`hamburger ${isMenuOpen ? 'active' : ''}`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Main Navigation */}
        <div className={`navbar-menu ${isMenuOpen ? 'active' : ''}`}>
          <div className="navbar-nav">
            {/* Home - Profile */}
            <Link 
              to="/" 
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Home - User Profile"
            >
              Home
            </Link>

            {/* Match Tracking - Coach Court */}
            <Link 
              to="/match-tracking" 
              className={`nav-link ${isActive('/match-tracking') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Match Tracking"
            >
              Match Tracking
            </Link>

            {/* Stat Book - Express Logging */}
            <Link 
              to="/stat-book" 
              className={`nav-link ${isActive('/stat-book') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Stat Book"
            >
              Stat Book
            </Link>

            {/* Classic - Legacy Court */}
            <Link 
              to="/classic" 
              className={`nav-link ${isActive('/classic') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Classic - Legacy Volleyball Court"
            >
              Classic
            </Link>

            {/* Coaches Corner */}
            <Link 
              to="/coaches-corner" 
              className={`nav-link ${isActive('/coaches-corner') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Coaches Corner - Premium Features"
            >
              Coaches' Corner
            </Link>

            {/* Player Stats */}
            <Link 
              to="/stats" 
              className={`nav-link ${isActive('/stats') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Player Statistics"
            >
              Player Stats
            </Link>

            {/* Rosters & Matches */}
            <Link 
              to="/settings" 
              className={`nav-link ${isActive('/settings') ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
              title="Rosters & Matches Management"
            >
              Rosters & Matches
            </Link>
          </div>

          {/* User Menu */}
          <div className="navbar-user">
            <div className="user-info">
              {user?.email && <span className="user-email">{user.email}</span>}
            </div>
            <button 
              className="nav-link logout-btn"
              onClick={handleLogout}
              title="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;