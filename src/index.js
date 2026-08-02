import React from "react";
import ReactDOM from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./components/AuthContext";
import "./index.css";
import "./global.css";
import { setupStatRetryInterceptor } from "./utils/statRetryInterceptor";

setupStatRetryInterceptor();

// 🔥 FORCE CACHE CLEAR ON LOAD
if ('caches' in window) {
  caches.keys().then(names => {
    for (let name of names) caches.delete(name);
  });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    for (let reg of regs) reg.unregister();
  });
}

const rootElement = document.getElementById('root');

// Check if the page was pre-rendered by react-snap
if (rootElement.hasChildNodes()) {
  // Hydrate pre-rendered content (React 18 way)
  hydrateRoot(rootElement, 
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  );
} else {
  // Create new root for dynamic content (React 18 way)
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  );
}

// Service Worker registration (unchanged)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => {
        console.log('Service worker registered:', reg);
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });
  });
}