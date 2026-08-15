import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BottomTabBar = ({ isNative, offlinePending = 0, isOnline = true }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null);

  if (!isNative) return null;

  const hiddenPaths = ["/login", "/register"];
  if (hiddenPaths.includes(location.pathname)) return null;

  const isActive = (paths, exclude) => paths.some(p =>
    p === "/" ? location.pathname === "/" : location.pathname.startsWith(p)
  ) && (!exclude || !exclude.some(e => location.pathname.startsWith(e)));

  const toggleMenu = (key) => setOpenMenu(prev => prev === key ? null : key);
  const closeMenus = () => setOpenMenu(null);

  const navigateTo = (path) => {
    closeMenus();
    navigate(path);
  };

  const tabs = [
    {
      key: "home",
      label: "Home",
      paths: ["/"],
      onPress: () => navigateTo("/"),
      icon: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
            fill={active ? "#34C759" : "none"}
            stroke={active ? "#34C759" : "#8E8E93"}
            strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: "rosters",
      label: "Rosters",
      paths: ["/settings"],
      onPress: () => navigateTo("/settings"),
      icon: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3" stroke={active ? "#34C759" : "#8E8E93"} strokeWidth="1.8"/>
          <path d="M3 20C3 16.686 5.686 14 9 14C12.314 14 15 16.686 15 20"
            stroke={active ? "#34C759" : "#8E8E93"} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M16 11L18 13L22 9"
            stroke={active ? "#34C759" : "#8E8E93"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: "log",
      label: "Log",
      paths: ["/stat-book", "/match-tracking", "/classic"],
      hasMenu: true,
      onPress: () => toggleMenu("log"),
      menuItems: [
        { label: "Stat Book Mode", path: "/stat-book" },
        { label: "Match Tracking Mode", path: "/match-tracking" },
        { label: "Classic Mode", path: "/classic" },
      ],
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
      key: "stats",
      label: "Stats",
      paths: ["/stats", "/coaches-corner/stats"],
      hasMenu: true,
      onPress: () => toggleMenu("stats"),
      menuItems: [
        { label: "Stat Book / Classic Stats", path: "/stats" },
        { label: "Match Mode Stats", path: "/coaches-corner/stats" },
      ],
      icon: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="12" width="4" height="9" rx="1" fill={active ? "#34C759" : "#8E8E93"}/>
          <rect x="10" y="7" width="4" height="14" rx="1" fill={active ? "#34C759" : "#8E8E93"}/>
          <rect x="17" y="3" width="4" height="18" rx="1" fill={active ? "#34C759" : "#8E8E93"}/>
        </svg>
      ),
    },
    {
      key: "coaches",
      label: "Coaches",
      paths: ["/coaches-corner"],
      exclude: ["/coaches-corner/stats"],
      hasMenu: true,
      onPress: () => toggleMenu("coaches"),
      menuItems: [
        { label: "Coaches' Corner Home", path: "/coaches-corner" },
        { label: "My Drills", path: "/coaches-corner/drills" },
        { label: "Practice Assist", path: "/coaches-corner/practice" },
        { label: "Jobs", path: "/coaches-corner/jobs" },
      ],
      icon: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="2" width="14" height="18" rx="2"
            fill={active ? "#34C759" : "none"}
            stroke={active ? "#34C759" : "#8E8E93"}
            strokeWidth="1.8"/>
          <path d="M8 2V4M14 2V4" stroke={active ? "white" : "#8E8E93"} strokeWidth="1.8" strokeLinecap="round"/>
          <rect x="4" y="2" width="14" height="4" rx="1"
            fill={active ? "#2aa84a" : "#8E8E93"}
            stroke="none"/>
          <path d="M7 11H15M7 14H12"
            stroke={active ? "white" : "#C7C7CC"}
            strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: "profile",
      label: "Profile",
      paths: ["/profile", "/roi-calendar", "/recruiting"],
      hasMenu: true,
      onPress: () => toggleMenu("profile"),
      menuItems: [
        { label: "My Profile", path: "/profile" },
        { label: "Expenses", path: "/roi-calendar" },
        { label: "Recruiting Card", path: "/recruiting" },
      ],
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

  return (
    <>
      {/* Spacer */}
      <div style={{ height: "calc(70px + env(safe-area-inset-bottom, 0px))" }} />

      {/* Backdrop to close menus */}
      {openMenu && (
        <div
          onClick={closeMenus}
          style={{
            position: "fixed", inset: 0, zIndex: 8999,
          }}
        />
      )}

      {offlinePending > 0 && (
        <div style={{
          position: "fixed",
          bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 12,
          fontWeight: 600,
          padding: "5px 0",
          color: isOnline ? "#FF9500" : "#FF3B30",
          backgroundColor: isOnline ? "rgba(255,149,0,0.1)" : "rgba(255,59,48,0.1)",
          zIndex: 9000,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>
          {isOnline
            ? `⟳ Syncing ${offlinePending} action${offlinePending > 1 ? "s" : ""}…`
            : `⚠ ${offlinePending} action${offlinePending > 1 ? "s" : ""} queued (offline)`}
        </div>
      )}

      <nav style={{
        position: "fixed",
        bottom: 10,
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
          const active = isActive(tab.paths, tab.exclude);
          const menuOpen = openMenu === tab.key;

          return (
            <div key={tab.key} style={{ flex: 1, position: "relative", display: "flex" }}>

              {/* Popup menu — slides up above the tab */}
              {tab.hasMenu && menuOpen && (
                <div style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "rgba(255,255,255,0.97)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  borderRadius: 14,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  minWidth: 190,
                  overflow: "hidden",
                  marginBottom: 8,
                  zIndex: 9001,
                }}>
                  {tab.menuItems.map((item, i) => {
                    const itemActive = location.pathname === item.path ||
                      location.pathname.startsWith(item.path + "/");
                    return (
                      <button
                        key={item.path}
                        onClick={() => navigateTo(item.path)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "13px 18px",
                          textAlign: "left",
                          background: itemActive ? "rgba(52,199,89,0.1)" : "none",
                          border: "none",
                          borderBottom: i < tab.menuItems.length - 1
                            ? "1px solid rgba(0,0,0,0.06)" : "none",
                          fontSize: 15,
                          fontWeight: itemActive ? 600 : 400,
                          color: itemActive ? "#34C759" : "#1C1C1E",
                          cursor: "pointer",
                          WebkitTapHighlightColor: "transparent",
                          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tab button */}
              <button
                onClick={tab.onPress}
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
                {tab.icon(active || menuOpen)}
                <span style={{
                  fontSize: "10px",
                  fontWeight: active || menuOpen ? 600 : 400,
                  color: active || menuOpen ? "#34C759" : "#8E8E93",
                  letterSpacing: "-0.2px",
                }}>
                  {tab.label}
                </span>
                {/* Chevron indicator for tabs with submenus */}
                {tab.hasMenu && (
                  <span style={{
                    fontSize: "7px",
                    color: active || menuOpen ? "#34C759" : "#C7C7CC",
                    marginTop: -2,
                    lineHeight: 1,
                  }}>
                    {menuOpen ? "▼" : "▲"}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
    </>
  );
};

export default BottomTabBar;
