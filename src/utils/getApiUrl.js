export const getApiUrl = () => {
  if (window.Capacitor?.isNativePlatform?.()) return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("10.")) {
    return `http://${hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};