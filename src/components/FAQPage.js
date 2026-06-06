import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdCourtBottom from './AdCourtBottom';

const FAQPage = () => {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <h1 style={styles.title}>Loggerhead.app FAQ</h1>
        <p style={styles.subtitle}>Answers to your most common questions about Loggerhead</p>
      </section>

      <section style={styles.content}>
        <h2>What is Loggerhead.app?</h2>
        <p>
          Loggerhead.app is a modern, mobile-friendly web app that makes it easy to capture real volleyball match stats
          — in real time. It was created to answer the question: “How do you track volleyball stats?” Most answers were
          outdated or unclear. Loggerhead sets a new standard in volleyball stat logging.
        </p>

        <h2>Who is Loggerhead.app for?</h2>
        <p>
          Loggerhead is designed for <strong>coaches</strong>, <strong>parents</strong>, and <strong>players</strong> who want
          fast, accurate stat tracking for their team.
        </p>

        <h2>Who created Loggerhead.app?</h2>
        <p>
          Loggerhead was built by a 30-year software developer — who’s also a proud 4-year volleyball dad, a former coach,
          and a newly certified referee in the USAV Southern Region.
        </p>

        <h2>What does it cost to use Loggerhead.app?</h2>
        <p>Loggerhead is free for all core features, including:</p>
        <ul>
          <li>✅ Team setup</li>
          <li>✅ Player roster management</li>
          <li>✅ Live match stat logging</li>
          <li>✅ Substitution & libero tracking</li>
          <li>✅ Serve rotation awareness</li>
          <li>✅ Action log</li>
          <li>✅ NCAA-style match stats</li>
        </ul>

        <p>
          We're able to offer these for free thanks to our partnership with Google to serve ads like the one below:
        </p>

        <div style={styles.adWrapper}>
          <AdCourtBottom adKey="faq-page" />
        </div>

        <p>
          <strong>Premium subscriptions</strong> are available directly from your profile page and include daily, weekly, monthly,
          half-year, or yearly options.
        </p>

        <p>Subscribers get access to:</p>
        <ul>
          <li>🚫 An ad-free experience after login</li>
          <li>📊 Live team stat dashboards</li>
          <li>🤖 AI-powered match insights</li>
          <li>📌 Additional roadmap features (available to both free and paid users)</li>
        </ul>

        <h2>What features are planned for the future?</h2>
        <ul>
          <li>📥 Team lineup importing (Free & Subscriber)</li>
          <li>🏖️ Beach volleyball & 4v4 stat tracking (Subscriber)</li>
          <li>📈 Custom stat visualizations (Subscriber)</li>
          <li>📅 Match calendar & recap summaries (Free & Subscriber)</li>
        </ul>

        <h2>How do I use Loggerhead.app?</h2>
        <p>
          Visit our <Link to="/how-to" style={styles.link}>Getting Started Guide</Link> to see a step-by-step walkthrough for
          logging your first match, managing players, and exporting stats.
        </p>
      </section>
    </main>
  );
};

const styles = {
  page: {
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    backgroundColor: '#F9F9F9',
    color: '#1C1C1E',
  },
  hero: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#555',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.05)',
    lineHeight: '1.6',
  },
  link: {
    color: '#007AFF',
    fontWeight: '600',
    textDecoration: 'none',
  },
  adWrapper: {
    margin: '20px 0',
    display: 'flex',
    justifyContent: 'center',
  },
};

export default FAQPage;
