import { ReactNode } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import JournalLines from "components/finance/JournalLines";
import {
  MEMBER_MONEY_PURPOSES,
  MEMBER_MONEY_PURPOSE_LABELS,
  MemberMoneyPurpose,
} from "components/finance/ledgerPostingTypes";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { postingMethodLabel } from "helpers/ledgerPostings";
import { JournalDetail, journalTypeLabel } from "helpers/ledgerReversals";
import { formatLagosTimestamp } from "helpers/openingBalances";

const Fact = ({ children }: { children: ReactNode }) => <Text fontSize="sm">{children}</Text>;

const purposeLabel = (purpose: string | null) =>
  purpose && (MEMBER_MONEY_PURPOSES as readonly string[]).includes(purpose)
    ? MEMBER_MONEY_PURPOSE_LABELS[purpose as MemberMoneyPurpose]
    : purpose;

/**
 * One journal exactly as the server reports it, including how it is linked
 * to a reversal. Every missing value stays missing; nothing is derived.
 */
const JournalDetailCard = ({
  journal,
  accounts,
  onOpenJournal,
}: {
  journal: JournalDetail;
  accounts: readonly LedgerAccount[] | null;
  onOpenJournal: (journalId: string) => void;
}) => {
  const method = postingMethodLabel(journal.method);
  const purpose = purposeLabel(journal.purpose);
  const reversedBy = journal.reversedBy.kind === "reversed" ? journal.reversedBy.journalId : null;

  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3} bg="bg.panel">
      <Stack gap={3}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontWeight="semibold">
            {[journalTypeLabel(journal.sourceType), journal.number].filter(Boolean).join(" ")}
          </Text>
          {journal.reversesJournalId && (
            <Badge colorPalette="purple" variant="subtle">
              Reversal
            </Badge>
          )}
          {reversedBy && (
            <Badge colorPalette="orange" variant="subtle">
              Reversed
            </Badge>
          )}
        </Flex>

        <Stack gap={1}>
          <Fact>
            {`Amount: ${journal.totalKobo === null ? "unavailable" : formatKobo(journal.totalKobo)}`}
          </Fact>
          <Fact>
            {`Business date: ${
              journal.businessDate ? formatBusinessDate(journal.businessDate) : "unavailable"
            }`}
          </Fact>
          {method && <Fact>{`Payment method: ${method}`}</Fact>}
          {journal.counterpartyName && <Fact>{`Counterparty: ${journal.counterpartyName}`}</Fact>}
          {purpose && <Fact>{`Purpose: ${purpose}`}</Fact>}
          {journal.memberMoneySourceNumber && (
            <Fact>{`Refunded from: ${journal.memberMoneySourceNumber}`}</Fact>
          )}
          {journal.reason && <Fact>{`Reason: ${journal.reason}`}</Fact>}
          {journal.reference && <Fact>{`Reference: ${journal.reference}`}</Fact>}
          {journal.externalReference && (
            <Fact>{`External reference: ${journal.externalReference}`}</Fact>
          )}
          {journal.note && (
            <Fact>{`${journal.reversesJournalId ? "Reversal reason" : "Note"}: ${journal.note}`}</Fact>
          )}
          {journal.postedAt && (
            <Text fontSize="sm" color="fg.muted">
              {`Posted: ${formatLagosTimestamp(journal.postedAt) ?? "time unavailable"}`}
            </Text>
          )}
          {journal.postedByName && (
            <Text fontSize="sm" color="fg.muted">{`Posted by: ${journal.postedByName}`}</Text>
          )}
          <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
            {`Journal id: ${journal.id}`}
          </Text>
        </Stack>

        <JournalLines journalId={journal.id} lines={journal.lines} accounts={accounts} />

        {(journal.reversesJournalId || reversedBy) && (
          <Stack gap={2}>
            {journal.reversesJournalId && (
              <Text fontSize="sm">This journal undoes an earlier entry, which stays unchanged.</Text>
            )}
            {reversedBy && (
              <Text fontSize="sm">
                This entry was undone by a linked reversal journal. It stays in the books
                unchanged.
              </Text>
            )}
            <Flex gap={2} wrap="wrap">
              {journal.reversesJournalId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenJournal(journal.reversesJournalId as string)}
                >
                  View the original entry
                </Button>
              )}
              {reversedBy && (
                <Button size="sm" variant="outline" onClick={() => onOpenJournal(reversedBy)}>
                  View the reversal
                </Button>
              )}
            </Flex>
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default JournalDetailCard;
