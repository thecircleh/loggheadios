import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

const tabs = [
  {
    label: "Home",
    path: "/",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
          fill={active ? "#34C759" : "none"}
          stroke={active ? "#34C759" : "#8E8E93"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Rosters & Matches",
    path: "/settings",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="3" stroke={active ? "#34C759" : "#8E8E93"} strokeWidth="1.8"/>
        <path d="M3 20C3 16.686 5.686 14 9 14C12.314 14 15 16.686 15 20" stroke={active ? "#34C759" : "#8E8E93"} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M16 11L18 13L22 9" stroke={active ? "#34C759" : "#8E8E93"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Log Stats",
    path: "/stat-book",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2"
          fill={active ? "#34C759" : "none"}
          stroke={active ? "#34C759" : "#8E8E93"}
          strokeWidth="1.8"/>
        <path d="M8 8H16M8 12H16M8 16H12"
          stroke={active ? "white" : "#8E8E93"}
          strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "View Stats",
    path: "/stats",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="12" width="4" height="9" rx="1" fill={active ? "#34C759" : "#8E8E93"}/>
        <rect x="10" y="7" width="4" height="14" rx="1" fill={active ? "#34C759" : "#8E8E93"}/>
        <rect x="17" y="3" width="4" height="18" rx="1" fill={active ? "#34C759" : "#8E8E93"}/>
      </svg>
    ),
  },
  {
    label: "Profile",
    path: "/profile",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4"
          fill={active ? "#34C759" : "none"}
          stroke={active ? "#34C759" : "#8E8E93"}
          strokeWidth="1.8"/>
        <path d="M4 20C4 16.134 7.582 13 12 13C16.418 13 20 16.134 20 20"
          stroke={active ? "#34C759" : "#8E8E93"}
          strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const BottomTabBar = ({ isNative, isMobile }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Only show on native iOS app or mobile
  if (!isNative && !isMobile) return null;

  // Hide on login/register pages
  const hiddenPaths = ["/login", "/register"];
  if (hiddenPaths.includes(location.pathname)) return null;

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Spacer so content doesn't hide behind the tab bar */}
      <div style={{ height: "calc(60px + env(safe-area-inset-bottom, 0px))" }} />

      <nav style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "calc(60px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backgroundColor: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "stretch",
        zIndex: 9000,
      }}>
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 0 0 0",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {tab.icon(active)}
              <span style={{
                fontSize: "10px",
                fontWeight: active ? 600 : 400,
                color: active ? "#34C759" : "#8E8E93",
                letterSpacing: "-0.2px",
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default BottomTabBar;