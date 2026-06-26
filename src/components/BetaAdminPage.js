import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const normalizeTeams = (teams) => {
  if (!teams) return [];
  if (Array.isArray(teams)) return teams.filter(Boolean);
  if (typeof teams === "string") {
    return teams
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeRole = (role) => {
  const r = String(role || "").trim().toLowerCase();
  if (r === "coach") return "coach";
  if (r === "player") return "player";
  if (r === "parent") return "parent";
  if (!r) return "other";
  return "other";
};

const roleMeta = {
  coach: { label: "Coach", dot: "#2563EB", rowBg: "#EFF6FF" },
  player: { label: "Player", dot: "#16A34A", rowBg: "#ECFDF5" },
  parent: { label: "Parent", dot: "#F59E0B", rowBg: "#FFFBEB" },
  other: { label: "Other", dot: "#6B7280", rowBg: "#F3F4F6" },
};

const getEmailPrefix = (email) => (email || "").split("@")[0] || "";

const getDisplayName = (u) => {
  const dn = String(u?.displayName || "").trim();
  if (dn) return dn;

  const fn = String(u?.firstName || "").trim();
  const ln = String(u?.lastName || "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;

  const un = String(u?.username || "").trim();
  if (un) return un;

  return getEmailPrefix(u?.email);
};

const getFullName = (u) => {
  const fn = String(u?.firstName || "").trim();
  const ln = String(u?.lastName || "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || getDisplayName(u);
};

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const BetaAdminPage = ({ isMobile = false, isNative = false }) => {
  const { token, user } = useAuth();

  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");

  const [sortKey, setSortKey] = useState("lastSeen");
  const [sortDirection, setSortDirection] = useState("desc");

  const [stats, setStats] = useState({
    totalUsers: 0,
    subscribers: 0,
    formerSubscribers: 0,
    freeUsers: 0,
    activeNow: 0,
    activeToday: 0,
    activeThisWeek: 0,
  });

  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  // Selection
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [showEmailSection, setShowEmailSection] = useState(false);
  const [showNotifSection, setShowNotifSection] = useState(false);

  // Email
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ sent: 0, total: 0, skipped: 0 });
  const [respectConsent, setRespectConsent] = useState(true);

  // Editor UX
  const [showPreview, setShowPreview] = useState(true);
  const [accentColor, setAccentColor] = useState("#007AFF");
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [imageAltDraft, setImageAltDraft] = useState("");
  const [imageLinkDraft, setImageLinkDraft] = useState("");

  // Notification
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifSeverity, setNotifSeverity] = useState("info");
  const [notifExpireDays, setNotifExpireDays] = useState(30);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifOnlyNoEmailConsent, setNotifOnlyNoEmailConsent] = useState(true);

  // Filters
  const [filters, setFilters] = useState({
    subscriptionStatus: "all",
    activityStatus: "all",
    hasTeams: "all",
    hasMatches: "all",
    emailConsent: "all",
    searchEmail: "",
    volleyballRole: "all",
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset to page 1 whenever filters or sort change
  const prevFiltersRef = React.useRef(filters);
  useEffect(() => {
    if (prevFiltersRef.current !== filters) {
      setCurrentPage(1);
      prevFiltersRef.current = filters;
    }
  }, [filters]);

  // Data loading states
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingTeamHoldings, setLoadingTeamHoldings] = useState(false);
  const [dataLoadMessage, setDataLoadMessage] = useState("");
  const [dataLoadStats, setDataLoadStats] = useState(null);
  const [dataLoadLogs, setDataLoadLogs] = useState([]);
  const [playersFile, setPlayersFile] = useState(null);
  const [teamHoldingsFile, setTeamHoldingsFile] = useState(null);

  const calculateStats = (userList) => {
    const now = dayjs();
    const formerStripeStatuses = new Set(["canceled", "cancelled"]);

    let subscribers = 0;
    let formerSubscribers = 0;

    userList.forEach((u) => {
      const status = u.subscription?.status;
      const isFormer = formerStripeStatuses.has(status);

      if (status === "active") subscribers++;
      else if (isFormer) formerSubscribers++;
    });

    const totalUsers = userList.length;
    const freeUsers = totalUsers - subscribers - formerSubscribers;

    const todayStart = now.startOf("day");
    const weekStart = now.startOf("week");

    const activeNow = userList.filter((u) => u.isOnline).length;
    const activeToday = userList.filter(
      (u) => u.lastSeen && dayjs(u.lastSeen).isAfter(todayStart)
    ).length;
    const activeThisWeek = userList.filter(
      (u) => u.lastSeen && dayjs(u.lastSeen).isAfter(weekStart)
    ).length;

    setStats({
      totalUsers,
      subscribers,
      formerSubscribers,
      freeUsers,
      activeNow,
      activeToday,
      activeThisWeek,
    });
  };

  const loadUsers = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setRefreshingUsers(true);
        setMessage("");

        const res = await axios.get(`${API_URL}/api/users/admin-list`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const nextUsers = res.data || [];
        setUsers(nextUsers);
        calculateStats(nextUsers);
        setSelectedUsers(new Set());
        setLastRefreshedAt(new Date());
      } catch (err) {
        console.error("❌ Failed to load users:", err);
        setMessage("Failed to load users: " + (err.response?.data?.message || err.message));
      } finally {
        if (!silent) setRefreshingUsers(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    loadUsers({ silent: true });
  }, [token, loadUsers]);

  const formatLastRefresh = () => {
    if (!lastRefreshedAt) return "Not refreshed yet";
    return `Last refreshed ${dayjs(lastRefreshedAt).fromNow()}`;
  };

  const handleLoadPlayers = async () => {
    if (!playersFile) {
      alert("Please select a players JSON file first.");
      return;
    }

    if (
      !window.confirm(
        `Load players from ${playersFile.name}? This will create new player records for teams that don't have any.`
      )
    ) {
      return;
    }

    setLoadingPlayers(true);
    setDataLoadMessage("");
    setDataLoadStats(null);
    setDataLoadLogs([]);

    try {
      const formData = new FormData();
      formData.append("file", playersFile);

      const res = await axios.post(`${API_URL}/api/admin/load-players`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setDataLoadMessage(res.data.message || "Players loaded successfully");
      setDataLoadStats(res.data.stats);
      setDataLoadLogs(res.data.logs || []);
      setPlayersFile(null);
      await loadUsers({ silent: true });
    } catch (err) {
      console.error("Failed to load players:", err);
      setDataLoadMessage("Error: " + (err.response?.data?.message || err.message));
    } finally {
      setLoadingPlayers(false);
    }
  };

  const handleLoadTeamHoldings = async () => {
    if (!teamHoldingsFile) {
      alert("Please select a team holdings JSON file first.");
      return;
    }

    if (
      !window.confirm(
        `Load team holdings from ${teamHoldingsFile.name}? This will update or create TeamHolding records.`
      )
    ) {
      return;
    }

    setLoadingTeamHoldings(true);
    setDataLoadMessage("");
    setDataLoadStats(null);
    setDataLoadLogs([]);

    try {
      const formData = new FormData();
      formData.append("file", teamHoldingsFile);

      const res = await axios.post(`${API_URL}/api/admin/load-team-holdings`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setDataLoadMessage(res.data.message || "Team holdings loaded successfully");
      setDataLoadStats(res.data.stats);
      setDataLoadLogs(res.data.logs || []);
      setTeamHoldingsFile(null);
      await loadUsers({ silent: true });
    } catch (err) {
      console.error("Failed to load team holdings:", err);
      setDataLoadMessage("Error: " + (err.response?.data?.message || err.message));
    } finally {
      setLoadingTeamHoldings(false);
    }
  };

  const getFilteredUsers = () => {
    let filtered = [...users];
    const now = dayjs();
    const formerStripeStatuses = new Set(["canceled", "cancelled"]);

    if (filters.subscriptionStatus !== "all") {
      filtered = filtered.filter((u) => {
        const status = u.subscription?.status;
        const isFormer = formerStripeStatuses.has(status);

        if (filters.subscriptionStatus === "active") return status === "active";
        if (filters.subscriptionStatus === "former") return isFormer;
        if (filters.subscriptionStatus === "free") return status !== "active" && !isFormer;
        return true;
      });
    }

    if (filters.activityStatus !== "all") {
      filtered = filtered.filter((u) => {
        if (filters.activityStatus === "online") return u.isOnline;
        if (filters.activityStatus === "today") {
          return u.lastSeen && dayjs(u.lastSeen).isAfter(now.startOf("day"));
        }
        if (filters.activityStatus === "week") {
          return u.lastSeen && dayjs(u.lastSeen).isAfter(now.startOf("week"));
        }
        if (filters.activityStatus === "month") {
          return u.lastSeen && dayjs(u.lastSeen).isAfter(now.subtract(30, "days"));
        }
        return true;
      });
    }

    if (filters.hasTeams !== "all") {
      filtered = filtered.filter((u) => {
        const hasTeams = normalizeTeams(u.teams).length > 0;
        return filters.hasTeams === "yes" ? hasTeams : !hasTeams;
      });
    }

    if (filters.hasMatches !== "all") {
      filtered = filtered.filter((u) => {
        const hasMatches = (u.matchesCount || 0) > 0;
        return filters.hasMatches === "yes" ? hasMatches : !hasMatches;
      });
    }

    if (filters.emailConsent !== "all") {
      filtered = filtered.filter((u) => {
        return filters.emailConsent === "yes" ? u.consentToEmails : !u.consentToEmails;
      });
    }

    if (filters.volleyballRole !== "all") {
      filtered = filtered.filter((u) => {
        const role = normalizeRole(u.volleyballRole);
        return role === filters.volleyballRole;
      });
    }

    if (filters.searchEmail.trim()) {
      const search = filters.searchEmail.trim().toLowerCase();
      filtered = filtered.filter((u) => {
        const email = (u.email || "").toLowerCase();
        return email.includes(search);
      });
    }

    return filtered;
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortedUsers = useMemo(() => {
    const filtered = getFilteredUsers();

    return [...filtered].sort((a, b) => {
      let aVal, bVal;

      if (sortKey === "isOnline") {
        aVal = a.isOnline ? 1 : 0;
        bVal = b.isOnline ? 1 : 0;
      } else if (sortKey === "subscriptionStatus") {
        const getStatusOrder = (u) => {
          const st = u.subscription?.status;
          if (st === "active") return 2;
          if (["canceled", "cancelled"].includes(st)) return 1;
          return 0;
        };
        aVal = getStatusOrder(a);
        bVal = getStatusOrder(b);
      } else if (sortKey === "email") {
        aVal = (a.email || "").toLowerCase();
        bVal = (b.email || "").toLowerCase();
      } else if (sortKey === "consentToEmails") {
        aVal = a.consentToEmails ? 1 : 0;
        bVal = b.consentToEmails ? 1 : 0;
      } else if (sortKey === "lastSeen") {
        aVal = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
        bVal = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      } else if (sortKey === "subscription.current_period_end") {
        aVal = a.subscription?.current_period_end
          ? new Date(a.subscription.current_period_end).getTime()
          : 0;
        bVal = b.subscription?.current_period_end
          ? new Date(b.subscription.current_period_end).getTime()
          : 0;
      } else if (sortKey === "createdAt") {
        aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else if (sortKey === "matchesCount") {
        aVal = a.matchesCount || 0;
        bVal = b.matchesCount || 0;
      } else {
        return 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "desc"
          ? bVal.localeCompare(aVal)
          : aVal.localeCompare(bVal);
      }

      return sortDirection === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [users, sortKey, sortDirection, filters]);

  const handleSelectUser = (userId) => {
    const copy = new Set(selectedUsers);
    if (copy.has(userId)) {
      copy.delete(userId);
    } else {
      copy.add(userId);
    }
    setSelectedUsers(copy);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === sortedUsers.length && sortedUsers.length > 0) {
      setSelectedUsers(new Set());
    } else {
      const all = new Set(sortedUsers.map((u) => u._id));
      setSelectedUsers(all);
    }
  };

const handleSendEmails = async () => {
  if (!emailSubject.trim() || !emailBody.trim()) {
    alert("Please fill in both subject and body.");
    return;
  }

  if (selectedUsers.size === 0) {
    alert("No users selected.");
    return;
  }

  const recipients = sortedUsers.filter((u) => selectedUsers.has(u._id));

  const eligible = respectConsent
    ? recipients.filter((u) => u.consentToEmails)
    : recipients;

  if (eligible.length === 0) {
    alert("No eligible users (consent check might be filtering them out).");
    return;
  }

  if (!window.confirm(`Send email to ${eligible.length} user(s)?`)) {
    return;
  }

  setSendingEmail(true);
  setEmailProgress({ sent: 0, total: eligible.length, skipped: 0 });

  let sent = 0;
  let skipped = 0;

  try {
    for (const recipient of eligible) {
      if (!recipient.email) {
        skipped++;
        continue;
      }

      await axios.post(
        `${API_URL}/api/users/send-email`,
        {
          to: recipient.email,
          subject: emailSubject,
          html: emailBody,
          respectConsent,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      sent++;
      setEmailProgress({ sent, total: eligible.length, skipped });
    }

    alert(`Email sent successfully!\nSent: ${sent}\nSkipped: ${skipped}`);
  } catch (err) {
    console.error("Failed to send emails:", err);
    alert("Failed to send emails: " + (err.response?.data?.message || err.message));
  } finally {
    setSendingEmail(false);
  }
};

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) {
      alert("Please fill in both title and body.");
      return;
    }

    if (selectedUsers.size === 0) {
      alert("No users selected.");
      return;
    }

    const recipients = sortedUsers.filter((u) => selectedUsers.has(u._id));

    const eligible = notifOnlyNoEmailConsent
      ? recipients.filter((u) => !u.consentToEmails)
      : recipients;

    if (eligible.length === 0) {
      alert("No eligible users (filters might be excluding them).");
      return;
    }

    if (!window.confirm(`Send notification to ${eligible.length} user(s)?`)) {
      return;
    }

    setSendingNotif(true);

    try {
      const res = await axios.post(
        `${API_URL}/api/notifications/admin-create`,
        {
          userIds: eligible.map((u) => u._id),
          title: notifTitle,
          body: notifBody,
          severity: notifSeverity,
          expireDays: notifExpireDays,
          onlyNoEmailConsent: notifOnlyNoEmailConsent,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(`Notification sent to ${res.data.count || 0} user(s)!`);
    } catch (err) {
      console.error("Failed to send notification:", err);
      alert("Failed to send notification: " + (err.response?.data?.message || err.message));
    } finally {
      setSendingNotif(false);
    }
  };

  const getRegistrationsByDay = (users) => {
    const map = {};
    users.forEach((u) => {
      if (!u.createdAt) return;
      const dateStr = dayjs(u.createdAt).format("YYYY-MM-DD");
      map[dateStr] = (map[dateStr] || 0) + 1;
    });

    const sorted = Object.keys(map).sort();
    return sorted.map((date) => ({ date, count: map[date] }));
  };

  const getRegistrationsByWeekday = (users) => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    users.forEach((u) => {
      if (!u.createdAt) return;
      const d = dayjs(u.createdAt);
      const day = d.day();
      const idx = day === 0 ? 6 : day - 1;
      counts[idx]++;
    });
    return weekdays.map((day, i) => ({ day, count: counts[i] }));
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "-";
    return dayjs(lastSeen).fromNow();
  };

  const getOnlineStatus = (u) => {
    if (u.isOnline) return <span style={{ color: "green" }}>● Online</span>;
    return formatLastSeen(u.lastSeen);
  };

  const getSubscriptionIcon = (u) => {
    const status = u.subscription?.status;
    if (status === "active") return "💎 Pro";
    if (status === "canceled" || status === "cancelled") return "⏸️ Former";
    return "🆓 Free";
  };

  const getSubscriptionEndDate = (u) => {
    const end = u.subscription?.current_period_end;
    if (!end) return "-";
    return dayjs(end).format("YYYY-MM-DD");
  };

  const primaryBtn = (bg) => ({
    padding: "10px 20px",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: 14,
    color: "#fff",
    backgroundColor: bg,
  });

  const disabledBtn = {
    padding: "10px 20px",
    border: "none",
    borderRadius: 5,
    cursor: "not-allowed",
    fontWeight: "bold",
    fontSize: 14,
    color: "#999",
    backgroundColor: "#ddd",
  };

  const inputStyle = {
    padding: 8,
    fontSize: 14,
    borderRadius: 5,
    border: "1px solid #ccc",
    flex: 1,
  };

  const selectStyle = {
    padding: 8,
    fontSize: 14,
    borderRadius: 5,
    border: "1px solid #ccc",
  };

  const insertText = (text) => {
    setEmailBody((prev) => prev + text);
  };

  const insertHeading = () => {
    insertText('<h2 style="font-size:22px;font-weight:700;color:#111;">Heading</h2>');
  };

  const insertParagraph = () => {
    insertText("<p>Your text here</p>");
  };

  const insertButton = () => {
    insertText(
      `<a href="https://loggerhead.app" style="display:inline-block;background:${accentColor};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:16px;margin:16px 0;">Click Here</a>`
    );
  };

  const insertDivider = () => {
    insertText('<hr style="border:0;border-top:2px solid #e0e0e0;margin:24px 0;" />');
  };

  const openImageModal = () => {
    setShowImageModal(true);
  };

  const insertImageFromModal = () => {
    const url = imageUrlDraft.trim();
    if (!url) {
      alert("Please enter an image URL.");
      return;
    }

    const alt = imageAltDraft.trim() || "Image";
    const link = imageLinkDraft.trim();

    let html = `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:16px 0;border-radius:8px;" />`;

    if (link) {
      html = `<a href="${link}" style="display:block;margin:16px 0;">${html}</a>`;
    }

    insertText(html);
    setShowImageModal(false);
    setImageUrlDraft("");
    setImageAltDraft("");
    setImageLinkDraft("");
  };

  const renderEmailPreview = () => {
    return (
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 20,
          backgroundColor: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: 16,
          lineHeight: 1.6,
          color: "#111",
        }}
        dangerouslySetInnerHTML={{ __html: emailBody }}
      />
    );
  };

  return (
    <div style={{
      padding: isMobile ? 12 : 20,
      paddingTop: isNative ? "max(env(safe-area-inset-top), 12px)" : (isMobile ? 12 : 20),
      paddingBottom: isNative ? "max(env(safe-area-inset-bottom), 20px)" : 20,
      maxWidth: 1400,
      margin: "0 auto",
    }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 28 }}>User Admin</h1>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {formatLastRefresh()}
          </div>
        </div>

        <button
          onClick={() => loadUsers()}
          disabled={refreshingUsers}
          style={refreshingUsers ? disabledBtn : primaryBtn("#2563EB")}
        >
          {refreshingUsers ? "Refreshing..." : "Refresh Users"}
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: 10,
            marginBottom: 20,
            backgroundColor: "#ffebee",
            borderRadius: 5,
          }}
        >
          {message}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 20, marginBottom: 30, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#f5f5f5",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Total Users</div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.totalUsers}</div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#e3f2fd",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Subscribers</div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.subscribers}</div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#fff3e0",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Former</div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.formerSubscribers}</div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#e8f5e9",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Free</div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.freeUsers}</div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#c8e6c9",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Online Now</div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.activeNow}</div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#fff9c4",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Active Today</div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.activeToday}</div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 140,
            padding: 15,
            backgroundColor: "#ffe0b2",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
            Active This Week
          </div>
          <div style={{ fontSize: 24, fontWeight: "bold" }}>{stats.activeThisWeek}</div>
        </div>
      </div>

      {/* Data Loading Section */}
      <div
        style={{
          marginBottom: 30,
          padding: 20,
          backgroundColor: "#f8f9fa",
          borderRadius: 8,
          border: "2px solid #dee2e6",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 15 }}>📦 Data Loading Operations</h2>

        {/* Players Upload */}
        <div
          style={{ marginBottom: 20, padding: 15, backgroundColor: "#fff", borderRadius: 5 }}
        >
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Load Players</h4>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setPlayersFile(e.target.files[0])}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              onClick={handleLoadPlayers}
              disabled={loadingPlayers || !playersFile}
              style={loadingPlayers || !playersFile ? disabledBtn : primaryBtn("#2563EB")}
            >
              {loadingPlayers ? "Loading Players..." : "Load Players from JSON"}
            </button>
          </div>
          {playersFile && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              Selected: {playersFile.name} ({(playersFile.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>

        {/* Team Holdings Upload */}
        <div
          style={{ marginBottom: 20, padding: 15, backgroundColor: "#fff", borderRadius: 5 }}
        >
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Load Team Holdings</h4>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setTeamHoldingsFile(e.target.files[0])}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              onClick={handleLoadTeamHoldings}
              disabled={loadingTeamHoldings || !teamHoldingsFile}
              style={
                loadingTeamHoldings || !teamHoldingsFile ? disabledBtn : primaryBtn("#16A34A")
              }
            >
              {loadingTeamHoldings
                ? "Loading Team Holdings..."
                : "Load Team Holdings from JSON"}
            </button>
          </div>
          {teamHoldingsFile && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              Selected: {teamHoldingsFile.name} ({(teamHoldingsFile.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>

        {dataLoadMessage && (
          <div
            style={{
              padding: 12,
              marginTop: 15,
              backgroundColor: dataLoadMessage.startsWith("Error") ? "#fee2e2" : "#d1fae5",
              borderRadius: 5,
              border: `1px solid ${
                dataLoadMessage.startsWith("Error") ? "#fca5a5" : "#86efac"
              }`,
            }}
          >
            <strong>{dataLoadMessage}</strong>
          </div>
        )}

        {dataLoadStats && (
          <div
            style={{
              marginTop: 15,
              padding: 15,
              backgroundColor: "#fff",
              borderRadius: 5,
              border: "1px solid #e5e7eb",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: 10 }}>Load Statistics:</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              {Object.entries(dataLoadStats).map(([key, value]) => (
                <div key={key} style={{ padding: 10, backgroundColor: "#f9fafb", borderRadius: 4 }}>
                  <div
                    style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize" }}
                  >
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: "bold", color: "#111" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dataLoadLogs.length > 0 && (
          <div
            style={{
              marginTop: 15,
              padding: 15,
              backgroundColor: "#fff",
              borderRadius: 5,
              border: "1px solid #e5e7eb",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: 10 }}>Recent Logs:</h4>
            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: 12,
                backgroundColor: "#f9fafb",
                padding: 10,
                borderRadius: 4,
              }}
            >
              {dataLoadLogs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          marginBottom: 20,
          padding: 15,
          backgroundColor: "#f5f5f5",
          borderRadius: 8,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Subscription Status:
            </label>
            <select
              value={filters.subscriptionStatus}
              onChange={(e) =>
                setFilters({ ...filters, subscriptionStatus: e.target.value })
              }
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="active">Active Subscribers</option>
              <option value="former">Former Subscribers</option>
              <option value="free">Free Users</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Activity Status:
            </label>
            <select
              value={filters.activityStatus}
              onChange={(e) => setFilters({ ...filters, activityStatus: e.target.value })}
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="online">Online Now</option>
              <option value="today">Active Today</option>
              <option value="week">Active This Week</option>
              <option value="month">Active This Month</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Has Teams:
            </label>
            <select
              value={filters.hasTeams}
              onChange={(e) => setFilters({ ...filters, hasTeams: e.target.value })}
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="yes">Has Teams</option>
              <option value="no">No Teams</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Has Matches:
            </label>
            <select
              value={filters.hasMatches}
              onChange={(e) => setFilters({ ...filters, hasMatches: e.target.value })}
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="yes">Has Matches</option>
              <option value="no">No Matches</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Email Consent:
            </label>
            <select
              value={filters.emailConsent}
              onChange={(e) => setFilters({ ...filters, emailConsent: e.target.value })}
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="yes">Opted In</option>
              <option value="no">Not Opted In</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Volleyball Role:
            </label>
            <select
              value={filters.volleyballRole}
              onChange={(e) => setFilters({ ...filters, volleyballRole: e.target.value })}
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="coach">Coach</option>
              <option value="player">Player</option>
              <option value="parent">Parent</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
              Search Email:
            </label>
            <input
              type="text"
              placeholder="Enter email..."
              value={filters.searchEmail}
              onChange={(e) => setFilters({ ...filters, searchEmail: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>
            Filtered: {sortedUsers.length} / {users.length}
          </strong>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => setShowEmailSection(!showEmailSection)}
          style={primaryBtn("#111")}
        >
          {showEmailSection ? "Hide Email Section" : "Send Email to Selected"}
        </button>
        <button
          onClick={() => setShowNotifSection(!showNotifSection)}
          style={primaryBtn("#6B7280")}
        >
          {showNotifSection ? "Hide Notification Section" : "Send Notification to Selected"}
        </button>
      </div>

      {/* Email Section */}
      {showEmailSection && (
        <div
          style={{
            marginBottom: 30,
            padding: 20,
            backgroundColor: "#f9f9f9",
            borderRadius: 8,
          }}
        >
          <h3>Send Bulk Email</h3>
          <p>
            Selected: {selectedUsers.size} users
            {respectConsent && (
              <span style={{ color: "#d97706" }}> (only those who consented)</span>
            )}
          </p>

          <label style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={respectConsent}
              onChange={(e) => setRespectConsent(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Only send to users who gave consent
          </label>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
              Subject:
            </label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
              placeholder="Email subject"
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
              Body (HTML):
            </label>

            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  ...primaryBtn(showPreview ? "#9CA3AF" : "#111"),
                  fontSize: 12,
                  padding: "6px 12px",
                }}
              >
                Edit HTML
              </button>
              <button
                onClick={() => setShowPreview(true)}
                style={{
                  ...primaryBtn(!showPreview ? "#9CA3AF" : "#111"),
                  fontSize: 12,
                  padding: "6px 12px",
                }}
              >
                Preview
              </button>
            </div>

            {!showPreview && (
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={12}
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 14,
                  border: "1px solid #ccc",
                  borderRadius: 5,
                  fontFamily: "monospace",
                }}
                placeholder="Enter HTML content here..."
              />
            )}

            {showPreview && renderEmailPreview()}
          </div>

          {!showPreview && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  Accent Color:
                </label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: 60, height: 40, border: "none", cursor: "pointer" }}
                />
                <span style={{ marginLeft: 10, fontSize: 14, color: "#666" }}>
                  {accentColor}
                </span>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <button onClick={insertHeading} style={primaryBtn("#111")}>
                  + Heading
                </button>
                <button onClick={insertParagraph} style={primaryBtn("#111")}>
                  + Paragraph
                </button>
                <button onClick={insertButton} style={primaryBtn("#111")}>
                  + Button
                </button>
                <button onClick={insertDivider} style={primaryBtn("#6B7280")}>
                  + Divider
                </button>
                <button onClick={openImageModal} style={primaryBtn("#059669")}>
                  + Image
                </button>
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <button
              onClick={handleSendEmails}
              disabled={sendingEmail}
              style={sendingEmail ? disabledBtn : primaryBtn("#DC2626")}
            >
              {sendingEmail
                ? `Sending... ${emailProgress.sent}/${emailProgress.total}`
                : "Send Email"}
            </button>
          </div>
        </div>
      )}

      {/* Notification Section */}
      {showNotifSection && (
        <div
          style={{
            marginBottom: 30,
            padding: 20,
            backgroundColor: "#f0f9ff",
            borderRadius: 8,
          }}
        >
          <h3>Send Bulk Notification</h3>
          <p>
            Selected: {selectedUsers.size} users
            {notifOnlyNoEmailConsent && (
              <span style={{ color: "#d97706" }}>
                {" "}
                (only those who did NOT consent to emails)
              </span>
            )}
          </p>

          <label style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={notifOnlyNoEmailConsent}
              onChange={(e) => setNotifOnlyNoEmailConsent(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Only send to users who did NOT consent to emails
          </label>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
              Title:
            </label>
            <input
              type="text"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
              placeholder="Notification title"
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
              Body:
            </label>
            <textarea
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              rows={4}
              style={{ ...inputStyle, width: "100%" }}
              placeholder="Notification body"
            />
          </div>

          <div style={{ marginBottom: 10, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                Severity:
              </label>
              <select
                value={notifSeverity}
                onChange={(e) => setNotifSeverity(e.target.value)}
                style={selectStyle}
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                Expire in (days):
              </label>
              <input
                type="number"
                value={notifExpireDays}
                onChange={(e) => setNotifExpireDays(Number(e.target.value))}
                style={{ ...inputStyle, width: 100 }}
                min="1"
                max="365"
              />
            </div>
          </div>

          <button
            onClick={handleSendNotification}
            disabled={sendingNotif}
            style={sendingNotif ? disabledBtn : primaryBtn("#0284C7")}
          >
            {sendingNotif ? "Sending..." : "Send Notification"}
          </button>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowImageModal(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              padding: 30,
              borderRadius: 10,
              width: "90%",
              maxWidth: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Insert Image</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                Image URL:
              </label>
              <input
                type="text"
                value={imageUrlDraft}
                onChange={(e) => setImageUrlDraft(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                Alt Text (optional):
              </label>
              <input
                type="text"
                value={imageAltDraft}
                onChange={(e) => setImageAltDraft(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="Describe the image"
              />
            </div>

            {imageUrlDraft.trim() && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 8 }}>
                  Preview:
                </label>
                <img
                  src={imageUrlDraft}
                  alt="Preview"
                  style={{
                    maxWidth: "100%",
                    height: "auto",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                  }}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                Link URL (optional):
              </label>
              <input
                type="text"
                value={imageLinkDraft}
                onChange={(e) => setImageLinkDraft(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="https://example.com/destination"
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                onClick={insertImageFromModal}
                disabled={!String(imageUrlDraft || "").trim()}
                style={
                  !String(imageUrlDraft || "").trim()
                    ? disabledBtn
                    : primaryBtn("#111")
                }
              >
                Insert Image
              </button>

              <button
                onClick={() => {
                  setImageUrlDraft("");
                  setImageAltDraft("");
                  setImageLinkDraft("");
                }}
                style={primaryBtn("#6B7280")}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination controls — top */}
      {(() => {
        const total = sortedUsers.length;
        const totalPages = pageSize === "all" ? 1 : Math.ceil(total / pageSize);
        const pagedUsers = pageSize === "all" ? sortedUsers : sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        const pageSizes = [25, 50, 100, "all"];
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#555" }}>
                {pageSize === "all"
                  ? `Showing all ${total} users`
                  : `Page ${currentPage} of ${totalPages} (${total} total)`}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <label style={{ fontSize: 12, color: "#555" }}>Per page:</label>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(e.target.value === "all" ? "all" : Number(e.target.value)); setCurrentPage(1); }}
                  style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: 13 }}
                >
                  {pageSizes.map(s => <option key={s} value={s}>{s === "all" ? "View All" : s}</option>)}
                </select>
                {pageSize !== "all" && (
                  <>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #ccc", cursor: currentPage === 1 ? "not-allowed" : "pointer", background: "#fff" }}>‹</button>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #ccc", cursor: currentPage === totalPages ? "not-allowed" : "pointer", background: "#fff" }}>›</button>
                  </>
                )}
              </div>
            </div>

            {/* User Table */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginBottom: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ backgroundColor: "#f5f5f5" }}>
                  <th style={{ border: "1px solid #ccc", padding: 8, width: 44 }}>
                    <input type="checkbox" checked={selectedUsers.size === sortedUsers.length && sortedUsers.length > 0} onChange={handleSelectAll} />
                  </th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("isOnline")}>Status</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("subscriptionStatus")}>Plan</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("email")}>Email</th>
                  <th style={{ border: "1px solid #ccc", padding: 8 }}>Role</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("consentToEmails")} title="Email consent">📧</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("lastSeen")}>Last Seen {sortKey === "lastSeen" && (sortDirection === "desc" ? "↓" : "↑")}</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("subscription.current_period_end")}>Sub End</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("createdAt")}>Registered</th>
                  <th style={{ border: "1px solid #ccc", padding: 8 }}>Teams</th>
                  <th style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }} onClick={() => handleSort("matchesCount")}>Matches</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => {
                  const roleKey = normalizeRole(u.volleyballRole);
                  const rm = roleMeta[roleKey] || roleMeta.other;
                  return (
                    <tr key={u._id} style={{ backgroundColor: selectedUsers.has(u._id) ? "#e3f2fd" : u.isOnline ? "#f0fff4" : rm.rowBg }}>
                      <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}><input type="checkbox" checked={selectedUsers.has(u._id)} onChange={() => handleSelectUser(u._id)} /></td>
                      <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{getOnlineStatus(u)}</td>
                      <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{getSubscriptionIcon(u)}</td>
                      <td style={{ border: "1px solid #ccc", padding: 8 }}>{u.email}</td>
                      <td style={{ border: "1px solid #ccc", padding: 8 }}>
                        <span title={`volleyballRole: ${u.volleyballRole || "other"}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, fontWeight: 800, color: "#111" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: rm.dot }} />
                          {rm.label}
                        </span>
                      </td>
                      <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center", backgroundColor: u.consentToEmails ? "#e8f5e9" : "#ffebee" }}>
                        <span title={u.consentToEmails ? "Opted in" : "Not opted in"}>{u.consentToEmails ? "✅" : "❌"}</span>
                      </td>
                      <td style={{ border: "1px solid #ccc", padding: 8 }}>{formatLastSeen(u.lastSeen)}</td>
                      <td style={{ border: "1px solid #ccc", padding: 8 }}>{getSubscriptionEndDate(u)}</td>
                      <td style={{ border: "1px solid #ccc", padding: 8 }}>{u.createdAt ? dayjs(u.createdAt).format("YYYY-MM-DD") : "-"}</td>
                      <td style={{ border: "1px solid #ccc", padding: 8 }}>
                        {(() => {
                          const arr = normalizeTeams(u.teams);
                          if (arr.length === 0) return "-";
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>{arr.length} team{arr.length > 1 ? "s" : ""}</div>
                              {arr.slice(0, 6).map((t, idx) => <div key={idx} style={{ fontSize: 12, color: "#333" }}>{t}</div>)}
                              {arr.length > 6 && <div style={{ fontSize: 12, color: "#666" }}>+ {arr.length - 6} more…</div>}
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{u.matchesCount || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Pagination controls — bottom */}
            {pageSize !== "all" && totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 30, flexWrap: "wrap" }}>
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #ccc", cursor: currentPage === 1 ? "not-allowed" : "pointer", background: "#fff" }}>«</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #ccc", cursor: currentPage === 1 ? "not-allowed" : "pointer", background: "#fff" }}>‹</button>
                <span style={{ fontSize: 13, color: "#555", padding: "4px 8px" }}>{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #ccc", cursor: currentPage === totalPages ? "not-allowed" : "pointer", background: "#fff" }}>›</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #ccc", cursor: currentPage === totalPages ? "not-allowed" : "pointer", background: "#fff" }}>»</button>
              </div>
            )}
          </>
        );
      })()}

      {false && <table style={{ display: "none" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th style={{ border: "1px solid #ccc", padding: 8, width: 44 }}>
              <input
                type="checkbox"
                checked={selectedUsers.size === sortedUsers.length && sortedUsers.length > 0}
                onChange={handleSelectAll}
              />
            </th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("isOnline")}
            >
              Status
            </th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("subscriptionStatus")}
            >
              Plan
            </th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("email")}
            >
              Email
            </th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>Role</th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("consentToEmails")}
              title="Email consent"
            >
              📧
            </th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("lastSeen")}
            >
              Last Seen {sortKey === "lastSeen" && (sortDirection === "desc" ? "↓" : "↑")}
            </th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("subscription.current_period_end")}
            >
              Subscription End
            </th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("createdAt")}
            >
              Registered
            </th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>Teams</th>
            <th
              style={{ border: "1px solid #ccc", padding: 8, cursor: "pointer" }}
              onClick={() => handleSort("matchesCount")}
            >
              Matches
            </th>
          </tr>
        </thead>

        <tbody>
          {sortedUsers.map((u) => {
            const roleKey = normalizeRole(u.volleyballRole);
            const rm = roleMeta[roleKey] || roleMeta.other;

            return (
              <tr
                key={u._id}
                style={{
                  backgroundColor: selectedUsers.has(u._id)
                    ? "#e3f2fd"
                    : u.isOnline
                    ? "#f0fff4"
                    : rm.rowBg,
                }}
              >
                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u._id)}
                    onChange={() => handleSelectUser(u._id)}
                  />
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>
                  {getOnlineStatus(u)}
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>
                  {getSubscriptionIcon(u)}
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8 }}>{u.email}</td>

                <td style={{ border: "1px solid #ccc", padding: 8 }}>
                  <span
                    title={`volleyballRole: ${u.volleyballRole || "other"}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "#fff",
                      border: "1px solid rgba(0,0,0,0.08)",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#111",
                    }}
                  >
                    <span
                      style={{ width: 8, height: 8, borderRadius: 99, background: rm.dot }}
                    />
                    {rm.label}
                  </span>
                </td>

                <td
                  style={{
                    border: "1px solid #ccc",
                    padding: 8,
                    textAlign: "center",
                    backgroundColor: u.consentToEmails ? "#e8f5e9" : "#ffebee",
                  }}
                >
                  <span title={u.consentToEmails ? "Opted in" : "Not opted in"}>
                    {u.consentToEmails ? "✅" : "❌"}
                  </span>
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8 }}>
                  {formatLastSeen(u.lastSeen)}
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8 }}>
                  {getSubscriptionEndDate(u)}
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8 }}>
                  {u.createdAt ? dayjs(u.createdAt).format("YYYY-MM-DD") : "-"}
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8 }}>
                  {(() => {
                    const arr = normalizeTeams(u.teams);
                    if (arr.length === 0) return "-";
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>
                          {arr.length} team{arr.length > 1 ? "s" : ""}
                        </div>
                        {arr.slice(0, 6).map((t, idx) => (
                          <div key={idx} style={{ fontSize: 12, color: "#333" }}>
                            {t}
                          </div>
                        ))}
                        {arr.length > 6 && (
                          <div style={{ fontSize: 12, color: "#666" }}>
                            + {arr.length - 6} more…
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>

                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>
                  {u.matchesCount || 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>}

      {/* Charts */}
      <h3>Registrations by Date</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={getRegistrationsByDay(users)}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="count" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>

      <h3 style={{ marginTop: 20 }}>Registrations by Weekday</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={getRegistrationsByWeekday(users)}>
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" />
        </BarChart>
      </ResponsiveContainer>

      <h3 style={{ marginTop: 20 }}>Subscription Status Breakdown</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={[
            { status: "Subscribers", count: stats.subscribers },
            { status: "Former", count: stats.formerSubscribers },
            { status: "Free", count: stats.freeUsers },
          ]}
        >
          <XAxis dataKey="status" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BetaAdminPage;