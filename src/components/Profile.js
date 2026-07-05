import React, { useState, useEffect, useRef } from "react";
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
  const { user, token, removeToken, loading, refreshUser, hasGiftSubscription } =
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
  const [giftCheckoutResult, setGiftCheckoutResult] = useState(() => {
    try {
      const stored = sessionStorage.getItem("lh_gift_checkout_result");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const saveGiftResult = (data) => {
    try { sessionStorage.setItem("lh_gift_checkout_result", JSON.stringify(data)); } catch {}
    setGiftCheckoutResult(data);
  };

  const clearGiftResult = () => {
    try { sessionStorage.removeItem("lh_gift_checkout_result"); } catch {}
    setGiftCheckoutResult(null);
  };

  const showMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

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
          saveGiftResult(res.data);
          const count = res.data.codes?.length || 1;
          showMessage(`Gift purchase successful. ${count} code${count > 1 ? "s" : ""} ready.`);
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
      showMessage(
        `Gift redeemed! Access active until ${new Date(res.data.endsAt).toLocaleDateString()}`
      );
      setGiftCode("");
      await refreshUser();
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

      {/* ── Gift Code Result (after purchase) ── */}
      {!isNative && giftCheckoutResult?.codes?.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="card-title">🎁 Gift Purchase Successful</p>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 10 }}>
            Share {giftCheckoutResult.codes.length > 1 ? "these codes" : "this code"} with the recipient{giftCheckoutResult.codes.length > 1 ? "s" : ""}:
          </p>
          {giftCheckoutResult.codes.map((code) => (
            <div
              key={code}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
            >
              <div className="gift-code-display" style={{ flex: 1 }}>{code}</div>
              <button
                type="button"
                className="primary-button"
                style={{ width: "auto", padding: "8px 14px" }}
                onClick={() => navigator.clipboard.writeText(code)}
              >
                Copy
              </button>
            </div>
          ))}
          {giftCheckoutResult.codes.length > 1 && (
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 4 }}
              onClick={() =>
                navigator.clipboard.writeText(giftCheckoutResult.codes.join("\n"))
              }
            >
              Copy All Codes
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: 8, width: "100%" }}
            onClick={clearGiftResult}
          >
            Dismiss
          </button>
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