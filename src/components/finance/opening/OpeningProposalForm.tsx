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
import { DateField } from "components/ui/date-field";
import { useConfirm } from "components/ui/confirm-dialog";
import OpeningAccountAmountList from "components/finance/opening/OpeningAccountAmountList";
import OpeningMemberMoneyEditor from "components/finance/opening/OpeningMemberMoneyEditor";
import OpeningPreviewCard from "components/finance/opening/OpeningPreview";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  amountsToLines,
  buildInitialOpeningInput,
  earliestOpeningDate,
  initialOpeningReadiness,
  memberMoneyDraftsToInputs,
  openingDateIssue,
  openingPreview,
  parseNairaToKobo,
  todayInLagos,
} from "helpers/openingBalances";
import { useOpeningBalanceWrites } from "hooks/useOpeningBalances";
import { classifyIntentWriteFailure, useLedgerWriteIntent } from "hooks/useLedgerWriteIntent";
import { MemberMoneyDraft } from "helpers/openingBalances";

const STEPS = ["Date and evidence", "Counted amounts", "Member money", "Review"];

/**
 * Guided initial opening proposal (RFC v0.3 §4.4, §5.6.5, D28).
 *
 * Nothing is submitted until the officer reviews the whole proposal. The
 * client sends integer kobo and never a holding-account total; the backend
 * computes the summary, fingerprint and journal.
 */
