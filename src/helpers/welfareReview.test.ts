import {
  ALL_STATUSES,
  attentionProgress,
  effectiveWelfareStatus,
  isBusinessDate,
  memberHasStatus,
  statusesParam,
  welfareBirthdayPresentation,
  welfareStatusScope,
} from "helpers/welfareReview";
import { WelfareInsight } from "components/welfare/welfareTypes";
import { WelfareFollowUp } from "components/welfare/followUps/types";

const REVIEW = "2026-10-08";

const period = {
  expected: 4,
  present: 1,
  excused: 0,
  absent: 3,
  presenceRate: 25,
  attendanceRate: 25,
};

const insight = (memberId: string): WelfareInsight => ({
  memberId,
  name: `Member ${memberId}`,
  signals: ["consecutive_absence"],
  recent: period,
  previous: period,
  presenceChangePoints: -50,
  consecutiveAbsent: 3,
  lastPresentDate: null,
});

const ELEVEN = Array.from({ length: 11 }, (_, i) => insight(`m${i + 1}`));

const followUp = (over: Partial<WelfareFollowUp> = {}): WelfareFollowUp => ({
  id: `f-${Math.random()}`,
  organisationId: "org1",
  memberId: "m1",
  member: null,
  recordDate: REVIEW,
  sourceType: "attention",
  sourceSignals: ["consecutive_absence"],
  sourceAsOf: REVIEW,
  reason: "Check-in",
  note: null,
  workflowStatus: "closed",
  nextFollowUpDate: null,
  assignedTo: null,
  createdBy: null,
  updatedBy: null,
  closedAt: null,
  revision: 1,
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  ...over,
});

describe("isBusinessDate", () => {
  it("accepts only exact, real YYYY-MM-DD calendar dates", () => {
    expect(isBusinessDate("2026-10-08")).toBe(true);
    expect(isBusinessDate("2026-02-30")).toBe(false);
    expect(isBusinessDate("2026-10-8")).toBe(false);
    expect(isBusinessDate("08/10/2026")).toBe(false);
    expect(isBusinessDate("")).toBe(false);
    expect(isBusinessDate(null)).toBe(false);
  });
});

describe("welfareStatusScope", () => {
  it("defaults to the configured Active spelling, matched case-insensitively", () => {
    const scope = welfareStatusScope([
      { name: "name", type: "text" },
      { name: "status", type: "option", options: ["ACTIVE", "Inactive"] },
    ]);
    expect(scope.defaultStatus).toBe("ACTIVE");
    expect(scope.options).toEqual(["ACTIVE", "Inactive"]);
    expect(statusesParam(scope.defaultStatus as string)).toBe("ACTIVE");
  });

  it("defaults to All when no Active option is configured", () => {
    const scope = welfareStatusScope([
      { name: "status", type: "option", options: ["Member", "Alumni"] },
    ]);
    expect(scope.defaultStatus).toBeNull();
    expect(scope.options).toEqual(["Member", "Alumni"]);
  });

  it("offers nothing when there is no status field or it is not an option field", () => {
    expect(welfareStatusScope([{ name: "name", type: "text" }])).toEqual({
      options: [],
      defaultStatus: null,
    });
    expect(
      welfareStatusScope([
        { name: "status", type: "text", options: ["Active"] },
      ])
    ).toEqual({ options: [], defaultStatus: null });
    expect(welfareStatusScope(undefined).defaultStatus).toBeNull();
  });

  it("matches the permanent key, never a label", () => {
    const scope = welfareStatusScope([
      { name: "state", label: "status", type: "option", options: ["Active"] },
    ]);
    expect(scope.defaultStatus).toBeNull();
  });
});

describe("effectiveWelfareStatus", () => {
  const scope = { options: ["Active", "Inactive"], defaultStatus: "Active" };

  it("uses the default until the officer chooses", () => {
    expect(effectiveWelfareStatus(null, "org1", scope)).toBe("Active");
  });

  it("keeps a valid selection for the same organisation, including All", () => {
    expect(
      effectiveWelfareStatus(
        { organisationId: "org1", value: "Inactive" },
        "org1",
        scope
      )
    ).toBe("Inactive");
    expect(
      effectiveWelfareStatus(
        { organisationId: "org1", value: ALL_STATUSES },
        "org1",
        scope
      )
    ).toBe(ALL_STATUSES);
  });

  it("drops another organisation's selection or a removed option", () => {
    expect(
      effectiveWelfareStatus(
        { organisationId: "org1", value: "Inactive" },
        "org2",
        scope
      )
    ).toBe("Active");
    expect(
      effectiveWelfareStatus(
        { organisationId: "org1", value: "Alumni" },
        "org1",
        scope
      )
    ).toBe("Active");
    expect(
      effectiveWelfareStatus(
        { organisationId: "org1", value: "Alumni" },
        "org1",
        { options: ["Alumni2"], defaultStatus: null }
      )
    ).toBe(ALL_STATUSES);
  });

  it("omits the statuses param for All", () => {
    expect(statusesParam(ALL_STATUSES)).toBeUndefined();
  });
});

