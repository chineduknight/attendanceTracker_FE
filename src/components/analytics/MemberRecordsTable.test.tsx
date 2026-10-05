import { render, screen } from "@testing-library/react";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";
import { createStatusConfig } from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";

const statuses = createStatusConfig(CUSTOM_STATUSES);

it("renders a row per record with an edited tag when updated", () => {
  render(
    <MemberRecordsTable
      statuses={statuses}
      records={[
        { attendanceId: "a1", date: "2026-06-28", status: "present", sessionName: "First Mass", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "no_show", sessionName: "Second Mass", hasBeenUpdated: true },
        { attendanceId: "a3", date: "2026-06-14", status: "present", sessionName: "Third Mass", hasBeenUpdated: true, editCount: 2 },
      ]}
    />,
  );
  expect(screen.getByText("First Mass")).toBeInTheDocument();
  expect(screen.getByText("Second Mass")).toBeInTheDocument();
  expect(screen.getByText("edited")).toBeInTheDocument();
  expect(screen.getByText("edited 2×")).toBeInTheDocument();
});

it("labels custom, inactive and unknown statuses from configuration", () => {
  render(
    <MemberRecordsTable
      statuses={statuses}
      records={[
        { attendanceId: "a1", date: "2026-06-28", status: "late", sessionName: "S1", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "remote", sessionName: "S2", hasBeenUpdated: false },
        { attendanceId: "a3", date: "2026-06-14", status: "mystery", sessionName: "S3", hasBeenUpdated: false },
      ]}
    />,
  );
  expect(screen.getByText("Late")).toBeInTheDocument();
  expect(screen.getByText("Remote")).toBeInTheDocument();
  expect(screen.getByText("Unknown")).toBeInTheDocument();
});
