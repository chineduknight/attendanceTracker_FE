import { useId } from "react";
import { Box, Button, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { LEDGER_MEMBER_MONEY_UI_ENABLED } from "config/ledgerMemberMoney";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import { LEDGER_REVERSALS_UI_ENABLED } from "config/ledgerReversals";
import { LEDGER_F3_ALLOCATION_UI_ENABLED } from "config/ledgerF3Allocations";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { hasPendingLedgerPosting } from "helpers/ledgerPostingIntent";
import {
  expenseOperationReadiness,
  postingReadiness,
  receiptOperationReadiness,
  shownPostingSections,
  transferOperationReadiness,
} from "helpers/ledgerPostings";
import { todayInLagos } from "helpers/openingBalances";
import { usePostingWorkflow } from "hooks/usePostingWorkflow";
import { usePermissions } from "rbac/usePermissions";
import PostingIntentNotice from "components/finance/postings/PostingIntentNotice";
import PostingReceipt from "components/finance/postings/PostingReceipt";
import PostingSupersededNotice from "components/finance/postings/PostingSupersededNotice";
import {
  ExpenseForm,
  ReceiptForm,
  TransferForm,
} from "components/finance/postings/PostingForms";

type View = "overview" | "receipt" | "expense" | "transfer";

/**
 * F2B-1 cashbook posting UI (RFC v0.3 §5.1–§5.5, §8.2).
 *
 * The panel is gated three times: this release's feature switch, the
 * officer's `finance.manage` permission, and the server's real readiness
 * (`postingEnabled` with no blockers). It shows only active, verified
 * accounts and categories, never derives a balance, and never presents a
 * cashbook receipt as a member's dues payment.
 */
const CashbookPostingsPanel = ({
  organisationId,
  status,
  accounts,
  onRecheckLedger,
  isRechecking = false,
  enabled = LEDGER_POSTINGS_UI_ENABLED,
  memberMoneyEnabled = LEDGER_MEMBER_MONEY_UI_ENABLED,
  reversalsEnabled = LEDGER_REVERSALS_UI_ENABLED,
  allocationsEnabled = LEDGER_F3_ALLOCATION_UI_ENABLED,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** Refetches status, accounts and journals after the officer asks to recheck. */
  onRecheckLedger?: () => void;
  isRechecking?: boolean;
  enabled?: boolean;
  /** Whether the Member money section is shown; it owns retries of member-money postings. */
  memberMoneyEnabled?: boolean;
  /** Whether the Reversals section is shown; it owns retries of reversals. */
  reversalsEnabled?: boolean;
  /** Whether "Allocate member money" is shown; it owns retries of allocations. */
  allocationsEnabled?: boolean;
}) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const workflow = usePostingWorkflow<Exclude<View, "overview">>({
    organisationId,
    onRecheckLedger,
  });
  const { postings, view, formError, panelError, success, superseded, formInstance, recheck } =
    workflow;

  if (!enabled) return null;

  const intentRead = postings.intent.read;
  const hasIntent = hasPendingLedgerPosting(intentRead);
  const readiness = postingReadiness({ status, canManage, accounts });
  const receiptReadiness = receiptOperationReadiness(accounts);
  const expenseReadiness = expenseOperationReadiness(accounts);
  const transferReadiness = transferOperationReadiness(accounts);

  const formProps = {
    accounts: accounts ?? [],
    context: {
      today: todayInLagos(),
      openingDate: status.openingDate,
      lockedThrough: status.lockedThrough,
      lockedThroughState: status.lockedThroughState,
    },
    isPosting: postings.isPosting,
    error: formError,
    locked: superseded,
    onCancel: workflow.back,
    onSubmit: workflow.submit,
  };

  const form = (() => {
    switch (view) {
      case "receipt":
        return <ReceiptForm key={formInstance} {...formProps} />;
      case "expense":
        return <ExpenseForm key={formInstance} {...formProps} />;
      case "transfer":
        return <TransferForm key={formInstance} {...formProps} />;
      default:
        return null;
    }
  })();

  return (
    <Box as="section" aria-labelledby={headingId}>
      <Text as="h2" id={headingId} fontSize="lg" fontWeight="semibold" mb={2}>
        Record money
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={3}>
        Record an ordinary receipt, an expense, or a transfer between your own cash and
        bank accounts. These entries never change dues, levies or compliance figures.
      </Text>

      <Stack gap={4}>
        {!postings.isPosting && (
          <PostingIntentNotice
            read={intentRead}
            canManage={canManage}
            isPosting={postings.isPosting}
            isRechecking={isRechecking}
            onRetry={workflow.retry}
            onRecheck={recheck}
            // Member-money postings and reversals are retried in their own
            // sections when those are shown; otherwise nothing pending may be
            // stranded out of view.
            section="cashbook"
            shownSections={shownPostingSections({
              cashbook: true,
              memberMoney: memberMoneyEnabled,
              reversals: reversalsEnabled,
              allocations: allocationsEnabled,
            })}
          />
        )}

        {panelError && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {panelError}
          </Text>
        )}

        {success && (
          <PostingReceipt
            result={success.result}
            summary={success.summary}
            onAnother={workflow.dismissSuccess}
          />
        )}

        {!readiness.ready && (
          <Box
            borderWidth="1px"
            borderColor="border.warning"
            borderRadius="md"
            p={3}
            bg="bg.panel"
          >
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              Posting isn't available
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {readiness.reason}
            </Text>
          </Box>
        )}

        {readiness.ready && !hasIntent && !success && view === "overview" && (
          <>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
              <Button
                size="lg"
                variant="outline"
                minH="64px"
                disabled={!receiptReadiness.ready}
                onClick={() => workflow.open("receipt")}
              >
                <Stack gap={0}>
                  <Text fontWeight="semibold">Money in</Text>
                  <Text fontSize="xs" color="fg.muted">
                    Donation, offering or sale
                  </Text>
                </Stack>
              </Button>
              <Button
                size="lg"
                variant="outline"
                minH="64px"
                disabled={!expenseReadiness.ready}
                onClick={() => workflow.open("expense")}
              >
                <Stack gap={0}>
                  <Text fontWeight="semibold">Money out</Text>
                  <Text fontSize="xs" color="fg.muted">
                    An expense paid from an account
                  </Text>
                </Stack>
              </Button>
              <Button
                size="lg"
                variant="outline"
                minH="64px"
                disabled={!transferReadiness.ready}
                onClick={() => workflow.open("transfer")}
              >
                <Stack gap={0}>
                  <Text fontWeight="semibold">Transfer</Text>
                  <Text fontSize="xs" color="fg.muted">
                    Move money between accounts
                  </Text>
                </Stack>
              </Button>
            </SimpleGrid>
            {!receiptReadiness.ready && (
              <Text fontSize="sm" color="fg.muted">
                {`Money in: ${receiptReadiness.reason}`}
              </Text>
            )}
            {!expenseReadiness.ready && (
              <Text fontSize="sm" color="fg.muted">
                {`Money out: ${expenseReadiness.reason}`}
              </Text>
            )}
            {!transferReadiness.ready && (
              <Text fontSize="sm" color="fg.muted">
                {`Transfer: ${transferReadiness.reason}`}
              </Text>
            )}
          </>
        )}

        {/* Keep the active form mounted while its own request is in flight:
            the persisted intent appears immediately, but the form's loading
            state is what the officer is interacting with. After an
            unconfirmed result the view returns to the overview, where only
            the exact stored retry is offered. */}
        {readiness.ready && view !== "overview" && superseded && (
          <PostingSupersededNotice
            hasPendingIntent={hasIntent}
            isRechecking={isRechecking}
            onRecheck={recheck}
            onStartNew={workflow.startNewPosting}
          />
        )}

        {readiness.ready && view !== "overview" && form}

        {status.unconfirmedAttempts !== null && status.unconfirmedAttempts > 0 && (
          <Text fontSize="sm" color="fg.muted">
            {status.unconfirmedAttempts === 1
              ? "The server reports 1 unresolved posting attempt for this organisation. It must be resolved before that transaction can be relied on."
              : `The server reports ${status.unconfirmedAttempts} unresolved posting attempts for this organisation. They must be resolved before those transactions can be relied on.`}
          </Text>
        )}

        {hasIntent && (
          <Text fontSize="sm" color="fg.muted">
            New postings are blocked until the unconfirmed posting is proved by the
            server. Do not enter the same transaction again from a new form.
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default CashbookPostingsPanel;
