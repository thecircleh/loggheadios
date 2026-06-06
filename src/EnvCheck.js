import React, { useEffect, useState } from "react";
import axios from "axios";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useAuth } from "./components/AuthContext";

const API_URL = process.env.REACT_APP_API_URL || "https://api.loggerhead.app";

const geoUrl =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const stateNameToAbbreviation = (stateName) => {
  const states = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY"
  };
  return states[stateName] || "";
};

const abbreviationToStateName = (abbr) => {
  const states = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming"
  };
  return states[abbr] || "";
};

const EnvCheck = () => {
  const { token } = useAuth();
  const [stateData, setStateData] = useState({});
  const [error, setError] = useState(null);
   const [selectedState, setSelectedState] = useState(null);

  useEffect(() => {
    const fetchStates = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/users/states`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          withCredentials: true,
        });
        setStateData(res.data);
      } catch (err) {
        setError(err.message || "Failed to load states");
      }
    };

    if (token) {
      fetchStates();
    }
  }, [token]);

  const getColor = (stateName) => {
    const userCount = stateData[stateName] || 0;
    if (userCount >= 6) return "#003366";
    if (userCount >= 3) return "#336699";
    if (userCount >= 1) return "#99ccff";
    return "#EEE";
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h2>📍 User Locations Map</h2>
      {error ? (
        <p style={{ color: "red" }}>❌ {error}</p>
      ) : (
        <>
          <ComposableMap projection="geoAlbersUsa" width={980} height={600}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const stateName = geo.properties.name;
                  return (
					<Geography
					key={geo.rsmKey}
					geography={geo}
					fill={getColor(stateName)}
					stroke="#FFFFFF"
					onMouseEnter={() => {
						const count = stateData[stateName] || 0;
						console.log(`${stateName}: ${count} user(s)`);
					}}
					onClick={() => {
						const count = stateData[stateName] || 0;
						setSelectedState({ name: stateName, count });
					}}
					style={{
						default: { outline: "none", cursor: "pointer" },
						hover: { fill: "#FF5722", outline: "none", cursor: "pointer" },
						pressed: { outline: "none" },
					}}
					/>
                  );
                })
              }
            </Geographies>
          </ComposableMap>

<div
  style={{
    marginTop: "1rem",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    backgroundColor: "#f5f5f5",
    display: "inline-block",
    fontSize: "14px",
  }}
>
  {selectedState ? (
    <>
      <strong>{selectedState.name}</strong>:{" "}
      {selectedState.count}{" "}
      {selectedState.count === 1 ? "user" : "users"}
    </>
  ) : (
    <span>Click a state to see how many users are there.</span>
  )}
</div>

          <div style={{ marginTop: "1rem", fontSize: "14px" }}>
            <p><strong>Color Key:</strong></p>
            <ul>
              <li style={{ color: "#003366" }}>6+ Users</li>
              <li style={{ color: "#336699" }}>3-5 Users</li>
              <li style={{ color: "#99ccff" }}>1-2 Users</li>
              <li style={{ color: "#EEE" }}>0 Users</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default EnvCheck;
