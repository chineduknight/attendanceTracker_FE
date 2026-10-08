import { useMemo } from "react";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { orgRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { BirthdayMember, birthdayRangeForPreset } from "helpers/birthday";
import { buildBirthdayQueryString } from "hooks/useBirthdays";

const NO_MEMBERS: BirthdayMember[] = [];

/**
 * The existing Birthday API, scoped to the Welfare snapshot window: the
 * selected review date through review date + 7, inclusive (the shared `next7`
 * preset). The caller supplies `asOf` so the snapshot follows the pinned
 * Welfare review rather than the browser's today; the backend wraps years.
 *
 * Only enabled once the caller has confirmed `members.view`, the birthdays
 * module is visible and the member model configures a `dob` date field — the
 * endpoint is never called otherwise. Failures stay local to the snapshot and
 * never break the Welfare overview.
 */
export const useWelfareBirthdays = (
  organisationId: string,
  { enabled, asOf }: { enabled: boolean; asOf: string },
) => {
  const { fromDate, toDate } = useMemo(
    () => birthdayRangeForPreset("next7", asOf),
    [asOf],
  );

  const url = useMemo(() => {
    if (!organisationId) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY, {
      organisationId,
    });
    return `${base}?${buildBirthdayQueryString(fromDate, toDate, "")}`;
  }, [organisationId, fromDate, toDate]);

  // Keyed by organisation + range, so a new review date or organisation never
  // presents the previous snapshot as the current review's result.
  const { data: response, isFetching, isError, isSuccess } = useQueryWrapper(
    queryKeys.birthday.snapshot(organisationId, fromDate, toDate),
    url,
    { enabled: enabled && Boolean(organisationId) && Boolean(asOf) },
  );

  const members: BirthdayMember[] = response?.data?.members ?? NO_MEMBERS;
  return {
    members,
    fromDate,
    toDate,
    isFetching,
    isError,
    isSuccess,
  };
};
