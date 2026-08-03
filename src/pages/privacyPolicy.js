import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    fetch('/privacy_policy.html')
      .then(res => res.text())
      .then(setHtml)
      .catch(err => console.error('Failed to load privacy policy:', err));
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />


    </div>
  );
};

export default PrivacyPolicy;