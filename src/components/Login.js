import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import "./login.css";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const { setToken } = useAuth();

  useEffect(() => {
    const onKey = (e) => { if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock')); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
    };
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  
  const [teamLogos, setTeamLogos] = useState([]);

  useEffect(() => {
    let isMounted = true;

    fetch("/teams/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((files) => {
        if (!isMounted) return;
        const cleaned = Array.isArray(files) ? files.filter(Boolean) : [];
        setTeamLogos(cleaned);
      })
      .catch(() => {
        // if manifest missing, just show nothing (safe default)
        if (!isMounted) return;
        setTeamLogos([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);
  
  // Handle success message from password reset
  const [successMessage, setSuccessMessage] = useState(location.state?.message || '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage(''); // Clear any existing success message

    try {
      const response = await axios.post(`${API_URL}/auth/login`, { email, password }, {
        withCredentials: true
      });

      if (!response.data.token) throw new Error('No token received from server.');
      await setToken(response.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="login-page">  
      <div className="login-container">
        <div className="login-box">
          <img
            src="/web-app-manifest-512x512.png"
            alt="Loggerhead Logo"
            className="login-logo"
          />   
          <h2 className="login-header">Loggerhead Login</h2>
          
          {/* Success message from password reset */}
          {successMessage && <p className="login-success">{successMessage}</p>}
          
          {error && <p className="login-error">{error}</p>}

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', boxSizing: 'border-box', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '0',
                  color: '#888', fontSize: '1.1rem', lineHeight: 1,
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {capsLock && (
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#e6a817' }}>
                ⚠️ Caps Lock is on
              </p>
            )}

            <button type="submit" className="primary-button">Login</button>
          </form>

          {/* Forgot Password Link */}
          <div className="forgot-password-link">
            <Link to="/forgot-password">Forgot your password?</Link>
          </div>

          <p className="login-footer">
            Don't have an account? <Link to="/register">Register here</Link>
          </p>
		  
		            {teamLogos.length > 0 && (
            <div className="trusted-clubs">
              <div className="trusted-clubs-title">
                The clubs that are trusting Loggerhead for their stats in 2026
              </div>

              <div className="logo-marquee" aria-label="Trusted clubs">
                <div className="logo-track">
                  {[...teamLogos, ...teamLogos].map((file, idx) => (
                    <div className="logo-item" key={`${file}-${idx}`}>
                      <img
                        src={`/teams/${file}`}
                        alt=""
                        loading="lazy"
                        draggable="false"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>	
  );
};

export default Login;