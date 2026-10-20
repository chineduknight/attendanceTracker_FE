import { useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import axiosInstance from "services/api";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { financeRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  LedgerAttemptKey,
  RESOLVE_UNPROVEN_RESPONSE_MESSAGE,
  ResolveFailureKind,
  ResolveOutcome,
  classifyResolveFailure,
  toLedgerAttemptPage,
  toResolveOutcome,
} from "helpers/ledgerAttempts";
import { withLedgerKeyActivity } from "helpers/ledgerKeyActivity";
import { isPostingKey } from "helpers/ledgerPostingIntent";
import { useLedgerPostingIntent } from "hooks/useLedgerPostingIntent";
import useGlobalStore from "zStore";

const PAGE_SIZE = 50;

export const ATTEMPTS_UNREADABLE_MESSAGE =
  "The server's list of unconfirmed attempts couldn't be read, so none are shown as resolved or absent.";

/**
 * The unresolved posting attempts this officer may see (F2B-3,
 * `finance.manage`): their own, or everyone's for the owner. The server
 * decides who sees what; this only pages through what it returns.
 */
export const useUnresolvedLedgerAttempts = (organisationId: string, enabled: boolean) => {
  const baseUrl = convertParamsToString(financeRequest.LEDGER_ATTEMPTS, { organisationId });
  const query = useInfiniteQuery(
    queryKeys.finance.ledger.unresolvedAttempts(organisationId),
    async ({ pageParam }: { pageParam?: string }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      const response = await axiosInstance.get(
        `${baseUrl}?status=unresolved&limit=${PAGE_SIZE}${cursor}`,
      );
      const page = toLedgerAttemptPage(response?.data?.data);
      if (!page) throw new Error(ATTEMPTS_UNREADABLE_MESSAGE);
      return page;
    },
    {
      enabled: Boolean(organisationId) && enabled,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );
  const items: LedgerAttemptKey[] | null = query.data
    ? query.data.pages.flatMap((page) => page.items)
    : null;
  return {
    /** null until the first page is read; never "nothing unresolved" before that. */
    items,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
};

export type ResolveResult =
  | {
      kind: "resolved";
      outcome: ResolveOutcome;
      /** Whether this browser's own pending record for the key (if any) is gone. */
      cleared: boolean;
    }
  | {
      kind: "not-resolved";
      reason: ResolveFailureKind | "unproven" | "busy" | "uncoordinated" | "invalid-key";
      message: string;
    };

export const RESOLVE_KEY_BEING_SENT_MESSAGE =
  "This request is being sent from this browser right now. Wait for its result; resolve it only if it is still unconfirmed afterwards.";

export const RESOLVE_UNCOORDINATED_MESSAGE =
  "This browser couldn't coordinate resolving this request with its other open tabs, so nothing was sent. Close other tabs or use a current browser, then try again.";

export const RESOLVE_INVALID_KEY_MESSAGE =
  "That isn't a request key this app can resolve. Keys are 8–128 letters, digits, '_', '.', ':' or '-', start with a letter or digit, and never start with \"opening:\". Nothing was sent.";

/**
 * `POST /ledger/attempts/resolve { idempotencyKey }` (RFC §7.4). Only a
 * proved outcome (committed or voided) clears this browser's pending record,
 * and only the record for that organisation and key. A retry always sends the
 * same key; the server answers a resolved key with the same result.
 */
export const useResolveLedgerAttempt = (organisationId: string) => {
  const intent = useLedgerPostingIntent(organisationId);
  const { clearKey } = intent;
  const officerId = useGlobalStore((store) => store.user.id);

  const resolve = useCallback(
    async (key: string): Promise<ResolveResult> => {
      // Client keys only, never generated or guessed here; the server's own
      // `opening:` keys are refused before anything is sent.
      if (!isPostingKey(key)) {
        return { kind: "not-resolved", reason: "invalid-key", message: RESOLVE_INVALID_KEY_MESSAGE };
      }
      // Captured: the officer may switch organisation while this runs, and
      // the result must only ever touch the organisation it was sent for.
      const target = organisationId;
      const url = convertParamsToString(financeRequest.LEDGER_ATTEMPTS_RESOLVE, {
        organisationId: target,
      });
      const activity = await withLedgerKeyActivity(target, key, "resolving", async () => {
        try {
          const response = await axiosInstance.post(url, { idempotencyKey: key });
          const outcome = toResolveOutcome(response.status, response.data, officerId);
          if (!outcome) {
            return {
              kind: "not-resolved",
              reason: "unproven",
              message: RESOLVE_UNPROVEN_RESPONSE_MESSAGE,
            } as const;
          }
          const cleared = await clearKey(target, key);
          return { kind: "resolved", outcome, cleared } as const;
        } catch (error) {
          const failure = classifyResolveFailure(error);
          return { kind: "not-resolved", reason: failure.kind, message: failure.message } as const;
        }
      });
      // Whatever happened, this organisation's reads may now be stale: a
      // proved key leaves the list and may add a journal; a refusal may mean
      // the list itself is out of date.
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root(target) });
      switch (activity.kind) {
        case "ran":
          return activity.value;
        case "busy":
          return { kind: "not-resolved", reason: "busy", message: RESOLVE_KEY_BEING_SENT_MESSAGE };
        case "uncoordinated":
          return { kind: "not-resolved", reason: "uncoordinated", message: RESOLVE_UNCOORDINATED_MESSAGE };
      }
    },
    [clearKey, officerId, organisationId],
  );

  return { resolve, intent };
};
