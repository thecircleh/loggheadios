import React from 'react';
import { Link } from 'react-router-dom';

const About = () => (
  <div style={{ padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', lineHeight: '1.6', color: '#1C1C1E' }}>
    <h1>About Loggerhead.app</h1>

    <p>
      Loggerhead.app is a modern web application built to help coaches, parents, and players track real-time volleyball stats with precision and ease.
    </p>

    <h2>Who created Loggerhead?</h2>
    <p>
      Loggerhead was developed by a 30-year software engineer who is also a volleyball dad, a former coach, and a certified USAV referee in the Southern Region.
    </p>

    <h2>Why Loggerhead?</h2>
    <p>
      The app was created in response to one common question: <strong>“How do you track volleyball stats?”</strong>
      Existing solutions were often outdated, incomplete, or not mobile-friendly. Loggerhead was built to be the answer.
    </p>

    <h2>What does Loggerhead do?</h2>
    <p>Loggerhead helps you:</p>
    <ul>
      <li>✅ Set up teams and rosters</li>
      <li>✅ Log stats like kills, aces, errors, digs, blocks, and assists</li>
      <li>✅ Track serve rotation and libero substitutions</li>
      <li>✅ Export stats to NCAA-style reports (PDF/CSV)</li>
      <li>✅ Review player and team performance instantly</li>
    </ul>

    <h2>What does Loggerhead cost?</h2>
    <p>
      Loggerhead is <strong>free</strong> to use for all core features. Premium subscription options unlock extra tools like:
    </p>
    <ul>
      <li>📊 Live stat dashboards</li>
      <li>🤖 AI-powered match insights</li>
    </ul>

    <h2>Where can I learn more?</h2>
    <p>
      For a full walkthrough of Loggerhead’s features, visit the{' '}
      <Link to="/how-to" style={{ color: '#007AFF', fontWeight: '600' }}>
        Getting Started Guide
      </Link>.
    </p>

    <p>
      You can also visit our full{' '}
      <Link to="/faq" style={{ color: '#007AFF', fontWeight: '600' }}>
        FAQ Page
      </Link>{' '}
      for detailed answers.
    </p>


  </div>
);

export default About;