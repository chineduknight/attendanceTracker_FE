import { useMemo } from "react";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { orgRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { BirthdayMember } from "helpers/birthday";

const NO_MEMBERS: BirthdayMember[] = [];

/**
 * Shared Birthday list query string. The new frontend always sends full
 * YYYY-MM-DD dates (MM-DD remains backend compatibility only), and an empty
 * status selection means All — no status param at all.
 */
export const buildBirthdayQueryString = (
  fromDate: string,
  toDate: string,
  statusesParam: string,
): string => {
  const params = new URLSearchParams({
    field: "dob",
    startDate: fromDate,
    endDate: toDate,
    displayedFields: "name,dob",
  });
  if (statusesParam) params.set("status", statusesParam);
  return params.toString();
};

interface UseBirthdaysArgs {
  fromDate: string;
  toDate: string;
  /** Selected statuses; empty means All. */
  statuses: readonly string[];
  enabled?: boolean;
}

/**
 * Tenant-scoped Birthday list fetch. The same hook backs both the proactive
 * 30-day summary snapshot and the active list, so identical range + status
 * selections dedupe into one cache entry automatically. Failures stay local
 * to the caller and are never turned into zero counts.
 */
export const useBirthdays = (
  organisationId: string,
  { fromDate, toDate, statuses, enabled = true }: UseBirthdaysArgs,
) => {
  const statusesParam = statuses.join(",");

  const url = useMemo(() => {
    if (!organisationId || !fromDate || !toDate) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY, {
      organisationId,
    });
    return `${base}?${buildBirthdayQueryString(
      fromDate,
      toDate,
      statusesParam,
    )}`;
  }, [organisationId, fromDate, toDate, statusesParam]);

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    isSuccess,
  } = useQueryWrapper(
    queryKeys.birthday.list(organisationId, fromDate, toDate, statusesParam),
    url,
    {
      enabled:
        enabled &&
        Boolean(organisationId) &&
        Boolean(fromDate) &&
        Boolean(toDate),
    },
  );

  const members: BirthdayMember[] = response?.data?.members ?? NO_MEMBERS;
  return { members, isLoading, isFetching, isError, isSuccess };
};
