import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Country, State } from "country-state-city";
import "./Profile.css";
import SubscriptionButtons from "./SubscriptionButtons";
import TeamNameBuilder from "./TeamNameBuilder";

const getApiUrl = () => {
  if (window.location.hostname.startsWith("10.")) {
    return `http://${window.location.hostname}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const Profile = () => {
  const { user, token, removeToken, loading } = useAuth();
  const navigate = useNavigate();

  const AUTO_SAVE_DEBOUNCE_MS = 700;
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef(null);

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

  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedTeamToAdd, setArchivedTeamToAdd] = useState("");

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTeamName, setDuplicateTeamName] = useState("");

  const [availableStates, setAvailableStates] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");

  const [teamQuery, setTeamQuery] = useState("");
  const [teamSuggestions, setTeamSuggestions] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(
    new Date().getFullYear().toString()
  );

  const updateStateList = (selectedCountry) => {
    const selected = Country.getAllCountries().find(
      (c) => c.name === selectedCountry
    );
    if (selected) {
      const states = State.getStatesOfCountry(selected.isoCode);
      setAvailableStates(states);
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
        volleyballRole: profile.volleyballRole, // ✅ include in auto-save
        // never auto-send password here
        ...partial,
      };

      await axios.put(`${API_URL}/api/users/${user.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      setSaveStatus("Saved");
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
    setTeamQuery("");
    setTeamSuggestions([]);
  };

  const unarchiveTeam = async (teamName) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/users/${user.id}/teams/unarchive`,
        { teamName },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      setProfile((prev) => ({
        ...prev,
        teams: res.data.teams || [...prev.teams, teamName],
        archivedTeams:
          res.data.archivedTeams ||
          prev.archivedTeams.filter((t) => t !== teamName),
      }));

      setMessage("Team unarchived successfully!");
      setShowArchivedModal(false);
      setArchivedTeamToAdd("");
      setTeamQuery("");
      setTeamSuggestions([]);
    } catch (err) {
      setMessage(
        `Error unarchiving team: ${err.response?.data?.message || "Unknown error"}`
      );
      console.error("Error unarchiving team:", err);
    }
  };

  // Auto-save whenever profile changes (debounced)
  useEffect(() => {
    if (!user?.id) return;

    // skip the first change that comes from the initial fetch
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveProfile();
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [profile, user?.id]);

  // Load profile
  useEffect(() => {
    if (!user?.id) {
      setMessage("Error: User ID is missing. Please log in again.");
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
        setMessage(
          `Failed to load profile: ${err.response?.data?.message || "Unknown error"}`
        );
      });
  }, [user, token]);

  // Team search (kept as-is even though TeamNameBuilder likely does its own thing)
  useEffect(() => {
    if (teamQuery.length < 2) {
      setTeamSuggestions([]);
      return;
    }

    const fetchTeams = async () => {
      try {
        const res = await axios.get(
          `${API_URL}/api/users/teams/search?q=${teamQuery}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );
        setTeamSuggestions(res.data);
      } catch (err) {
        console.error("Error fetching team suggestions:", err);
      }
    };

    const debounce = setTimeout(fetchTeams, 300);
    return () => clearTimeout(debounce);
  }, [teamQuery, token]);

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
      setMessage("Please select a country.");
      setUpdating(false);
      return;
    }

    // If user typed a team manually and didn't hit builder action
    if (teamQuery.trim()) {
      const trimmedTeam = teamQuery.trim();

      if (profile.teams.includes(trimmedTeam)) {
        setMessage(`"${trimmedTeam}" is already in your active teams.`);
        setUpdating(false);
        return;
      }

      if (profile.archivedTeams && profile.archivedTeams.includes(trimmedTeam)) {
        setMessage(
          `"${trimmedTeam}" is in your archived teams. Please unarchive it first.`
        );
        setUpdating(false);
        return;
      }

      // Avoid mutating state array directly
      setProfile((prev) => ({ ...prev, teams: [...prev.teams, trimmedTeam] }));
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

      setMessage("Profile updated successfully!");
      setTeamQuery("");
    } catch (err) {
      setMessage(
        `Error updating profile: ${err.response?.data?.message || "Unknown error"}`
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

  if (loading) return <p>Loading...</p>;
  if (!user) return <p>Not authenticated.</p>;

  return (
    <div className="page-wrapper">
      <h2 className="page-header">Profile</h2>

      {saveStatus && <p className="profile-message">{saveStatus}</p>}

      <form onSubmit={handleSubmit} className="profile-form">
        {/* Account + Role */}
        <div className="card">
          <label>Email</label>
          <input type="email" name="email" value={profile.email} disabled />
		<div>
          <label>Name</label>
          <input
            type="text"
            name="displayName"
            value={profile.displayName}
            onChange={handleChange}
          />
<div>
          <label className="section-label">Your role as relates to volleyball</label>

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
        </div>

        {/* Teams */}
        <div className="card">
          <TeamNameBuilder apiUrl={API_URL} token={token} onAddTeam={pushTeam} />

          <label>Team(s)</label>
          <div className="team-input-wrapper">
            {profile.teams.map((team, index) => (
              <span key={`${team}-${index}`} className="team-chip">
                {team}
              </span>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="card">
          <label>Country</label>
          <select name="country" value={profile.country} onChange={handleChange}>
            <option value="">Select a country</option>
            {Country.getAllCountries().map((c) => (
              <option key={c.isoCode} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
<div>
          {availableStates.length > 0 && (
            <>
              <label>State/Region</label>
              <select name="state" value={profile.state} onChange={handleChange}>
                <option value="">Select a state/region</option>
                {availableStates.map((s) => (
                  <option key={s.isoCode} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}
  </div>
  </div>

        {/* Password + Preferences */}
        <div className="card">
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
            <label htmlFor="consentToEmails">Check to receive emails.</label>
          </div>
        </div>

        {message && <p className="profile-message">{message}</p>}

        <button type="submit" className="primary-button" disabled={updating}>
          {updating ? "Updating..." : "Update Profile"}
        </button>
      </form>

      <button onClick={handleLogout} className="logout-button">
        Logout
      </button>

      <div className="card">
        <SubscriptionButtons />
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Change Password</h3>

            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="modal-input"
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="modal-input"
            />

            <div className="modal-button-group">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="modal-cancel"
                type="button"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (newPassword !== confirmPassword) {
                    setMessage("Passwords do not match.");
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
                    setMessage("Password updated successfully!");
                    setShowPasswordModal(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  } catch (error) {
                    setMessage("Error updating password.");
                  } finally {
                    setUpdating(false);
                  }
                }}
                className="modal-submit"
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archived Team Modal */}
      {showArchivedModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Team is Archived</h3>
            <p>
              The team "{archivedTeamToAdd}" is currently in your archived teams.
              Would you like to unarchive it?
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
                Unarchive Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Team Modal */}
      {showDuplicateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Team Already Added</h3>
            <p>The team "{duplicateTeamName}" is already in your active teams list.</p>
            <div className="modal-button-group">
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateTeamName("");
                  setTeamQuery("");
                  setTeamSuggestions([]);
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
