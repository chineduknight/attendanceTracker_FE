import { fireEvent, screen } from "@testing-library/react";
import { render } from "test-utils/render";
import MemberRecordsList, { groupRecordsByMonth } from "components/analytics/MemberRecordsList";
import { MemberRecord } from "components/analytics/memberAnalyticsTypes";
import { createStatusConfig } from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";

const statuses = createStatusConfig(CUSTOM_STATUSES);

const record = (date: string, sessionName: string, over: Partial<MemberRecord> = {}): MemberRecord => ({
  attendanceId: `${date}-${sessionName}`,
  date,
  status: "present",
  behavior: "present",
  sessionName,
  hasBeenUpdated: false,
  ...over,
});

// One record per month, January to September 2026 (stored as UTC midnight).
const NINE_MONTHS = Array.from({ length: 9 }, (_, i) =>
  record(`2026-0${i + 1}-15T00:00:00.000Z`, `Session ${i + 1}`),
);

describe("groupRecordsByMonth", () => {
  it("groups by the stored calendar month, newest month and row first", () => {
    const groups = groupRecordsByMonth([
      record("2026-05-01T00:00:00.000Z", "May first"),
      record("2026-06-30T00:00:00.000Z", "June last"),
      record("2026-05-31T00:00:00.000Z", "May last"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-06", "2026-05"]);
    expect(groups[1].records.map((r) => r.sessionName)).toEqual(["May last", "May first"]);
  });
});

describe("<MemberRecordsList>", () => {
  it("opens the newest two months, collapses older ones and caps at six", () => {
    render(<MemberRecordsList records={NINE_MONTHS} statuses={statuses} />);
    const headers = screen.getAllByRole("button", { expanded: true });
    expect(headers.map((h) => h.textContent)).toEqual([
      "September 20261 record",
      "August 20261 record",
    ]);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(4);
    expect(screen.getByText("Session 9")).toBeInTheDocument();
    expect(screen.queryByText("Session 7")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /July 2026/ }));
    expect(screen.getByText("Session 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /September 2026/ }));
    expect(screen.queryByText("Session 9")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /January 2026/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 3 more months" }));
    expect(screen.getByRole("button", { name: /January 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more month/ })).not.toBeInTheDocument();
  });

  it("marks edited records and labels custom, inactive and unknown statuses", () => {
    render(
      <MemberRecordsList
        statuses={statuses}
        records={[
          record("2026-06-28", "S1", { status: "late" }),
          record("2026-06-21", "S2", { status: "remote", hasBeenUpdated: true }),
          record("2026-06-14", "S3", { status: "mystery", behavior: "absent", hasBeenUpdated: true, editCount: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.getByText("Edited 2×")).toBeInTheDocument();
    expect(screen.getByText("Sun 28")).toBeInTheDocument();
  });
});
