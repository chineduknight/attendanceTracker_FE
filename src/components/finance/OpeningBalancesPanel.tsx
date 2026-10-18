import { useId, useState } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LEDGER_OPENING_BALANCES_UI_ENABLED } from "config/ledgerOpeningBalances";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { OpeningProposal } from "components/finance/openingBalanceTypes";
import OpeningProposalForm from "components/finance/opening/OpeningProposalForm";
import OpeningProposalReview from "components/finance/opening/OpeningProposalReview";
import OpeningWriteIntentNotice from "components/finance/opening/OpeningWriteIntentNotice";
import {
  CorrectionOpeningForm,
  SupplementaryOpeningForm,
} from "components/finance/opening/OpeningAdjustmentForms";
import { LEDGER_STATE_LABELS, ledgerStateKey } from "helpers/ledger";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  canSubmitAdjustmentProposal,
  canSubmitOpeningProposal,
  hasMultipleOpenProposals,
  initialOpeningReadiness,
  moneyAccountsAwaitingOpening,
  openProposalOf,
  openingKindLabels,
  openingProposalStatusLabels,
  openingStatusKey,
  verifiedZeroAccounts,
} from "helpers/openingBalances";
import { useEffectiveOpenings, useOpeningBalanceWrites, useOpeningProposals } from "hooks/useOpeningBalances";
import { useLedgerWriteIntent } from "hooks/useLedgerWriteIntent";
import { usePermissions } from "rbac/usePermissions";
import useGlobalStore from "zStore";

/**
 * F2A-3A opening balances and independent verification (preparation).
 *
 * Gated by `config/ledgerOpeningBalances`: while false, Books is exactly what
 * #132 shipped. The screens read the provisional backend contract in PR #40
 * and are exercised with mocks; nothing here is reachable until the corrected
 * backend and F2A-4 are live.
 *
 * The backend owns every authoritative figure. The client previews only, never
 * derives an opening from F0 records, and never treats missing data as zero,
 * verified or complete.
 */

const STATUS_SCHEMES: Record<
  ReturnType<typeof openingStatusKey>,
  "green" | "blue" | "red" | "gray" | "yellow"
> = {
  submitted: "blue",
  verified: "green",
  rejected: "red",
  withdrawn: "gray",
  unknown: "yellow",
};

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Text as="h2" id={id} fontSize="lg" fontWeight="semibold" mb={2}>
    {children}
  </Text>
);

type View =
  | { kind: "overview" }
  | { kind: "initial" }
  | { kind: "supplementary" }
  | { kind: "correction" }
  | { kind: "review"; proposalId: string };

const accountName = (accounts: readonly LedgerAccount[], accountId: string) =>
  accounts.find((account) => account.id === accountId)?.name ??
  `Unknown account (${accountId})`;

const ProposalRow = ({
  proposal,
  onOpen,
}: {
  proposal: OpeningProposal;
  onOpen: () => void;
}) => {
  const statusKey = openingStatusKey(proposal.status);
  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
      <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
        <Stack gap={0.5} minW={0}>
          <Flex align="center" gap={2} wrap="wrap">
            <Text fontSize="sm" fontWeight="semibold">
              {openingKindLabels[proposal.kind]}
            </Text>
            <Badge colorPalette={STATUS_SCHEMES[statusKey]} variant="subtle">
              {openingProposalStatusLabels[statusKey]}
            </Badge>
          </Flex>
          <Text fontSize="sm" color="fg.muted">
            Opening date {formatBusinessDate(proposal.asOfDate)}
            {proposal.summary
              ? ` · counted ${formatKobo(proposal.summary.moneyKobo)}`
              : " · totals unavailable"}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {proposal.lines.length} account line{proposal.lines.length === 1 ? "" : "s"}
            {proposal.memberMoneyItems.length > 0
              ? ` · ${proposal.memberMoneyItems.length} member-money item${
                  proposal.memberMoneyItems.length === 1 ? "" : "s"
                }`
              : ""}
          </Text>
        </Stack>
        <Button size="sm" variant="outline" onClick={onOpen}>
          Review
        </Button>
      </Flex>
    </Box>
  );
};

