import { useMemo, useRef } from "react";
import { QueryKey } from "@tanstack/react-query";
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
  WelfareFollowUpListData,
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

/**
 * Writes a saved record into every cached follow-up list of one organisation,
 * so the card shows the new revision the moment the save succeeds rather than
 * after the refetch lands. Without it, Close straight after an edit sent the
 * old revision and got a 409. Only a newer revision replaces the cached one,
 * so a refetch that already landed is never rolled back.
 */
const syncFollowUpRecord = (rootKey: QueryKey, record?: WelfareFollowUp) => {
  if (!record?.id || typeof record.revision !== "number") return;
  queryClient.setQueriesData<{ data?: WelfareFollowUpListData }>(
    rootKey,
    (cached) => {
      const list = cached?.data?.followUps;
      if (!cached?.data || !list) return cached;
      const index = list.findIndex(
        (item) => item.id === record.id && item.revision < record.revision,
      );
      if (index === -1) return cached;
      const followUps = [...list];
      followUps[index] = record;
      return { ...cached, data: { ...cached.data, followUps } };
    },
  );
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
    isSuccess,
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

  // Records with a write in flight. A second write would carry the same
  // (soon stale) revision and fail with a 409, so it is dropped; the buttons
  // are disabled while saving, this also covers a double tap before re-render.
  const inFlight = useRef(new Set<string>());

  /**
   * Runs one revision-guarded write. `mutateAsync` always settles, unlike the
   * per-call callbacks of `mutate`, which React Query drops when another
   * mutation starts first, so the cache sync and refetch can never be lost.
   */
  const guardedWrite = (
    id: string,
    write: () => Promise<{ data?: WelfareFollowUp } | undefined>,
    { onSuccess, onError }: WelfareFollowUpMutationCallbacks,
    syncRecord: boolean,
  ) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    // Captured now: a reply that lands after an organisation switch still
    // updates the organisation it was sent for, never the new one.
    const writeRootKey = rootKey;
    write()
      .then((res) => {
        if (syncRecord) syncFollowUpRecord(writeRootKey, res?.data);
        onSuccess?.(syncRecord ? res?.data : undefined);
      })
      .catch((error: unknown) => onError?.(error))
      .finally(() => {
        inFlight.current.delete(id);
        // Refetch after failures too: a 409/404 means another officer
        // changed or archived the record, so the list on screen is stale.
        queryClient.invalidateQueries({ queryKey: writeRootKey });
      });
  };

  const update = (
    id: string,
    payload: WelfareFollowUpUpdatePayload,
    callbacks: WelfareFollowUpMutationCallbacks = {},
  ) =>
    guardedWrite(
      id,
      () => updateMutation.mutateAsync({ url: oneUrl(id), data: payload }),
      callbacks,
      true,
    );

  const archive = (
    id: string,
    expectedRevision: number,
    callbacks: WelfareFollowUpMutationCallbacks = {},
  ) =>
    guardedWrite(
      id,
      () =>
        archiveMutation.mutateAsync({
          url: oneUrl(id),
          data: { expectedRevision },
        }),
      callbacks,
      false,
    );

  return {
    asOf,
    summary,
    followUps,
    isLoading,
    isFetching,
    isSuccess,
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
