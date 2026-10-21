import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import {
  MEMBER_MONEY_PURPOSES,
  MEMBER_MONEY_PURPOSE_LABELS,
  MemberMoneyPurpose,
  POSTING_METHOD_LABELS,
  PostingSummary,
} from "components/finance/ledgerPostingTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { postingMethodLabel } from "helpers/ledgerPostings";
import { formatLagosTimestamp } from "helpers/openingBalances";
import {
  POSTING_STORAGE_CLEAR_FAILED_MESSAGE,
  PostingSubmitResult,
} from "hooks/useLedgerPostings";
import ReversalReceipt from "components/finance/reversals/ReversalReceipt";
import { ALLOCATION_NOT_PAYMENT_NOTE } from "helpers/ledgerAllocations";

type Confirmed = Extract<PostingSubmitResult, { kind: "confirmed" }>;

const summaryText = (summary: PostingSummary) => {
  switch (summary.operation) {
    case "receipt":
      return `Money in to ${
        summary.toAccountName ?? "the selected account"
      }, category ${summary.categoryName ?? "the selected income category"}`;
    case "expense":
      return `Money out from ${
        summary.fromAccountName ?? "the selected account"
      }, category ${summary.categoryName ?? "the selected expense category"}`;
    case "transfer":
      return `Transfer from ${
        summary.fromAccountName ?? "the selected account"
      } to ${summary.toAccountName ?? "the selected account"}`;
    case "member_receipt":
      return `Member money in to ${
        summary.toAccountName ?? "the selected account"
      }, held for members (not income)`;
    case "refund":
      return `Member money refund from ${summary.fromAccountName ?? "the selected account"}`;
    case "reversal":
      return "Reversal of an earlier entry";
    case "allocation":
      return `Allocation to ${summary.memberName ?? "the selected member"}, ${
        summary.obligationName ?? "the selected obligation"
      }${summary.obligationType ? ` (${summary.obligationType} income)` : ""}`;
  }
};

const COUNTERPARTY_LABELS: Partial<Record<PostingSummary["operation"], string>> = {
  member_receipt: "Paid by",
  refund: "Paid to",
};

/** The server's purpose when readable and known, else what was sent. */
const purposeLabel = (fromServer: string | null, sent: PostingSummary["purpose"]) => {
  const purpose =
    fromServer && (MEMBER_MONEY_PURPOSES as readonly string[]).includes(fromServer)
      ? (fromServer as MemberMoneyPurpose)
      : sent ?? null;
  return purpose ? MEMBER_MONEY_PURPOSE_LABELS[purpose] : null;
};

/**
 * What the server proved. The journal number, date, amount and posting actor
 * come from the confirmed response; the locally known summary is used only
 * when the server did not send a readable additive field.
 */
const PostingReceipt = ({
  result,
  summary,
  onAnother,
  onViewHistory,
}: {
  result: Confirmed;
  summary: PostingSummary;
  onAnother: () => void;
  /** Allocations: show it in the allocation history (when that is shown). */
  onViewHistory?: (journalId: string, sourceId: string | null, sourceNumber: string | null) => void;
}) => {
  // A reversal has no number or method; it proves a link to its original.
  // A section that retried one on the Reversals section's behalf shows the
  // same receipt.
  if (summary.operation === "reversal") {
    return <ReversalReceipt result={result} summary={summary} onDone={onAnother} />;
  }
  return (
    <NumberedPostingReceipt result={result} summary={summary} onAnother={onAnother} onViewHistory={onViewHistory} />
  );
};

