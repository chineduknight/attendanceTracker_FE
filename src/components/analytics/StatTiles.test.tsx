import { render, screen } from "@testing-library/react";
import StatTiles from "components/analytics/StatTiles";

it("renders all four totals with labels", () => {
  render(<StatTiles present={30} absent={6} apology={4} totalSessions={40} />);
  expect(screen.getByText("Present")).toBeInTheDocument();
  expect(screen.getByText("30")).toBeInTheDocument();
  expect(screen.getByText("Total Sessions")).toBeInTheDocument();
  expect(screen.getByText("40")).toBeInTheDocument();
});
