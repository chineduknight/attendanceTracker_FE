import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { ResolveOutcome } from "helpers/ledgerAttempts";
import { journalTypeLabel } from "helpers/ledgerReversals";
import { formatLagosTimestamp } from "helpers/openingBalances";

/**
 * What resolving proved about one request key. Committed and voided are
 * shown separately: one means the transaction is in the books, the other
 * that this key can never post.
 */
const ResolutionResult = ({
  idempotencyKey,
  outcome,
  cleared,
  hadLocalRecord,
  officerId,
  onOpenJournal,
  onDismiss,
}: {
  idempotencyKey: string;
  outcome: ResolveOutcome;
  /** Whether this browser's pending record for the key (if any) is gone. */
  cleared: boolean;
  hadLocalRecord: boolean;
  officerId: string;
  onOpenJournal?: (journalId: string) => void;
  onDismiss: () => void;
}) => (
  <Box role="status" borderWidth="1px" borderColor="border.emphasized" borderRadius="md" p={4} bg="bg.panel">
    <Stack gap={2}>
      {outcome.kind === "committed" ? (
        <>
          <Flex align="center" gap={2} wrap="wrap">
            <Text fontWeight="semibold">Posted</Text>
            <Badge colorPalette="green" variant="subtle">
              Committed
            </Badge>
          </Flex>
          <Text fontSize="sm">
            The original request was saved. Nothing new was posted by resolving it. Don't enter
            this transaction again.
          </Text>
          <Text fontSize="sm">
            {[
              journalTypeLabel(outcome.journal.sourceType),
              outcome.journal.number,
              outcome.journal.totalKobo === null ? null : formatKobo(outcome.journal.totalKobo),
              outcome.journal.businessDate ? formatBusinessDate(outcome.journal.businessDate) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
            {`Journal id: ${outcome.journal.id}`}
          </Text>
        </>
      ) : (
        <>
          <Flex align="center" gap={2} wrap="wrap">
            <Text fontWeight="semibold">Voided</Text>
            <Badge colorPalette="gray" variant="subtle">
              {outcome.voidedByThisRequest ? "Voided now" : "Already voided"}
            </Badge>
          </Flex>
          <Text fontSize="sm">
            {outcome.voidedByThisRequest
              ? "The request was never posted, and its key is now voided."
              : "The request was never posted; its key had already been voided earlier."}{" "}
            This key can never create a journal. If the transaction really happened, record it
            again as a new posting; it gets a new request key.
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {[
              outcome.voidedBy
                ? `Voided by ${outcome.voidedBy === officerId ? "you" : `another officer (${outcome.voidedBy})`}`
                : null,
              outcome.voidedAt ? formatLagosTimestamp(outcome.voidedAt) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {outcome.voidId && (
            <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
              {`Void id: ${outcome.voidId}`}
            </Text>
          )}
        </>
      )}
      <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
        {`Request key: ${idempotencyKey}`}
      </Text>
      {hadLocalRecord && cleared && (
        <Text fontSize="sm" color="fg.muted">
          This browser's pending record for the request was cleared.
        </Text>
      )}
      {!cleared && (
        <Text role="alert" fontSize="sm" color="fg.error">
          This browser couldn't clear its own pending record for this request. It still blocks
          new postings here; retrying it only returns this same result.
        </Text>
      )}
      <Flex gap={2} wrap="wrap">
        {outcome.kind === "committed" && onOpenJournal && (
          <Button size="sm" variant="outline" onClick={() => onOpenJournal(outcome.journal.id)}>
            View the journal
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </Flex>
    </Stack>
  </Box>
);

export default ResolutionResult;
