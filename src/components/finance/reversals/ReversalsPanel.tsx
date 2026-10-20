import { useEffect, useId, useRef, useState } from "react";
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LEDGER_MEMBER_MONEY_UI_ENABLED } from "config/ledgerMemberMoney";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import { LEDGER_REVERSALS_UI_ENABLED } from "config/ledgerReversals";
import { ReversalTarget } from "components/finance/ledgerPostingTypes";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { ledgerHttpStatus } from "helpers/ledger";
import { hasPendingLedgerPosting } from "helpers/ledgerPostingIntent";
import { ledgerWriteReadiness, shownPostingSections } from "helpers/ledgerPostings";
import { reversalCaution, reversalEligibility } from "helpers/ledgerReversals";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerJournal } from "hooks/useLedgerJournal";
import { usePostingWorkflow } from "hooks/usePostingWorkflow";
import { usePermissions } from "rbac/usePermissions";
import PostingIntentNotice from "components/finance/postings/PostingIntentNotice";
import PostingSupersededNotice from "components/finance/postings/PostingSupersededNotice";
import JournalDetailCard from "components/finance/reversals/JournalDetailCard";
import ReversalForm from "components/finance/reversals/ReversalForm";
import ReversalReceipt from "components/finance/reversals/ReversalReceipt";

const Notice = ({ title, children }: { title: string; children: string }) => (
  <Box borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
    <Text fontSize="sm" fontWeight="semibold" mb={1}>
      {title}
    </Text>
    <Text fontSize="sm" color="fg.muted">
      {children}
    </Text>
  </Box>
);

/**
 * F2B-3 reversals (RFC v0.3 §5.3, §7, §8.2): a journal's details and, where
 * this build may offer it, undoing it with a new linked journal.
 *
 * Gated by its own release switch, `finance.manage` and the server's write
 * readiness. A reversal is a posting: it takes the one pending-posting slot
 * shared with "Record money" and "Member money", is stored with its journal
 * before it is sent, retried only as that exact request, and shown as done
 * only when the response names the original and mirrors its total. The
 * server decides every refusal (already reversed, insufficient funds, a
 * member receipt still in use).
 */
