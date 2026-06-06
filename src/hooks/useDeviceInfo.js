
// hooks/useDeviceInfo.js
import { useState, useEffect } from 'react';

const useDeviceInfo = () => {
  const [deviceInfo, setDeviceInfo] = useState(() => {
    if (typeof window !== "undefined") {
      return {
        isLandscape: window.innerWidth > window.innerHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      };
    }
    return { isLandscape: false, viewportHeight: 0, viewportWidth: 0 };
  });

  useEffect(() => {
    const handleResize = () => {
      setDeviceInfo({
        isLandscape: window.innerWidth > window.innerHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return deviceInfo;
};

export default useDeviceInfo;