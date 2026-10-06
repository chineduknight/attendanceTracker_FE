/**
 * Phase 6E: whole-session analytics inclusion. Session-level metadata, never an
 * attendance status — the backend decides what analytics count, the client
 * only displays the flag and requests changes.
 */

export const ANALYTICS_EXCLUSION_REASON_MAX = 200;

/** Inclusion fields as returned on attendance list/detail reads. */
export type AnalyticsInclusionFields = {
  analyticsIncluded?: boolean;
  analyticsExclusionReason?: string | null;
  analyticsExcludedAt?: string | null;
  analyticsExcludedBy?: string | null;
};

export type AnalyticsInclusion = {
  included: boolean;
  reason: string | null;
  excludedAt: string | null;
};

/** PATCH body for the analytics-inclusion endpoint. */
export type AnalyticsInclusionChange =
  | { analyticsIncluded: false; reason?: string }
  | { analyticsIncluded: true };

export type AnalyticsInclusionFilter = "all" | "included" | "excluded";

/** Organisation analytics disclosure of raw sessions in the range. */
export type AnalyticsSessionSummary = {
  recorded: number;
  included: number;
  excluded: number;
};

/** Legacy records without the flag are included. */
export const isAnalyticsIncluded = (record: AnalyticsInclusionFields) =>
  record.analyticsIncluded !== false;

export const toAnalyticsInclusion = (
  record: AnalyticsInclusionFields
): AnalyticsInclusion => {
  const included = isAnalyticsIncluded(record);
  return {
    included,
    reason: included ? null : record.analyticsExclusionReason || null,
    excludedAt: included ? null : record.analyticsExcludedAt || null,
  };
};

export const matchesInclusionFilter = (
  record: AnalyticsInclusionFields,
  filter: AnalyticsInclusionFilter
) => filter === "all" || (filter === "included") === isAnalyticsIncluded(record);

/** A blank reason is omitted rather than sent empty. */
export const exclusionChange = (reason: string): AnalyticsInclusionChange => {
  const trimmed = reason.trim();
  return trimmed
    ? { analyticsIncluded: false, reason: trimmed }
    : { analyticsIncluded: false };
};

export const RESTORE_CHANGE: AnalyticsInclusionChange = {
  analyticsIncluded: true,
};
