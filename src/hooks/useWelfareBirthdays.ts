import { useMemo } from "react";
import { addDays } from "date-fns";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { orgRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { WelfareBirthdayMember } from "components/welfare/welfareTypes";
import { localBusinessDate } from "hooks/useWelfareOverview";

/** Phase 7A snapshot window: today through the next 7 days. */
export const WELFARE_BIRTHDAY_SNAPSHOT_DAYS = 7;

const NO_MEMBERS: WelfareBirthdayMember[] = [];

/**
 * The existing Birthday API, scoped to the Welfare snapshot window. The
 * backend wraps years, so the frontend only sends today and today + 7.
 *
 * Only enabled once the caller has confirmed `members.view`, the birthdays
 * module is visible and the member model configures a `dob` date field — the
 * endpoint is never called otherwise. Failures stay local to the snapshot and
 * never break the Welfare overview.
 */
export const useWelfareBirthdays = (
  organisationId: string,
  { enabled }: { enabled: boolean },
) => {
  const startDate = localBusinessDate();
  const endDate = localBusinessDate(
    addDays(new Date(), WELFARE_BIRTHDAY_SNAPSHOT_DAYS),
  );

  const url = useMemo(() => {
    if (!organisationId) return "";
    const path = convertParamsToString(orgRequest.BIRTHDAY, {
      organisationId,
    });
    const params = new URLSearchParams({
      field: "dob",
      startDate,
      endDate,
      displayedFields: "name,dob",
    });
    return `${path}?${params.toString()}`;
  }, [organisationId, startDate, endDate]);

  const { data: response, isFetching, isError, isSuccess } = useQueryWrapper(
    queryKeys.birthday.snapshot(organisationId, startDate, endDate),
    url,
    { enabled: enabled && Boolean(organisationId) },
  );

  const members: WelfareBirthdayMember[] =
    response?.data?.members ?? NO_MEMBERS;
  return { members, isFetching, isError, isSuccess };
};
