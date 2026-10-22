import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { LEDGER_SETUP_UI_ENABLED } from "config/ledgerSetup";
import { hasPendingLedgerPosting } from "helpers/ledgerPostingIntent";
import { canCreateAccounts } from "helpers/ledgerSetup";
import {
  expenseOperationReadiness,
  postingReadiness,
  receiptOperationReadiness,
  transferOperationReadiness,
} from "helpers/ledgerPostings";
import { todayInLagos } from "helpers/openingBalances";
import { usePostingWorkflow } from "hooks/usePostingWorkflow";
import { usePermissions } from "rbac/usePermissions";

export type CashbookView = "receipt" | "expense" | "transfer";

/**
 * The F2B-1 cashbook posting workflow and its readiness, outside any screen.
 * Books holds it above its sheets, so closing a sheet (Back included) never
 * drops a save in flight or its outcome.
 */
export const useCashbookPostings = ({
  organisationId,
  status,
  accounts,
  onRecheckLedger,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** Refetches status, accounts and journals after the officer asks to recheck. */
  onRecheckLedger?: () => void;
}) => {
  const canManage = usePermissions().has("finance.manage");
  const workflow = usePostingWorkflow<CashbookView>({ organisationId, onRecheckLedger });
  const intentRead = workflow.postings.intent.read;

  return {
    workflow,
    canManage,
    intentRead,
    hasIntent: hasPendingLedgerPosting(intentRead),
    readiness: postingReadiness({ status, canManage, accounts }),
    receiptReadiness: receiptOperationReadiness(accounts),
    expenseReadiness: expenseOperationReadiness(accounts),
    transferReadiness: transferOperationReadiness(accounts),
    formProps: {
      accounts: accounts ?? [],
      organisationId,
      context: {
        today: todayInLagos(),
        openingDate: status.openingDate,
        lockedThrough: status.lockedThrough,
        lockedThroughState: status.lockedThroughState,
      },
      isPosting: workflow.postings.isPosting,
      error: workflow.formError,
      locked: workflow.superseded,
      // A manager may add a category from inside Money in/out, even when the
      // kind currently has none. Posting still waits for a valid category.
      canAddCategory: LEDGER_SETUP_UI_ENABLED && canCreateAccounts(status, canManage),
      onCancel: workflow.back,
      onSubmit: workflow.submit,
    },
  };
};

export type CashbookPostings = ReturnType<typeof useCashbookPostings>;