const OpeningBalancesPanel = ({
  organisationId,
  status,
  accounts,
  onRecheckLedger,
  enabled = LEDGER_OPENING_BALANCES_UI_ENABLED,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  /** Refetches the ledger status/accounts alongside opening reads. */
  onRecheckLedger?: () => void;
  enabled?: boolean;
}) => {
  const headingId = useId();
  const { has, isOwner } = usePermissions();
  const canManage = has("finance.manage");
  const userId = useGlobalStore((s) => s.user.id) || null;
  const [view, setView] = useState<View>({ kind: "overview" });

  const state = ledgerStateKey(status);
  const ready = enabled && accounts !== null && state !== "unknown" && state !== "not_active";

  const proposalsQuery = useOpeningProposals(organisationId, ready);
  const effectiveQuery = useEffectiveOpenings(organisationId, ready);
  const writes = useOpeningBalanceWrites(organisationId);
  const intent = useLedgerWriteIntent(organisationId);

  if (!enabled) return null;
  if (state === "unknown") return null;

  const recheck = () => {
    proposalsQuery.refetch();
    effectiveQuery.refetch();
    intent.refresh();
    onRecheckLedger?.();
  };

  const intentNotice = (
    <OpeningWriteIntentNotice
      read={intent.read}
      canManage={canManage}
      isRechecking={proposalsQuery.isFetching || effectiveQuery.isFetching}
      onRecheck={recheck}
      onAcknowledge={intent.acknowledge}
      onRetryStorage={intent.refresh}
    />
  );

  if (view.kind === "review") {
    const proposal =
      proposalsQuery.proposals?.find((entry) => entry.id === view.proposalId) ?? null;
    return (
      <Box as="section" aria-labelledby={headingId}>
        <SectionHeading id={headingId}>Opening balances</SectionHeading>
        <Stack gap={4}>
          {intentNotice}
          {proposal ? (
            <OpeningProposalReview
              proposal={proposal}
              accounts={accounts ?? []}
              status={status}
              isOwner={isOwner}
              userId={userId}
              writes={writes}
              intent={intent}
              onBack={() => setView({ kind: "overview" })}
              onDecided={recheck}
            />
          ) : (
            <EmptyState
              title="That proposal isn't available"
              description="It may have been decided or the proposal list is still loading. Go back and reload."
              action={<Button onClick={() => setView({ kind: "overview" })}>Back</Button>}
            />
          )}
        </Stack>
      </Box>
    );
  }

  if (view.kind === "initial") {
    return (
      <Box as="section" aria-labelledby={headingId}>
        <SectionHeading id={headingId}>Opening balances</SectionHeading>
        <Stack gap={4}>
          {intentNotice}
          <OpeningProposalForm
            organisationId={organisationId}
            status={status}
            accounts={accounts ?? []}
            writes={writes}
            intent={intent}
            onCancel={() => setView({ kind: "overview" })}
            onSubmitted={() => {
              setView({ kind: "overview" });
              recheck();
            }}
          />
        </Stack>
      </Box>
    );
  }

  if (view.kind === "supplementary") {
    return (
      <Box as="section" aria-labelledby={headingId}>
        <SectionHeading id={headingId}>Opening balances</SectionHeading>
        <Stack gap={4}>
          {intentNotice}
          <SupplementaryOpeningForm
            status={status}
            accounts={accounts ?? []}
            writes={writes}
            intent={intent}
            onCancel={() => setView({ kind: "overview" })}
            onSubmitted={() => {
              setView({ kind: "overview" });
              recheck();
            }}
          />
        </Stack>
      </Box>
    );
  }

  if (view.kind === "correction") {
    return (
      <Box as="section" aria-labelledby={headingId}>
        <SectionHeading id={headingId}>Opening balances</SectionHeading>
        <Stack gap={4}>
          {intentNotice}
          <CorrectionOpeningForm
            status={status}
            accounts={accounts ?? []}
            effective={effectiveQuery.effective}
            writes={writes}
            intent={intent}
            onCancel={() => setView({ kind: "overview" })}
            onSubmitted={() => {
              setView({ kind: "overview" });
              recheck();
            }}
          />
        </Stack>
      </Box>
    );
  }

  const notStarted = state === "not_active";
  if (notStarted) {
    return (
      <Box as="section" aria-labelledby={headingId}>
        <SectionHeading id={headingId}>Opening balances</SectionHeading>
        <EmptyState
          title="Set up the ledger first"
          description="Start bookkeeping setup and add the chart of accounts before proposing opening balances."
        />
      </Box>
    );
  }

  const proposals = proposalsQuery.proposals;
  const multipleOpen = proposals ? hasMultipleOpenProposals(proposals) : false;
  const openProposal = proposals ? openProposalOf(proposals) : null;
  const proposalsKnown = proposals !== null;
  const proposalsComplete = proposalsQuery.complete === true;
  const anyUnknownStatus = (proposals ?? []).some(
    (proposal) => proposal.status.kind === "unknown",
  );
  const hasOpenProposal = openProposal !== null || multipleOpen;
  const readiness = initialOpeningReadiness(
    accounts ?? [],
    status.memberReceiptsEnabled === true,
  );
  const proposePermission = canSubmitOpeningProposal({
    canManage,
    isOwner,
    hasOpenProposal,
    proposalsKnown,
    proposalsComplete,
    anyUnknownStatus,
  });
  const adjustmentPermission = canSubmitAdjustmentProposal({
    ledgerState: state,
    canManage,
    isOwner,
    hasOpenProposal,
    proposalsKnown,
    proposalsComplete,
    anyUnknownStatus,
  });
  const awaiting = moneyAccountsAwaitingOpening(status, accounts ?? []);
  const unknownAccountOpeningState =
    state === "active" &&
    (accounts ?? []).some((account) => account.openingVerified === null);
  const zeroVerified = verifiedZeroAccounts(effectiveQuery.effective);

  return (
    <Box as="section" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Opening balances</SectionHeading>
      <Stack gap={4}>
        {intentNotice}

        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Flex justify="space-between" align="center" gap={3} wrap="wrap">
            <Stack gap={0.5}>
              <Text fontSize="sm" fontWeight="semibold">
                Ledger state
              </Text>
              <Text fontSize="sm" color="fg.muted">
                Opening date:{" "}
                {status.openingDate
                  ? formatBusinessDate(status.openingDate)
                  : "not set yet"}
              </Text>
            </Stack>
            <Badge colorPalette={state === "active" ? "green" : "gray"} variant="subtle">
              {LEDGER_STATE_LABELS[state]}
            </Badge>
          </Flex>
          <Text fontSize="xs" color="fg.muted" mt={2}>
            These are opening figures, not current balances. Current balances are not
            calculated in this release.
          </Text>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Cash and bank accounts awaiting opening verification
          </Text>
          {awaiting.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              {state === "active"
                ? "No money account is explicitly awaiting an opening."
                : "No active cash or bank accounts."}
            </Text>
          ) : (
            <Stack gap={1}>
              {awaiting.map((account) => (
                <Flex key={account.id} justify="space-between" gap={3}>
                  <Text fontSize="sm" color="fg.muted">
                    {account.name}
                  </Text>
                  <Text fontSize="sm">
                    {state === "active" ? "Needs supplementary opening" : "Awaiting initial opening"}
                  </Text>
                </Flex>
              ))}
            </Stack>
          )}
          {unknownAccountOpeningState && (
            <Text fontSize="xs" color="fg.muted" mt={2}>
              This server doesn't report each account's opening state yet, so only accounts
              it explicitly marks are shown.
            </Text>
          )}
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Verified openings
          </Text>
          {effectiveQuery.isError ? (
            <ErrorState
              title="Couldn't load verified openings"
              description={errorMessage(effectiveQuery.error)}
              onRetry={() => effectiveQuery.refetch()}
              retrying={effectiveQuery.isFetching}
            />
          ) : effectiveQuery.isLoading ? (
            <PageLoader h="15vh" label="Loading verified openings..." />
          ) : effectiveQuery.effective === null ? (
            <Text fontSize="sm" color="fg.muted">
              {effectiveQuery.hasData
                ? "The verified opening figures aren't a shape this app version understands. Nothing has been assumed."
                : "Verified opening figures aren't available from this server yet."}
            </Text>
          ) : effectiveQuery.effective.accounts.length === 0 &&
            effectiveQuery.effective.memberMoneyItems.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              Nothing is verified yet.
            </Text>
          ) : (
            <Stack gap={2}>
              {effectiveQuery.effective.accounts.map((opening) => (
                <Box
                  key={opening.accountId}
                  borderWidth="1px"
                  borderColor="border"
                  borderRadius="md"
                  p={3}
                >
                  <Flex justify="space-between" gap={3} wrap="wrap">
                    <Text fontSize="sm" fontWeight="medium">
                      {accountName(accounts ?? [], opening.accountId)}
                    </Text>
                    <Flex gap={2} align="center">
                      <Badge
                        colorPalette={opening.effectiveKobo === 0 ? "gray" : "green"}
                        variant="subtle"
                      >
                        {opening.effectiveKobo === 0 ? "Verified ₦0" : "Verified"}
                      </Badge>
                      <Text fontSize="sm" fontWeight="medium">
                        {formatKobo(opening.effectiveKobo)}
                      </Text>
                    </Flex>
                  </Flex>
                  <Text fontSize="xs" color="fg.muted">
                    Original {formatKobo(opening.originalKobo)} ·{" "}
                    {opening.corrections.length} correction
                    {opening.corrections.length === 1 ? "" : "s"}
                  </Text>
                  {opening.corrections.map((correction) => (
                    <Text key={correction.proposalId} fontSize="xs" color="fg.muted">
                      Correction {correction.proposalId}: {formatKobo(correction.deltaKobo)}
                    </Text>
                  ))}
                </Box>
              ))}
              {effectiveQuery.effective.memberMoneyItems.map((item) => (
                <Box
                  key={item.id}
                  borderWidth="1px"
                  borderColor="border"
                  borderRadius="md"
                  p={3}
                >
                  <Flex justify="space-between" gap={3} wrap="wrap">
                    <Text fontSize="sm" fontWeight="medium">
                      {item.number} · {item.payerName}
                    </Text>
                    <Text fontSize="sm">{formatKobo(item.effectiveKobo)}</Text>
                  </Flex>
                  <Text fontSize="xs" color="fg.muted">
                    {item.purpose} · {item.evidence} · adjusted{" "}
                    {item.adjustments.length} time{item.adjustments.length === 1 ? "" : "s"}
                  </Text>
                </Box>
              ))}
              {zeroVerified.length > 0 && (
                <Text fontSize="xs" color="fg.muted">
                  A verified zero is a confirmed count, not missing data.
                </Text>
              )}
            </Stack>
          )}
        </Box>

        <Box>
          <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={2}>
            <Text fontSize="sm" fontWeight="semibold">
              Opening proposals
            </Text>
            {proposalsQuery.isError && (
              <Button size="sm" variant="outline" onClick={() => proposalsQuery.refetch()}>
                Try again
              </Button>
            )}
          </Flex>
          {proposalsQuery.isLoading ? (
            <PageLoader h="15vh" label="Loading proposals..." />
          ) : proposals === null ? (
            <Text fontSize="sm" color="fg.muted">
              {proposalsQuery.isError
                ? errorMessage(proposalsQuery.error) ?? "Couldn't load proposals."
                : "The proposal list isn't available from this server yet."}
            </Text>
          ) : proposals.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              No opening proposals yet.
            </Text>
          ) : (
            <Stack gap={2}>
              {multipleOpen && (
                <Text role="alert" fontSize="sm" color="fg.error">
                  The server reported more than one open proposal. This app won't decide
                  either until the data is reconciled.
                </Text>
              )}
              {openProposal && (
                <Text fontSize="xs" color="fg.muted">
                  One proposal is open and waiting for a decision.
                </Text>
              )}
              {proposals.map((proposal) => (
                <ProposalRow
                  key={proposal.id}
                  proposal={proposal}
                  onOpen={() => setView({ kind: "review", proposalId: proposal.id })}
                />
              ))}
            </Stack>
          )}
          {proposals !== null && proposalsQuery.complete === false && (
            <Text fontSize="xs" color="fg.muted" mt={2}>
              Only part of the proposal history could be read, so new proposals are
              blocked until it can be read in full.
            </Text>
          )}
        </Box>

        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Next step
          </Text>
          {state === "setup" && (
            <Stack gap={2}>
              {openProposal ? (
                <Button
                  alignSelf="flex-start"
                  colorPalette="teal"
                  onClick={() => setView({ kind: "review", proposalId: openProposal.id })}
                >
                  Review the open proposal
                </Button>
              ) : (
                <>
                  <Button
                    alignSelf="flex-start"
                    colorPalette="teal"
                    disabled={
                      !proposePermission.allowed ||
                      intent.blocked ||
                      readiness.blockers.length > 0 ||
                      status.revision === null
                    }
                    onClick={() => setView({ kind: "initial" })}
                  >
                    Propose opening balances
                  </Button>
                  {!proposePermission.allowed && proposePermission.reason && (
                    <Text fontSize="xs" color="fg.muted">
                      {proposePermission.reason}
                    </Text>
                  )}
                  {readiness.blockers.map((blocker) => (
                    <Text key={blocker} fontSize="xs" color="fg.muted">
                      {blocker}
                    </Text>
                  ))}
                  {status.revision === null && (
                    <Text fontSize="xs" color="fg.muted">
                      This server doesn't send the ledger revision yet, so a proposal
                      can't be submitted from here.
                    </Text>
                  )}
                </>
              )}
            </Stack>
          )}

          {state === "pending_verification" && (
            <Text fontSize="sm" color="fg.muted">
              The ledger is waiting for the owner to verify the open proposal. Only the
              owner can verify, and never their own proposal.
            </Text>
          )}

          {state === "active" && (
            <Stack gap={2}>
              <Flex gap={2} wrap="wrap">
                <Button
                  variant="outline"
                  disabled={intent.blocked || !adjustmentPermission.allowed}
                  onClick={() => setView({ kind: "supplementary" })}
                >
                  Supplementary opening
                </Button>
                <Button
                  variant="outline"
                  disabled={intent.blocked || !adjustmentPermission.allowed}
                  onClick={() => setView({ kind: "correction" })}
                >
                  Correct a verified opening
                </Button>
              </Flex>
              {!adjustmentPermission.allowed && adjustmentPermission.reason && (
                <Text fontSize="xs" color="fg.muted">
                  {adjustmentPermission.reason}
                </Text>
              )}
              <Text fontSize="xs" color="fg.muted">
                Supplementary and correction flows are provisional until the backend
                contract is final. Opening entries are never reversed or deleted.
              </Text>
            </Stack>
          )}

          {state === "suspended" && (
            <Text fontSize="sm" color="fg.muted">
              Opening changes are unavailable while the ledger is suspended.
            </Text>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

export default OpeningBalancesPanel;
