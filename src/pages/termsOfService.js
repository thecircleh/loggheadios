import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const TermsOfService = () => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    fetch('/terms.html')
      .then(res => res.text())
      .then(setHtml)
      .catch(err => console.error('Failed to load terms of service policy:', err));
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />


    </div>
  );
};

export default TermsOfService;