import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { localBusinessDate } from "helpers/birthday";
import { isBusinessDate } from "helpers/welfareReview";

/**
 * The Welfare review date, pinned in the URL (`?asOf=YYYY-MM-DD`) so a refresh
 * or shared link reviews the same horizon. A missing, invalid or future value
 * resolves to the officer's local business today — never a server-side date —
 * and the resolved value is written back to the URL. A review can only look
 * back: a future date has no attendance to compare. The backend still owns
 * the recent/previous periods derived from it.
 */
export const useWelfareReviewDate = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("asOf");
  const today = localBusinessDate();
  // YYYY-MM-DD compares correctly as a string.
  const isReviewable = (value: string | null): value is string =>
    isBusinessDate(value) && value <= today;
  const asOf = isReviewable(raw) ? raw : today;

  const writeAsOf = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("asOf", value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (raw !== asOf) writeAsOf(asOf);
  }, [raw, asOf, writeAsOf]);

  /** Ignores anything that is not an exact, real, non-future date. */
  const setAsOf = useCallback(
    (value: string) => {
      if (isBusinessDate(value) && value <= today && value !== asOf) {
        writeAsOf(value);
      }
    },
    [asOf, today, writeAsOf],
  );

  const resetToToday = useCallback(
    () => setAsOf(localBusinessDate()),
    [setAsOf],
  );

  return { asOf, today, isToday: asOf === today, setAsOf, resetToToday };
};
