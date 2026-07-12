import { render, screen } from "@testing-library/react";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";

it("renders a row per record with an edited tag when updated", () => {
  render(
    <MemberRecordsTable
      records={[
        { attendanceId: "a1", date: "2026-06-28", status: "present", sessionName: "First Mass", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "absent", sessionName: "Second Mass", hasBeenUpdated: true },
      ]}
    />,
  );
  expect(screen.getByText("First Mass")).toBeInTheDocument();
  expect(screen.getByText("Second Mass")).toBeInTheDocument();
  expect(screen.getByText("edited")).toBeInTheDocument();
});