describe("memberHasStatus", () => {
  it("matches case-insensitively and lets All through", () => {
    expect(memberHasStatus({ status: "active" }, "Active")).toBe(true);
    expect(memberHasStatus({ status: "Inactive" }, "Active")).toBe(false);
    expect(memberHasStatus({}, "Active")).toBe(false);
    expect(memberHasStatus({}, ALL_STATUSES)).toBe(true);
  });
});

describe("attentionProgress", () => {
  it("11 signals with no linked follow-ups are all pending", () => {
    const progress = attentionProgress(ELEVEN, [], REVIEW);
    expect(progress.all).toHaveLength(11);
    expect(progress.pending).toHaveLength(11);
    expect(progress.followedUp).toHaveLength(0);
  });

  it("a closed linked follow-up counts as followed up", () => {
    const progress = attentionProgress(
      ELEVEN,
      [followUp({ workflowStatus: "closed" })],
      REVIEW
    );
    expect(progress.followedUp.map((i) => i.memberId)).toEqual(["m1"]);
    expect(progress.pending).toHaveLength(10);
  });

  it("an open linked follow-up counts the same way", () => {
    const progress = attentionProgress(
      ELEVEN,
      [followUp({ workflowStatus: "open" })],
      REVIEW
    );
    expect(progress.followedUp).toHaveLength(1);
    expect(progress.pending).toHaveLength(10);
  });

  it("counts unique members, not records", () => {
    const progress = attentionProgress(
      ELEVEN,
      [
        followUp({ memberId: "m1" }),
        followUp({ memberId: "m1", workflowStatus: "open" }),
        followUp({ memberId: "m2" }),
        followUp({ memberId: "m3" }),
      ],
      REVIEW
    );
    expect(progress.followedUp).toHaveLength(3);
    expect(progress.pending).toHaveLength(8);
  });

  it("manual follow-ups never satisfy the attendance signal", () => {
    const progress = attentionProgress(
      ELEVEN,
      [followUp({ sourceType: "manual", sourceAsOf: null, sourceSignals: [] })],
      REVIEW
    );
    expect(progress.followedUp).toHaveLength(0);
  });

  it("other insight sources never satisfy Needs Check-in", () => {
    const progress = attentionProgress(
      ELEVEN,
      [followUp({ sourceType: "communicated" })],
      REVIEW
    );
    expect(progress.followedUp).toHaveLength(0);
  });

  it("a follow-up from another review date does not satisfy this review", () => {
    const progress = attentionProgress(
      ELEVEN,
      [followUp({ sourceAsOf: "2026-10-01" })],
      REVIEW
    );
    expect(progress.followedUp).toHaveLength(0);
    expect(progress.pending).toHaveLength(11);
  });

  it("never mutates or reorders the backend list", () => {
    const attention = [...ELEVEN];
    const progress = attentionProgress(attention, [followUp()], REVIEW);
    expect(progress.all).toBe(attention);
    expect(attention).toEqual(ELEVEN);
  });
});

describe("welfareBirthdayPresentation", () => {
  const TODAY = "2026-10-08";
  const UPCOMING = { isUpcoming: true, label: "Upcoming Birthdays" };
  const REVIEW = { isUpcoming: false, label: "Birthdays in Review Range" };

  it("calls a range starting today upcoming", () => {
    expect(welfareBirthdayPresentation("2026-10-08", TODAY)).toEqual(UPCOMING);
  });

  it("calls a future range upcoming", () => {
    expect(welfareBirthdayPresentation("2026-10-20", TODAY)).toEqual(UPCOMING);
  });

  it("calls an entirely past range a review range", () => {
    expect(welfareBirthdayPresentation("2026-09-29", TODAY)).toEqual(REVIEW);
  });

  it("calls a range that straddles today a review range", () => {
    expect(welfareBirthdayPresentation("2026-10-04", TODAY)).toEqual(REVIEW);
  });
});
