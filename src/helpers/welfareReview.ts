import { isValid, parseISO, format } from "date-fns";
import { MemberModelField } from "helpers/memberFields";
import type { WelfareInsight } from "components/welfare/welfareTypes";
import type { WelfareFollowUp } from "components/welfare/followUps/types";

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for an exact, real `YYYY-MM-DD` calendar date. The pattern alone
 * would accept `2026-02-30`, so the value must also round-trip through
 * date-fns unchanged (mirrors the backend overview validator).
 */
export const isBusinessDate = (
  value: string | null | undefined
): value is string => {
  if (!value || !BUSINESS_DATE.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
};

/** Sentinel for "no member-status scope": the `statuses` param is omitted. */
export const ALL_STATUSES = "__all__";

export interface WelfareStatusScope {
  /** Configured status options, in configured order and spelling. */
  options: readonly string[];
  /** The configured spelling of "Active", or null when there is none. */
  defaultStatus: string | null;
}

const NO_STATUS_SCOPE: WelfareStatusScope = {
  options: [],
  defaultStatus: null,
};

/**
 * Status options for the Welfare population filter, read from the member
 * model field whose permanent key is `status`. Only an option field qualifies
 * (the backend rejects a status scope on any other type), and the default is
 * the *configured* spelling of Active — never a normalised one, because the
 * backend stores and compares the configured value.
 */
export const welfareStatusScope = (
  fields: readonly MemberModelField[] | null | undefined
): WelfareStatusScope => {
  const statusField = (fields ?? []).find(
    (field) =>
      String(field?.name ?? "")
        .trim()
        .toLowerCase() === "status"
  );
  if (
    !statusField ||
    String(statusField.type ?? "")
      .trim()
      .toLowerCase() !== "option"
  ) {
    return NO_STATUS_SCOPE;
  }
  const options = (statusField.options ?? []).filter(
    (option) => typeof option === "string" && option.trim() !== ""
  );
  const defaultStatus =
    options.find((option) => option.trim().toLowerCase() === "active") ?? null;
  return { options, defaultStatus };
};

/**
 * The status the page should use. A selection only survives while it is still
 * a configured option for the same organisation; anything else (organisation
 * switch, option removed from the model) falls back to the scope's default —
 * Active when configured, otherwise All.
 */
export const effectiveWelfareStatus = (
  selection: { organisationId: string; value: string } | null,
  organisationId: string,
  scope: WelfareStatusScope
): string => {
  const fallback = scope.defaultStatus ?? ALL_STATUSES;
  if (!selection || selection.organisationId !== organisationId)
    return fallback;
  if (selection.value === ALL_STATUSES) return ALL_STATUSES;
  return scope.options.includes(selection.value) ? selection.value : fallback;
};

/** `statuses` request value, or undefined when the scope is All. */
export const statusesParam = (status: string): string | undefined =>
  status === ALL_STATUSES ? undefined : status;

/** Case-insensitive member-status match for client-side picker narrowing. */
export const memberHasStatus = (
  member: Record<string, unknown>,
  status: string
): boolean => {
  if (status === ALL_STATUSES) return true;
  const value = member.status;
  return (
    typeof value === "string" &&
    value.trim().toLowerCase() === status.trim().toLowerCase()
  );
};

export interface AttentionProgress {
  /** The backend's attention list, untouched. */
  all: readonly WelfareInsight[];
  pending: WelfareInsight[];
  followedUp: WelfareInsight[];
  /** Members with at least one follow-up linked to this review's signal. */
  followedUpIds: ReadonlySet<string>;
}

/**
 * Welfare progress for Needs Check-in. The attendance signal stays exactly as
 * the backend returned it; this only partitions it by whether Welfare has
 * acted on *this* review. A member counts as followed up when any active
 * follow-up — open or closed — was created from the attention insight for the
 * same `sourceAsOf`. Manual records and follow-ups from another review date do
 * not satisfy the signal. Members are counted once regardless of how many
 * linked records exist.
 */
export const attentionProgress = (
  attention: readonly WelfareInsight[],
  followUps: readonly WelfareFollowUp[],
  asOf: string
): AttentionProgress => {
  const linked = new Set<string>();
  followUps.forEach((record) => {
    if (record.sourceType === "attention" && record.sourceAsOf === asOf) {
      linked.add(record.memberId);
    }
  });
  const pending: WelfareInsight[] = [];
  const followedUp: WelfareInsight[] = [];
  const followedUpIds = new Set<string>();
  attention.forEach((insight) => {
    if (linked.has(insight.memberId)) {
      followedUp.push(insight);
      followedUpIds.add(insight.memberId);
    } else {
      pending.push(insight);
    }
  });
  return { all: attention, pending, followedUp, followedUpIds };
};
