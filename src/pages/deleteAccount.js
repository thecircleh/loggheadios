import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const DeleteAccount = () => {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent('Account Deletion Request');
    const body = encodeURIComponent(
      `Hello,\n\nI would like to request deletion of my Loggerhead account and all associated data.\n\nAccount email: ${email}\n\nPlease confirm once my data has been deleted.\n\nThank you.`
    );
    window.location.href = `mailto:admin@loggerhead.app?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Delete Your Account</h1>
        <p style={styles.sub}>
          You can request deletion of your Loggerhead account and all associated data at any time.
        </p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>What gets deleted</h2>
          <ul style={styles.list}>
            <li>Your profile and account credentials</li>
            <li>All match and stat logs you have recorded</li>
            <li>Roster and player data associated with your account</li>
            <li>Subscription and billing records (where permitted by law)</li>
            <li>Any drills, practice plans, or notes you have created</li>
          </ul>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>How to request deletion</h2>
          <p style={styles.body}>
            Fill in your account email below and click the button to send us a deletion request.
            We will process your request within <strong>30 days</strong> and send a confirmation
            to your email address.
          </p>
        </div>

        {submitted ? (
          <div style={styles.success}>
            ✅ Your email app should have opened with a pre-filled deletion request.
            If it didn't, email us directly at{' '}
            <a href="mailto:admin@loggerhead.app" style={styles.link}>
              admin@loggerhead.app
            </a>{' '}
            with the subject "Account Deletion Request" and your account email.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="del-email">
              Account email address
            </label>
            <input
              id="del-email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <button type="submit" style={styles.button}>
              Send Deletion Request
            </button>
          </form>
        )}

        <p style={styles.footer}>
          Questions? Visit our <Link to="/contact" style={styles.link}>Contact</Link> page
          or review our <Link to="/privacy" style={styles.link}>Privacy Policy</Link>.
        </p>
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
    maxWidth: 600,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 16,
    padding: '28px 24px 32px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: {
    margin: '0 0 8px',
    fontSize: 26,
    fontWeight: 700,
    color: '#1C1C1E',
  },
  sub: {
    margin: '0 0 24px',
    fontSize: 15,
    color: '#666',
    lineHeight: 1.5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1C1C1E',
    margin: '0 0 8px',
  },
  list: {
    margin: '0',
    paddingLeft: 20,
    color: '#444',
    fontSize: 15,
    lineHeight: 1.8,
  },
  body: {
    margin: 0,
    fontSize: 15,
    color: '#444',
    lineHeight: 1.6,
  },
  form: {
    marginTop: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1C1C1E',
  },
  input: {
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: 10,
    border: '1.5px solid #D1D1D6',
    outline: 'none',
    background: '#FAFAFA',
  },
  button: {
    marginTop: 4,
    padding: '13px',
    borderRadius: 12,
    border: 'none',
    background: '#FF3B30',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  success: {
    marginTop: 24,
    padding: '16px',
    background: '#F0FFF4',
    border: '1px solid #34C759',
    borderRadius: 10,
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 1.6,
  },
  footer: {
    marginTop: 28,
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  link: {
    color: '#007AFF',
    textDecoration: 'none',
  },
};

export default DeleteAccount;
