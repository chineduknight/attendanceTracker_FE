import { attendanceLeaveQuestion } from "helpers/leaveQuestions";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

const REHEARSAL = {
  ...DEFAULT_TERMINOLOGY,
  attendanceSingular: "Rehearsal",
  attendancePlural: "Rehearsals",
};

describe("attendanceLeaveQuestion", () => {
  it.each(["navigate", "logout"] as const)(
    "never calls leaving a saved draft a discard (%s)",
    (reason) => {
      const question = attendanceLeaveQuestion("draft", reason, DEFAULT_TERMINOLOGY);
      expect(question.destructive).toBeFalsy();
      expect(question.cancelLabel).toBe("Keep marking");
      expect(
        `${question.title} ${question.body} ${question.confirmLabel}`,
      ).not.toMatch(/discard|lost|delete/i);
    },
  );

  it("names the leave action for a draft", () => {
    expect(attendanceLeaveQuestion("draft", "logout", DEFAULT_TERMINOLOGY).confirmLabel).toBe("Log out");
    expect(attendanceLeaveQuestion("draft", "navigate", DEFAULT_TERMINOLOGY).confirmLabel).toBe("Leave");
  });

  it.each(["edit", "setup"] as const)("warns that leaving %s work discards it", (work) => {
    const question = attendanceLeaveQuestion(work, "logout", DEFAULT_TERMINOLOGY);
    expect(question.destructive).toBe(true);
    expect(question.confirmLabel).toBe("Discard and log out");
    expect(question.cancelLabel).toBe("Keep editing");
  });

  it("uses the organisation's words", () => {
    expect(attendanceLeaveQuestion("draft", "navigate", REHEARSAL).body).toBe(
      "Your progress on this rehearsal is saved on this device. Open Create Rehearsal here to continue marking it.",
    );
    expect(attendanceLeaveQuestion("setup", "navigate", REHEARSAL).title).toBe(
      "Discard this new rehearsal?",
    );
    expect(attendanceLeaveQuestion("edit", "navigate", REHEARSAL).body).toBe(
      "Your changes to this rehearsal haven't been saved. Leave without saving them?",
    );
  });
});
