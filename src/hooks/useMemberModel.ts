import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axiosInstance from "services/api";
import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { MemberModelField } from "helpers/attendanceEligibility";

const NO_FIELDS: MemberModelField[] = [];

const memberModelUrl = (organisationId: string) =>
  convertParamsToString(orgRequest.CONFIG_MODEL, { organisationId });

/** The organisation's configured member fields, from the canonical model cache. */
export const useMemberModel = (
  organisationId: string,
  {
    refetchOnWindowFocus = true,
    enabled = true,
  }: { refetchOnWindowFocus?: boolean; enabled?: boolean } = {},
) => {
  const url = memberModelUrl(organisationId);
  const { data, isLoading, isSuccess, isError, isFetchedAfterMount, error, refetch } = useQueryWrapper(
    queryKeys.memberModel(organisationId),
    url,
    { enabled: enabled && Boolean(organisationId), refetchOnWindowFocus },
  );

  const fields: MemberModelField[] = data?.data?.fields ?? NO_FIELDS;
  return {
    fields,
    hasData: data !== undefined,
    isLoading,
    isSuccess,
    isError,
    isFetchedAfterMount,
    error,
    refetch,
  };
};

/**
 * Loads the selected organisation's member model into the shared cache in the
 * background, so the pages that read it (Welfare, members, attendance,
 * birthdays) open on cached fields instead of waiting for this request first.
 * Same key and response shape as useMemberModel. Pages that seed an editor
 * still wait for their own fresh fetch (isFetchedAfterMount).
 */
export const usePrefetchMemberModel = (organisationId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || !organisationId) return;
    void queryClient.prefetchQuery(queryKeys.memberModel(organisationId), async () => {
      const response = await axiosInstance.get(memberModelUrl(organisationId));
      return response.data;
    });
  }, [queryClient, organisationId, enabled]);
};
