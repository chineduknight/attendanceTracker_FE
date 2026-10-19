import { useId, useState } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { SelectOption } from "components/ui/themed-select";
import { LEDGER_MEMBER_MONEY_UI_ENABLED } from "config/ledgerMemberMoney";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  MEMBER_MONEY_OPERATIONS,
  MEMBER_MONEY_PURPOSE_LABELS,
} from "components/finance/ledgerPostingTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { hasPendingLedgerPosting } from "helpers/ledgerPostingIntent";
import { memberMoneyReadiness, postingReadiness } from "helpers/ledgerPostings";
import {
  MEMBER_MONEY_NOT_DUES_NOTE,
  MEMBER_MONEY_SOURCE_KIND_LABELS,
  MemberMoneySource,
} from "helpers/memberMoney";
import { todayInLagos } from "helpers/openingBalances";
import { useObligations } from "hooks/useFinance";
import { useMembers } from "hooks/useMembers";
import { useOpenMemberMoney } from "hooks/useMemberMoney";
import { usePostingWorkflow } from "hooks/usePostingWorkflow";
import { usePermissions } from "rbac/usePermissions";
import PostingIntentNotice from "components/finance/postings/PostingIntentNotice";
import PostingReceipt from "components/finance/postings/PostingReceipt";
import PostingSupersededNotice from "components/finance/postings/PostingSupersededNotice";
import { MemberReceiptForm, RefundForm } from "components/finance/postings/MemberMoneyForms";

type MemberMoneyView = "member_receipt" | "refund";

