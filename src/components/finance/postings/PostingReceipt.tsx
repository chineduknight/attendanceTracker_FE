import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import {
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
  }
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
}: {
  result: Confirmed;
  summary: PostingSummary;
  onAnother: () => void;
}) => {
  const journal = result.journal;
  const amountKobo = journal?.totalKobo ?? summary.amountKobo;
  const method =
    postingMethodLabel(journal?.method ?? null) ??
    POSTING_METHOD_LABELS[summary.method];

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
          <Text fontSize="sm">{`Payment method: ${method}`}</Text>
          <Text fontSize="sm">{summaryText(summary)}</Text>
          {journal?.counterpartyName && (
            <Text fontSize="sm">{`Counterparty: ${journal.counterpartyName}`}</Text>
          )}
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

        <Flex>
          <Button variant="outline" onClick={onAnother}>
            Record another posting
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
};

export default PostingReceipt;
