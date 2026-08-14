import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../components/AuthContext';

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || 'https://api.loggerhead.app';
};

const API_URL = getApiUrl();

const DeleteAccount = () => {
  const { token, removeToken } = useAuth();
  const navigate = useNavigate();

  // Step 1: show warning  Step 2: confirm  Step 3: done
  const [step, setStep] = useState(1);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      setError('Please type DELETE to confirm.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.delete(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Clear auth state and go to confirmation screen
      removeToken();
      setStep(3);
    } catch (err) {
      console.error('Account deletion failed:', err);
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (step === 3) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.icon}>✅</div>
          <h1 style={styles.title}>Account Deleted</h1>
          <p style={styles.sub}>
            Your account and all associated data have been permanently deleted.
            We're sorry to see you go.
          </p>
          <button onClick={() => navigate('/login')} style={styles.primaryButton}>
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {step === 1 && (
          <>
            <div style={styles.icon}>⚠️</div>
            <h1 style={styles.title}>Delete Account</h1>
            <p style={styles.sub}>
              This action is permanent and cannot be undone.
            </p>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>What gets deleted</h2>
              <ul style={styles.list}>
                <li>Your profile and login credentials</li>
                <li>All match and stat logs you have recorded</li>
                <li>Roster and player data associated with your account</li>
                <li>Any active subscription will be cancelled immediately</li>
                <li>Drills, practice plans, and notes you have created</li>
              </ul>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              <button onClick={() => setStep(2)} style={styles.dangerButton}>
                Continue to Delete Account
              </button>
              <Link to="/profile" style={styles.cancelLink}>
                Cancel — Keep My Account
              </Link>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={styles.icon}>🗑️</div>
            <h1 style={styles.title}>Confirm Deletion</h1>
            <p style={styles.sub}>
              Type <strong>DELETE</strong> in the box below to permanently delete
              your account and all data.
            </p>

            <div style={styles.form}>
              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={confirmText}
                onChange={(e) => { setConfirmText(e.target.value); setError(''); }}
                style={{
                  ...styles.input,
                  borderColor: error ? '#FF3B30' : '#D1D1D6',
                }}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              {error && <p style={styles.errorText}>{error}</p>}

              <button
                onClick={handleDelete}
                disabled={loading}
                style={{
                  ...styles.dangerButton,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Deleting…' : 'Permanently Delete My Account'}
              </button>

              <button onClick={() => { setStep(1); setConfirmText(''); setError(''); }} style={styles.ghostButton}>
                Go Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F2F2F7',
    padding: '20px',
    paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    maxWidth: 560,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 16,
    padding: '28px 24px 32px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  icon: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    margin: '0 0 8px',
    fontSize: 24,
    fontWeight: 700,
    color: '#1C1C1E',
    textAlign: 'center',
  },
  sub: {
    margin: '0 0 20px',
    fontSize: 15,
    color: '#666',
    lineHeight: 1.5,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
    background: '#FFF5F5',
    border: '1px solid #FFD0CC',
    borderRadius: 10,
    padding: '14px 16px',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#C0392B',
    margin: '0 0 8px',
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    color: '#444',
    fontSize: 14,
    lineHeight: 1.8,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  input: {
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: 10,
    border: '1.5px solid #D1D1D6',
    outline: 'none',
    background: '#FAFAFA',
    letterSpacing: 1,
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    color: '#FF3B30',
  },
  dangerButton: {
    padding: '13px',
    borderRadius: 12,
    border: 'none',
    background: '#FF3B30',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  primaryButton: {
    display: 'block',
    width: '100%',
    padding: '13px',
    borderRadius: 12,
    border: 'none',
    background: '#007AFF',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    marginTop: 16,
  },
  ghostButton: {
    padding: '11px',
    borderRadius: 12,
    border: '1.5px solid #D1D1D6',
    background: 'transparent',
    color: '#444',
    fontSize: 15,
    cursor: 'pointer',
    textAlign: 'center',
  },
  cancelLink: {
    textAlign: 'center',
    fontSize: 15,
    color: '#007AFF',
    textDecoration: 'none',
    padding: '8px 0',
  },
};

export default DeleteAccount;