const OpeningProposalForm = ({
  organisationId,
  status,
  accounts,
  writes,
  intent,
  onCancel,
  onSubmitted,
}: {
  organisationId: string;
  status: LedgerStatus;
  accounts: readonly LedgerAccount[];
  writes: ReturnType<typeof useOpeningBalanceWrites>;
  intent: ReturnType<typeof useLedgerWriteIntent>;
  onCancel: () => void;
  onSubmitted: () => void;
}) => {
  const today = todayInLagos();
  const readiness = initialOpeningReadiness(
    accounts,
    status.memberReceiptsEnabled === true,
  );
  const { confirm, confirmDialog } = useConfirm();

  const [step, setStep] = useState(0);
  const [asOfDate, setAsOfDate] = useState(status.openingDate ?? today);
  const [evidence, setEvidence] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(readiness.moneyAccounts.map((account) => [account.id, ""])),
  );
  const [items, setItems] = useState<MemberMoneyDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const accountLines = readiness.moneyAccounts.map((account) => ({
    accountId: account.id,
    amountKobo: parseNairaToKobo(amounts[account.id] ?? ""),
  }));
  const preview = openingPreview(
    accountLines,
    items.map((item) => ({ amountKobo: parseNairaToKobo(item.amount) })),
  );

  const stepProblem = (index: number): string | null => {
    if (index === 0) {
      const dateIssue = openingDateIssue(asOfDate, today);
      if (dateIssue) return dateIssue;
      const trimmed = evidence.trim();
      if (!trimmed) return "Record the supporting evidence for this count.";
      if (trimmed.length > 500) return "Evidence can be at most 500 characters.";
      return null;
    }
    if (index === 1) {
      if (readiness.moneyAccounts.length === 0) return "No active cash or bank accounts.";
      return amountsToLines(readiness.moneyAccounts, amounts).problem;
    }
    if (index === 2) {
      if (!readiness.memberMoneyReady || items.length === 0) return null;
      return memberMoneyDraftsToInputs(items).problem;
    }
    return null;
  };

  const submitProblem =
    readiness.blockers[0] ??
    stepProblem(0) ??
    stepProblem(1) ??
    stepProblem(2) ??
    (status.revision === null
      ? "This server doesn't send the ledger revision yet, so a proposal can't be submitted from here."
      : null) ??
    (preview === null ? "Enter every counted amount before submitting." : null) ??
    (preview?.memberExceedsMoney
      ? "Identified member money can't be more than the cash and bank money counted."
      : null) ??
    (intent.blocked
      ? "An earlier opening change is unresolved. Recheck the ledger before submitting."
      : null);

  const next = () => {
    const problem = stepProblem(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (submitProblem) {
      setError(submitProblem);
      return;
    }
    const lines = amountsToLines(readiness.moneyAccounts, amounts);
    if (!lines.lines) {
      setError(lines.problem);
      return;
    }
    const itemInputs = memberMoneyDraftsToInputs(items);
    if (!itemInputs.inputs) {
      setError(itemInputs.problem);
      return;
    }
    const confirmed = await confirm({
      title: "Submit opening proposal",
      body: `Submit this opening proposal for independent verification? ${
        status.revision === null ? "" : "It does not activate the ledger by itself; the owner must verify it."
      } The client preview is not authoritative; the backend recalculates and verifies the figures.`,
      confirmLabel: "Submit opening proposal",
    });
    if (!confirmed) return;

    // The durable write persists the safety record before dispatch and sends
    // nothing without it, so a reload cannot permit a blind retry.
    writes.submitOpening(
      buildInitialOpeningInput({
        asOfDate,
        expectedLedgerRevision: status.revision as number,
        evidence,
        lines: lines.lines,
        memberMoneyItems: itemInputs.inputs,
      }),
      {
        onSuccess: onSubmitted,
        onError: (failure) => {
          const outcome = classifyIntentWriteFailure(failure);
          // May have been saved: the intent notice says so; stop here.
          if (outcome.kind === "unknown") setError(null);
          else setError(outcome.message ?? "The proposal wasn't submitted. Try again.");
        },
      },
    );
  };

  if (readiness.blockers.length > 0) {
    return (
      <Stack gap={4}>
        <Text as="h3" fontSize="md" fontWeight="semibold">
          Propose opening balances
        </Text>
        <Box role="alert" borderWidth="1px" borderColor="border.error" borderRadius="md" p={3}>
          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="semibold" color="fg.error">
              The chart of accounts isn't ready
            </Text>
            {readiness.blockers.map((blocker) => (
              <Text key={blocker} fontSize="sm" color="fg.muted">
                {blocker}
              </Text>
            ))}
          </Stack>
        </Box>
        <Button alignSelf="flex-start" variant="outline" onClick={onCancel}>
          Back
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <Text as="h3" fontSize="md" fontWeight="semibold">
          Propose opening balances
        </Text>
        <Badge colorPalette="blue" variant="subtle">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </Badge>
      </Flex>

      <Text fontSize="sm" color="fg.muted">
        The opening date is the first day these books cover. Count cash and bank money at
        the start of that day. Nothing is copied from dues, levy or payment records.
      </Text>

      {error && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {error}
        </Text>
      )}

      {step === 0 && (
        <Stack gap={4}>
          <Field.Root>
            <Field.Label>Opening date</Field.Label>
            <DateField
              value={asOfDate}
              onChange={setAsOfDate}
              min={earliestOpeningDate(today)}
              max={today}
            />
            <Field.HelperText>
              At most 31 days before today in Lagos ({formatBusinessDate(today)}). The
              owner must verify the proposal before this date falls out of the window.
            </Field.HelperText>
          </Field.Root>
          <Field.Root>
            <Field.Label>Supporting evidence</Field.Label>
            <Textarea
              value={evidence}
              maxLength={500}
              placeholder="e.g. Counted by the treasurer and secretary; bank statement stamped 1 Nov"
              onChange={(event) => setEvidence(event.target.value)}
            />
            <Field.HelperText>Required. At most 500 characters.</Field.HelperText>
          </Field.Root>
        </Stack>
      )}

      {step === 1 && (
        <Stack gap={4}>
          <Text fontSize="sm" color="fg.muted">
            Every active cash or bank account must appear, including accounts whose count
            was zero.
          </Text>
          <OpeningAccountAmountList
            accounts={readiness.moneyAccounts}
            amounts={amounts}
            onChange={(accountId, value) =>
              setAmounts((current) => ({ ...current, [accountId]: value }))
            }
          />
        </Stack>
      )}

      {step === 2 && (
        <Stack gap={4}>
          {readiness.memberMoneyReady ? (
            <OpeningMemberMoneyEditor drafts={items} onChange={setItems} />
          ) : (
            <Text fontSize="sm" color="fg.muted">
              Member receipts are off or there is no active member-money holding account,
              so opening member-money items aren't available. All counted money will be
              credited to opening balance equity.
            </Text>
          )}
          <OpeningPreviewCard preview={preview} />
        </Stack>
      )}

      {step === 3 && (
        <Stack gap={4}>
          <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
            <Stack gap={2}>
              <Text fontSize="sm" fontWeight="semibold">
                Opening date
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {formatBusinessDate(asOfDate)}
              </Text>
              <Text fontSize="sm" fontWeight="semibold">
                Evidence
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {evidence.trim()}
              </Text>
            </Stack>
          </Box>

          <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>
              Counted amounts
            </Text>
            <Stack gap={1}>
              {accountLines.map((line, index) => (
                <Flex
                  key={line.accountId}
                  justify="space-between"
                  gap={3}
                  fontSize="sm"
                >
                  <Text color="fg.muted">{readiness.moneyAccounts[index].name}</Text>
                  <Text fontWeight="medium">
                    {line.amountKobo === null ? "Not entered" : formatKobo(line.amountKobo)}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Box>

          {items.length > 0 && (
            <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Opening member money
              </Text>
              <Stack gap={2}>
                {items.map((item) => {
                  const amount = parseNairaToKobo(item.amount);
                  return (
                    <Flex key={item.key} justify="space-between" gap={3} fontSize="sm">
                      <Text color="fg.muted">
                        {item.payerName.trim() || "Unnamed payer"} ·{" "}
                        {item.purpose === "unspecified" ? "Unspecified" : item.purpose}
                      </Text>
                      <Text fontWeight="medium">
                        {amount === null ? "Not entered" : formatKobo(amount)}
                      </Text>
                    </Flex>
                  );
                })}
              </Stack>
            </Box>
          )}

          <OpeningPreviewCard preview={preview} />

          <Text fontSize="xs" color="fg.muted">
            Submitting sends this proposal to the owner for independent verification. It
            does not activate the ledger and does not post money. The owner must not be
            the officer who submits it.
          </Text>
        </Stack>
      )}

      <Flex gap={2} wrap="wrap">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((current) => current - 1)}>
            Back
          </Button>
        )}
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {step < STEPS.length - 1 ? (
          <Button colorPalette="teal" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button
            colorPalette="teal"
            loading={writes.isSubmitting}
            disabled={Boolean(submitProblem)}
            onClick={() => void submit()}
          >
            Submit proposal
          </Button>
        )}
      </Flex>

      {submitProblem && step === STEPS.length - 1 && (
        <Text fontSize="sm" color="fg.muted">
          {submitProblem}
        </Text>
      )}

      {confirmDialog}
    </Stack>
  );
};

export default OpeningProposalForm;
