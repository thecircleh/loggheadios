
import React, { useEffect, useRef } from 'react';

const AdCourtBottom = () => {
  const adRef = useRef(null);
  const alreadyPushedRef = useRef(false);

  // Push AdSense once
  useEffect(() => {
    console.log("[AdCourtBottom] useEffect: attempt AdSense push");
    
    if (!window.adsbygoogle) {
      console.warn("[AdCourtBottom] adsbygoogle not found on window.");
      return;
    }

    if (!adRef.current) {
      console.warn("[AdCourtBottom] adRef.current is null.");
      return;
    }

    if (alreadyPushedRef.current) {
      console.warn("[AdCourtBottom] AdSense already pushed once, skipping.");
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      alreadyPushedRef.current = true;
      console.log("[AdCourtBottom] AdSense push successful");
    } catch (e) {
      console.error("[AdCourtBottom] AdSense push failed:", e);
    }
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '300px',
        height: '100px',
        margin: '12px auto',
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'inline-block', width: '300px', height: '100px' }}
        data-ad-client="ca-pub-3584274514330714"
        data-ad-slot="9345918650"
      />
    </div>
  );
};

export default AdCourtBottom;