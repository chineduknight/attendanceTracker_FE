import { render, screen } from "@testing-library/react";
import AttendanceTimeline from "components/analytics/AttendanceTimeline";

it("groups verdicts by month and renders a cell per verdict", () => {
  const { container } = render(
    <AttendanceTimeline
      verdicts={[
        { date: "2026-05-03", status: "present" },
        { date: "2026-05-10", status: "apology" },
        { date: "2026-06-07", status: "absent" },
      ]}
    />,
  );
  expect(screen.getByText("May 2026")).toBeInTheDocument();
  expect(screen.getByText("Jun 2026")).toBeInTheDocument();
  // 3 verdict cells + 3 legend swatches = 6 boxes of 16px/12px; assert verdict cells:
  expect(container.querySelectorAll('[data-cell="verdict"]').length).toBe(3);
});
