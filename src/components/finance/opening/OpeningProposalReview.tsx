import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useConfirm } from "components/ui/confirm-dialog";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { OpeningProposal } from "components/finance/openingBalanceTypes";
import { formatKobo } from "helpers/financeConstants";
import { formatBusinessDate } from "helpers/financeCompliance";
import {
  formatLagosTimestamp,
  openingDecisionPermissions,
  openingKindLabels,
  openingProposalStatusLabels,
  openingStatusKey,
} from "helpers/openingBalances";
import { ledgerApiFailure, ledgerWriteOutcomeUnknown } from "helpers/ledgerSetup";
import { useOpeningBalanceWrites } from "hooks/useOpeningBalances";
import { useLedgerWriteIntent } from "hooks/useLedgerWriteIntent";

const STATUS_SCHEMES: Record<
  ReturnType<typeof openingStatusKey>,
  "green" | "blue" | "orange" | "red" | "gray" | "yellow"
> = {
  submitted: "blue",
  verified: "green",
  rejected: "red",
  withdrawn: "gray",
  unknown: "yellow",
};

interface VerifyOutcome {
  replayed: boolean | null;
  journalPresent: boolean | null;
  ledgerState: string | null;
}

/**
 * Reviewer screen for one opening proposal (RFC v0.3 §4.4.3, D3/D22).
 *
 * The owner verifies with the exact `{ expectedFingerprint,
 * expectedLedgerRevision, attestation: true }` contract and never their own
 * proposal. A successful verification may or may not create a journal: an
 * all-zero opening activates the ledger without one.
 */