/** One source that still holds money, with its refund action. */
const SourceRow = ({
  source,
  canRefund,
  onRefund,
}: {
  source: MemberMoneySource;
  canRefund: boolean;
  onRefund: () => void;
}) => (
  <Box as="li" listStyleType="none" borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
    <Flex
      direction={{ base: "column", sm: "row" }}
      justify="space-between"
      align={{ base: "stretch", sm: "flex-start" }}
      gap={3}
    >
      <Stack gap={0.5} minW={0}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold">{source.number}</Text>
          <Badge variant="subtle">{MEMBER_MONEY_SOURCE_KIND_LABELS[source.kind]}</Badge>
        </Flex>
        <Text fontSize="sm">{source.payerName ?? "Payer not recorded"}</Text>
        <Text fontSize="sm" color="fg.muted">
          {`${source.purpose ? MEMBER_MONEY_PURPOSE_LABELS[source.purpose] : "Purpose unknown"} · received ${formatBusinessDate(source.businessDate)}`}
        </Text>
        {(source.refundedKobo > 0 || source.allocatedKobo > 0) && (
          <Text fontSize="sm" color="fg.muted">
            {[
              `${formatKobo(source.effectiveKobo)} received`,
              source.refundedKobo > 0 ? `${formatKobo(source.refundedKobo)} refunded` : null,
              source.allocatedKobo > 0 ? `${formatKobo(source.allocatedKobo)} allocated` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
      </Stack>
      <Stack gap={1} align={{ base: "flex-start", sm: "flex-end" }}>
        <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
          {`${formatKobo(source.remainingKobo)} held`}
        </Text>
        {canRefund && (
          <Button size="sm" variant="outline" onClick={onRefund}>
            {`Refund from ${source.number}`}
          </Button>
        )}
      </Stack>
    </Flex>
  </Box>
);

type RefundSourceState =
  | { kind: "current"; source: MemberMoneySource }
  /** The server's full list no longer has it: nothing is left to refund. */
  | { kind: "gone" }
  /** The latest list couldn't be read, so its current figures are unknown. */
  | { kind: "unknown" };

const refundSourceState = ({
  id,
  sources,
  complete,
}: {
  id: string;
  sources: MemberMoneySource[] | null;
  complete: boolean | null;
}): RefundSourceState => {
  if (!sources) return { kind: "unknown" };
  const source = sources.find((entry) => entry.id === id);
  if (source) return { kind: "current", source };
  // Missing from a capped list proves nothing.
  return complete ? { kind: "gone" } : { kind: "unknown" };
};

/** Shown instead of a refund form whose source can't be confirmed now. */
const RefundSourceUnavailable = ({
  gone,
  isRechecking,
  onRecheck,
  onBack,
}: {
  gone: boolean;
  isRechecking: boolean;
  onRecheck: () => void;
  onBack: () => void;
}) => (
  <Box role="alert" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
    <Text fontSize="sm" fontWeight="semibold" mb={1}>
      {gone ? "Nothing is held to refund any more" : "What is held couldn't be confirmed"}
    </Text>
    <Text fontSize="sm" color="fg.muted" mb={3}>
      {gone
        ? "The server reports that this member money no longer holds anything, so no refund is offered. Check the journal entries before recording anything else."
        : "The latest amount still held couldn't be read from the server, so this refund is paused. Check again before refunding."}
    </Text>
    <Flex gap={2} wrap="wrap">
      {!gone && (
        <Button size="sm" variant="outline" onClick={onRecheck} loading={isRechecking}>
          Check again
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onBack}>
        Back
      </Button>
    </Flex>
  </Box>
);

/**
 * F2B-2 member money (RFC v0.3 §5.6, §8.2): dues and levy money held for
 * members, recorded as a liability and never as income.
 *
 * Gated by its own release switch, the officer's `finance.manage`, the
 * server's posting readiness, member receipts being on and an active holding
 * account. It shares one pending posting with "Record money": an unconfirmed
 * posting of either kind blocks every new posting until it is proved.
 * Recording member money never writes dues, levies, payments or compliance.
 */
const MemberMoneyPanel = ({
  organisationId,
  status,
  accounts,
  onRecheckLedger,
  isRechecking = false,
  enabled = LEDGER_MEMBER_MONEY_UI_ENABLED,
  cashbookEnabled = LEDGER_POSTINGS_UI_ENABLED,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** Refetches status, accounts and journals after the officer asks to recheck. */
  onRecheckLedger?: () => void;
  isRechecking?: boolean;
  enabled?: boolean;
  /** Whether "Record money" is shown; it owns retries of ordinary postings. */
  cashbookEnabled?: boolean;
}) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const canReadMembers = has("members.view");
  const memberReceiptsOn = status.memberReceiptsEnabled === true;
  const sourcesQuery = useOpenMemberMoney(organisationId, enabled && memberReceiptsOn);
  const workflow = usePostingWorkflow<MemberMoneyView>({
    organisationId,
    onRecheckLedger,
    // What each source still holds is the server's figure; any posting made
    // elsewhere, a recheck or a refusal re-reads it rather than trusting it.
    onPanelReadsStale: () => {
      if (memberReceiptsOn) void sourcesQuery.refetch();
    },
  });
  const { postings, view, formError, panelError, success, superseded, formInstance, recheck } =
    workflow;
  // The source the officer chose to refund. The form shows the latest server
  // copy of it, never this snapshot's figures.
  const [refundSourceId, setRefundSourceId] = useState<string | null>(null);
  // Hints are read only while the form that offers them is open. The member
  // list needs members.view; without it the payer name alone is recorded.
  const hintsNeeded = enabled && view === "member_receipt";
  const membersQuery = useMembers(organisationId, { enabled: hintsNeeded && canReadMembers });
  const obligationsQuery = useObligations(organisationId, { enabled: hintsNeeded });

  if (!enabled) return null;

  const intentRead = postings.intent.read;
  const hasIntent = hasPendingLedgerPosting(intentRead);
  const posting = postingReadiness({ status, canManage, accounts });
  const memberMoney = memberMoneyReadiness({ status, accounts });
  const readiness = posting.ready ? memberMoney : posting;
  const canStart = readiness.ready && !hasIntent && !success && view === "overview";
  const rechecking = isRechecking || (sourcesQuery.isFetching && !sourcesQuery.isLoading);

  const refund = refundSourceId
    ? refundSourceState({
        id: refundSourceId,
        sources: sourcesQuery.isError ? null : sourcesQuery.sources,
        complete: sourcesQuery.complete,
      })
    : null;

  const memberOptions: SelectOption[] | null =
    canReadMembers && membersQuery.isSuccess
      ? membersQuery.members.map((member) => ({ value: member.id, label: member.name }))
      : null;
  const obligationOptions: SelectOption[] | null = obligationsQuery.hasData
    ? obligationsQuery.obligations.map((obligation) => ({
        value: obligation.id,
        label: obligation.year ? `${obligation.name} (${obligation.year})` : obligation.name,
      }))
    : null;

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

  const form =
    view === "member_receipt" ? (
      <MemberReceiptForm
        key={formInstance}
        {...formProps}
        memberOptions={memberOptions}
        obligationOptions={obligationOptions}
      />
    ) : view === "refund" && refund?.kind === "current" ? (
      <RefundForm key={`${refund.source.id}-${formInstance}`} {...formProps} source={refund.source} />
    ) : view === "refund" ? (
      <RefundSourceUnavailable
        gone={refund?.kind === "gone"}
        isRechecking={rechecking}
        onRecheck={recheck}
        onBack={workflow.back}
      />
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
          The server's list of member money held couldn't be read, so no refund is offered.
        </Text>
      );
    }
    if (sourcesQuery.sources.length === 0) {
      return (
        <EmptyState
          title="No member money is held"
          description="Member receipts and opening member money with money still held appear here, ready to refund."
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
              canRefund={canStart}
              onRefund={() => {
                setRefundSourceId(source.id);
                workflow.open("refund");
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
        Member money
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={2}>
        Dues and levy money members paid in, held for them until it is matched later. It
        is recorded as money the organisation holds, never as income.
      </Text>
      <Text fontSize="sm" fontWeight="medium" mb={3}>
        {MEMBER_MONEY_NOT_DUES_NOTE}
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
            // Ordinary postings are retried in "Record money" when it is
            // shown; otherwise nothing pending may be stranded out of view.
            operations={cashbookEnabled ? MEMBER_MONEY_OPERATIONS : undefined}
            elsewhereLabel="Record money"
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
          <Box borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              Member money can't be recorded
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {readiness.reason}
            </Text>
          </Box>
        )}

        {canStart && (
          <Button
            size="lg"
            variant="outline"
            minH="64px"
            alignSelf="flex-start"
            onClick={() => workflow.open("member_receipt")}
          >
            <Stack gap={0}>
              <Text fontWeight="semibold">Member money in</Text>
              <Text fontSize="xs" color="fg.muted">
                Dues or levy money a member paid
              </Text>
            </Stack>
          </Button>
        )}

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
              Member money held
            </Text>
            {sources}
          </Stack>
        )}

        {hasIntent && readiness.ready && (
          <Text fontSize="sm" color="fg.muted">
            New postings are blocked until the unconfirmed posting is proved by the server.
            Do not enter the same transaction again from a new form.
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default MemberMoneyPanel;
