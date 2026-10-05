import { render, screen } from "@testing-library/react";
import AttendanceTimeline from "components/analytics/AttendanceTimeline";
import { createStatusConfig } from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";

const statuses = createStatusConfig(CUSTOM_STATUSES);

it("groups verdicts by month and renders a cell per verdict", () => {
  const { container } = render(
    <AttendanceTimeline
      statuses={statuses}
      verdicts={[
        { date: "2026-05-03", status: "present" },
        { date: "2026-05-10", status: "late" },
        { date: "2026-06-07", status: "no_show" },
      ]}
    />,
  );
  expect(screen.getByText("May 2026")).toBeInTheDocument();
  expect(screen.getByText("Jun 2026")).toBeInTheDocument();
  expect(container.querySelectorAll('[data-cell="verdict"]').length).toBe(3);
});

it("uses configured statuses in the legend, plus inactive/unknown history", () => {
  render(
    <AttendanceTimeline
      statuses={statuses}
      verdicts={[
        { date: "2026-05-03", status: "late" },
        { date: "2026-05-10", status: "remote" },
        { date: "2026-05-17", status: "apology" },
      ]}
    />,
  );
  ["Present", "Late", "Excused", "No Show", "Remote", "Unknown"].forEach(
    (label) => expect(screen.getByText(label)).toBeInTheDocument(),
  );
});
