import { useQuery } from "@tanstack/react-query";
import axiosInstance from "services/api";
import {
  postRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { financeRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toLedgerStatus } from "helpers/ledger";
import { toEffectiveOpenings, toOpeningProposal, toOpeningProposalPage } from "helpers/openingBalances";
import { LedgerStatus } from "components/finance/ledgerTypes";
import {
  EffectiveOpeningsView,
  OpeningProposal,
  SubmitOpeningInput,
  VerifyOpeningInput,
} from "components/finance/openingBalanceTypes";

/**
 * F2A-3 opening-balance reads and writes (provisional backend PR #40).
 *
 * Every key is organisation-scoped and every invalidation uses the ledger
 * prefix for that organisation only. Mutations never post, activate or derive
 * a figure client-side: the backend owns fingerprints, totals, deltas and
 * activation outcomes.
 *
 * `useMutationWrapper`'s hook-level error handler runs even when a per-call
 * handler exists, so a no-op is passed to keep the generic toast out of the
 * ledger-specific unknown-outcome warning.
 */

const suppressGenericError = () => undefined;

interface MutationCallbacks<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
}

export interface VerifyOpeningResult {
  proposal: OpeningProposal | null;
  status: LedgerStatus | null;
  /** null when the response did not say (never assumed either way). */
  journalPresent: boolean | null;
  replayed: boolean | null;
}

export interface DecideOpeningResult {
  proposal: OpeningProposal | null;
  status: LedgerStatus | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const PROPOSAL_PAGE_SIZE = 100;
const MAX_PROPOSAL_PAGES = 10;

interface ProposalCollection {
  /** null when any page was malformed. */
  items: OpeningProposal[] | null;
  /** false when the cap was reached with a cursor still outstanding. */
  complete: boolean;
}

/** Reads every proposal page (bounded) so "none open" is real evidence. */
const fetchAllOpeningProposals = async (
  baseUrl: string,
): Promise<ProposalCollection> => {
  const items: OpeningProposal[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PROPOSAL_PAGES; page += 1) {
    const query = `?limit=${PROPOSAL_PAGE_SIZE}${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;
    const response = await axiosInstance.get(`${baseUrl}${query}`);
    const parsed = toOpeningProposalPage(response?.data?.data);
    if (!parsed) return { items: null, complete: false };
    items.push(...parsed.items);
    if (!parsed.nextCursor) return { items, complete: true };
    cursor = parsed.nextCursor;
  }
  return { items, complete: false };
};

export const useOpeningProposals = (organisationId: string, enabled: boolean) => {
  const baseUrl = convertParamsToString(financeRequest.LEDGER_OPENING_BALANCES, {
    organisationId,
  });
  // The list is read to completion before it can prove that nothing is open.
  // A single 50-row page is not evidence: the open proposal could be older.
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    queryKeys.finance.ledger.openingBalanceList(organisationId),
    () => fetchAllOpeningProposals(baseUrl),
    { enabled: Boolean(organisationId) && enabled },
  );
  return {
    /** null means the list is unknown/malformed, never "no proposals". */
    proposals: data?.items ?? null,
    /** true only when every page was read and the last page had no cursor. */
    complete: data ? data.complete : null,
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

export const useEffectiveOpenings = (organisationId: string, enabled: boolean) => {
  const url = convertParamsToString(financeRequest.LEDGER_OPENING_BALANCES_EFFECTIVE, {
    organisationId,
  });
  const { data, isLoading, isError, error, refetch, isFetching } = useQueryWrapper(
    queryKeys.finance.ledger.effectiveOpenings(organisationId),
    url,
    { enabled: Boolean(organisationId) && enabled },
  );
  const effective: EffectiveOpeningsView | null = toEffectiveOpenings(data?.data);
  return {
    effective,
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

export const useOpeningBalanceWrites = (organisationId: string) => {
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.finance.ledger.root(organisationId),
    });

  const submitMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);
  const verifyMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);
  const rejectMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);
  const withdrawMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);

  const baseUrl = convertParamsToString(financeRequest.LEDGER_OPENING_BALANCES, {
    organisationId,
  });
  const proposalUrl = (template: string, proposalId: string) =>
    convertParamsToString(template, { organisationId, proposalId });

  const submitOpening = (
    input: SubmitOpeningInput,
    { onSuccess, onError }: MutationCallbacks<DecideOpeningResult> = {},
  ) =>
    submitMutation.mutate(
      { url: baseUrl, data: input },
      {
        onSettled: invalidate,
        onSuccess: (response: { data?: unknown }) => {
          const body = asRecord(response?.data);
          onSuccess?.({
            proposal: toOpeningProposal(body?.proposal),
            status: toLedgerStatus(body?.status),
          });
        },
        onError: onError ?? suppressGenericError,
      },
    );

  const verifyOpening = (
    proposalId: string,
    input: VerifyOpeningInput,
    { onSuccess, onError }: MutationCallbacks<VerifyOpeningResult> = {},
  ) =>
    verifyMutation.mutate(
      {
        url: proposalUrl(financeRequest.LEDGER_OPENING_BALANCE_VERIFY, proposalId),
        data: input,
      },
      {
        onSettled: invalidate,
        onSuccess: (response: { data?: unknown }) => {
          const body = asRecord(response?.data);
          onSuccess?.({
            proposal: toOpeningProposal(body?.proposal),
            status: toLedgerStatus(body?.status),
            journalPresent:
              body && "journal" in body ? body.journal !== null : null,
            replayed:
              typeof body?.replayed === "boolean" ? body.replayed : null,
          });
        },
        onError: onError ?? suppressGenericError,
      },
    );

  const rejectOpening = (
    proposalId: string,
    reason: string,
    { onSuccess, onError }: MutationCallbacks<DecideOpeningResult> = {},
  ) =>
    rejectMutation.mutate(
      {
        url: proposalUrl(financeRequest.LEDGER_OPENING_BALANCE_REJECT, proposalId),
        data: { reason },
      },
      {
        onSettled: invalidate,
        onSuccess: (response: { data?: unknown }) => {
          const body = asRecord(response?.data);
          onSuccess?.({
            proposal: toOpeningProposal(body?.proposal),
            status: toLedgerStatus(body?.status),
          });
        },
        onError: onError ?? suppressGenericError,
      },
    );

  const withdrawOpening = (
    proposalId: string,
    { onSuccess, onError }: MutationCallbacks<DecideOpeningResult> = {},
  ) =>
    withdrawMutation.mutate(
      {
        url: proposalUrl(financeRequest.LEDGER_OPENING_BALANCE_WITHDRAW, proposalId),
        data: {},
      },
      {
        onSettled: invalidate,
        onSuccess: (response: { data?: unknown }) => {
          const body = asRecord(response?.data);
          onSuccess?.({
            proposal: toOpeningProposal(body?.proposal),
            status: toLedgerStatus(body?.status),
          });
        },
        onError: onError ?? suppressGenericError,
      },
    );

  return {
    submitOpening,
    verifyOpening,
    rejectOpening,
    withdrawOpening,
    isSubmitting: Boolean(submitMutation.isLoading),
    isVerifying: Boolean(verifyMutation.isLoading),
    isRejecting: Boolean(rejectMutation.isLoading),
    isWithdrawing: Boolean(withdrawMutation.isLoading),
  };
};
