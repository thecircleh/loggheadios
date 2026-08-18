import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Country, State } from "country-state-city";
import "./Profile.css";
import SubscriptionButtons from "./SubscriptionButtons";
import TeamNameBuilder from "./TeamNameBuilder";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const Profile = ({ setCurrentMatchId, isNative }) => {
  const { user, token, removeToken, loading, refreshUser, hasGiftSubscription, hasPremium } =
    useAuth();
  const navigate = useNavigate();

  const AUTO_SAVE_DEBOUNCE_MS = 700;
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const subscriptionRef = useRef(null);

  const [saveStatus, setSaveStatus] = useState(""); // '', 'Saving…', 'Saved', 'Error'

  const [profile, setProfile] = useState({
    email: "",
    displayName: "",
    teams: [],
    archivedTeams: [],
    state: "",
    country: "",
    consentToEmails: false,
    password: "",
    volleyballRole: "parent",
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [giftCode, setGiftCode] = useState("");

  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedTeamToAdd, setArchivedTeamToAdd] = useState("");

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTeamName, setDuplicateTeamName] = useState("");

  const [availableStates, setAvailableStates] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info"); // 'info' | 'error'
  const [myCodes, setMyCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const showMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  // ── My Players (ROI) ────────────────────────────────────────────────────
  const [claimedPlayers,  setClaimedPlayers]  = useState([]);
  const [showClaimPanel,  setShowClaimPanel]  = useState(false);
  const [availableTeams,  setAvailableTeams]  = useState([]);
  const [loadingClaim,    setLoadingClaim]    = useState(false);

  const loadClaimedPlayers = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get(`${API_URL}/api/roi/claimed-players`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClaimedPlayers(res.data.players || []);
    } catch {}
  }, [user?.id, token]);

  const loadTeamsAndPlayers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/roi/teams-and-players`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAvailableTeams(res.data.teams || []);
    } catch {}
  }, [token]);

  const loadMyCodes = useCallback(async () => {
    if (!token) return;
    setCodesLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/gifts/my-codes`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      // Deduplicate by code string in case of any legacy duplication
      const seen = new Set();
      const deduped = (res.data.codes || []).filter((c) => {
        if (seen.has(c.code)) return false;
        seen.add(c.code);
        return true;
      });
      setMyCodes(deduped);
    } catch (err) {
      console.error("Failed to load gift codes:", err);
    } finally {
      setCodesLoading(false);
    }
  }, [token]);

  const markSent = useCallback(async (code) => {
    try {
      await axios.post(`${API_URL}/api/gifts/mark-sent/${code}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      await loadMyCodes();
    } catch (err) {
      showMessage(err.response?.data?.message || "Failed to mark code as sent.", "error");
    }
  }, [token, loadMyCodes]);

  const retireCode = useCallback(async (code) => {
    try {
      const res = await axios.post(`${API_URL}/api/gifts/retire/${code}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      showMessage(`Code retired. New code generated: ${res.data.replacement.code}`);
      await loadMyCodes();
    } catch (err) {
      showMessage(err.response?.data?.message || "Failed to retire code.", "error");
    }
  }, [token, loadMyCodes]);

  const copyCode = useCallback((code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const claimPlayer = async (playerId) => {
    setLoadingClaim(true);
    try {
      await axios.post(`${API_URL}/api/roi/claim`, { playerId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await Promise.all([loadClaimedPlayers(), loadTeamsAndPlayers()]);
    } catch {
      showMessage('Failed to claim player', 'error');
    } finally {
      setLoadingClaim(false);
    }
  };

  const unclaimPlayer = async (playerId) => {
    setLoadingClaim(true);
    try {
      await axios.delete(`${API_URL}/api/roi/claim/${playerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await Promise.all([loadClaimedPlayers(), loadTeamsAndPlayers()]);
    } catch {
      showMessage('Failed to unclaim player', 'error');
    } finally {
      setLoadingClaim(false);
    }
  };

  useEffect(() => { loadClaimedPlayers(); }, [loadClaimedPlayers]);
  // ────────────────────────────────────────────────────────────────────────

  const updateStateList = (selectedCountry) => {
    const selected = Country.getAllCountries().find(
      (c) => c.name === selectedCountry
    );
    if (selected) {
      setAvailableStates(State.getStatesOfCountry(selected.isoCode));
    } else {
      setAvailableStates([]);
    }
  };

  const saveProfile = async (partial = {}) => {
    if (!user?.id) return;
    try {
      setSaveStatus("Saving…");
      const payload = {
        displayName: profile.displayName,
        teams: Array.isArray(profile.teams) ? profile.teams : [],
        state: profile.state,
        country: profile.country,
        consentToEmails: profile.consentToEmails,
        volleyballRole: profile.volleyballRole,
        ...partial,
      };
      await axios.put(`${API_URL}/api/users/${user.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setSaveStatus("Saved ✓");
      setTimeout(() => setSaveStatus(""), 1500);
    } catch (err) {
      console.error("Auto-save failed:", err);
      setSaveStatus("Error");
    }
  };

  const pushTeam = (teamName) => {
    if (!teamName) return;
    if (profile.teams.includes(teamName)) {
      setDuplicateTeamName(teamName);
      setShowDuplicateModal(true);
      return;
    }
    if (profile.archivedTeams && profile.archivedTeams.includes(teamName)) {
      setArchivedTeamToAdd(teamName);
      setShowArchivedModal(true);
      return;
    }
    setProfile((prev) => ({ ...prev, teams: [...prev.teams, teamName] }));
  };

  const removeTeam = (teamName) => {
    setProfile((prev) => ({
      ...prev,
      teams: prev.teams.filter((t) => t !== teamName),
    }));
  };

  const unarchiveTeam = async (teamName) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/users/${user.id}/teams/unarchive`,
        { teamName },
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setProfile((prev) => ({
        ...prev,
        teams: res.data.teams || [...prev.teams, teamName],
        archivedTeams:
          res.data.archivedTeams ||
          prev.archivedTeams.filter((t) => t !== teamName),
      }));
      showMessage("Team unarchived successfully!");
      setShowArchivedModal(false);
      setArchivedTeamToAdd("");
    } catch (err) {
      showMessage(
        `Error unarchiving team: ${err.response?.data?.message || "Unknown error"}`,
        "error"
      );
    }
  };

  // Auto-save (debounced)
  useEffect(() => {
    if (!user?.id) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProfile(), AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [profile, user?.id]);

  // Load profile
  useEffect(() => {
    if (!user?.id) {
      showMessage("Error: User ID is missing. Please log in again.", "error");
      return;
    }
    axios
      .get(`${API_URL}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      })
      .then((res) => {
        setProfile({
          email: res.data.email,
          displayName: res.data.displayName || "",
          teams: Array.isArray(res.data.teams) ? res.data.teams : [],
          archivedTeams: Array.isArray(res.data.archivedTeams)
            ? res.data.archivedTeams
            : [],
          state: res.data.state || "",
          country: res.data.country || "",
          consentToEmails: res.data.consentToEmails || false,
          password: "",
          volleyballRole: res.data.volleyballRole || "parent",
        });
        if (res.data.country) updateStateList(res.data.country);
      })
      .catch((err) => {
        showMessage(
          `Failed to load profile: ${err.response?.data?.message || "Unknown error"}`,
          "error"
        );
      });
  }, [user, token]);

  // Checkout result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const purchaseType = params.get("purchaseType");
    const sessionId = params.get("session_id");
    if (checkout !== "success") return;

    const processCheckout = async () => {
      try {
        if (purchaseType === "gift_subscription" && sessionId) {
          const res = await axios.get(`${API_URL}/api/gifts/checkout-result`, {
            params: { session_id: sessionId },
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
          const count = res.data.codes?.length || 1;
          showMessage(`Gift purchase successful — ${count} code${count > 1 ? "s" : ""} added to My Gift Codes below.`);
          await loadMyCodes();
        } else {
          showMessage("Purchase successful.");
        }
        setTimeout(() => refreshUser(), 1000);
      } catch (err) {
        showMessage(
          err.response?.data?.message ||
            err.response?.data?.error ||
            "Purchase completed but details could not be loaded.",
          "error"
        );
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    processCheckout();
  }, [token]);

  // Load gift codes whenever the user/token is ready
  useEffect(() => {
    if (user?.id && token) loadMyCodes();
  }, [user?.id, token, loadMyCodes]);

  // Scroll to subscription section
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "subscription" && subscriptionRef.current) {
      setTimeout(() => {
        subscriptionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  const redeemGift = async () => {
    try {
      const res = await axios.post(
        `${API_URL}/api/gifts/redeem`,
        { code: giftCode.trim() },
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setGiftCode("");
      // Refresh user immediately so giftSubscription state reflects in UI
      await refreshUser();
      await loadMyCodes();
      showMessage(
        `Gift redeemed! Access active until ${new Date(res.data.endsAt).toLocaleDateString()}`
      );
    } catch (err) {
      showMessage(err.response?.data?.message || "Unable to redeem gift.", "error");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfile((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (name === "country") updateStateList(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMessage("");

    if (!profile.country) {
      showMessage("Please select a country.", "error");
      setUpdating(false);
      return;
    }

    try {
      await axios.put(
        `${API_URL}/api/users/${user.id}`,
        {
          displayName: profile.displayName,
          teams: Array.isArray(profile.teams)
            ? profile.teams
            : profile.teams.split(",").map((t) => t.trim()),
          state: profile.state,
          country: profile.country,
          consentToEmails: profile.consentToEmails,
          volleyballRole: profile.volleyballRole,
          password: profile.password || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );
      showMessage("Profile updated!");
    } catch (err) {
      showMessage(
        `Error updating profile: ${err.response?.data?.message || "Unknown error"}`,
        "error"
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    setProfile({
      email: "",
      displayName: "",
      teams: [],
      archivedTeams: [],
      state: "",
      country: "",
      consentToEmails: false,
      password: "",
      volleyballRole: "parent",
    });
    removeToken();
    navigate("/login");
  };

  if (loading) return <p style={{ textAlign: "center", padding: 40 }}>Loading…</p>;
  if (!user) return <p style={{ textAlign: "center", padding: 40 }}>Not authenticated.</p>;

  return (
    <div className="page-wrapper">
      <h2 className="page-header">Profile</h2>

      {/* Auto-save indicator */}
      {saveStatus && (
        <p className={`save-status${saveStatus === "Error" ? " error" : ""}`}>
          {saveStatus}
        </p>
      )}

      <form onSubmit={handleSubmit} className="profile-form">

        {/* ── Account ── */}
        <div className="card">
          <p className="card-title">Account</p>

          <div className="field">
            <label>Email</label>
            <input type="email" name="email" value={profile.email} disabled />
          </div>

          <div className="field">
            <label>Display Name</label>
            <input
              type="text"
              name="displayName"
              value={profile.displayName}
              onChange={handleChange}
              placeholder="Your name"
            />
          </div>

          <div className="field">
            <label className="section-label">Your volleyball role</label>
            <div className="segmented">
              {[
                ["parent", "Parent"],
                ["player", "Player"],
                ["coach", "Coach"],
                ["other", "Other"],
              ].map(([value, label]) => (
                <label key={value} className="segmented-item">
                  <input
                    type="radio"
                    name="volleyballRole"
                    value={value}
                    checked={profile.volleyballRole === value}
                    onChange={handleChange}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Teams ── */}
        <div className="card">
          <p className="card-title">Teams</p>

          <TeamNameBuilder apiUrl={API_URL} token={token} onAddTeam={pushTeam} />

          {profile.teams.length > 0 && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Active Teams</label>
              <div className="team-input-wrapper">
                {profile.teams.map((team, index) => (
                  <span key={`${team}-${index}`} className="team-chip">
                    {team}
                    <button
                      type="button"
                      onClick={() => removeTeam(team)}
                      aria-label={`Remove ${team}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Location ── */}
        <div className="card">
          <p className="card-title">Location</p>

          <div className="field">
            <label>Country</label>
            <select name="country" value={profile.country} onChange={handleChange}>
              <option value="">Select a country</option>
              {Country.getAllCountries().map((c) => (
                <option key={c.isoCode} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {availableStates.length > 0 && (
            <div className="field">
              <label>State / Region</label>
              <select name="state" value={profile.state} onChange={handleChange}>
                <option value="">Select a state/region</option>
                {availableStates.map((s) => (
                  <option key={s.isoCode} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Security & Preferences ── */}
        <div className="card">
          <p className="card-title">Security &amp; Preferences</p>

          {!user.googleId && (
            <button
              type="button"
              className="change-password-button"
              onClick={() => setShowPasswordModal(true)}
            >
              Change Password
            </button>
          )}

          <div className="checkbox-wrapper">
            <input
              type="checkbox"
              id="consentToEmails"
              name="consentToEmails"
              checked={profile.consentToEmails}
              onChange={handleChange}
            />
            <label htmlFor="consentToEmails">
              Send me occasional emails about Loggerhead updates
            </label>
          </div>
        </div>

        {message && (
          <p className={`profile-message${messageType === "error" ? " error" : ""}`}>
            {message}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={updating}>
          {updating ? "Saving…" : "Save Profile"}
        </button>
      </form>

      {/* ── Gift Subscription (active) ── */}
      {user?.giftSubscription?.active && (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="card-title">Gift Subscription</p>
          <div className="gift-badge">🎁 Gift Active</div>
          <div className="field">
            <label>Plan</label>
            <p style={{ margin: 0, fontSize: 15 }}>{user.giftSubscription.planType}</p>
          </div>
          <div className="field">
            <label>Expires</label>
            <p style={{ margin: 0, fontSize: 15 }}>
              {new Date(user.giftSubscription.endsAt).toLocaleDateString()}
            </p>
          </div>
          <div className="field">
            <label>Gifted By</label>
            <p style={{ margin: 0, fontSize: 15 }}>{user.giftSubscription.giftedBy}</p>
          </div>
        </div>
      )}

      {/* ── My Gift Codes ── */}
      {(myCodes.length > 0 || codesLoading) && (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="card-title">🎁 My Gift Codes</p>

          {codesLoading && (
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Loading…</p>
          )}

          {/* Available */}
          {myCodes.filter(c => c.status === "available").length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#34C759", letterSpacing: 1, marginBottom: 8 }}>
                Available
              </p>
              {myCodes.filter(c => c.status === "available").map(c => (
                <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <div className="gift-code-display" style={{ flex: 1, minWidth: 180 }}>{c.code}</div>
                  <button type="button" className="primary-button" style={{ width: "auto", padding: "8px 14px" }}
                    onClick={() => copyCode(c.code)}>
                    {copiedCode === c.code ? "Copied!" : "Copy"}
                  </button>
                  <button type="button" className="secondary-button" style={{ width: "auto", padding: "8px 14px" }}
                    onClick={() => markSent(c.code)}>
                    Mark as Sent
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pending Redemption */}
          {myCodes.filter(c => c.status === "sent").length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#FF9500", letterSpacing: 1, marginBottom: 8 }}>
                Pending Redemption
              </p>
              {myCodes.filter(c => c.status === "sent").map(c => (
                <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <div className="gift-code-display" style={{ flex: 1, minWidth: 180, opacity: 0.7 }}>{c.code}</div>
                  <button type="button" className="primary-button" style={{ width: "auto", padding: "8px 14px" }}
                    onClick={() => copyCode(c.code)}>
                    {copiedCode === c.code ? "Copied!" : "Copy"}
                  </button>
                  <button type="button" className="secondary-button"
                    style={{ width: "auto", padding: "8px 14px", borderColor: "#FF3B30", color: "#FF3B30" }}
                    onClick={() => {
                      if (window.confirm("Pull back this code? It will be retired and a new code will be generated to replace it.")) {
                        retireCode(c.code);
                      }
                    }}>
                    Pull Back
                  </button>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Pull Back retires the sent code and generates a fresh one — prevents two copies of the same code being active.
              </p>
            </div>
          )}

          {/* Redeemed */}
          {myCodes.filter(c => c.status === "redeemed").length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
                Redeemed
              </p>
              {myCodes.filter(c => c.status === "redeemed").map(c => (
                <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, opacity: 0.5 }}>
                  <div className="gift-code-display" style={{ flex: 1, minWidth: 180, fontSize: 14 }}>{c.code}</div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {c.redeemedAt ? new Date(c.redeemedAt).toLocaleDateString() : "Redeemed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Redeem Gift Code ── */}
      <div className="card" style={{ marginTop: 14 }}>
        <p className="card-title">Redeem a Gift Code</p>
        <div className="field">
          <label>Gift Code</label>
          <input
            className="gift-code-input"
            type="text"
            placeholder="LH-GIFT-XXXX-XXXX"
            value={giftCode}
            onChange={(e) => setGiftCode(e.target.value)}
          />
        </div>
        <button type="button" className="primary-button" onClick={redeemGift}>
          Redeem Gift
        </button>
      </div>

      {/* ── My Players ── */}
      <div className="card" style={{ marginTop: 14 }}>
        {!hasPremium ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p className="card-title" style={{ margin: '0 0 8px' }}>My Players</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>
              Claim your player and unlock the <strong>VB Expense Tracker</strong> — track every dollar invested in their development alongside their real match stats.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => subscriptionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Subscribe to Unlock
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p className="card-title" style={{ margin: 0 }}>My Players</p>
              <button
                type="button"
                className="primary-button"
                style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  if (!showClaimPanel) loadTeamsAndPlayers();
                  setShowClaimPanel(v => !v);
                }}
              >
                {showClaimPanel ? 'Done' : '+ Claim Player'}
              </button>
            </div>

            {claimedPlayers.length === 0 && !showClaimPanel && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                Claim your player(s) to track your investment and see their stats in your VB Expense Tracker.
              </p>
            )}

            {claimedPlayers.map(p => (
              <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#3b82f622', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 14, flexShrink: 0 }}>
                  {p.number || p.name?.[0] || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.team}{p.linkedCount > 1 ? ` · + ${p.linkedCount - 1} Linked` : ''}</div>
                </div>
                <button
                  type="button"
                  onClick={() => unclaimPlayer(p._id)}
                  disabled={loadingClaim}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', padding: '4px 8px' }}
                >
                  Remove
                </button>
              </div>
            ))}

            {process.env.NODE_ENV === 'development' && claimedPlayers.length > 0 && (
              <a
                href="/recruiting"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 14,
                  padding: '11px 14px',
                  background: 'linear-gradient(135deg, rgba(52,199,89,0.12) 0%, rgba(52,199,89,0.06) 100%)',
                  border: '1.5px solid rgba(52,199,89,0.35)',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: '#1C7A38',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span>🏐 Recruiting Card</span>
                <span style={{ fontSize: 16, opacity: 0.7 }}>›</span>
              </a>
            )}

            {showClaimPanel && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>Players on your teams</p>
                {availableTeams.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No teams found. Add teams to your profile above.</p>
                )}
                {availableTeams.map(team => (
                  <div key={team.name} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{team.name}</div>
                    {team.players.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No players on this team.</p>
                    )}
                    {team.players.map(pl => (
                      <div key={pl._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: pl.claimed ? '#10b98122' : '#6b728018', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: pl.claimed ? '#10b981' : '#6b7280', fontSize: 13, flexShrink: 0 }}>
                          {pl.number || pl.name?.[0] || '?'}
                        </div>
                        <span style={{ flex: 1, fontSize: 14 }}>{pl.name}</span>
                        {pl.claimed
                          ? <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Claimed</span>
                          : (
                            <button
                              type="button"
                              className="primary-button"
                              style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                              onClick={() => claimPlayer(pl._id)}
                              disabled={loadingClaim}
                            >
                              Claim
                            </button>
                          )
                        }
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Subscription ── */}
      <div className="card" style={{ marginTop: 14 }} ref={subscriptionRef}>
        {hasGiftSubscription && (
          <div className="gift-badge" style={{ marginBottom: 14 }}>
            🎁 Gift Subscription Active
          </div>
        )}
        <SubscriptionButtons isNative={isNative} />
      </div>

      {/* Logout at the bottom */}
      <button onClick={handleLogout} className="logout-button">
        Log Out
      </button>

      {/* Account deletion — required by App Store guideline 5.1.1(v) */}
      <div style={{ textAlign: 'center', marginTop: 12, marginBottom: 8 }}>
        <a
          href="/delete-account"
          style={{ fontSize: 13, color: '#FF3B30', textDecoration: 'none' }}
        >
          Delete Account
        </a>
      </div>

      {/* ── Change Password Modal ── */}
      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Change Password</h3>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="modal-input"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="modal-input"
            />
            <div className="modal-button-group">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-submit"
                onClick={async () => {
                  if (newPassword !== confirmPassword) {
                    showMessage("Passwords do not match.", "error");
                    return;
                  }
                  setUpdating(true);
                  try {
                    await axios.put(
                      `${API_URL}/api/users/${user.id}`,
                      { password: newPassword },
                      {
                        headers: { Authorization: `Bearer ${token}` },
                        withCredentials: true,
                      }
                    );
                    showMessage("Password updated successfully!");
                    setShowPasswordModal(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  } catch {
                    showMessage("Error updating password.", "error");
                  } finally {
                    setUpdating(false);
                  }
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archived Team Modal ── */}
      {showArchivedModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Team is Archived</h3>
            <p>
              "{archivedTeamToAdd}" is in your archived teams. Would you like to
              unarchive it?
            </p>
            <div className="modal-button-group">
              <button
                type="button"
                onClick={() => {
                  setShowArchivedModal(false);
                  setArchivedTeamToAdd("");
                }}
                className="modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => unarchiveTeam(archivedTeamToAdd)}
                className="modal-submit"
              >
                Unarchive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Duplicate Team Modal ── */}
      {showDuplicateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Already Added</h3>
            <p>"{duplicateTeamName}" is already in your active teams.</p>
            <div className="modal-button-group">
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateTeamName("");
                }}
                className="modal-submit"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;