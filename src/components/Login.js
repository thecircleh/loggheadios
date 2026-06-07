import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import "./login.css";

const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { setToken } = useAuth();
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
          <meta name="viewport" content="width=device-width, initial-scale=1" />
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
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

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