const OpeningProposalReview = ({
  proposal,
  accounts,
  status,
  isOwner,
  userId,
  writes,
  intent,
  onBack,
  onDecided,
}: {
  proposal: OpeningProposal;
  accounts: readonly LedgerAccount[];
  status: LedgerStatus;
  isOwner: boolean;
  userId: string | null;
  writes: ReturnType<typeof useOpeningBalanceWrites>;
  intent: ReturnType<typeof useLedgerWriteIntent>;
  onBack: () => void;
  onDecided: () => void;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const permissions = openingDecisionPermissions({
    proposal,
    isOwner,
    userId,
    ledgerRevision: status.revision,
  });
  const statusKey = openingStatusKey(proposal.status);
  const submitted = proposal.status.kind === "known" && proposal.status.status === "submitted";
  const accountName = (accountId: string) =>
    accounts.find((account) => account.id === accountId)?.name ??
    `Unknown account (${accountId})`;

  const begin = (action: Parameters<typeof intent.begin>[0]) => {
    if (intent.blocked) {
      setError("An earlier opening change is unresolved. Recheck the ledger before continuing.");
      return null;
    }
    const record = intent.begin(action, {
      proposalId: proposal.id,
      fingerprint: proposal.fingerprint,
      kind: proposal.kind,
    });
    if (!record)
      setError(
        "This browser can't store the safety record required before this change. Allow site storage and try again.",
      );
    return record;
  };

  const handleFailure = (record: NonNullable<ReturnType<typeof begin>>, failure: unknown) => {
    const parsed = ledgerApiFailure(failure);
    if (ledgerWriteOutcomeUnknown(parsed)) {
      // The decision may have been recorded. Keep the persisted intent and
      // never present a 409/timeout as confirmation either way.
      intent.markUnresolved(record);
      setError(null);
      return;
    }
    intent.clear(record);
    setError(parsed.message ?? "The proposal wasn't changed. Try again.");
  };

  const verify = async () => {
    if (!proposal.fingerprint || status.revision === null) return;
    const confirmed = await confirm({
      title: "Verify opening balances",
      body: `Verify this ${openingKindLabels[
        proposal.kind
      ].toLowerCase()} with fingerprint ${proposal.fingerprint.slice(
        0,
        12,
      )}… at ledger revision ${status.revision}? ${
        proposal.kind === "initial"
          ? "This activates the ledger. "
          : ""
      }You confirm that you checked the counts and evidence and are not the proposer.`,
      confirmLabel: "Verify opening balances",
    });
    if (!confirmed) return;
    const record = begin("verify-opening");
    if (!record) return;
    writes.verifyOpening(
      proposal.id,
      {
        expectedFingerprint: proposal.fingerprint,
        expectedLedgerRevision: status.revision,
        attestation: true,
      },
      {
        onSuccess: (result) => {
          intent.clear(record);
          setError(null);
          setOutcome({
            replayed: result.replayed,
            journalPresent: result.journalPresent,
            ledgerState: result.status ? result.status.state.kind === "known" ? result.status.state.state : "unknown" : null,
          });
          onDecided();
        },
        onError: (failure) => handleFailure(record, failure),
      },
    );
  };

  const reject = async () => {
    if (!reason.trim()) {
      setError("Enter a reason for rejecting this proposal.");
      return;
    }
    const confirmed = await confirm({
      title: "Reject opening proposal",
      body: "Reject this proposal? This is final for this proposal. The proposer must submit a new one.",
      confirmLabel: "Reject this proposal",
      destructive: true,
    });
    if (!confirmed) return;
    const record = begin("reject-opening");
    if (!record) return;
    writes.rejectOpening(proposal.id, reason.trim(), {
      onSuccess: () => {
        intent.clear(record);
        setError(null);
        setRejecting(false);
        onDecided();
      },
      onError: (failure) => handleFailure(record, failure),
    });
  };

  const withdraw = async () => {
    const confirmed = await confirm({
      title: "Withdraw opening proposal",
      body: "Withdraw this proposal? It becomes read-only and can't be verified.",
      confirmLabel: "Withdraw proposal",
    });
    if (!confirmed) return;
    const record = begin("withdraw-opening");
    if (!record) return;
    writes.withdrawOpening(proposal.id, {
      onSuccess: () => {
        intent.clear(record);
        setError(null);
        onDecided();
      },
      onError: (failure) => handleFailure(record, failure),
    });
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <Flex align="center" gap={2} wrap="wrap">
          <Text as="h3" fontSize="md" fontWeight="semibold">
            {openingKindLabels[proposal.kind]}
          </Text>
          <Badge colorPalette={STATUS_SCHEMES[statusKey]} variant="subtle">
            {openingProposalStatusLabels[statusKey]}
          </Badge>
        </Flex>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </Flex>

      {!submitted && (
        <Text fontSize="sm" color="fg.muted">
          This proposal has been decided and is read-only.
        </Text>
      )}

      {error && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {error}
        </Text>
      )}

      {outcome && (
        <Box
          role="status"
          borderWidth="1px"
          borderColor="border"
          borderRadius="md"
          p={3}
          bg="bg.panel"
        >
          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="semibold">
              {outcome.replayed ? "Verification was already recorded" : "Verification recorded"}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {outcome.journalPresent === true
                ? "A journal was created for this verification."
                : outcome.journalPresent === false
                  ? "No journal was created. An all-zero opening needs no journal."
                  : "The response didn't say whether a journal was created."}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {outcome.ledgerState
                ? `Ledger state now: ${outcome.ledgerState}.`
                : "The response didn't include the ledger state."}
            </Text>
          </Stack>
        </Box>
      )}

      <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
        <Stack gap={2}>
          <Flex justify="space-between" gap={3} wrap="wrap">
            <Text fontSize="sm" color="fg.muted">
              Opening date
            </Text>
            <Text fontSize="sm" fontWeight="medium">
              {formatBusinessDate(proposal.asOfDate)}
            </Text>
          </Flex>
          <Flex justify="space-between" gap={3} wrap="wrap">
            <Text fontSize="sm" color="fg.muted">
              Proposed
            </Text>
            <Text fontSize="sm">
              {proposal.proposedBy ?? "Proposer unavailable"}
              {proposal.proposedAt
                ? ` · ${formatLagosTimestamp(proposal.proposedAt) ?? proposal.proposedAt}`
                : ""}
            </Text>
          </Flex>
          {proposal.decidedAt && (
            <Flex justify="space-between" gap={3} wrap="wrap">
              <Text fontSize="sm" color="fg.muted">
                Decided
              </Text>
              <Text fontSize="sm">
                {proposal.decidedBy ?? "Decider unavailable"}
                {` · ${formatLagosTimestamp(proposal.decidedAt) ?? proposal.decidedAt}`}
              </Text>
            </Flex>
          )}
          {proposal.decisionNote && (
            <Flex justify="space-between" gap={3} wrap="wrap">
              <Text fontSize="sm" color="fg.muted">
                Decision note
              </Text>
              <Text fontSize="sm">{proposal.decisionNote}</Text>
            </Flex>
          )}
          <Box>
            <Text fontSize="sm" color="fg.muted">
              Evidence
            </Text>
            <Text fontSize="sm">{proposal.evidence}</Text>
          </Box>
        </Stack>
      </Box>

      <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="semibold" mb={2}>
          {proposal.kind === "correction" ? "Corrected amounts" : "Account opening amounts"}
        </Text>
        <Stack gap={2}>
          {proposal.lines.map((line) => (
            <Flex key={line.accountId} justify="space-between" gap={3} wrap="wrap">
              <Text fontSize="sm" color="fg.muted">
                {accountName(line.accountId)}
              </Text>
              {proposal.kind === "correction" ? (
                <Text fontSize="sm">
                  {line.correctedAmountKobo === null
                    ? "Corrected amount unavailable"
                    : formatKobo(line.correctedAmountKobo)}
                  {line.effectiveBeforeKobo === null
                    ? ""
                    : ` (was ${formatKobo(line.effectiveBeforeKobo)})`}
                  {line.deltaKobo === null
                    ? ""
                    : ` · delta ${formatKobo(line.deltaKobo)}`}
                </Text>
              ) : (
                <Text fontSize="sm" fontWeight="medium">
                  {line.amountKobo === null ? "Amount unavailable" : formatKobo(line.amountKobo)}
                </Text>
              )}
            </Flex>
          ))}
          {proposal.lines.length === 0 && (
            <Text fontSize="sm" color="fg.muted">
              No account lines on this proposal.
            </Text>
          )}
        </Stack>
      </Box>

      {proposal.memberMoneyItems.length > 0 && (
        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Opening member money
          </Text>
          <Stack gap={2}>
            {proposal.memberMoneyItems.map((item) => (
              <Box key={item.id}>
                <Flex justify="space-between" gap={3} wrap="wrap">
                  <Text fontSize="sm" fontWeight="medium">
                    {item.payerName}
                  </Text>
                  <Text fontSize="sm">{formatKobo(item.amountKobo)}</Text>
                </Flex>
                <Text fontSize="xs" color="fg.muted">
                  {item.purpose} · {item.evidence}
                  {item.memberId ? ` · member ${item.memberId}` : ""}
                  {item.obligationId ? ` · obligation ${item.obligationId}` : ""}
                </Text>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {proposal.itemChanges.length > 0 && (
        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Member-money corrections
          </Text>
          <Stack gap={2}>
            {proposal.itemChanges.map((change) => (
              <Flex key={change.itemId} justify="space-between" gap={3} wrap="wrap">
                <Text fontSize="sm" color="fg.muted">
                  Item {change.itemId}
                </Text>
                <Text fontSize="sm">
                  {formatKobo(change.correctedAmountKobo)} (was{" "}
                  {formatKobo(change.effectiveBeforeKobo)}) · delta{" "}
                  {formatKobo(change.deltaKobo)}
                </Text>
              </Flex>
            ))}
          </Stack>
        </Box>
      )}

      <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="semibold" mb={2}>
          Backend totals
        </Text>
        {proposal.summary ? (
          <Stack gap={1}>
            <Flex justify="space-between" gap={3}>
              <Text fontSize="sm" color="fg.muted">
                Money counted
              </Text>
              <Text fontSize="sm">{formatKobo(proposal.summary.moneyKobo)}</Text>
            </Flex>
            <Flex justify="space-between" gap={3}>
              <Text fontSize="sm" color="fg.muted">
                Member money identified
              </Text>
              <Text fontSize="sm">{formatKobo(proposal.summary.memberMoneyKobo)}</Text>
            </Flex>
            <Flex justify="space-between" gap={3}>
              <Text fontSize="sm" color="fg.muted">
                Opening balance equity
              </Text>
              <Text fontSize="sm">{formatKobo(proposal.summary.equityKobo)}</Text>
            </Flex>
          </Stack>
        ) : (
          <Text fontSize="sm" color="fg.muted">
            The backend didn't send totals for this proposal. Nothing has been assumed.
          </Text>
        )}
      </Box>

      <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
        <Stack gap={1}>
          <Text fontSize="sm" color="fg.muted">
            Fingerprint
          </Text>
          <Text
            fontSize="xs"
            css={{ fontFamily: "monospace", wordBreak: "break-all" }}
          >
            {proposal.fingerprint ?? "Fingerprint unavailable — verification can't be requested."}
          </Text>
          <Text fontSize="sm" color="fg.muted" mt={1}>
            Expected ledger revision
          </Text>
          <Text fontSize="sm">
            {status.revision === null
              ? "Not reported by this server"
              : String(status.revision)}
          </Text>
        </Stack>
      </Box>

      {submitted && (
        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Stack gap={3}>
            <Text fontSize="sm" fontWeight="semibold">
              Decision
            </Text>

            <Flex gap={2} wrap="wrap">
              <Button
                colorPalette="green"
                disabled={!permissions.canVerify || intent.blocked}
                loading={writes.isVerifying}
                onClick={() => void verify()}
              >
                Verify opening
              </Button>
              <Button
                variant="outline"
                colorPalette="red"
                disabled={!permissions.canReject || intent.blocked}
                onClick={() => setRejecting((current) => !current)}
              >
                Reject
              </Button>
              <Button
                variant="outline"
                disabled={!permissions.canWithdraw || intent.blocked}
                loading={writes.isWithdrawing}
                onClick={() => void withdraw()}
              >
                Withdraw
              </Button>
            </Flex>

            {permissions.verifyBlockedReason && (
              <Text fontSize="xs" color="fg.muted">
                {permissions.verifyBlockedReason}
              </Text>
            )}

            {rejecting && (
              <Stack gap={2}>
                <Field.Root>
                  <Field.Label>Reason for rejection</Field.Label>
                  <Textarea
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <Field.HelperText>Required. At most 500 characters.</Field.HelperText>
                </Field.Root>
                <Flex gap={2}>
                  <Button
                    colorPalette="red"
                    loading={writes.isRejecting}
                    disabled={intent.blocked}
                    onClick={() => void reject()}
                  >
                    Reject proposal
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(false)}>
                    Cancel
                  </Button>
                </Flex>
              </Stack>
            )}
          </Stack>
        </Box>
      )}

      {confirmDialog}
    </Stack>
  );
};

export default OpeningProposalReview;
