import {
  followUpDateLabel,
  followUpDueLabel,
  followUpNoteExcerpt,
  followUpPrefillReason,
} from "components/welfare/followUps/followUpPresentation";

describe("followUpDueLabel", () => {
  const asOf = "2026-10-07";

  it("labels overdue, due today, future and dateless open records", () => {
    expect(
      followUpDueLabel(
        { workflowStatus: "open", nextFollowUpDate: "2026-10-05" },
        asOf,
      ),
    ).toBe("Overdue");
    expect(
      followUpDueLabel(
        { workflowStatus: "open", nextFollowUpDate: "2026-10-07" },
        asOf,
      ),
    ).toBe("Due today");
    expect(
      followUpDueLabel(
        { workflowStatus: "open", nextFollowUpDate: "2026-10-12" },
        asOf,
      ),
    ).toBe("Follow up 12 Oct");
    expect(
      followUpDueLabel(
        { workflowStatus: "open", nextFollowUpDate: null },
        asOf,
      ),
    ).toBe("Open — no date set");
  });

  it("does not claim a due state for closed records", () => {
    expect(
      followUpDueLabel(
        { workflowStatus: "closed", nextFollowUpDate: null },
        asOf,
      ),
    ).toBe("Closed");
  });
});

describe("followUpPrefillReason", () => {
  const attention = (signals: string[], consecutiveAbsent = 2) => ({
    signals,
    consecutiveAbsent,
  });

  it("prefills the consecutive-absence wording", () => {
    expect(
      followUpPrefillReason("attention", attention(["consecutive_absence"])),
    ).toBe("2 consecutive unexplained absences");
  });

  it("prefills the presence-drop wording", () => {
    expect(
      followUpPrefillReason(
        "attention",
        attention(["presence_drop_with_absence"]),
      ),
    ).toBe("Physical presence reduced, with unexplained absences");
  });

  it("combines multiple attention signals into one editable sentence", () => {
    expect(
      followUpPrefillReason(
        "attention",
        attention(["presence_drop_with_absence", "consecutive_absence"]),
      ),
    ).toBe(
      "Attendance follow-up: 2 consecutive unexplained absences; physical presence reduced",
    );
  });

  it("uses the fixed wording for communicated and encouragement", () => {
    expect(followUpPrefillReason("communicated", attention([]))).toBe(
      "Physical presence reduced, but communicated",
    );
    expect(followUpPrefillReason("encouragement", attention([]))).toBe(
      "Physical presence improved",
    );
  });
});

describe("followUpNoteExcerpt", () => {
  it("keeps short notes and drops blank ones", () => {
    expect(followUpNoteExcerpt("Called the family.")).toBe(
      "Called the family.",
    );
    expect(followUpNoteExcerpt(null)).toBeNull();
    expect(followUpNoteExcerpt("   ")).toBeNull();
  });

  it("truncates long notes with an ellipsis", () => {
    const long = "x".repeat(200);
    const excerpt = followUpNoteExcerpt(long, 140);
    expect(excerpt).toHaveLength(140);
    expect(excerpt?.endsWith("…")).toBe(true);
  });
});

describe("followUpDateLabel", () => {
  it("formats canonical business dates and passes through bad input", () => {
    expect(followUpDateLabel("2026-10-07")).toBe("7 Oct");
    expect(followUpDateLabel("not-a-date")).toBe("not-a-date");
  });
});
