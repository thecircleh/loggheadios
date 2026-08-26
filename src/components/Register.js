
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './login.css'; // reuse shared styles


const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const { setToken } = useAuth();

  useEffect(() => {
    const onKey = (e) => setCapsLock(e.getModifierState('CapsLock'));
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
    };
  }, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref'); 
  
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
        if (!isMounted) return;
        setTeamLogos([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    console.log("Submitting to:", API_URL);
    e.preventDefault();
    setError('');
    console.log("Submitting to:", API_URL);
    
    try {
      console.log("Registering to:", API_URL);
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        ...(referralCode && { referralCode }) // Include referral code if present
      });

      await setToken(response.data.token);
      navigate('/profile');
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed';
      if (err.response?.status === 403) {
        setError("Profile creation failed.  Please try again.");
      } else {
        setError(message);
      }
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
          <h2 className="login-header">Create Account</h2>
     <p className="login-subtext">
  Loggerhead is a FREE live volleyball stat tracker designed for parents, coaches, and players. 
  Keep in mind  we invite user feedback for anything that works great or seems off.  
  Please submit that feedback by finding us on{" "}
  <a href="https://www.facebook.com/people/Loggerheadapp/61575107152681/" target="_blank" rel="noopener noreferrer">
    Facebook
  </a>{" "} and sending us a DM!
  – Happy Logging.
</p>

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

            <button type="submit" className="primary-button">Register</button>
			
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
          </form>
        </div>
      </div>

    </div>
  );
};

export default Register;