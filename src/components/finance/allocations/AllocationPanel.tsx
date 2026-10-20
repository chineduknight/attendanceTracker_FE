import { useEffect, useId, useRef, useState } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LEDGER_F3_ALLOCATION_UI_ENABLED } from "config/ledgerF3Allocations";
import { LEDGER_MEMBER_MONEY_UI_ENABLED } from "config/ledgerMemberMoney";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import { LEDGER_REVERSALS_UI_ENABLED } from "config/ledgerReversals";
import { AllocationStart } from "components/finance/ledgerReconciliationTypes";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { MEMBER_MONEY_PURPOSE_LABELS } from "components/finance/ledgerPostingTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { ALLOCATION_NOT_PAYMENT_NOTE, allocationReadiness } from "helpers/ledgerAllocations";
import { hasPendingLedgerPosting } from "helpers/ledgerPostingIntent";
import { shownPostingSections } from "helpers/ledgerPostings";
import { MEMBER_MONEY_SOURCE_KIND_LABELS, MemberMoneySource } from "helpers/memberMoney";
import { todayInLagos } from "helpers/openingBalances";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { useOpenMemberMoney } from "hooks/useMemberMoney";
import { usePostingWorkflow } from "hooks/usePostingWorkflow";
import { usePermissions } from "rbac/usePermissions";
import PostingIntentNotice from "components/finance/postings/PostingIntentNotice";
import PostingReceipt from "components/finance/postings/PostingReceipt";
import PostingSupersededNotice from "components/finance/postings/PostingSupersededNotice";
import AllocationForm from "components/finance/allocations/AllocationForm";

type SourceState =
  | { kind: "current"; source: MemberMoneySource }
  /** The server's full list no longer has it: nothing is held any more. */
  | { kind: "gone" }
  /** The latest list couldn't be read, or is capped: what it holds is unknown. */
  | { kind: "unknown" };

const sourceState = (
  id: string,
  sources: MemberMoneySource[] | null,
  complete: boolean | null,
): SourceState => {
  if (!sources) return { kind: "unknown" };
  const source = sources.find((entry) => entry.id.toLowerCase() === id.toLowerCase());
  if (source) return { kind: "current", source };
  return complete ? { kind: "gone" } : { kind: "unknown" };
};

const SourceRow = ({
  source,
  canAllocate,
  onAllocate,
}: {
  source: MemberMoneySource;
  canAllocate: boolean;
  onAllocate: () => void;
}) => (
  <Box as="li" listStyleType="none" borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
    <Flex direction={{ base: "column", sm: "row" }} justify="space-between" gap={3}>
      <Stack gap={0.5} minW={0}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold">{source.number}</Text>
          <Badge variant="subtle">{MEMBER_MONEY_SOURCE_KIND_LABELS[source.kind]}</Badge>
        </Flex>
        <Text fontSize="sm">{source.payerName ?? "Payer not recorded"}</Text>
        <Text fontSize="sm" color="fg.muted">
          {`${source.purpose ? MEMBER_MONEY_PURPOSE_LABELS[source.purpose] : "Purpose unknown"} · received ${formatBusinessDate(source.businessDate)}`}
        </Text>
      </Stack>
      <Stack gap={1} align={{ base: "flex-start", sm: "flex-end" }}>
        <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
          {`${formatKobo(source.remainingKobo)} available`}
        </Text>
        {canAllocate && (
          <Button size="sm" variant="outline" minH="44px" onClick={onAllocate}>
            {`Allocate from ${source.number}`}
          </Button>
        )}
      </Stack>
    </Flex>
  </Box>
);

const Notice = ({ title, children }: { title: string; children: string }) => (
  <Box role="alert" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
    <Text fontSize="sm" fontWeight="semibold" mb={1}>
      {title}
    </Text>
    <Text fontSize="sm" color="fg.muted">
      {children}
    </Text>
  </Box>
);

