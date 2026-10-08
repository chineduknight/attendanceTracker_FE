import {
  createStatusRow,
  generateStatusKey,
  MAX_ATTENDANCE_STATUSES,
  moveStatusRow,
  setDefaultStatus,
  StatusRow,
  toStatusRows,
  validateStatusRows,
} from "helpers/attendanceStatusSettings";
import { DEFAULT_ATTENDANCE_STATUSES } from "helpers/attendanceStatuses";

const defaults = () => toStatusRows(DEFAULT_ATTENDANCE_STATUSES);
const update = (rows: StatusRow[], key: string, patch: Partial<StatusRow>) =>
  rows.map((row) => (row.key === key ? { ...row, ...patch } : row));

describe("attendance status settings", () => {
  it("starts from the default configuration, all persisted and valid", () => {
    const rows = toStatusRows(undefined);
    expect(rows.map((row) => row.key)).toEqual(["present", "apology", "absent"]);
    expect(rows.every((row) => row.persisted)).toBe(true);
    expect(validateStatusRows(rows)).toEqual([]);
  });

  it("adds a `late` status with a key generated from its label", () => {
    const rows = defaults();
    const late = createStatusRow("  Late ", rows);
    expect(late).toMatchObject({
      key: "late",
      label: "Late",
      shortLabel: "LA",
      behavior: "present",
      active: true,
      isDefault: false,
      persisted: false,
    });
    expect(validateStatusRows([...rows, late])).toEqual([]);
  });

  it("keeps generated keys unique", () => {
    const rows = defaults();
    expect(generateStatusKey("Present", rows)).toBe("present_2");
    expect(generateStatusKey("No Show!", rows)).toBe("no_show");
    expect(generateStatusKey("!!!", rows)).toBe("status");
  });

  it("keeps generated keys within the backend key rule", () => {
    const rows = defaults();
    const key = generateStatusKey("A".repeat(60), rows);
    expect(key).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
    const second = generateStatusKey("A".repeat(60), [
      ...rows,
      { ...rows[0], key },
    ]);
    expect(second).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
    expect(second).not.toBe(key);
  });

  it("enforces label and short-label length limits", () => {
    const rows = update(defaults(), "present", { shortLabel: "TOOLONG" });
    expect(validateStatusRows(rows)).toContain(
      "Labels are at most 40 characters and short labels at most 6.",
    );
  });

  it("rejects duplicate labels and short labels", () => {
    const rows = update(defaults(), "apology", {
      label: "present",
      shortLabel: "p",
    });
    expect(validateStatusRows(rows)).toEqual(
      expect.arrayContaining([
        'Label "present" is used more than once.',
        'Short label "p" is used more than once.',
      ]),
    );
  });

  it("enforces the maximum number of statuses", () => {
    let rows = defaults();
    while (rows.length <= MAX_ATTENDANCE_STATUSES) {
      rows = [...rows, createStatusRow(`Extra ${rows.length}`, rows)];
    }
    expect(validateStatusRows(rows)).toContain(
      `Use at most ${MAX_ATTENDANCE_STATUSES} statuses.`,
    );
  });

  it("requires exactly one active default with absent behavior", () => {
    expect(
      validateStatusRows(update(defaults(), "absent", { isDefault: false })),
    ).toContain("Choose exactly one active default status.");
    expect(validateStatusRows(setDefaultStatus(defaults(), "present"))).toContain(
      "The default status must have Absent behavior.",
    );
  });

  it("rejects an inactive default", () => {
    expect(
      validateStatusRows(update(defaults(), "absent", { active: false })),
    ).toEqual(
      expect.arrayContaining([
        "An inactive status cannot be the default.",
        "At least one active status must have Absent behavior.",
      ]),
    );
  });

  it("requires an active present-behavior status", () => {
    expect(
      validateStatusRows(update(defaults(), "present", { active: false })),
    ).toContain("At least one active status must have Present behavior.");
  });

  it("allows deactivating a status without removing it", () => {
    const rows = update(defaults(), "apology", { active: false });
    expect(rows.map((row) => row.key)).toContain("apology");
    expect(validateStatusRows(rows)).toEqual([]);
  });

  it("moves rows up and down within bounds", () => {
    const rows = defaults();
    expect(moveStatusRow(rows, 2, -1).map((r) => r.key)).toEqual([
      "present",
      "absent",
      "apology",
    ]);
    expect(moveStatusRow(rows, 0, -1).map((r) => r.key)).toEqual([
      "present",
      "apology",
      "absent",
    ]);
  });
});
