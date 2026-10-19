import { useCallback, useRef, useState } from "react";
import axiosInstance from "services/api";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  PostingDraft,
  PostingJournal,
  PostingSummary,
} from "components/finance/ledgerPostingTypes";
import {
  LedgerPostingClaimBlockedReason,
  LedgerPostingIntentRecord,
  newPostingKey,
  readLedgerPostingIntentByKey,
  readLedgerPostingIntents,
  sameLedgerPostingBody,
} from "helpers/ledgerPostingIntent";
import {
  assessPostingConfirmation,
  buildPostingBody,
  classifyPostingFailure,
  postingEndpoint,
} from "helpers/ledgerPostings";
import { useLedgerPostingIntent } from "hooks/useLedgerPostingIntent";

export const POSTING_STORAGE_UNAVAILABLE_MESSAGE =
  "This browser can't store the safety record required before a financial posting. Allow site storage and try again. Nothing was sent.";

export const POSTING_STORAGE_CLEAR_FAILED_MESSAGE =
  "The posting was confirmed, but this browser couldn't clear its safety record. Do not enter it again; retrying this record only replays the same posting.";

export const POSTING_UNRESOLVED_BLOCKS_MESSAGE =
  "An earlier financial posting is still unconfirmed. Retry that exact request first; a new posting is blocked until it is proved.";

export const POSTING_UNKNOWN_RECORD_MESSAGE =
  "This browser has a posting safety record that this app version can't read. New postings are blocked. Contact support before entering money again.";

export const POSTING_COORDINATION_UNAVAILABLE_MESSAGE =
  "Posting couldn't be coordinated safely across open tabs, so nothing was sent. Close other tabs or use a current browser, then try again.";

export const POSTING_CLAIM_MISMATCH_MESSAGE =
  "The browser's posting safety record couldn't be verified before sending, so nothing was sent. Recheck the books, then try again.";

const claimBlockedMessage = (reason: LedgerPostingClaimBlockedReason): string => {
  switch (reason) {
    case "existing":
      return POSTING_UNRESOLVED_BLOCKS_MESSAGE;
    case "unknown":
      return POSTING_UNKNOWN_RECORD_MESSAGE;
    case "storage-unavailable":
      return POSTING_STORAGE_UNAVAILABLE_MESSAGE;
    case "coordination-unavailable":
      return POSTING_COORDINATION_UNAVAILABLE_MESSAGE;
    case "write-failed":
      return POSTING_CLAIM_MISMATCH_MESSAGE;
    case "invalid":
      return "This posting couldn't be recorded safely, so nothing was sent.";
  }
};

export type PostingSubmitResult =
  | {
      kind: "confirmed";
      journal: PostingJournal;
      replayed: boolean;
      cleared: boolean;
    }
  | { kind: "refused" | "voided" | "key-reused" | "blocked" | "busy"; message: string }
  | { kind: "unconfirmed"; ambiguous: boolean; message: string };

const invalidateLedger = (organisationId: string) =>
  queryClient.invalidateQueries({
    queryKey: queryKeys.finance.ledger.root(organisationId),
  });

/**
 * F2B-1 posting writes. Each dispatch persists `{ key, exact body, org,
 * officer }` before sending, sends that same object on every retry, and
 * accepts only a contract-consistent 201 or 200-replayed response as proof.
 * Everything else applies RFC §7.5. A posting in flight blocks every other
 * posting from this screen.
 */
