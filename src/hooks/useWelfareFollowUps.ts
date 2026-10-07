import { useMemo } from "react";
import {
  deleteRequest,
  patchRequest,
  postRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { welfareRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { localBusinessDate } from "helpers/birthday";
import {
  WelfareFollowUp,
  WelfareFollowUpCreatePayload,
  WelfareFollowUpSummary,
  WelfareFollowUpUpdatePayload,
  WelfareFollowUpWorkflowStatus,
} from "components/welfare/followUps/types";

const NO_FOLLOW_UPS: WelfareFollowUp[] = [];

/**
 * A 409/404 from a follow-up write means the record the officer is looking at
 * is stale (someone else edited or archived it). Callers close the editor and
 * let the invalidated list refetch.
 */
export const isStaleFollowUpError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  return status === 409 || status === 404;
};

export interface UseWelfareFollowUpsOptions {
  /** Business date the list and summary are computed against. */
  asOf?: string;
  workflowStatus?: WelfareFollowUpWorkflowStatus;
  memberId?: string;
  assignedToUserId?: string;
  /** Callers disable this without welfare.view so no request is ever made. */
  enabled?: boolean;
}

export interface WelfareFollowUpMutationCallbacks {
  onSuccess?: (record?: WelfareFollowUp) => void;
  onError?: (error: unknown) => void;
}

/**
 * Phase 7C private follow-up log for the selected organisation.
 *
 * Reading requires `welfare.view` and writing `welfare.manage`; the caller
 * gates `enabled` so an attendance-only viewer never triggers a request. Every
 * mutation invalidates only this organisation's follow-up cache — never the
 * Welfare overview, attendance analytics, members or birthdays, because
 * follow-up records are independent context.
 */
export const useWelfareFollowUps = (
  organisationId: string,
  options: UseWelfareFollowUpsOptions = {},
) => {
  const asOf = options.asOf ?? localBusinessDate();
  const { workflowStatus, memberId, assignedToUserId } = options;
  const enabled = options.enabled ?? true;

  const listKey = queryKeys.welfare.followUps.list(
    organisationId,
    asOf,
    workflowStatus,
    memberId,
    assignedToUserId,
  );
  const rootKey = queryKeys.welfare.followUps.root(organisationId);
  const baseUrl = convertParamsToString(welfareRequest.FOLLOW_UPS, {
    organisationId,
  });
  const oneUrl = (id: string) =>
    convertParamsToString(welfareRequest.FOLLOW_UP_ONE, {
      organisationId,
      id,
    });

  const url = useMemo(() => {
    if (!organisationId) return "";
    const params = new URLSearchParams({ asOf });
    if (workflowStatus) params.set("workflowStatus", workflowStatus);
    if (memberId) params.set("memberId", memberId);
    if (assignedToUserId) params.set("assignedToUserId", assignedToUserId);
    return `${baseUrl}?${params.toString()}`;
  }, [
    organisationId,
    baseUrl,
    asOf,
    workflowStatus,
    memberId,
    assignedToUserId,
  ]);

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
  } = useQueryWrapper(listKey, url, {
    enabled: enabled && Boolean(organisationId),
  });

  const followUps: WelfareFollowUp[] =
    response?.data?.followUps ?? NO_FOLLOW_UPS;
  const summary: WelfareFollowUpSummary | undefined = response?.data?.summary;

  const createMutation = useMutationWrapper(postRequest);
  const updateMutation = useMutationWrapper(patchRequest);
  const archiveMutation = useMutationWrapper(deleteRequest);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: rootKey });

  const create = (
    payload: WelfareFollowUpCreatePayload,
    { onSuccess, onError }: WelfareFollowUpMutationCallbacks = {},
  ) =>
    createMutation.mutate(
      { url: baseUrl, data: payload },
      {
        onSuccess: (res: { data?: WelfareFollowUp }) => {
          invalidate();
          onSuccess?.(res?.data);
        },
        onError: (error: unknown) => onError?.(error),
      },
    );

  const update = (
    id: string,
    payload: WelfareFollowUpUpdatePayload,
    { onSuccess, onError }: WelfareFollowUpMutationCallbacks = {},
  ) =>
    updateMutation.mutate(
      { url: oneUrl(id), data: payload },
      {
        // Refetch after failures too: a 409/404 means another officer changed
        // or archived the record, so the list on screen is stale.
        onSettled: invalidate,
        onSuccess: (res: { data?: WelfareFollowUp }) => onSuccess?.(res?.data),
        onError: (error: unknown) => onError?.(error),
      },
    );

  const archive = (
    id: string,
    expectedRevision: number,
    { onSuccess, onError }: WelfareFollowUpMutationCallbacks = {},
  ) =>
    archiveMutation.mutate(
      { url: oneUrl(id), data: { expectedRevision } },
      {
        onSettled: invalidate,
        onSuccess: () => onSuccess?.(),
        onError: (error: unknown) => onError?.(error),
      },
    );

  return {
    asOf,
    summary,
    followUps,
    isLoading,
    isFetching,
    isError,
    create,
    update,
    archive,
    isSaving:
      createMutation.isLoading ||
      updateMutation.isLoading ||
      archiveMutation.isLoading,
  };
};
