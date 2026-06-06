import React from "react";
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders Volleyball Logger App heading", () => {
  render(<App />);
  const heading = screen.getByText(/Volleyball Logger App/i);
  expect(heading).toBeInTheDocument();
});
