// src/components/AuthContext.js
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import Cookies from "js-cookie";
import axios from "axios";
import { io } from "socket.io-client";

const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(Cookies.get("token") || null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingNotifications, setPendingNotifications] = useState([]);

  const presenceSocketRef = useRef(null);

 const normalizeUser = useCallback((data) => {
  if (!data) return null;

  return {
    id: data.id || data._id,
    email: data.email,
    displayName: data.displayName,
    googleId: data.googleId || null,
    teams: data.teams || [],

    subscription: data.subscription || null,
	giftSubscription: data.giftSubscription || null,
    matchKeys: Array.isArray(data.matchKeys) ? data.matchKeys : [],
    dailyUsage: data.dailyUsage || {
      statbook: { count: 0, lastReset: null },
      match: { count: 0, lastReset: null },
    },

    betaStatus: data.betaStatus || data.beta_status || null,
    role: data.role || "user",
    volleyballRole: data.volleyballRole || null,
    coachCornerFreeDrillsUsed: data.coachCornerFreeDrillsUsed || 0,
    consentToEmails: !!data.consentToEmails,
  };
}, []);

  useEffect(() => {
    if (!token) {
      if (presenceSocketRef.current) {
        try {
          presenceSocketRef.current.disconnect();
        } catch {}
      }
      presenceSocketRef.current = null;
      return;
    }

    if (presenceSocketRef.current?.connected) return;

    const socket = io(API_URL, {
      transports: ["websocket"],
      auth: { token },
    });

    presenceSocketRef.current = socket;

    const heartbeatInterval = setInterval(() => {
      try {
        socket.emit("heartbeat");
      } catch {}
    }, 25000);

    return () => {
      clearInterval(heartbeatInterval);
      try {
        socket.disconnect();
      } catch {}
      presenceSocketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");

    if (tokenFromUrl) {
      Cookies.set("token", tokenFromUrl, { expires: 7 });
      setToken(tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      axios.defaults.withCredentials = true;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  const clearAllUserData = useCallback(async () => {
    if (token) {
      try {
        await axios.post(
          `${API_URL}/api/users/set-offline`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );
      } catch (err) {
        console.error("Failed to set offline status:", err);
      }
    }

    Cookies.remove("token");
    setToken(null);
    setUser(null);
    setPendingNotifications([]);

    localStorage.clear();
    sessionStorage.clear();

    window.dispatchEvent(
      new CustomEvent("userLogout", {
        detail: {
          timestamp: new Date().toISOString(),
          reason: "user_logout",
        },
      })
    );

    console.log("All user data cleared and logout event dispatched");
  }, [token]);

  const setAuthToken = useCallback(
    async (newToken) => {
      if (!newToken) {
        await clearAllUserData();
        return;
      }

      Cookies.set("token", newToken, { expires: 7 });
      setToken(newToken);

      try {
        await axios.post(
          `${API_URL}/api/users/set-online`,
          {},
          {
            headers: { Authorization: `Bearer ${newToken}` },
            withCredentials: true,
          }
        );
      } catch (err) {
        console.error("Failed to set online status:", err);
      }
    },
    [clearAllUserData]
  );

  const removeToken = useCallback(() => {
    console.log("User logout initiated");
    try {
      presenceSocketRef.current?.disconnect?.();
    } catch {}
    presenceSocketRef.current = null;
    clearAllUserData();
  }, [clearAllUserData]);

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await axios.get(`${API_URL}/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const normalized = normalizeUser(res.data);
        setUser(normalized);

        console.log("👤 [AuthContext] User loaded from API:", {
          id: normalized?.id,
          email: normalized?.email,
          role: normalized?.role,
          volleyballRole: normalized?.volleyballRole,
        });
      } catch (error) {
        console.error("Error loading user:", error);
        await clearAllUserData();
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [token, normalizeUser, clearAllUserData]);

  useEffect(() => {
    if (!token || !user?.id) return;

    axios
      .get(`${API_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setPendingNotifications(res.data);
        } else {
          setPendingNotifications([]);
        }
      })
      .catch((err) => {
        console.warn("Failed to load notifications:", err);
      });
  }, [token, user?.id]);

  const refreshUser = useCallback(async () => {
    if (!token) return;

    try {
      const res = await axios.get(`${API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser(normalizeUser(res.data));
    } catch (error) {
      console.error("Error refreshing user:", error);
    }
  }, [token, normalizeUser]);

  const role = (user?.role || "").toLowerCase();
  const volleyballRole = user?.volleyballRole || null;
  const subStatus = user?.subscription?.status || null;
  const isActiveSub = ["active", "canceling"].includes(subStatus);
  const hasGiftSubscription =
  user?.giftSubscription?.active === true &&
  user?.giftSubscription?.endsAt &&
  new Date(user.giftSubscription.endsAt) > new Date();
  const isAdminOrWinner = role === "admin" || role === "winner";
  const normalizeMode = (mode) => {
  if (!mode) return null;

  const m = mode.toLowerCase();

  if (m.includes("stat")) return "statbook";
  if (m.includes("match")) return "match";

  return m;
};
  const getEtNow = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`
  );
};

const getCurrentAccessWindowStartEt = () => {
  const nowEt = getEtNow();
  const start = new Date(nowEt);
  start.setHours(2, 0, 0, 0);

  if (nowEt < start) {
    start.setDate(start.getDate() - 1);
  }

  return start;
};

const canUseFreeMode = (mode) => {
  const normalized = normalizeMode(mode);

  const usage = user?.dailyUsage?.[normalized];
  if (!usage) return true;

 const count = Number(usage?.count ?? 0);
const lastReset = usage?.lastReset
  ? new Date(usage.lastReset)
  : null;
  
  const windowStartEt = getCurrentAccessWindowStartEt();

  if (!lastReset || Number.isNaN(lastReset.getTime())) {
    return true;
  }

  return lastReset < windowStartEt || count < 1;
};

const hasUnusedMatchKey = (mode) => {
  const normalized = normalizeMode(mode);

  return (user?.matchKeys || []).some(
    (k) => normalizeMode(k.mode) === normalized && !k.used
  );
};


const getMatchAccess = (mode) => {
  if (isSubscriber) return "subscriber";
  if (hasUnusedMatchKey(mode)) return "key";
  if (canUseFreeMode(mode)) return "free";
  return "locked";
};

 const hasPremium =
  isActiveSub ||
  hasGiftSubscription ||
  isAdminOrWinner;
  const hasCoachesCorner = true;
  const isCoach = volleyballRole === "coach";
  const isSubscriber = hasPremium;

  console.log("🏐 [AuthContext] volleyballRole:", volleyballRole);
  console.log("🔐 [AuthContext] Final access state:", {
    volleyballRole,
    isCoach,
    hasPremium,
    hasCoachesCorner,
	hasGiftSubscription,
    isSubscriber,
  });

const contextValue = {
  token,
  user,
  setUser,
  setToken: setAuthToken,
  removeToken,
  clearAllUserData,
  loading,
  pendingNotifications,

  isSubscriber,
  hasPremium,
  hasCoachesCorner,
  hasGiftSubscription,
  isCoach,
  volleyballRole,
  refreshUser,

  matchKeys: user?.matchKeys || [],
  dailyUsage: user?.dailyUsage || {
    statbook: { count: 0, lastReset: null },
    match: { count: 0, lastReset: null },
  },
  hasUnusedMatchKey,
  canUseFreeMode,
  getMatchAccess,
};

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);