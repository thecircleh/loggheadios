import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { listMyDrills } from "./CoachesCornerPages/coachDrillsApi";

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl();

const getTodayString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const categories = [
  "warmup",
  "serving",
  "serve_receive",
  "setting",
  "attacking",
  "defense",
  "blocking",
  "wash",
  "conditioning",
  "other",
];

const statsTypes = ["none", "serving", "passing", "setting",  "attacking", "defense", "blocking"];

const categoryLabels = {
  warmup: "Warmup",
  serving: "Serving",
  serve_receive: "Serve Receive",
  passing: "Passing",
  setting: "Setting",
  attacking: "Attacking",
  defense: "Defense",
  blocking: "Blocking",
  wash: "Wash / Game-Like",
  conditioning: "Conditioning",
  other: "Other",
};

const statsTypeLabels = {
  none: "No Stats",
  serving: "Serving",
  passing: "Passing",
  setting: "Setting",
  attacking: "Attacking",
  defense: "Defense",
  blocking: "Blocking",
};

const createNewDrill = (order) => ({
  id: `drill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  category: "other",
  durationMinutes: 10,
  order,
  notes: "",
  statsEnabled: false,
  statsType: "none",
  status: "planned",
  actualStartTime: null,
  actualEndTime: null,
  playerStats: [],
});

export default function PracticePlannerPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryTeam = searchParams.get("team") || "";
  const queryDate = searchParams.get("date") || "";
  const storedTeam = localStorage.getItem("selectedTeam") || "";
  const teamName = queryTeam || storedTeam;
  
  // Allow selecting any date - default to today
  const [sessionDate, setSessionDate] = useState(queryDate || getTodayString());

  const [session, setSession] = useState(null);
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  
  const [showSavedDrillsModal, setShowSavedDrillsModal] = useState(false);
  const [savedDrills, setSavedDrills] = useState([]);
  const [loadingSavedDrills, setLoadingSavedDrills] = useState(false);
  
  // Track which drill is being saved to library
  const [savingToLibrary, setSavingToLibrary] = useState(null);
  
  // Track dates that have sessions
  const [datesWithSessions, setDatesWithSessions] = useState([]);
  
  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const totalPlannedMinutes = useMemo(() => {
    return drills.reduce((sum, drill) => {
      const minutes = Number(drill.durationMinutes || 0);
      return sum + (Number.isFinite(minutes) ? minutes : 0);
    }, 0);
  }, [drills]);

  const trackedDrillCount = useMemo(() => {
    return drills.filter((drill) => drill.statsEnabled && drill.statsType !== "none").length;
  }, [drills]);

  const loadSession = async () => {
    if (!token) {
      setMessage("You must be logged in to plan a practice.");
      setLoading(false);
      return;
    }

    if (!teamName) {
      setMessage("No team selected. Go to Rosters & Matches first and select a team.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const res = await axios.get(`${API_URL}/api/practice/session`, {
        params: { teamName, sessionDate },
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      setSession(res.data);
      
      // Ensure drills imported from library are marked as saved
      const loadedDrills = Array.isArray(res.data.drills) 
        ? res.data.drills.map(drill => ({
            ...drill,
            // If drill has sourceCoachDrillId but no savedToLibraryId, use sourceCoachDrillId
            // This handles drills imported from library before this feature was added
            savedToLibraryId: drill.savedToLibraryId || 
              (drill.sourceCoachDrillId ? drill.sourceCoachDrillId : undefined),
          }))
        : [];
      setDrills(loadedDrills);
    } catch (err) {
      console.error("Failed to load practice session:", err);
      
      // If 404, it means no session exists for this date yet - that's OK, start fresh
      if (err.response?.status === 404) {
        setSession(null);
        setDrills([]);
        setMessage(""); // Clear any error message
      } else {
        setMessage(
          err.response?.data?.message || "Failed to load practice session."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [teamName, sessionDate, token]);

  // Load dates with sessions when team changes
  useEffect(() => {
    const loadDatesWithSessions = async () => {
      if (!token || !teamName) return;
      
      try {
        const res = await axios.get(`${API_URL}/api/practice/dates`, {
          params: { teamName },
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        
        setDatesWithSessions(Array.isArray(res.data.dates) ? res.data.dates : []);
      } catch (err) {
        console.error("Failed to load practice dates:", err);
        // Don't show error to user - this is background data
      }
    };
    
    loadDatesWithSessions();
  }, [teamName, token]);

  // Auto-import drill if importDrill query parameter is present
  useEffect(() => {
    const importDrillId = searchParams.get("importDrill");
    if (importDrillId && token && !loading) {
      const autoImportDrill = async () => {
        try {
          const data = await listMyDrills(token);
          const drillToImport = data.find((d) => d._id === importDrillId);
          
          if (drillToImport) {
            importSavedDrill(drillToImport);
            // Clear the query parameter
            window.history.replaceState({}, '', '/coaches-corner/practice-planner');
          }
        } catch (err) {
          console.error("Failed to auto-import drill:", err);
        }
      };
      
      autoImportDrill();
    }
  }, [searchParams, token, loading]);

  const updateDrill = (index, field, value) => {
    setDrills((prev) =>
      prev.map((drill, i) => {
        if (i !== index) return drill;

        const updated = {
          ...drill,
          [field]: value,
        };

        if (field === "statsEnabled" && !value) {
          updated.statsType = "none";
        }

        if (field === "category" && value === "serve_receive" && !updated.statsEnabled) {
          updated.statsEnabled = true;
          updated.statsType = "passing";
        }
		
		 if (field === "category" && value === "passing" && !updated.statsEnabled) {
          updated.statsEnabled = true;
          updated.statsType = "passing";
        }
		
		if (field === "category" && value === "setting" && !updated.statsEnabled) {
          updated.statsEnabled = true;
          updated.statsType = "setting";
        }

		if (field === "category" && value === "blocking" && !updated.statsEnabled) {
          updated.statsEnabled = true;
          updated.statsType = "blocking";
        }
		
        if (field === "category" && value === "serving" && !updated.statsEnabled) {
          updated.statsEnabled = true;
          updated.statsType = "serving";
        }

        return updated;
      })
    );
    setHasUnsavedChanges(true);
  };

  const addDrill = () => {
    setDrills((prev) => [...prev, createNewDrill(prev.length)]);
    setHasUnsavedChanges(true);
  };

  const duplicateDrill = (index) => {
    setDrills((prev) => {
      const source = prev[index];
      if (!source) return prev;

      const copy = {
        ...source,
        id: `drill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: source.title ? `${source.title} Copy` : "Drill Copy",
        order: index + 1,
        status: "planned",
        actualStartTime: null,
        actualEndTime: null,
        playerStats: [],
      };

      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next.map((drill, i) => ({ ...drill, order: i }));
    });
    setHasUnsavedChanges(true);
  };

  const removeDrill = (index) => {
    setDrills((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((drill, i) => ({ ...drill, order: i }))
    );
    setHasUnsavedChanges(true);
  };

  const moveDrill = (index, direction) => {
    setDrills((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;

      [next[index], next[target]] = [next[target], next[index]];
      return next.map((drill, i) => ({ ...drill, order: i }));
    });
    setHasUnsavedChanges(true);
  };

  const saveDrills = async () => {
    if (!token) {
      setMessage("You must be logged in to save practice plans.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const sanitized = drills.map((drill, index) => ({
        ...drill,
        order: index,
        title: typeof drill.title === "string" ? drill.title.trim() : "",
        category: categories.includes(drill.category) ? drill.category : "other",
        durationMinutes: Math.max(1, Number(drill.durationMinutes || 10)),
        notes: typeof drill.notes === "string" ? drill.notes : "",
        statsEnabled: !!drill.statsEnabled,
        statsType:
          !!drill.statsEnabled && statsTypes.includes(drill.statsType)
            ? drill.statsType
            : "none",
        // Preserve library tracking fields
        savedToLibraryId: drill.savedToLibraryId || undefined,
        sourceCoachDrillId: drill.sourceCoachDrillId || undefined,
      }));

      // If no session exists yet, create one first
      if (!session?._id) {
        const createRes = await axios.post(
          `${API_URL}/api/practice/session`,
          {
            teamName,
            sessionDate,
            title: "Practice",
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );
        
        setSession(createRes.data);
        
        // Now save drills to the newly created session
        const res = await axios.patch(
          `${API_URL}/api/practice/drills`,
          {
            sessionId: createRes.data._id,
            drills: sanitized,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );

        setSession(res.data);
        
        // Preserve savedToLibraryId and sourceCoachDrillId from local state
        const mergedDrills = Array.isArray(res.data.drills) 
          ? res.data.drills.map((serverDrill, index) => ({
              ...serverDrill,
              savedToLibraryId: serverDrill.savedToLibraryId || drills[index]?.savedToLibraryId,
              sourceCoachDrillId: serverDrill.sourceCoachDrillId || drills[index]?.sourceCoachDrillId,
            }))
          : [];
        setDrills(mergedDrills);
      } else {
        // Session exists, just update drills
        const res = await axios.patch(
          `${API_URL}/api/practice/drills`,
          {
            sessionId: session._id,
            drills: sanitized,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );

        setSession(res.data);
        
        // Preserve savedToLibraryId and sourceCoachDrillId from local state
        const mergedDrills = Array.isArray(res.data.drills) 
          ? res.data.drills.map((serverDrill, index) => ({
              ...serverDrill,
              savedToLibraryId: serverDrill.savedToLibraryId || drills[index]?.savedToLibraryId,
              sourceCoachDrillId: serverDrill.sourceCoachDrillId || drills[index]?.sourceCoachDrillId,
            }))
          : [];
        setDrills(mergedDrills);
      }
      
      setHasUnsavedChanges(false); // Clear unsaved changes flag
      setMessage("Practice plan saved.");
      
      // Refresh the dates list
      const datesRes = await axios.get(`${API_URL}/api/practice/dates`, {
        params: { teamName },
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setDatesWithSessions(Array.isArray(datesRes.data.dates) ? datesRes.data.dates : []);
    } catch (err) {
      console.error("Failed to save drills:", err);
      setMessage(err.response?.data?.message || "Failed to save practice plan.");
    } finally {
      setSaving(false);
    }
  };

  const loadSavedDrills = async () => {
    if (!token) return;
    
    try {
      setLoadingSavedDrills(true);
      const data = await listMyDrills(token);
      setSavedDrills(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load saved drills:", err);
      setMessage("Failed to load saved drills.");
    } finally {
      setLoadingSavedDrills(false);
    }
  };

  const importSavedDrill = (savedDrill) => {
    // Map saved drill goal to category
    const goalToCategoryMap = {
      'serving': 'serving',
      'passing': 'serve_receive',
      'setting': 'setting',
      'attacking': 'attacking',
      'defense': 'defense',
      'blocking': 'blocking',
    };
    
    const goalLower = (savedDrill.goal || '').toLowerCase();
    let category = 'other';
    
    for (const [key, value] of Object.entries(goalToCategoryMap)) {
      if (goalLower.includes(key)) {
        category = value;
        break;
      }
    }

    // Create new drill from saved drill
    const newDrill = {
      id: `drill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: savedDrill.title || "Imported Drill",
      category,
      durationMinutes: Number(savedDrill.inputs?.durationMinutes) || 10,
      order: drills.length,
      notes: savedDrill.drillText || savedDrill.notes || "",
      statsEnabled: false,
      statsType: "none",
      status: "planned",
      actualStartTime: null,
      actualEndTime: null,
      playerStats: [],
      sourceCoachDrillId: savedDrill._id, // Track the source drill
    };

    // Auto-enable stats for certain categories
    if (category === 'serve_receive') {
      newDrill.statsEnabled = true;
      newDrill.statsType = 'passing';
    } else if (category === 'serving') {
      newDrill.statsEnabled = true;
      newDrill.statsType = 'serving';
    }

    setDrills((prev) => [...prev, newDrill]);
    setHasUnsavedChanges(true);
    setShowSavedDrillsModal(false);
    setMessage(`Added "${savedDrill.title}" to practice plan.`);
  };

  const openSavedDrillsModal = () => {
    setShowSavedDrillsModal(true);
    loadSavedDrills();
  };

  const saveDrillToLibrary = async (drill, drillIndex) => {
    if (!token) {
      setMessage("You must be logged in to save drills.");
      return;
    }

    if (!drill.title?.trim()) {
      setMessage("Please add a title to this drill before saving it to your library.");
      return;
    }

    // Check if this drill has already been saved
    if (drill.savedToLibraryId || drill.sourceCoachDrillId) {
      setMessage("This drill has already been saved to your library.");
      return;
    }

    try {
      setSavingToLibrary(drillIndex);
      setMessage("");

      // Map category to goal for better organization
      const categoryToGoalMap = {
        'serving': 'Serving',
        'serve_receive': 'Passing',
        'passing': 'Passing',
        'setting': 'Setting',
        'attacking': 'Attacking',
        'defense': 'Defense',
        'blocking': 'Blocking',
        'warmup': 'Warmup',
        'wash': 'Game-Like',
        'conditioning': 'Conditioning',
        'other': 'General',
      };

      const goal = categoryToGoalMap[drill.category] || 'General';

      // Build inputs object from drill data
      const inputs = {
        title: drill.title,
        durationMinutes: drill.durationMinutes || 10,
        goal,
        ageGroup: '', // Could be enhanced to capture this
        totalParticipants: '', 
        skillLevel: '',
        constraints: '',
        otherDetails: '',
      };

      // Create the payload
      const payload = {
        title: drill.title.trim(),
        goal,
        inputs,
        prompt: `Manually created drill from practice planner on ${sessionDate}`,
        drillText: drill.notes || '',
        notes: drill.notes || '',
      };

      const response = await axios.post(
        `${API_URL}/api/coaches-corner/drills`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      );

      // Mark the drill as saved in the local state
      setDrills((prev) =>
        prev.map((d, i) => {
          if (i === drillIndex) {
            return {
              ...d,
              savedToLibraryId: response.data._id,
            };
          }
          return d;
        })
      );

      // Mark practice plan as having unsaved changes so user knows to save
      setHasUnsavedChanges(true);

      setMessage(`✅ "${drill.title}" saved to your drill library!`);
      
      // Refresh saved drills if modal is open
      if (showSavedDrillsModal) {
        loadSavedDrills();
      }
    } catch (err) {
      console.error("Failed to save drill to library:", err);
      setMessage(err.response?.data?.message || "Failed to save drill to library.");
    } finally {
      setSavingToLibrary(null);
    }
  };

  if (loading) {
    return <div style={styles.page}>Loading practice planner...</div>;
  }

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7);
            }
            50% {
              box-shadow: 0 0 0 8px rgba(52, 199, 89, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(52, 199, 89, 0);
            }
          }
        `}
      </style>
      <div style={styles.page}>
        <div style={styles.wrap}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Plan a Practice</h1>
            <p style={styles.subtext}>
              {teamName || "No team selected"} · {sessionDate}
            </p>
          </div>
		 

          <div style={styles.headerLinks}>
            <Link to="/coaches-corner/practice" style={styles.link}>
              Practice Home
            </Link>
            {sessionDate === getTodayString() && (
              <>
                |
                <Link to="/coaches-corner/practice-live" style={styles.link}>
                  Run Practice
                </Link>
              </>
            )}
          </div>
        </div>

        {message ? <p style={styles.message}>{message}</p> : null}

        <div style={styles.dateSelector}>
          <label style={styles.dateLabel}>Practice Date:</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            style={styles.dateInput}
          />
          <button
            onClick={() => setSessionDate(getTodayString())}
            style={styles.todayButton}
          >
            Today
          </button>
        </div>

        {datesWithSessions.filter(date => date >= getTodayString()).length > 0 && (
          <div style={styles.datesWithDrillsCard}>
            <div style={styles.datesWithDrillsTitle}>
              📅 Scheduled Practices ({datesWithSessions.filter(date => date >= getTodayString()).length})
            </div>
            <div style={styles.datesWithDrillsList}>
              {datesWithSessions
                .filter(date => date >= getTodayString())
                .map((date) => {
                  const isCurrentDate = date === sessionDate;
                  return (
                    <button
                      key={date}
                      onClick={() => setSessionDate(date)}
                      style={
                        isCurrentDate
                          ? styles.dateChipActive
                          : styles.dateChip
                      }
                    >
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        <div style={styles.summaryStrip}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Planned Drills</div>
            <div style={styles.summaryValue}>{drills.length}</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Planned Minutes</div>
            <div style={styles.summaryValue}>{totalPlannedMinutes}</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Tracked Drills</div>
            <div style={styles.summaryValue}>{trackedDrillCount}</div>
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={addDrill} style={styles.primaryButton}>
            Add Drill
          </button>
          
          <button onClick={openSavedDrillsModal} style={styles.secondaryButton}>
            Add from Saved Drills
          </button>

          <button
            onClick={saveDrills}
            style={hasUnsavedChanges ? styles.saveButtonUnsaved : styles.secondaryButton}
            disabled={saving}
          >
            {saving ? "Saving..." : hasUnsavedChanges ? "💾 Save Changes" : "Save Practice Plan"}
          </button>
        </div>

        <div style={styles.list}>
          {drills.length === 0 ? (
            <div style={styles.emptyCard}>
              <div style={styles.emptyTitle}>No drills yet.</div>
              <div style={styles.emptyText}>
                Build the flow of your practice here. Add warmup, skill work,
                game-like drills, and any notes you want handy during practice.
              </div>
            </div>
          ) : (
            drills.map((drill, index) => (
              <div key={drill.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <div>
                    <div style={styles.drillIndex}>Drill {index + 1}</div>
                    <div style={styles.drillHint}>
                      {categoryLabels[drill.category] || "Other"} · {Number(drill.durationMinutes || 0)} min
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      onClick={() => moveDrill(index, -1)}
                      style={styles.smallButton}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDrill(index, 1)}
                      style={styles.smallButton}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => duplicateDrill(index)}
                      style={styles.smallButton}
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => saveDrillToLibrary(drill, index)}
                      style={(drill.savedToLibraryId || drill.sourceCoachDrillId) ? styles.smallSaved : styles.smallSave}
                      disabled={savingToLibrary === index || !drill.title?.trim() || drill.savedToLibraryId || drill.sourceCoachDrillId}
                      title={
                        (drill.savedToLibraryId || drill.sourceCoachDrillId)
                          ? "Already saved to library" 
                          : !drill.title?.trim() 
                          ? "Add a title before saving" 
                          : "Save this drill to your library"
                      }
                    >
                      {savingToLibrary === index 
                        ? "Saving..." 
                        : (drill.savedToLibraryId || drill.sourceCoachDrillId)
                        ? "✓ Saved" 
                        : "💾 Save to Library"}
                    </button>
                    <button
                      onClick={() => removeDrill(index)}
                      style={styles.smallDanger}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Drill Name</label>
                  <input
                    value={drill.title}
                    onChange={(e) => updateDrill(index, "title", e.target.value)}
                    style={styles.input}
                    placeholder="Serve & Pass, 6 v 6 Wash, Setter Release..."
                  />
                </div>

                <div style={styles.twoCol}>
                  <div style={styles.field}>
                    <label style={styles.label}>Category</label>
                    <select
                      value={drill.category}
                      onChange={(e) => updateDrill(index, "category", e.target.value)}
                      style={styles.select}
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabels[category] || category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Planned Minutes</label>
                    <input
                      type="number"
                      min="1"
                      value={drill.durationMinutes}
                      onChange={(e) =>
                        updateDrill(index, "durationMinutes", e.target.value)
                      }
                      style={styles.input}
                    />
                  </div>
                </div>

                <div style={styles.field}>
                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!drill.statsEnabled}
                      onChange={(e) =>
                        updateDrill(index, "statsEnabled", e.target.checked)
                      }
                    />
                    Track stats during this drill
                  </label>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Stats Mode</label>
                  <select
                    value={drill.statsType}
                    onChange={(e) => updateDrill(index, "statsType", e.target.value)}
                    style={styles.select}
                    disabled={!drill.statsEnabled}
                  >
                    {statsTypes.map((type) => (
                      <option key={type} value={type}>
                        {statsTypeLabels[type] || type}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Coaching Notes</label>
                  <textarea
                    value={drill.notes}
                    onChange={(e) => updateDrill(index, "notes", e.target.value)}
                    style={styles.textarea}
                    placeholder="Purpose, coaching cues, player groups, scoring, constraints, reminders..."
                  />
                </div>
              </div>
            ))
          )}
        </div>
        
        {showSavedDrillsModal && (
          <div style={styles.modalOverlay} onClick={() => setShowSavedDrillsModal(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Add Saved Drill</h2>
                <button 
                  onClick={() => setShowSavedDrillsModal(false)} 
                  style={styles.modalClose}
                >
                  ✕
                </button>
              </div>
              
              {loadingSavedDrills ? (
                <div style={styles.modalLoading}>Loading your saved drills...</div>
              ) : savedDrills.length === 0 ? (
                <div style={styles.modalEmpty}>
                  <p style={styles.modalEmptyTitle}>No saved drills yet</p>
                  <p style={styles.modalEmptyText}>
                    Generate drills in Coaches' Corner to add them to your practice plans.
                  </p>
                  <Link 
                    to="/coaches-corner" 
                    style={styles.modalLink}
                    onClick={() => setShowSavedDrillsModal(false)}
                  >
                    Go to Coaches' Corner
                  </Link>
                </div>
              ) : (
                <div style={styles.modalDrillList}>
                  {savedDrills.map((savedDrill) => (
                    <div key={savedDrill._id} style={styles.modalDrillCard}>
                      <div style={styles.modalDrillInfo}>
                        <div style={styles.modalDrillTitle}>{savedDrill.title}</div>
                        <div style={styles.modalDrillMeta}>
                          {savedDrill.inputs?.durationMinutes} min • {savedDrill.goal || "General"}
                        </div>
                        <div style={styles.modalDrillMeta}>
                          Rating: {Number(savedDrill.averageRating || 0).toFixed(1)} ({savedDrill.ratingsCount || 0})
                        </div>
                      </div>
                      <button
                        onClick={() => importSavedDrill(savedDrill)}
                        style={styles.modalAddButton}
                      >
                        Add to Plan
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#F2F2F7",
    padding: 16,
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  },
  wrap: {
    maxWidth: 920,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 700,
    color: "#111",
  },
  subtext: {
    marginTop: 6,
    color: "#666",
  },
  headerLinks: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  link: {
    color: "#007AFF",
    textDecoration: "none",
    fontWeight: 600,
  },
  message: {
    marginBottom: 12,
    color: "#1a7f37",
  },
  dateSelector: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    padding: 16,
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  dateLabel: {
    fontWeight: 600,
    fontSize: 15,
    color: "#111",
  },
  dateInput: {
    flex: 1,
    maxWidth: 200,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #D1D1D6",
    fontSize: 15,
    background: "#FAFAFA",
  },
  todayButton: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  datesWithDrillsCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  datesWithDrillsTitle: {
    fontWeight: 600,
    fontSize: 15,
    color: "#111",
    marginBottom: 12,
  },
  datesWithDrillsList: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  dateChip: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #D1D1D6",
    background: "#FAFAFA",
    color: "#111",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dateChipActive: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #007AFF",
    background: "#007AFF",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  summaryLabel: {
    color: "#666",
    fontSize: 13,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: 700,
    color: "#111",
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontWeight: 600,
    fontSize: 15,
  },
  secondaryButton: {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: "#E5E5EA",
    color: "#111",
    fontWeight: 600,
    fontSize: 15,
  },
  saveButtonUnsaved: {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: "#34C759",
    color: "#fff",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    animation: "pulse 2s ease-in-out infinite",
    boxShadow: "0 0 0 0 rgba(52, 199, 89, 0.7)",
  },
  list: {
    display: "grid",
    gap: 14,
  },
  emptyCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  emptyTitle: {
    fontWeight: 700,
    fontSize: 18,
    marginBottom: 8,
  },
  emptyText: {
    color: "#666",
    lineHeight: 1.45,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  drillIndex: {
    fontWeight: 700,
    fontSize: 18,
    color: "#111",
  },
  drillHint: {
    marginTop: 4,
    color: "#666",
    fontSize: 14,
  },
  cardActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  smallButton: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#E5E5EA",
    fontWeight: 600,
  },
  smallDanger: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#FF3B30",
    color: "#fff",
    fontWeight: 600,
  },
  smallSave: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#34C759",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  smallSaved: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #34C759",
    background: "#E8F5E9",
    color: "#34C759",
    fontWeight: 600,
    fontSize: 13,
    cursor: "not-allowed",
    opacity: 0.8,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
  },
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontWeight: 600,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 150px",
    gap: 12,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #D1D1D6",
    background: "#FAFAFA",
    fontSize: 16,
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #D1D1D6",
    background: "#FAFAFA",
    fontSize: 16,
  },
  textarea: {
    width: "100%",
    minHeight: 100,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #D1D1D6",
    background: "#FAFAFA",
    fontSize: 16,
    boxSizing: "border-box",
    resize: "vertical",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 16,
  },
  modalContent: {
    background: "#fff",
    borderRadius: 20,
    maxWidth: 600,
    width: "100%",
    maxHeight: "80vh",
    overflow: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottom: "1px solid #E5E5EA",
  },
  modalTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
  },
  modalClose: {
    background: "none",
    border: "none",
    fontSize: 28,
    color: "#666",
    cursor: "pointer",
    padding: 0,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalLoading: {
    padding: 40,
    textAlign: "center",
    color: "#666",
  },
  modalEmpty: {
    padding: 40,
    textAlign: "center",
  },
  modalEmptyTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  modalEmptyText: {
    color: "#666",
    marginBottom: 16,
  },
  modalLink: {
    display: "inline-block",
    padding: "12px 24px",
    borderRadius: 14,
    background: "#007AFF",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 600,
  },
  modalDrillList: {
    padding: 16,
    display: "grid",
    gap: 12,
  },
  modalDrillCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 16,
    background: "#F8F8FA",
    borderRadius: 14,
    border: "1px solid #E5E5EA",
  },
  modalDrillInfo: {
    flex: 1,
  },
  modalDrillTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  modalDrillMeta: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  modalAddButton: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};