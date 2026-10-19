import { useId, useState } from "react";
import { Box, Button, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  PostingSummary,
} from "components/finance/ledgerPostingTypes";
import {
  LedgerPostingIntentRecord,
  hasPendingLedgerPosting,
} from "helpers/ledgerPostingIntent";
import {
  expenseOperationReadiness,
  postingReadiness,
  receiptOperationReadiness,
  transferOperationReadiness,
} from "helpers/ledgerPostings";
import { todayInLagos } from "helpers/openingBalances";
import { PostingSubmitResult, useLedgerPostings } from "hooks/useLedgerPostings";
import { usePermissions } from "rbac/usePermissions";
import useGlobalStore from "zStore";
import PostingIntentNotice from "components/finance/postings/PostingIntentNotice";
import PostingReceipt from "components/finance/postings/PostingReceipt";
import {
  ExpenseForm,
  ReceiptForm,
  TransferForm,
} from "components/finance/postings/PostingForms";

type View = "overview" | "receipt" | "expense" | "transfer";

interface ConfirmedSuccess {
  result: Extract<PostingSubmitResult, { kind: "confirmed" }>;
  summary: PostingSummary;
}

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
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** Refetches status, accounts and journals after the officer asks to recheck. */
  onRecheckLedger?: () => void;
  isRechecking?: boolean;
  enabled?: boolean;
}) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const officerId = useGlobalStore((store) => store.user.id);
  const postings = useLedgerPostings(organisationId, officerId);
  const [view, setView] = useState<View>("overview");
  const [formError, setFormError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ConfirmedSuccess | null>(null);

  if (!enabled) return null;

  const intentRead = postings.intent.read;
  const hasIntent = hasPendingLedgerPosting(intentRead);
  const readiness = postingReadiness({ status, canManage, accounts });
  const receiptReadiness = receiptOperationReadiness(accounts);
  const expenseReadiness = expenseOperationReadiness(accounts);
  const transferReadiness = transferOperationReadiness(accounts);

  const recheck = () => {
    postings.intent.refresh();
    onRecheckLedger?.();
  };

  const open = (next: View) => {
    setFormError(null);
    setSuccess(null);
    setPanelError(null);
    setView(next);
  };

  const back = () => {
    setFormError(null);
    setView("overview");
  };

  const handleSubmit = async (
    draft: Parameters<typeof postings.submit>[0],
    summary: PostingSummary,
  ) => {
    setFormError(null);
    const result = await postings.submit(draft, summary);
    switch (result.kind) {
      case "confirmed":
        setView("overview");
        setSuccess({ result, summary });
        return;
      case "refused":
      case "voided":
      case "blocked":
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

  const handleRetry = async (record: LedgerPostingIntentRecord) => {
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
    onCancel: back,
    onSubmit: (draft: Parameters<typeof postings.submit>[0], summary: PostingSummary) => {
      void handleSubmit(draft, summary);
    },
  };

  const form = (() => {
    switch (view) {
      case "receipt":
        return <ReceiptForm {...formProps} />;
      case "expense":
        return <ExpenseForm {...formProps} />;
      case "transfer":
        return <TransferForm {...formProps} />;
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
            onRetry={(record) => void handleRetry(record)}
            onRecheck={recheck}
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
            onAnother={() => {
              setSuccess(null);
              setPanelError(null);
            }}
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
                onClick={() => open("receipt")}
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
                onClick={() => open("expense")}
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
                onClick={() => open("transfer")}
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
            New postings are blocked until the recorded request above is proved by the
            server. Do not enter the same transaction again from a new form.
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default CashbookPostingsPanel;