const ReversalsPanel = ({
  organisationId,
  status,
  accounts,
  openJournalId,
  onOpenJournal,
  onCloseJournal,
  onRecheckLedger,
  isRechecking = false,
  enabled = LEDGER_REVERSALS_UI_ENABLED,
  cashbookEnabled = LEDGER_POSTINGS_UI_ENABLED,
  memberMoneyEnabled = LEDGER_MEMBER_MONEY_UI_ENABLED,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** The journal whose details are open, chosen in Journal entries. */
  openJournalId: string | null;
  onOpenJournal: (journalId: string) => void;
  onCloseJournal: () => void;
  /** Refetches status, accounts and journals (reads only). */
  onRecheckLedger?: () => void;
  isRechecking?: boolean;
  enabled?: boolean;
  cashbookEnabled?: boolean;
  memberMoneyEnabled?: boolean;
}) => {
  const headingId = useId();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const journalQuery = useLedgerJournal(organisationId, enabled ? openJournalId : null);
  const workflow = usePostingWorkflow<"reversal">({
    organisationId,
    onRecheckLedger,
    // Whether the open journal is already reversed is the server's fact: any
    // posting made elsewhere, a recheck or a refusal re-reads it.
    onPanelReadsStale: () => {
      if (openJournalId) void journalQuery.refetch();
    },
  });
  const { postings, view, formError, panelError, success, superseded, formInstance, recheck } =
    workflow;
  // The journal the open form reverses; the form never follows another one.
  const [formTarget, setFormTarget] = useState<ReversalTarget | null>(null);

  // Opening another journal closes a form for the previous one (unless its
  // request is in flight; its outcome is then shown here regardless), and
  // moves focus to the details so they are announced and scrolled into view.
  const backRef = useRef(workflow.back);
  backRef.current = workflow.back;
  const postingRef = useRef(postings.isPosting);
  postingRef.current = postings.isPosting;
  useEffect(() => {
    if (!postingRef.current) backRef.current();
    if (openJournalId) detailHeadingRef.current?.focus();
  }, [openJournalId]);

  if (!enabled) return null;

  const intentRead = postings.intent.read;
  const hasIntent = hasPendingLedgerPosting(intentRead);
  const readiness = ledgerWriteReadiness({
    status,
    canManage,
    forbiddenReason:
      "Only officers with permission to manage finance can reverse entries. You can still view them.",
  });
  const journal = journalQuery.journal;
  const eligibility = journal ? reversalEligibility(journal) : null;
  const formOpen =
    view === "reversal" &&
    formTarget !== null &&
    formTarget.journalId === openJournalId &&
    eligibility?.eligible === true;

  const reversalAction = (() => {
    if (!journal || !eligibility) return null;
    if (!eligibility.eligible) {
      return <Notice title="This entry can't be reversed">{eligibility.reason}</Notice>;
    }
    if (!readiness.ready) {
      return <Notice title="Reversing isn't available">{readiness.reason ?? ""}</Notice>;
    }
    const caution = reversalCaution(eligibility.target);
    if (formOpen) {
      return (
        <Stack gap={3}>
          {caution && (
            <Text fontSize="sm" color="fg.muted">
              {caution}
            </Text>
          )}
          {superseded && (
            <PostingSupersededNotice
              hasPendingIntent={hasIntent}
              isRechecking={isRechecking}
              onRecheck={recheck}
              onStartNew={workflow.startNewPosting}
            />
          )}
          <ReversalForm
            key={`${formTarget.journalId}-${formInstance}`}
            original={formTarget}
            context={{
              today: todayInLagos(),
              openingDate: status.openingDate,
              lockedThrough: status.lockedThrough,
              lockedThroughState: status.lockedThroughState,
            }}
            isPosting={postings.isPosting}
            error={formError}
            locked={superseded}
            onCancel={workflow.back}
            onSubmit={workflow.submit}
          />
        </Stack>
      );
    }
    if (hasIntent || success) return null;
    return (
      <Stack gap={2} align="flex-start">
        {caution && (
          <Text fontSize="sm" color="fg.muted">
            {caution}
          </Text>
        )}
        <Button
          variant="outline"
          colorPalette="red"
          onClick={() => {
            setFormTarget(eligibility.target);
            workflow.open("reversal");
          }}
        >
          Reverse this entry
        </Button>
      </Stack>
    );
  })();

  const details = (() => {
    if (!openJournalId) return null;
    if (journalQuery.isLoading) return <PageLoader label="Loading the entry" h="120px" />;
    if (journalQuery.isError && !journal) {
      return ledgerHttpStatus(journalQuery.error) === 404 ? (
        <EmptyState
          title="This entry can't be found"
          description="It isn't in this organisation's books."
        />
      ) : (
        <ErrorState
          title="Couldn't load the entry"
          description={errorMessage(journalQuery.error)}
          onRetry={() => void journalQuery.refetch()}
          retrying={journalQuery.isFetching}
        />
      );
    }
    if (!journal) {
      return (
        <Text fontSize="sm" color="fg.muted">
          The server's copy of this entry couldn't be read, so no reversal is offered.
        </Text>
      );
    }
    return (
      <Stack gap={3}>
        <JournalDetailCard journal={journal} accounts={accounts} onOpenJournal={onOpenJournal} />
        {reversalAction}
      </Stack>
    );
  })();

  return (
    <Box as="section" aria-labelledby={headingId}>
      <Text as="h2" id={headingId} fontSize="lg" fontWeight="semibold" mb={2}>
        Reversals
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={3}>
        Undo a posted entry with a new reversal journal linked to it. The original entry
        is never edited or deleted. Choose Details on an entry in Journal entries to see
        it and, where allowed, reverse it.
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
            section="reversals"
            shownSections={shownPostingSections({
              cashbook: cashbookEnabled,
              memberMoney: memberMoneyEnabled,
              reversals: true,
            })}
          />
        )}

        {panelError && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {panelError}
          </Text>
        )}

        {/* A refusal can close the form: the reread entry may now say it is
            already reversed. The server's reason must stay on screen. */}
        {formError && !formOpen && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {formError}
          </Text>
        )}

        {success && (
          <ReversalReceipt
            result={success.result}
            summary={success.summary}
            onDone={workflow.dismissSuccess}
            onOpenJournal={onOpenJournal}
          />
        )}

        {openJournalId && (
          <Stack gap={3}>
            <Flex justify="space-between" align="center" gap={2} wrap="wrap">
              <Text
                as="h3"
                ref={detailHeadingRef}
                tabIndex={-1}
                fontSize="md"
                fontWeight="semibold"
                outline="none"
              >
                Entry details
              </Text>
              <Button size="sm" variant="ghost" onClick={onCloseJournal}>
                Close details
              </Button>
            </Flex>
            {details}
          </Stack>
        )}

        {hasIntent && (
          <Text fontSize="sm" color="fg.muted">
            New postings and reversals are blocked until the unconfirmed posting is proved
            by the server.
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default ReversalsPanel;
