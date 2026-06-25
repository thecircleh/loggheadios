export const getApiUrl = () => {
  const hostname = window.location.hostname;
  if (hostname.startsWith("localhost") || hostname.startsWith("10.") || hostname === "127.0.0.1") {
    return `http://${hostname}:3000`;
  }
  return 'https://api.loggerhead.app';
};