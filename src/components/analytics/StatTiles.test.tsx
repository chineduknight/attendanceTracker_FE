import { render, screen } from "@testing-library/react";
import StatTiles from "components/analytics/StatTiles";

it("renders behavior tiles and the organisation's total", () => {
  render(
    <StatTiles
      behaviorCounts={{ present: 30, excused: 4, absent: 6 }}
      totalSessions={40}
    />,
  );
  [
    ["Present", "30"],
    ["Excused", "4"],
    ["Absent", "6"],
    ["Total Attendance", "40"],
  ].forEach(([label, value]) => {
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value)).toBeInTheDocument();
  });
  expect(screen.queryByText("Apology")).not.toBeInTheDocument();
});
