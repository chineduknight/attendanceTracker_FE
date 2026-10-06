import {
  isAvailabilityActiveOn,
  isValidAvailabilityDate,
  sortAvailabilityPeriods,
  unavailableMemberIds,
} from "./attendanceAvailability";

const period = (
  id: string,
  startDate: string,
  endDate: string,
  memberId = id
) => ({
  id,
  organisationId: "org-1",
  memberId,
  startDate,
  endDate,
  createdAt: "",
  updatedAt: "",
});

describe("attendance availability helpers", () => {
  it("validates calendar dates rather than only their shape", () => {
    expect(isValidAvailabilityDate("2026-10-10")).toBe(true);
    expect(isValidAvailabilityDate("2026-02-30")).toBe(false);
    expect(isValidAvailabilityDate("")).toBe(false);
  });

  it("treats availability boundaries as inclusive", () => {
    const value = period("1", "2026-10-10", "2026-11-10");
    expect(isAvailabilityActiveOn(value, "2026-10-10")).toBe(true);
    expect(isAvailabilityActiveOn(value, "2026-11-10")).toBe(true);
    expect(isAvailabilityActiveOn(value, "2026-11-11")).toBe(false);
  });

  it("builds a unique unavailable member set", () => {
    const ids = unavailableMemberIds([
      period("1", "2026-10-10", "2026-11-10", "member-1"),
      period("2", "2026-10-12", "2026-11-12", "member-1"),
      period("3", "2026-10-12", "2026-11-12", "member-2"),
    ]);
    expect(ids).toEqual(new Set(["member-1", "member-2"]));
  });

  it("sorts periods without mutating the source", () => {
    const input = [
      period("2", "2026-11-10", "2026-11-12"),
      period("1", "2026-10-10", "2026-10-12"),
    ];
    expect(sortAvailabilityPeriods(input).map(({ id }) => id)).toEqual([
      "1",
      "2",
    ]);
    expect(input.map(({ id }) => id)).toEqual(["2", "1"]);
  });
});
