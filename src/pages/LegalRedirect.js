import React, { useEffect } from 'react';

// The privacy policy and terms live on the marketing site, so there's only one copy to keep up to date.
// On the web this page sends you there. In the apps it opens them in the in-app browser.
const isNative = () => !!window.Capacitor?.isNativePlatform?.();

async function openPage(url) {
  if (isNative()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch (e) {
      // Fall through to a normal link.
    }
  }
  window.location.replace(url);
}

export default function LegalRedirect({ url, title }) {
  useEffect(() => {
    openPage(url);
  }, [url]);

  return (
    <div style={{ padding: '20px', paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
      <h2>{title}</h2>
      <p>
        Opening our {title.toLowerCase()}… If it doesn't open,{' '}
        <a href={url} onClick={(e) => { e.preventDefault(); openPage(url); }}>tap here</a>.
      </p>
    </div>
  );
}
