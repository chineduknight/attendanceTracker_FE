import { screen } from "@testing-library/react";
import { render } from "test-utils/render";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";
import { createStatusConfig } from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";

const statuses = createStatusConfig(CUSTOM_STATUSES);

it("renders a row per record with an edited tag when updated", () => {
  render(
    <MemberRecordsTable
      statuses={statuses}
      records={[
        { attendanceId: "a1", date: "2026-06-28", status: "present", behavior: "present", sessionName: "First Mass", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "no_show", behavior: "absent", sessionName: "Second Mass", hasBeenUpdated: true },
        { attendanceId: "a3", date: "2026-06-14", status: "present", behavior: "present", sessionName: "Third Mass", hasBeenUpdated: true, editCount: 2 },
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
        { attendanceId: "a1", date: "2026-06-28", status: "late", behavior: "present", sessionName: "S1", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "remote", behavior: "present", sessionName: "S2", hasBeenUpdated: false },
        { attendanceId: "a3", date: "2026-06-14", status: "mystery", behavior: "absent", sessionName: "S3", hasBeenUpdated: false },
      ]}
    />,
  );
  expect(screen.getByText("Late")).toBeInTheDocument();
  expect(screen.getByText("Remote")).toBeInTheDocument();
  expect(screen.getByText("Unknown")).toBeInTheDocument();
});
