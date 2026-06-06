import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";

const RosterIndicator = () => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      marginLeft: 6,
      flexShrink: 0,
      boxShadow: "0 1px 3px rgba(124, 58, 237, 0.3)",
    }}
    title="Has rostered players"
  >
    R
  </span>
);

const normalize = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();



const stripTrailingSeasonYear = (name = "") =>
  String(name).replace(/\s*\(\s*(19|20)\d{2}\s*\)\s*$/i, "").trim();

const levenshteinSimilarity = (a, b) => {
  a = normalize(a);
  b = normalize(b);

  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const dist = dp[m][n];
  const maxLen = Math.max(m, n);
  return 1 - dist / maxLen;
};

const tokenize = (s = "") => normalize(s).split(" ").filter(Boolean);

const startsWithQueryAtWordBoundary = (teamName = "", query = "") => {
  const normalizedName = normalize(teamName);
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) return false;

  if (normalizedName.startsWith(normalizedQuery)) return true;

  const words = tokenize(teamName);
  return words.some((word) => word.startsWith(normalizedQuery));
};

const rankTeamSuggestions = (items = [], query = "") => {
  const normalizedQuery = normalize(query);

  return items
    .filter((item) => startsWithQueryAtWordBoundary(item.name, normalizedQuery))
    .sort((a, b) => {
      const aName = normalize(a.name);
      const bName = normalize(b.name);

      const aExactPrefix = aName.startsWith(normalizedQuery) ? 1 : 0;
      const bExactPrefix = bName.startsWith(normalizedQuery) ? 1 : 0;

      if (aExactPrefix !== bExactPrefix) return bExactPrefix - aExactPrefix;

      const aFirstWord = tokenize(a.name).find((word) => word.startsWith(normalizedQuery)) || "";
      const bFirstWord = tokenize(b.name).find((word) => word.startsWith(normalizedQuery)) || "";

      if (aFirstWord.length !== bFirstWord.length) {
        return aFirstWord.length - bFirstWord.length;
      }

      return aName.localeCompare(bName);
    })
    .slice(0, 100);
};


const getDefaultYear = (mode) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (mode === "club") {
    return month >= 6 ? year + 1 : year;
  }

  return year;
};

