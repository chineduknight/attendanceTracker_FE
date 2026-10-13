import { useMemo } from "react";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { welfareRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { isBusinessDate } from "helpers/welfareReview";
import { WelfareOverview } from "components/welfare/welfareTypes";

export interface UseWelfareOverviewOptions {
  /** Review date (`YYYY-MM-DD`); the backend derives both periods from it. */
  asOf: string;
  /** Configured member-status value, or undefined for every status. */
  status?: string;
  /** False while the status scope is still resolving, to avoid a wasted fetch. */
  enabled?: boolean;
}

/**
 * The Phase 7A Welfare overview for the selected organisation.
 *
 * Read-only: the backend classifies every signal and this hook only fetches,
 * tenant-scopes and returns the payload. Organisation, `asOf` and status scope
 * are all in the query key, so a different review can never surface another
 * review's snapshot. An invalid `asOf` is never sent.
 */
export const useWelfareOverview = (
  organisationId: string,
  { asOf, status, enabled = true }: UseWelfareOverviewOptions,
) => {
  const validAsOf = isBusinessDate(asOf);

  const url = useMemo(() => {
    if (!organisationId || !validAsOf) return "";
    const path = convertParamsToString(welfareRequest.OVERVIEW, {
      organisationId,
    });
    const params = new URLSearchParams({ asOf });
    if (status) params.set("statuses", status);
    return `${path}?${params.toString()}`;
  }, [organisationId, asOf, validAsOf, status]);

  const { data: response, isLoading, isFetching, isError, error, refetch } = useQueryWrapper(
    queryKeys.welfare.overview(organisationId, asOf, status),
    url,
    { enabled: enabled && validAsOf && Boolean(organisationId) },
  );

  const overview: WelfareOverview | undefined = response?.data;
  return { overview, isLoading, isFetching, isError, error, refetch };
};