const NumberedPostingReceipt = ({
  result,
  summary,
  onAnother,
  onViewHistory,
}: {
  result: Confirmed;
  summary: PostingSummary;
  onAnother: () => void;
  onViewHistory?: (journalId: string, sourceId: string | null, sourceNumber: string | null) => void;
}) => {
  const journal = result.journal;
  const amountKobo = journal?.totalKobo ?? summary.amountKobo;
  const method =
    postingMethodLabel(journal?.method ?? null) ??
    (summary.method ? POSTING_METHOD_LABELS[summary.method] : null);
  const purpose =
    summary.operation === "member_receipt"
      ? purposeLabel(journal?.purpose ?? null, summary.purpose)
      : null;
  const sourceNumber =
    summary.operation === "refund" || summary.operation === "allocation"
      ? journal?.memberMoneySourceNumber ?? summary.sourceNumber ?? null
      : null;
  const allocation = summary.operation === "allocation";

  return (
    <Box
      role="status"
      borderWidth="1px"
      borderColor="border.emphasized"
      borderRadius="md"
      p={4}
      bg="bg.panel"
    >
      <Stack gap={3}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontSize="md" fontWeight="semibold">
            {result.replayed ? "Already posted" : "Posted"}
          </Text>
          <Badge colorPalette={result.replayed ? "blue" : "green"} variant="subtle">
            {result.replayed ? "Confirmed replay" : "Confirmed by the server"}
          </Badge>
        </Flex>

        {journal?.number ? (
          <Text fontSize="lg" fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
            {`Journal number: ${journal.number}`}
          </Text>
        ) : (
          <Text fontSize="sm" color="fg.muted">
            The server confirmed the posting but didn't return a readable journal number.
            Check the journal entries below.
          </Text>
        )}

        <Stack gap={1}>
          <Text fontSize="sm">{`Amount: ${formatKobo(amountKobo)}`}</Text>
          <Text fontSize="sm">
            {`Business date: ${formatBusinessDate(
              journal?.businessDate ?? summary.businessDate,
            )}`}
          </Text>
          {method && <Text fontSize="sm">{`Payment method: ${method}`}</Text>}
          <Text fontSize="sm">{summaryText(summary)}</Text>
          {purpose && <Text fontSize="sm">{`Purpose: ${purpose}`}</Text>}
          {sourceNumber && (
            <Text fontSize="sm">{`${allocation ? "Allocated from" : "Refunded from"}: ${sourceNumber}`}</Text>
          )}
          {allocation && journal?.confirmedMismatches && journal.confirmedMismatches.length > 0 && (
            <Text fontSize="sm">{`Confirmed despite a different ${journal.confirmedMismatches.join(", ")} hint`}</Text>
          )}
          {allocation && <Text fontSize="sm">{ALLOCATION_NOT_PAYMENT_NOTE}</Text>}
          {journal?.counterpartyName && (
            <Text fontSize="sm">{`${
              COUNTERPARTY_LABELS[summary.operation] ?? "Counterparty"
            }: ${journal.counterpartyName}`}</Text>
          )}
          {journal?.reason && <Text fontSize="sm">{`Reason: ${journal.reason}`}</Text>}
          {journal?.reference && (
            <Text fontSize="sm">{`Reference: ${journal.reference}`}</Text>
          )}
          {journal?.externalReference && (
            <Text fontSize="sm">{`External reference: ${journal.externalReference}`}</Text>
          )}
          {journal?.postedAt && (
            <Text fontSize="sm" color="fg.muted">
              {`Posted: ${formatLagosTimestamp(journal.postedAt) ?? "time unavailable"}`}
            </Text>
          )}
          {journal?.postedByName && (
            <Text fontSize="sm" color="fg.muted">
              {`Posted by: ${journal.postedByName}`}
            </Text>
          )}
          {journal?.id && (
            <Text fontSize="xs" color="fg.muted">
              {`Journal id: ${journal.id}`}
            </Text>
          )}
        </Stack>

        {!result.cleared && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {POSTING_STORAGE_CLEAR_FAILED_MESSAGE}
          </Text>
        )}

        <Flex gap={2} wrap="wrap">
          {allocation && onViewHistory && journal?.id && (
            <Button
              variant="outline"
              onClick={() => onViewHistory(journal.id, journal.memberMoneySourceId, sourceNumber)}
            >
              View in allocation history
            </Button>
          )}
          <Button variant="outline" onClick={onAnother}>
            {allocation ? "Done" : "Record another posting"}
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
};

export default PostingReceipt;