export default function TeamNameBuilder({
  apiUrl,
  token,
  onAddTeam,
  overlay = false,
  onClose,
}) {
  const [mode, setMode] = useState("club");
  const [seasonYear, setSeasonYear] = useState(String(getDefaultYear("club")));

  const [clubName, setClubName] = useState("");
  const [age, setAge] = useState("");
  const [clubDescriptor, setClubDescriptor] = useState("");

  const [schoolName, setSchoolName] = useState("");
  const [level, setLevel] = useState("");
  const [schoolDescriptor, setSchoolDescriptor] = useState("");

  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarMatches, setSimilarMatches] = useState([]);
  const [showSimilarityConfirm, setShowSimilarityConfirm] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [logoSearching, setLogoSearching] = useState(false);
  const [foundLogos, setFoundLogos] = useState([]);
  const [showLogoSelector, setShowLogoSelector] = useState(false);
  const [pendingTeamName, setPendingTeamName] = useState("");

  useEffect(() => {
    setSeasonYear(String(getDefaultYear(mode)));
  }, [mode]);

  const builtName = useMemo(() => {
    if (mode === "club") {
      const parts = [clubName, age].filter(Boolean).join(" ");
      const right = clubDescriptor ? `-${clubDescriptor}` : "";
      return parts ? `${parts}${right} (${seasonYear})` : "";
    }

    const left = [schoolName, level].filter(Boolean).join(" ");
    const right = schoolDescriptor ? ` - ${schoolDescriptor}` : "";
    return left ? `${left}${right} (${seasonYear})` : "";
  }, [
    mode,
    clubName,
    age,
    clubDescriptor,
    schoolName,
    level,
    schoolDescriptor,
    seasonYear,
  ]);

  const clearBuiltFields = () => {
    if (mode === "club") {
      setClubName("");
      setAge("");
      setClubDescriptor("");
    } else {
      setSchoolName("");
      setLevel("");
      setSchoolDescriptor("");
    }
  };

  const searchLogos = async (teamName) => {
    setLogoSearching(true);
    setFoundLogos([]);

    const baseName = mode === "club" ? clubName : schoolName;
    const query =
      mode === "club"
        ? `${baseName} volleyball club logo`
        : `${baseName} volleyball team logo`;

    try {
      const res = await axios.get(
        `${apiUrl}/api/users/teams/search-logos?q=${encodeURIComponent(query)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      const logos = Array.isArray(res.data) ? res.data : [];
      setFoundLogos(logos);

      if (logos.length > 0) {
        setPendingTeamName(teamName);
        setShowLogoSelector(true);
      } else {
        onAddTeam(teamName);
      }
    } catch (error) {
      console.error("Logo search failed:", error);
      onAddTeam(teamName);
    } finally {
      setLogoSearching(false);
    }
  };

  const acceptExisting = (name) => {
    setShowSimilarityConfirm(false);
    searchLogos(name);
  };

  const keepGenerated = () => {
    setShowSimilarityConfirm(false);
    searchLogos(builtName);
  };

  const selectLogo = (logoUrl) => {
    onAddTeam(pendingTeamName, logoUrl);
    setShowLogoSelector(false);
    setFoundLogos([]);
    setPendingTeamName("");
    clearBuiltFields();
    setSearchQuery("");
    setSuggestions([]);
  };

  const skipLogo = () => {
    onAddTeam(pendingTeamName);
    setShowLogoSelector(false);
    setFoundLogos([]);
    setPendingTeamName("");
    clearBuiltFields();
    setSearchQuery("");
    setSuggestions([]);
  };

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);

        const res = await axios.get(
          `${apiUrl}/api/users/teams/search?q=${encodeURIComponent(searchQuery)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );

if (!cancelled) {
  const rawResults = Array.isArray(res.data) ? res.data : [];
  const filteredResults = rankTeamSuggestions(rawResults, searchQuery);
  setSuggestions(filteredResults);
}
      } catch (err) {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiUrl, token, searchQuery]);

  useEffect(() => {
    const name = builtName.trim();

    if (!name || name.length < 6) {
      setSimilarMatches([]);
      return;
    }

    const core =
      mode === "club"
        ? [clubName, age, clubDescriptor].filter(Boolean).join(" ")
        : [schoolName, level, schoolDescriptor].filter(Boolean).join(" ");

    if (!core || core.trim().length < 2) {
      setSimilarMatches([]);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setSimilarLoading(true);

        const nameForMatching = stripTrailingSeasonYear(name);
        const queryForSearch = stripTrailingSeasonYear(core);

        const res = await axios.get(
          `${apiUrl}/api/users/teams/search?q=${encodeURIComponent(queryForSearch)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );

        const list = Array.isArray(res.data) ? res.data : [];

        const scored = list
          .map((item) => ({
            ...item,
            score: levenshteinSimilarity(
              nameForMatching,
              stripTrailingSeasonYear(item.name)
            ),
          }))
          .filter((item) => item.score >= 0.72)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        if (!cancelled) {
          setSimilarMatches(scored);
        }
      } catch (err) {
        if (!cancelled) setSimilarMatches([]);
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    apiUrl,
    token,
    builtName,
    mode,
    clubName,
    age,
    clubDescriptor,
    schoolName,
    level,
    schoolDescriptor,
  ]);

  const addBuilt = () => {
    if (!builtName) return;

    const exactMatch = similarMatches.find(
      (m) => normalize(m.name) === normalize(builtName)
    );

    if (exactMatch) {
      acceptExisting(exactMatch.name);
      return;
    }

    if (similarMatches.length > 0) {
      setShowSimilarityConfirm(true);
      return;
    }

    searchLogos(builtName);
  };

  const hasRosterIndicator = (item) =>
    item.hasRoster || item.playerCount > 0 || (item.rosteredPlayers && item.rosteredPlayers.length > 0);

  const TeamListItem = ({ item, onUse }) => (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: "10px 12px",
        background: "#fff",
      }}
    >
      <div>
        <div style={{ fontSize: 14, display: "flex", alignItems: "center" }}>
          {item.name}
          {hasRosterIndicator(item) && <RosterIndicator />}
        </div>
        {(item.club || item.teamCode) && (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {item.club}
            {item.club && item.teamCode ? " • " : ""}
            {item.teamCode}
          </div>
        )}
      </div>
      <button
        type="button"
        className="modal-submit"
        style={{ padding: "8px 12px", borderRadius: 10, flexShrink: 0 }}
        onClick={() => onUse(item.name)}
      >
        Use this
      </button>
    </li>
  );

  return (
    <div className="team-builder-form">

      {/* ── Search ── */}
      <label>Search existing teams</label>
      <div style={{ position: "relative" }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Start typing a team name…"
          autoComplete="off"
        />
        {searchLoading && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            Searching…
          </div>
        )}
        {suggestions.length > 0 && (
          <ul className="suggestions-dropdown">
            {suggestions.map((item, i) => (
              <li
                key={`${item.teamCode || item.name}-${i}`}
                onClick={() => {
                  setSuggestions([]);
                  setSearchQuery("");
                  searchLogos(item.name);
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  {item.name}
                  {hasRosterIndicator(item) && <RosterIndicator />}
                </div>
                {(item.club || item.teamCode) && (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {item.club}
                    {item.club && item.teamCode ? " • " : ""}
                    {item.teamCode}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!searchLoading && searchQuery.trim().length >= 2 && suggestions.length === 0 && (
          <div style={{
            marginTop: 6,
            fontSize: 13,
            color: "var(--text-muted)",
            background: "#f5f5f7",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px dashed rgba(0,0,0,0.15)",
          }}>
            No matches — build a new team below.
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "18px 0 14px",
        color: "var(--text-muted)",
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        Or build a new team
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      {/* ── Team type switch ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 10px" }}>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: mode === "club" ? "var(--blue)" : "var(--text-muted)",
          transition: "color 0.2s",
          userSelect: "none",
        }}>Club</span>

        <button
          type="button"
          role="switch"
          aria-checked={mode === "school"}
          onClick={() => setMode(mode === "club" ? "school" : "club")}
          style={{
            position: "relative",
            width: 44,
            height: 26,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            padding: 0,
            background: mode === "school" ? "var(--blue)" : "#d1d5db",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute",
            top: 3,
            left: mode === "school" ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }} />
        </button>

        <span style={{
          fontSize: 13, fontWeight: 700,
          color: mode === "school" ? "var(--blue)" : "var(--text-muted)",
          transition: "color 0.2s",
          userSelect: "none",
        }}>School</span>
      </div>

      {/* ── Season year ── */}
      <label>Season year</label>
      <input
        value={seasonYear}
        onChange={(e) => setSeasonYear(e.target.value)}
        placeholder="2026"
        inputMode="numeric"
      />

      {/* ── Club fields ── */}
      {mode === "club" ? (
        <>
          <label>Club name</label>
          <input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Tsunami, A5, Skyline…" />

          <label>Age group</label>
          <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="14U, 15U, 17U…" />

          <label>
            Descriptor&nbsp;
            <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-muted)" }}>(optional)</span>
          </label>
          <input value={clubDescriptor} onChange={(e) => setClubDescriptor(e.target.value)} placeholder="1-Elite, National, Aces…" />
        </>
      ) : (
        <>
          <label>School name</label>
          <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Marist, Northview…" />

          <label>Level</label>
          <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Varsity, JV, 5/6" />

          <label>
            Descriptor&nbsp;
            <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-muted)" }}>(optional)</span>
          </label>
          <input value={schoolDescriptor} onChange={(e) => setSchoolDescriptor(e.target.value)} placeholder="Blue, Gold, A, B…" />
        </>
      )}

      {/* ── Preview + similar matches ── */}
      {builtName && (
        <div style={{
          marginTop: 14,
          padding: "12px 14px",
          borderRadius: 12,
          background: "var(--blue-light)",
          border: "1.5px solid var(--blue-ring)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
            Preview
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            {builtName}
          </div>
        </div>
      )}

      {similarLoading && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Checking for similar teams…
        </div>
      )}

      {!similarLoading && similarMatches.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Similar existing teams — use one instead?
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {similarMatches.map((m) => (
              <TeamListItem key={`${m.name}-${m.score}`} item={m} onUse={acceptExisting} />
            ))}
          </ul>
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          className="primary-button"
          onClick={addBuilt}
          disabled={!builtName || logoSearching}
        >
          {logoSearching ? "Searching for logos…" : "Add Team"}
        </button>

        {builtName && (
          <button
            type="button"
            className="change-password-button"
            onClick={clearBuiltFields}
            disabled={logoSearching}
            style={{ marginTop: 0 }}
          >
            Clear fields
          </button>
        )}

        {overlay && (
          <button type="button" className="change-password-button" onClick={onClose}>
            Cancel
          </button>
        )}
      </div>

      {showSimilarityConfirm && (
        <div className="modal-overlay" onClick={() => setShowSimilarityConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Similar teams found</h3>
            <p style={{ marginTop: 0 }}>
              These teams look a lot like <strong>{builtName}</strong>. Use one, or keep your new name.
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "grid", gap: 8 }}>
              {similarMatches.map((m) => (
                <TeamListItem key={`${m.name}-confirm`} item={m} onUse={acceptExisting} />
              ))}
            </ul>

            <div className="modal-button-group">
              <button type="button" className="modal-cancel" onClick={() => setShowSimilarityConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="modal-submit" onClick={keepGenerated}>
                Keep my name
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogoSelector && (
        <div className="modal-overlay" onClick={skipLogo}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Pick a Logo</h3>
            <p style={{ marginTop: 0, marginBottom: 4 }}>
              <strong>{pendingTeamName}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
              Tap one to use it, or skip to add without a logo.
            </p>

            {logoSearching ? (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
                Searching for logos...
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: 12,
                  marginTop: 12,
                  maxHeight: 420,
                  overflowY: "auto",
                }}
              >
                {foundLogos.map((logo, idx) => (
                  <button
                    key={`${logo.url}-${idx}`}
                    type="button"
                    onClick={() => selectLogo(logo.url)}
                    style={{
                      border: "1px solid rgba(0,0,0,0.10)",
                      borderRadius: 12,
                      background: "#fff",
                      padding: 10,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <img
                      src={logo.thumbnail || logo.url}
                      alt={logo.title || "Team logo"}
                      style={{
                        width: "100%",
                        height: 120,
                        objectFit: "contain",
                        background: "#f5f5f7",
                        borderRadius: 10,
                      }}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        opacity: 0.7,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {logo.source || "Unknown source"}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="modal-button-group" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="modal-cancel"
                onClick={skipLogo}
              >
                Skip - No Logo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}