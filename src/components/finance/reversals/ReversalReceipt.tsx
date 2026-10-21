import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import {
  PostingSummary,
  REVERSIBLE_SOURCE_TYPE_LABELS,
} from "components/finance/ledgerPostingTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { formatLagosTimestamp } from "helpers/openingBalances";
import {
  POSTING_STORAGE_CLEAR_FAILED_MESSAGE,
  PostingSubmitResult,
} from "hooks/useLedgerPostings";

type Confirmed = Extract<PostingSubmitResult, { kind: "confirmed" }>;

/**
 * What the server proved about a reversal: a new journal, linked to the
 * original, that mirrors its total. The original is never edited or deleted.
 * Only shown for a confirmation that passed the reversal proof (it names the
 * original, is not the original, and matches the date and total).
 */
const ReversalReceipt = ({
  result,
  summary,
  onDone,
  onOpenJournal,
}: {
  result: Confirmed;
  summary: PostingSummary;
  onDone: () => void;
  /** Opens a journal's details, e.g. the original that was undone. */
  onOpenJournal?: (journalId: string) => void;
}) => {
  const journal = result.journal;
  const originalLabel = [
    summary.originalSourceType
      ? REVERSIBLE_SOURCE_TYPE_LABELS[summary.originalSourceType]
      : "Entry",
    summary.originalNumber,
  ]
    .filter(Boolean)
    .join(" ");

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
            {result.replayed ? "Already reversed" : "Reversed"}
          </Text>
          <Badge colorPalette={result.replayed ? "blue" : "green"} variant="subtle">
            {result.replayed ? "Confirmed replay" : "Confirmed by the server"}
          </Badge>
        </Flex>
        <Text fontSize="sm">
          {`${originalLabel} was undone by a new reversal journal. The original entry stays in the books unchanged, linked to its reversal.`}
        </Text>
        <Stack gap={1}>
          <Text fontSize="sm">{`Amount reversed: ${formatKobo(journal.totalKobo ?? summary.amountKobo)}`}</Text>
          <Text fontSize="sm">
            {`Reversal date: ${formatBusinessDate(journal.businessDate ?? summary.businessDate)}`}
          </Text>
          {journal.note && <Text fontSize="sm">{`Reason: ${journal.note}`}</Text>}
          {journal.postedAt && (
            <Text fontSize="sm" color="fg.muted">
              {`Posted: ${formatLagosTimestamp(journal.postedAt) ?? "time unavailable"}`}
            </Text>
          )}
          {journal.postedByName && (
            <Text fontSize="sm" color="fg.muted">{`Posted by: ${journal.postedByName}`}</Text>
          )}
          <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
            {`Reversal journal id: ${journal.id}`}
          </Text>
          {journal.reversesJournalId && (
            <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
              {`Reverses journal id: ${journal.reversesJournalId}`}
            </Text>
          )}
        </Stack>

        {!result.cleared && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {POSTING_STORAGE_CLEAR_FAILED_MESSAGE}
          </Text>
        )}

        <Flex gap={2} wrap="wrap">
          {onOpenJournal && journal.reversesJournalId && (
            <Button
              variant="outline"
              onClick={() => onOpenJournal(journal.reversesJournalId as string)}
            >
              View the original entry
            </Button>
          )}
          <Button variant="outline" onClick={onDone}>
            Done
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
};

export default ReversalReceipt;
