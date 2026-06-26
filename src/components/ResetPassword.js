import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import "./login.css";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith("10.")) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isValidToken, setIsValidToken] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();
  const { token } = useParams();

  useEffect(() => {
    const validateResetToken = async () => {
      if (!token) {
        setIsValidToken(false);
        setError('Invalid or missing reset token.');
        return;
      }

      try {
        await axios.get(`${API_URL}/auth/validate-reset-token/${token}`, {
          timeout: 10000
        });
        setIsValidToken(true);
      } catch (err) {
        setIsValidToken(false);
        if (err.response?.status === 400) {
          setError('This password reset link has expired or is invalid.');
        } else {
          setError('Unable to validate reset token. Please try again.');
        }
      }
    };

    validateResetToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Password is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        newPassword: password
      }, {
        timeout: 10000
      });

      setIsSuccess(true);
      
      setTimeout(() => {
        navigate('/login', { 
          state: { message: 'Password reset successful. Please log in with your new password.' }
        });
      }, 3000);

    } catch (err) {
      if (err.response?.status === 400) {
        setError('This password reset link has expired or is invalid.');
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-box">
            <div className="loading-container">
              <span className="loading-spinner"></span>
              <p>Validating reset link...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-box">
            <img
              src="/web-app-manifest-512x512.png"
              alt="Loggerhead Logo"
              className="login-logo"
            />
            <h2 className="login-header">Invalid Reset Link</h2>
            <div className="login-error" role="alert">
              {error}
            </div>
            <div className="login-footer">
              <Link to="/forgot-password">Request New Reset Link</Link>
              <br />
              <Link to="/login">Back to Login</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-box">
            <img
              src="/web-app-manifest-512x512.png"
              alt="Loggerhead Logo"
              className="login-logo"
            />
            <div className="success-message">
              <div className="success-icon">✓</div>
              <h2>Password Reset Successful!</h2>
              <p>Your password has been updated successfully.</p>
              <p>Redirecting to login...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          
          <h2 className="login-header">Set New Password</h2>
          
          <p className="forgot-password-description">
            Please enter your new password below. Password must be at least 8 characters long.
          </p>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="password">New Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
              required
              disabled={isLoading}
              autoComplete="new-password"
            />

            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              disabled={isLoading}
              autoComplete="new-password"
            />

            <button 
              type="submit" 
              className={`primary-button ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Updating Password...
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </form>

          <div className="login-footer">
            <Link to="/login" className="back-to-login">
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;