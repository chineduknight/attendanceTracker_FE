import { useMemo } from "react";
import { useQueryWrapper } from "services/api/apiHelper";
import { localBusinessDate } from "helpers/birthday";
import { queryKeys } from "services/api/queryKeys";
import { welfareRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { WelfareOverview } from "components/welfare/welfareTypes";

/**
 * The Phase 7A Welfare overview for the selected organisation.
 *
 * Read-only: the backend classifies every signal and this hook only fetches,
 * tenant-scopes and returns the payload. `asOf` is part of the query key, so
 * a new business day can never surface the previous day's snapshot.
 */
export const useWelfareOverview = (organisationId: string) => {
  const asOf = localBusinessDate();

  const url = useMemo(() => {
    if (!organisationId) return "";
    const path = convertParamsToString(welfareRequest.OVERVIEW, {
      organisationId,
    });
    return `${path}?asOf=${asOf}`;
  }, [organisationId, asOf]);

  const { data: response, isLoading, isFetching, isError } = useQueryWrapper(
    queryKeys.welfare.overview(organisationId, asOf),
    url,
    { enabled: Boolean(organisationId) },
  );

  const overview: WelfareOverview | undefined = response?.data;
  return { overview, isLoading, isFetching, isError };
};