export const useLedgerPostings = (organisationId: string, officerId: string) => {
  const intent = useLedgerPostingIntent(organisationId);
  const [isPosting, setIsPosting] = useState(false);
  const inFlight = useRef(false);

  const dispatch = useCallback(
    async (record: LedgerPostingIntentRecord): Promise<PostingSubmitResult> => {
      const url = convertParamsToString(postingEndpoint(record.operation), {
        organisationId: record.organisationId,
      });
      try {
        // Use the Axios instance directly: only this path needs the HTTP
        // status, so the shared `postRequest` helper (and every consumer of
        // it) stays unchanged.
        const response = await axiosInstance.post(url, record.body);
        const assessment = assessPostingConfirmation({
          httpStatus: response.status,
          body: response.data,
          operation: record.operation,
          businessDate: record.body.businessDate,
          amountKobo: record.body.amountKobo,
        });
        if (!assessment.confirmed) {
          // A 2xx alone is not proof. Keep the exact body/key pending and
          // never show "Posted" without a readable journal and replay fact.
          intent.markUnresolved(record, {
            ambiguous: true,
            retryMode: "retry",
            message: assessment.message,
          });
          return {
            kind: "unconfirmed",
            ambiguous: true,
            message: assessment.message,
          };
        }
        const cleared = intent.clear(record);
        invalidateLedger(record.organisationId);
        return {
          kind: "confirmed",
          journal: assessment.journal,
          replayed: assessment.replayed,
          cleared,
        };
      } catch (error) {
        const disposition = classifyPostingFailure(
          error,
          record.hadAmbiguousAttempt,
        );
        switch (disposition.kind) {
          case "voided":
            intent.clear(record);
            return { kind: "voided", message: disposition.message };
          case "clean-refusal":
            intent.clear(record);
            return { kind: "refused", message: disposition.message };
          case "key-reused":
            intent.markUnresolved(record, {
              ambiguous: false,
              retryMode: "owner",
              message: disposition.message,
            });
            return { kind: "key-reused", message: disposition.message };
          case "keep-pending":
            intent.markUnresolved(record, {
              ambiguous: disposition.ambiguous,
              retryMode: disposition.ownerResolution ? "owner" : "retry",
              message: disposition.message,
            });
            return {
              kind: "unconfirmed",
              ambiguous: disposition.ambiguous || record.hadAmbiguousAttempt,
              message: disposition.message,
            };
        }
      }
    },
    [intent],
  );

  const beginPosting = useCallback(() => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setIsPosting(true);
    return true;
  }, []);

  const endPosting = useCallback(() => {
    inFlight.current = false;
    setIsPosting(false);
  }, []);

  const submit = useCallback(
    async (draft: PostingDraft, summary: PostingSummary): Promise<PostingSubmitResult> => {
      if (!beginPosting()) {
        return { kind: "busy", message: "A posting is already being sent." };
      }
      try {
        if (!organisationId || !officerId) {
          return {
            kind: "blocked",
            message:
              "This session can't identify the organisation or officer for a financial posting. Sign in again.",
          };
        }
        const key = newPostingKey();
        const body = buildPostingBody(draft, key);
        // The claim's read, write and read-back happen under one cross-tab
        // lock. A second tab therefore sees this record instead of admitting
        // a different key.
        const claim = await intent.begin({
          organisationId,
          officerId,
          key,
          operation: draft.operation,
          body,
          summary,
        });
        if (claim.kind === "blocked") {
          intent.refresh();
          return { kind: "blocked", message: claimBlockedMessage(claim.reason) };
        }

        // Recheck the durable record before dispatch: the body that will be
        // sent on any retry must be exactly the one just verified.
        const stored = readLedgerPostingIntentByKey(
          organisationId,
          claim.record.key,
        );
        if (
          !stored ||
          !sameLedgerPostingBody(stored.body, claim.record.body)
        ) {
          intent.refresh();
          return { kind: "blocked", message: POSTING_CLAIM_MISMATCH_MESSAGE };
        }
        // Dispatch the freshly claimed record, not the just-read copy: the
        // read treats any stored `dispatching` record as ambiguous (for
        // crash recovery), but this request has not been sent yet. The
        // read-back above proved the persisted body is identical.
        return await dispatch(claim.record);
      } finally {
        endPosting();
      }
    },
    [beginPosting, dispatch, endPosting, intent, officerId, organisationId],
  );

  const retry = useCallback(
    async (record: LedgerPostingIntentRecord): Promise<PostingSubmitResult> => {
      if (!beginPosting()) {
        return { kind: "busy", message: "A posting is already being sent." };
      }
      try {
        // The retry must send the persisted body and key, not a re-rendered
        // copy. If the record is no longer readable, nothing is sent.
        const current = readLedgerPostingIntents(record.organisationId);
        if (current.kind === "storage-unavailable") {
          return { kind: "blocked", message: POSTING_STORAGE_UNAVAILABLE_MESSAGE };
        }
        if (current.kind === "unknown") {
          return { kind: "blocked", message: POSTING_UNKNOWN_RECORD_MESSAGE };
        }
        const stored =
          current.kind === "pending"
            ? current.intents.find((entry) => entry.key === record.key)
            : undefined;
        if (!stored) {
          intent.refresh();
          return {
            kind: "blocked",
            message:
              "This posting is no longer in this browser's safety record. Recheck the books and the journal entries before entering it again.",
          };
        }
        return await dispatch(stored);
      } finally {
        endPosting();
      }
    },
    [beginPosting, dispatch, endPosting, intent],
  );

  return { submit, retry, isPosting, intent };
};
