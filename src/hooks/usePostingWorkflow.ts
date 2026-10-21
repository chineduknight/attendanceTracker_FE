import { useState } from "react";
import { PostingDraft, PostingSummary } from "components/finance/ledgerPostingTypes";
import { LedgerPostingIntentRecord } from "helpers/ledgerPostingIntent";
import { PostingSubmitResult, useLedgerPostings } from "hooks/useLedgerPostings";
import useGlobalStore from "zStore";

export interface ConfirmedPosting {
  result: Extract<PostingSubmitResult, { kind: "confirmed" }>;
  summary: PostingSummary;
}

/**
 * The screen state around F2B postings, shared by "Record money" (F2B-1) and
 * "Member money" (F2B-2) so both follow the same proof and recovery rules:
 *
 * - "Posted" only from a contract-consistent confirmation;
 * - an unconfirmed outcome hands over to the durable intent notice, whose
 *   only action is the exact retry;
 * - a form open while another tab or section changes the organisation's
 *   posting record is locked (entries kept) until the officer deliberately
 *   starts a new posting (F2B-1 finding F1).
 */
export const usePostingWorkflow = <View extends string>({
  organisationId,
  onRecheckLedger,
  onPanelReadsStale,
}: {
  organisationId: string;
  /** Refetches status, accounts and journals (reads only). */
  onRecheckLedger?: () => void;
  /**
   * Refetches the panel's own reads (e.g. member money held). Called whenever
   * they may be stale: a posting record changed elsewhere (form open or not),
   * a deliberate recheck, or the server refusing a posting.
   */
  onPanelReadsStale?: () => void;
}) => {
  const officerId = useGlobalStore((store) => store.user.id);
  const [view, setView] = useState<View | "overview">("overview");
  const [formError, setFormError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ConfirmedPosting | null>(null);
  // Another tab changed the posting record while a form was open. The form
  // keeps its entries but is locked until the officer deliberately starts a
  // new posting: re-enabling it would invite the same money twice.
  const [superseded, setSuperseded] = useState(false);
  // Bumped to remount the open form empty for a deliberate new posting.
  const [formInstance, setFormInstance] = useState(0);

  const supersedeForm = () => {
    setSuperseded(true);
    setFormError(null);
    // Reads only: this tab's journal list predates the other tab's write.
    onRecheckLedger?.();
  };

  const postings = useLedgerPostings(organisationId, officerId, {
    onExternalIntentChange: () => {
      if (view !== "overview") supersedeForm();
      // Even with no form open, what another tab or section just posted can
      // change what this panel shows (e.g. what a source still holds).
      onPanelReadsStale?.();
    },
  });

  const recheck = () => {
    postings.intent.refresh();
    onRecheckLedger?.();
    onPanelReadsStale?.();
  };

  const open = (next: View) => {
    setFormError(null);
    setSuccess(null);
    setPanelError(null);
    setSuperseded(false);
    setView(next);
  };

  const back = () => {
    setFormError(null);
    setSuperseded(false);
    setView("overview");
  };

  const startNewPosting = () => {
    setFormError(null);
    setSuperseded(false);
    setFormInstance((instance) => instance + 1);
  };

  const dismissSuccess = () => {
    setSuccess(null);
    setPanelError(null);
  };

  const submit = async (draft: PostingDraft, summary: PostingSummary) => {
    setFormError(null);
    const result = await postings.submit(draft, summary);
    switch (result.kind) {
      case "confirmed":
        setView("overview");
        setSuccess({ result, summary });
        return;
      case "blocked":
        // Another posting holds the record. Whatever happens to it, this
        // form must not quietly become submittable again when it clears.
        if (result.reason === "existing") {
          supersedeForm();
          return;
        }
        setFormError(result.message);
        return;
      case "refused":
      case "voided":
        // A refusal can mean this screen's figures were stale (e.g.
        // LEDGER_REFUND_EXCEEDS_REMAINING); show the server's current ones.
        setFormError(result.message);
        onPanelReadsStale?.();
        return;
      case "busy":
        setFormError(result.message);
        return;
      case "unconfirmed":
      case "key-reused":
        // The durable notice now owns the explanation. The form must not be
        // used for a new key; only the recorded retry is offered.
        setView("overview");
        setSuccess(null);
        return;
    }
  };

  const retry = async (record: LedgerPostingIntentRecord) => {
    setPanelError(null);
    const result = await postings.retry(record);
    switch (result.kind) {
      case "confirmed":
        setSuccess({ result, summary: record.summary });
        setView("overview");
        return;
      case "refused":
      case "voided":
        setPanelError(result.message);
        onPanelReadsStale?.();
        return;
      case "blocked":
      case "busy":
        setPanelError(result.message);
        return;
      case "unconfirmed":
      case "key-reused":
        // The notice already states the outcome and offers the only safe
        // next action: retry this exact request again.
        return;
    }
  };

  return {
    postings,
    view,
    open,
    back,
    startNewPosting,
    formError,
    panelError,
    success,
    dismissSuccess,
    superseded,
    formInstance,
    recheck,
    submit: (draft: PostingDraft, summary: PostingSummary) => {
      void submit(draft, summary);
    },
    retry: (record: LedgerPostingIntentRecord) => {
      void retry(record);
    },
  };
};
