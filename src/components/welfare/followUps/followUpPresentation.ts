/**
 * Pure presentation helpers for the Phase 7C follow-up section.
 *
 * These only label or describe backend-provided records — they never decide
 * workflow state, deduce due-ness for counts, or turn view data into payload
 * data. The backend summary stays authoritative for the counts.
 */
import { format, isValid, parseISO } from "date-fns";
import { WelfareInsight } from "components/welfare/welfareTypes";
import type { InsightVariant } from "components/welfare/AttendanceInsightCard";
import { WelfareFollowUp } from "./types";

export type WelfareFollowUpSourceVariant = InsightVariant;

/** Formats a canonical YYYY-MM-DD business date for compact display. */
export const followUpDateLabel = (value: string): string => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM") : value;
};

/**
 * Due-state label for one record (§18). `asOf` is the same business date the
 * list was fetched with, so the label and the backend summary agree.
 */
export const followUpDueLabel = (
  record: Pick<WelfareFollowUp, "workflowStatus" | "nextFollowUpDate">,
  asOf: string,
): string => {
  if (record.workflowStatus !== "open") return "Closed";
  const next = record.nextFollowUpDate;
  if (!next) return "Open — no date set";
  if (next < asOf) return "Overdue";
  if (next === asOf) return "Due today";
  return `Follow up ${followUpDateLabel(next)}`;
};

/**
 * Convenience prefill for an insight-based follow-up (§15). The officer can
 * edit the text before saving; it is never sent unconfirmed.
 */
export const followUpPrefillReason = (
  variant: WelfareFollowUpSourceVariant,
  insight: Pick<WelfareInsight, "signals" | "consecutiveAbsent">,
): string => {
  if (variant === "communicated") {
    return "Physical presence reduced, but communicated";
  }
  if (variant === "encouragement") return "Physical presence improved";

  const signals = insight.signals ?? [];
  const parts: string[] = [];
  if (signals.includes("consecutive_absence")) {
    parts.push(
      insight.consecutiveAbsent > 0
        ? `${insight.consecutiveAbsent} consecutive unexplained absences`
        : "Consecutive unexplained absences",
    );
  }
  if (signals.includes("presence_drop_with_absence")) {
    parts.push("physical presence reduced");
  }
  if (parts.length === 0) return "Attendance follow-up";
  if (parts.length === 1) {
    return signals.includes("consecutive_absence")
      ? parts[0]
      : "Physical presence reduced, with unexplained absences";
  }
  return `Attendance follow-up: ${parts.join("; ")}`;
};

/**
 * Short excerpt for overview cards. Full notes stay in the record and are only
 * shown through manage actions — never dumped on the section.
 */
export const followUpNoteExcerpt = (
  note: string | null,
  maxLength = 140,
): string | null => {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
};
