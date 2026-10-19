import { useCallback, useRef, useState } from "react";
import { postRequest, queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  PostingDraft,
  PostingJournal,
  PostingSummary,
} from "components/finance/ledgerPostingTypes";
import {
  LedgerPostingIntentRecord,
  hasPendingLedgerPosting,
  newPostingKey,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
import {
  buildPostingBody,
  classifyPostingFailure,
  postingEndpoint,
  toPostingResponse,
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

export type PostingSubmitResult =
  | {
      kind: "confirmed";
      journal: PostingJournal | null;
      replayed: boolean | null;
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
 * officer }` before sending, sends that same object on every retry, accepts
 * 201 and 200-replayed as proof, and otherwise applies RFC §7.5. A posting in
 * flight blocks every other posting from this screen.
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
        const response = await postRequest({ url, data: record.body });
        const parsed = toPostingResponse(response);
        const cleared = intent.clear(record);
        invalidateLedger(record.organisationId);
        return {
          kind: "confirmed",
          journal: parsed.journal,
          replayed: parsed.replayed,
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
        // Read storage again rather than trusting rendered state: another tab
        // may have persisted an intent since this screen mounted.
        const current = readLedgerPostingIntents(organisationId);
        if (hasPendingLedgerPosting(current)) {
          intent.refresh();
          return {
            kind: "blocked",
            message:
              current.kind === "storage-unavailable"
                ? POSTING_STORAGE_UNAVAILABLE_MESSAGE
                : current.kind === "unknown"
                  ? POSTING_UNKNOWN_RECORD_MESSAGE
                  : POSTING_UNRESOLVED_BLOCKS_MESSAGE,
          };
        }

        const key = newPostingKey();
        const body = buildPostingBody(draft, key);
        const record = intent.begin({
          organisationId,
          officerId,
          key,
          operation: draft.operation,
          body,
          summary,
        });
        if (!record) {
          return {
            kind: "blocked",
            message: POSTING_STORAGE_UNAVAILABLE_MESSAGE,
          };
        }
        return await dispatch(record);
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
