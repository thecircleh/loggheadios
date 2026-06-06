/**
 * court_tests.js
 *
 * Example front-end test for the VolleyballCourt component
 * using React Testing Library.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import VolleyballCourt from "../components/VolleyballCourt";

describe("VolleyballCourt Component Tests", () => {
  it("renders loading message if match prop is null", () => {
    render(<VolleyballCourt match={null} />);
    expect(screen.getByText(/Loading court/i)).toBeInTheDocument();
  });

  it("displays court with positions for a valid match", () => {
    const mockMatch = {
      _id: "fakeMatchId",
      teamName: "Court Test Team",
      opponentName: "Court Test Opponent",
      activePlayers: [],
      benchPlayers: []
    };

    render(<VolleyballCourt match={mockMatch} />);

    // Example checks
    expect(screen.getByText(/Main Court/i)).toBeInTheDocument();
    expect(screen.getByText(/Pos 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Pos 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Pos 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Pos 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Pos 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Pos 1/i)).toBeInTheDocument();
  });
});
