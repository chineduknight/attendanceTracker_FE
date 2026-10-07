/**
 * Organisation welfare settings.
 *
 * Phase 7A stores one value: the review window (days), used by the backend to
 * compare the most recent period with the immediately preceding period of the
 * same length. Legacy organisations persisted before the field existed read
 * as the effective default (14) with no migration, and any stored value
 * outside the backend's accepted range falls back to the default too, so the
 * settings form can never be seeded with a value the backend would reject.
 */

export interface WelfareSettings {
  reviewWindowDays: number;
}

export const DEFAULT_WELFARE_REVIEW_WINDOW_DAYS = 14;
export const MIN_WELFARE_REVIEW_WINDOW_DAYS = 7;
export const MAX_WELFARE_REVIEW_WINDOW_DAYS = 90;

/** The part of an organisation this module reads; older caches may lack it. */
export interface WelfareSettingsSource {
  welfareSettings?: Partial<WelfareSettings> | null;
}

/** Complete welfare settings: the stored window when valid, otherwise 14. */
export const effectiveWelfareSettings = (
  org: WelfareSettingsSource | null | undefined,
): WelfareSettings => {
  const stored = org?.welfareSettings?.reviewWindowDays;
  const valid =
    typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= MIN_WELFARE_REVIEW_WINDOW_DAYS &&
    stored <= MAX_WELFARE_REVIEW_WINDOW_DAYS;
  return {
    reviewWindowDays: valid ? stored : DEFAULT_WELFARE_REVIEW_WINDOW_DAYS,
  };
};

/**
 * Validation message for the raw form input, or null when valid. A blank
 * input is valid and means the effective default.
 */
export const welfareReviewWindowError = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const days = Number(trimmed);
  if (!Number.isInteger(days)) return "Must be a whole number";
  if (
    days < MIN_WELFARE_REVIEW_WINDOW_DAYS ||
    days > MAX_WELFARE_REVIEW_WINDOW_DAYS
  ) {
    return `Must be between ${MIN_WELFARE_REVIEW_WINDOW_DAYS} and ${MAX_WELFARE_REVIEW_WINDOW_DAYS}`;
  }
  return null;
};

/** The number to send for a validated form input; blank means the default. */
export const parseWelfareReviewWindow = (value: string): number => {
  const trimmed = value.trim();
  return trimmed === ""
    ? DEFAULT_WELFARE_REVIEW_WINDOW_DAYS
    : Number(trimmed);
};
