import {
  buildAtomicEditPayload,
  canSaveEdit,
  hasPendingEdits,
  pendingAdditions,
  toEditBaseline,
} from "helpers/attendanceEditDraft";

const RECORD = {
  name: "Rehearsal",
  date: "2026-09-01",
  categoryId: "cat1",
  subCategoryId: null,
  editCount: 2,
  editsRemaining: 1,
  attendance: [
    { memberId: "ada", member: { name: "Ada" }, attendanceStatus: "present" },
    { memberId: "bola", member: { name: "Bola" }, attendanceStatus: "absent" },
    { memberId: "chidi", member: { name: "Chidi" }, attendanceStatus: "late", manuallyAdded: true },
    { memberId: "dayo", member: { name: "Dayo" }, attendanceStatus: "present", manuallyAdded: true },
    // Unresolved: never listed, so the backend keeps it.
    { memberId: "gone", member: null, attendanceStatus: "present", manuallyAdded: true },
  ],
};
const baseline = toEditBaseline(RECORD);
const row = (id: string, attendanceStatus: string, reason?: string) => ({
  id,
  name: id,
  attendanceStatus,
  ...(reason ? { reason } : {}),
});
const SESSION = { name: "Rehearsal", date: "2026-09-01", categoryId: "cat1", subCategoryId: null };
const DETAILS = { name: "Rehearsal", date: "2026-09-01", categoryId: "cat1", subCategoryId: "" };
const EXPECTED = [row("ada", "present"), row("bola", "absent")];
const MANUAL = [row("chidi", "late"), row("dayo", "present")];

describe("toEditBaseline", () => {
  it("fixes the loaded edit count, allowance, details and stored roster", () => {
    expect(baseline.editCount).toBe(2);
    expect(baseline.editsRemaining).toBe(1);
    expect(baseline.editsLocked).toBe(false);
    expect(baseline.details).toEqual(DETAILS);
    expect(Array.from(baseline.manualIds)).toEqual(["chidi", "dayo", "gone"]);
    expect(baseline.statuses.get("gone")).toBe("present");
  });

  it("treats a legacy record without editCount as 0 and a locked one as unsaveable", () => {
    expect(toEditBaseline({ ...RECORD, editCount: undefined }).editCount).toBe(0);
    expect(
      toEditBaseline({ ...RECORD, editCount: undefined, hasBeenUpdated: true }).editCount,
    ).toBe(0);
    expect(canSaveEdit(baseline)).toBe(true);
    expect(canSaveEdit(toEditBaseline({ ...RECORD, editsRemaining: 0 }))).toBe(false);
    expect(canSaveEdit(toEditBaseline({ ...RECORD, editsLocked: true }))).toBe(false);
  });
});

describe("hasPendingEdits", () => {
  const unchanged = { details: DETAILS, rows: [...EXPECTED, ...MANUAL], manual: MANUAL, removals: [] };

  it("is false for an untouched edit", () => {
    expect(hasPendingEdits(baseline, unchanged)).toBe(false);
  });

  it("sees a status, a detail, an addition or a removal", () => {
    expect(hasPendingEdits(baseline, { ...unchanged, rows: [row("ada", "late")] })).toBe(true);
    expect(hasPendingEdits(baseline, { ...unchanged, details: { ...DETAILS, name: "Renamed" } })).toBe(true);
    expect(hasPendingEdits(baseline, { ...unchanged, manual: [...MANUAL, row("ezra", "present")] })).toBe(true);
    expect(hasPendingEdits(baseline, { ...unchanged, removals: ["dayo"] })).toBe(true);
  });
});

describe("buildAtomicEditPayload", () => {
  it("sends two removals and one addition with the full retained status list, in one body", () => {
    const payload = buildAtomicEditPayload({
      organisationId: "org1",
      session: SESSION,
      expected: [row("ada", "late"), row("bola", "absent")],
      manual: [row("ezra", "present", "  Joined late  ")],
      removals: ["chidi", "dayo"],
      baseline,
    });
    expect(payload).toEqual({
      name: "Rehearsal",
      date: "2026-09-01",
      categoryId: "cat1",
      subCategoryId: null,
      organisationId: "org1",
      memberStatuses: [
        { memberId: "ada", status: "late" },
        { memberId: "bola", status: "absent" },
      ],
      manualAdditions: [{ memberId: "ezra", status: "present", reason: "Joined late" }],
      manualRemovals: ["chidi", "dayo"],
      expectedEditCount: 2,
    });
  });

  it("keeps retained manual entries in memberStatuses and never lists unresolved ones", () => {
    const payload = buildAtomicEditPayload({
      organisationId: "org1",
      session: SESSION,
      expected: EXPECTED,
      manual: MANUAL,
      removals: [],
      baseline,
    });
    expect(payload.memberStatuses.map((s) => s.memberId)).toEqual(["ada", "bola", "chidi", "dayo"]);
    expect(payload).not.toHaveProperty("manualAdditions");
    expect(payload).not.toHaveProperty("manualRemovals");
    expect(JSON.stringify(payload)).not.toMatch(/gone|eligibilityRules|manuallyAdded/);
  });

  it("drops an addition the officer removed again before saving", () => {
    // Ezra was added and then removed in this edit: simply gone from manual.
    const manual = MANUAL;
    expect(pendingAdditions(manual, baseline)).toEqual([]);
    const payload = buildAtomicEditPayload({
      organisationId: "org1",
      session: SESSION,
      expected: EXPECTED,
      manual,
      removals: [],
      baseline,
    });
    expect(JSON.stringify(payload)).not.toMatch(/ezra/);
  });
});