/**
 * F3C allocation posting (F3 RFC v0.3 §5, O5, O8, O9): link held member money
 * to one member's dues or levy, one allocation per request.
 *
 * Gated by its own switch, `finance.manage` and the server's readiness
 * (writes on, ledger active, member receipts, the allocations setting, both
 * income accounts). An allocation is a posting: it takes the one pending
 * posting slot shared with every other posting section, is stored with its
 * key before it is sent, is retried only as that exact request and is shown
 * as done only when the response names the same source, member and
 * obligation. Nothing here writes Finance.
 */
const AllocationPanel = ({
  organisationId,
  status,
  accounts,
  start,
  onViewHistory,
  onRecheckLedger,
  isRechecking = false,
  enabled = LEDGER_F3_ALLOCATION_UI_ENABLED,
  cashbookEnabled = LEDGER_POSTINGS_UI_ENABLED,
  memberMoneyEnabled = LEDGER_MEMBER_MONEY_UI_ENABLED,
  reversalsEnabled = LEDGER_REVERSALS_UI_ENABLED,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** A request (e.g. a chosen suggestion) to start an allocation. */
  start?: AllocationStart | null;
  /** Shows a confirmed allocation in the history (absent when that isn't shown). */
  onViewHistory?: (journalId: string, sourceId: string | null, sourceNumber: string | null) => void;
  onRecheckLedger?: () => void;
  isRechecking?: boolean;
  enabled?: boolean;
  cashbookEnabled?: boolean;
  memberMoneyEnabled?: boolean;
  reversalsEnabled?: boolean;
}) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const memberReceiptsOn = status.memberReceiptsEnabled === true;
  const sourcesQuery = useOpenMemberMoney(organisationId, enabled && memberReceiptsOn);
  const workflow = usePostingWorkflow<"allocation">({
    organisationId,
    onRecheckLedger,
    // What a source holds and a position's figures are the server's: a
    // posting elsewhere, a recheck or a refusal re-reads both.
    onPanelReadsStale: () => {
      if (memberReceiptsOn) void sourcesQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.reconciliation(organisationId) });
    },
  });
  const { postings, view, formError, panelError, success, superseded, formInstance, recheck } = workflow;
  const [chosen, setChosen] = useState<{ sourceId: string; memberId: string; obligationId: string } | null>(null);

  const intentRead = postings.intent.read;
  const hasIntent = hasPendingLedgerPosting(intentRead);
  const readiness = allocationReadiness({ status, canManage, accounts });
  const canStart = readiness.ready && !hasIntent && !success && view === "overview";

  // A start request from a report opens the form for that source once, if an
  // allocation can be started now; otherwise the reason stays on screen.
  const handledStart = useRef<number | null>(null);
  const openRef = useRef(workflow.open);
  openRef.current = workflow.open;
  useEffect(() => {
    if (!enabled || !start || handledStart.current === start.nonce) return;
    handledStart.current = start.nonce;
    if (!canStart) return;
    setChosen({ sourceId: start.sourceId, memberId: start.memberId, obligationId: start.obligationId });
    openRef.current("allocation");
  }, [enabled, start, canStart]);

  if (!enabled) return null;

  const rechecking = isRechecking || (sourcesQuery.isFetching && !sourcesQuery.isLoading);
  const selected = chosen
    ? sourceState(chosen.sourceId, sourcesQuery.isError ? null : sourcesQuery.sources, sourcesQuery.complete)
    : null;

  const form =
    view === "allocation" && chosen && selected?.kind === "current" ? (
      <AllocationForm
        key={`${chosen.sourceId}-${formInstance}`}
        organisationId={organisationId}
        source={selected.source}
        initialMemberId={chosen.memberId}
        initialObligationId={chosen.obligationId}
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
    ) : view === "allocation" ? (
      <Box role="alert" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
        <Text fontSize="sm" fontWeight="semibold" mb={1}>
          {selected?.kind === "gone" ? "Nothing is held to allocate any more" : "What this money holds couldn't be confirmed"}
        </Text>
        <Text fontSize="sm" color="fg.muted" mb={3}>
          {selected?.kind === "gone"
            ? "The server reports that this member money no longer holds anything, so no allocation is offered."
            : "The latest amount held couldn't be read from the server, so this allocation is paused. Check again before allocating."}
        </Text>
        <Flex gap={2} wrap="wrap">
          {selected?.kind !== "gone" && (
            <Button size="sm" variant="outline" onClick={recheck} loading={rechecking}>
              Check again
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={workflow.back}>
            Back
          </Button>
        </Flex>
      </Box>
    ) : null;

  const sources = (() => {
    if (!memberReceiptsOn) return null;
    if (sourcesQuery.isLoading) return <PageLoader label="Loading member money held" h="120px" />;
    if (sourcesQuery.isError) {
      return (
        <ErrorState
          title="Member money held couldn't be loaded"
          description={errorMessage(sourcesQuery.error)}
          onRetry={() => void sourcesQuery.refetch()}
          retrying={sourcesQuery.isFetching}
        />
      );
    }
    if (sourcesQuery.sources === null) {
      return (
        <Text fontSize="sm" color="fg.muted">
          The server's list of member money held couldn't be read, so no allocation is offered.
        </Text>
      );
    }
    if (sourcesQuery.sources.length === 0) {
      return (
        <EmptyState
          title="No member money is held"
          description="There is nothing to allocate. Member receipts and opening member money that still hold money appear here."
        />
      );
    }
    return (
      <Stack gap={2}>
        <Box as="ul" display="flex" flexDirection="column" gap={2} m={0} p={0}>
          {sourcesQuery.sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              canAllocate={canStart}
              onAllocate={() => {
                setChosen({ sourceId: source.id, memberId: "", obligationId: "" });
                workflow.open("allocation");
              }}
            />
          ))}
        </Box>
        {sourcesQuery.complete === false && (
          <Text fontSize="sm" color="fg.muted">
            Only the oldest member money held is listed here; the server has more.
          </Text>
        )}
      </Stack>
    );
  })();

  return (
    <Box as="section" aria-labelledby={headingId}>
      <Text as="h2" id={headingId} fontSize="lg" fontWeight="semibold" mb={2}>
        Allocate member money
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={2}>
        Link money held for members to one member's dues or levy, one allocation at a time.
        The server chooses the holding and income accounts.
      </Text>
      <Text fontSize="sm" fontWeight="medium" mb={3}>
        {ALLOCATION_NOT_PAYMENT_NOTE}
      </Text>

      <Stack gap={4}>
        {!postings.isPosting && (
          <PostingIntentNotice
            read={intentRead}
            canManage={canManage}
            isPosting={postings.isPosting}
            isRechecking={rechecking}
            onRetry={workflow.retry}
            onRecheck={recheck}
            section="allocations"
            shownSections={shownPostingSections({
              cashbook: cashbookEnabled,
              memberMoney: memberMoneyEnabled,
              reversals: reversalsEnabled,
              allocations: true,
            })}
          />
        )}

        {panelError && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {panelError}
          </Text>
        )}

        {/* A refusal can close the form: the re-read source may now hold
            nothing. The server's reason must stay on screen. */}
        {formError && !(view === "allocation" && selected?.kind === "current") && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {formError}
          </Text>
        )}

        {success && (
          <PostingReceipt
            result={success.result}
            summary={success.summary}
            onAnother={workflow.dismissSuccess}
            onViewHistory={onViewHistory}
          />
        )}

        {!readiness.ready && <Notice title="Member money can't be allocated">{readiness.reason ?? ""}</Notice>}

        {readiness.ready && view !== "overview" && superseded && (
          <PostingSupersededNotice
            hasPendingIntent={hasIntent}
            isRechecking={rechecking}
            onRecheck={recheck}
            onStartNew={workflow.startNewPosting}
          />
        )}

        {readiness.ready && view !== "overview" && form}

        {view === "overview" && memberReceiptsOn && (
          <Stack gap={2}>
            <Text as="h3" fontSize="md" fontWeight="semibold">
              Member money available to allocate
            </Text>
            {sources}
          </Stack>
        )}

        {hasIntent && readiness.ready && (
          <Text fontSize="sm" color="fg.muted">
            New allocations are blocked until the unconfirmed posting is proved by the server.
            Do not enter the same allocation again from a new form.
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default AllocationPanel;
