import { Box, Flex, Text } from "@chakra-ui/react";
import { LedgerAccount, LedgerJournalLine } from "components/finance/ledgerTypes";
import { formatKobo } from "helpers/financeConstants";

/**
 * A journal's debit and credit lines exactly as the server sent them. A line
 * value this build can't read says so; nothing is rounded or guessed.
 */
const JournalLines = ({
  journalId,
  lines,
  accounts,
}: {
  journalId: string;
  lines: readonly LedgerJournalLine[];
  accounts: readonly LedgerAccount[] | null;
}) => {
  const accountNames = new Map((accounts ?? []).map((account) => [account.id, account.name]));
  const accountName = (accountId: string) =>
    accountNames.get(accountId) ??
    (accountId ? `Unknown account (${accountId})` : "Unknown account");

  if (lines.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No line detail available
      </Text>
    );
  }
  return (
    <Box
      as="ul"
      listStyleType="none"
      m={0}
      p={0}
      borderTopWidth="1px"
      borderColor="border.muted"
    >
      {lines.map((line, index) => (
        <Flex
          as="li"
          key={`${journalId}-${index}`}
          justify="space-between"
          align="baseline"
          gap={3}
          py={1}
          borderTopWidth={index === 0 ? 0 : "1px"}
          borderColor="border.muted"
        >
          <Text fontSize="sm" flex="1" minW={0}>
            {accountName(line.accountId)}
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {line.side === "debit"
              ? "Debit"
              : line.side === "credit"
                ? "Credit"
                : "Side unavailable"}
          </Text>
          <Text
            fontSize="sm"
            fontWeight="medium"
            css={{ fontVariantNumeric: "tabular-nums" }}
          >
            {line.amountKobo === null ? "Amount unavailable" : formatKobo(line.amountKobo)}
          </Text>
        </Flex>
      ))}
    </Box>
  );
};

export default JournalLines;
