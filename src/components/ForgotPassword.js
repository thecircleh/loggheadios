import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      await axios.post(`${API_URL}/auth/forgot-password`, 
        { email: email.trim().toLowerCase() },
        { 
          withCredentials: true,
          timeout: 10000
        }
      );

      setMessage('If an account with that email exists, we\'ve sent password reset instructions to your email address.');
      setIsSubmitted(true);
      
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please try again.');
      } else if (err.response?.status === 429) {
        setError('Too many requests. Please wait a few minutes before trying again.');
      } else {
        setError('An error occurred. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendRequest = () => {
    setIsSubmitted(false);
    setMessage('');
    setError('');
    setEmail('');
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
          
          <h2 className="login-header">Reset Your Password</h2>
          
          {!isSubmitted ? (
            <>
              <p className="forgot-password-description">
                Enter your email address and we'll send you instructions to reset your password.
              </p>

              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="login-form">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />

                <button 
                  type="submit" 
                  className={`primary-button ${isLoading ? 'loading' : ''}`}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Sending...
                    </>
                  ) : (
                    'Send Reset Instructions'
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="success-message">
              <div className="success-icon">✓</div>
              <p>{message}</p>
              <p className="help-text">
                Didn't receive an email? Check your spam folder or{' '}
                <button 
                  type="button" 
                  className="link-button" 
                  onClick={handleResendRequest}
                >
                  try again
                </button>
              </p>
            </div>
          )}

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

export default ForgotPassword;