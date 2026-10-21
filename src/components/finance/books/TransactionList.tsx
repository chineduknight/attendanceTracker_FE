import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { IconType } from "react-icons";
import { FiArrowDownLeft, FiArrowUpRight, FiCornerUpLeft, FiFlag, FiRepeat, FiUser, FiFileText } from "react-icons/fi";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { TransactionKind, toTransactionRow } from "helpers/booksTransactions";
import { formatBusinessDate } from "helpers/financeCompliance";
import { JournalDetail } from "helpers/ledgerReversals";

const LOOK: Record<TransactionKind, { icon: IconType; color: string; label: string }> = {
  in: { icon: FiArrowDownLeft, color: "green.fg", label: "Money in" },
  held: { icon: FiUser, color: "green.fg", label: "Held for a member" },
  out: { icon: FiArrowUpRight, color: "red.fg", label: "Money out" },
  refund: { icon: FiArrowUpRight, color: "red.fg", label: "Refund" },
  move: { icon: FiRepeat, color: "fg", label: "Transfer" },
  applied: { icon: FiFlag, color: "fg", label: "Applied" },
  opening: { icon: FiFileText, color: "fg", label: "Opening balance" },
  reversal: { icon: FiCornerUpLeft, color: "fg", label: "Undo" },
  other: { icon: FiFileText, color: "fg", label: "Entry" },
};

/**
 * Books entries in plain words. Each row is a button opening the entry; the
 * sign and the words carry the meaning, the colour only repeats it.
 */
const TransactionList = ({
  journals,
  accounts,
  onOpen,
  label,
}: {
  journals: readonly JournalDetail[];
  accounts: readonly LedgerAccount[];
  onOpen: (journalId: string) => void;
  label: string;
}) => (
  <Box as="ul" aria-label={label} listStyleType="none" m={0} p={0} borderWidth="1px" borderColor="border" borderRadius="lg" overflow="hidden">
    {journals.map((journal) => {
      const row = toTransactionRow(journal, accounts);
      const look = LOOK[row.kind];
      return (
        <Box as="li" key={row.id} _notFirst={{ borderTopWidth: "1px", borderColor: "border.muted" }}>
          <chakra.button
            type="button"
            onClick={() => onOpen(row.id)}
            w="100%"
            minH="60px"
            px={4}
            py={2}
            textAlign="left"
            bg="bg.panel"
            cursor="pointer"
            _hover={{ bg: "bg.muted" }}
            aria-label={`${look.label}: ${row.title}, ${row.amountText}, ${row.date ? formatBusinessDate(row.date) : "undated"}`}
          >
            <Flex align="center" gap={3}>
              <Flex
                aria-hidden
                align="center"
                justify="center"
                w="36px"
                h="36px"
                borderRadius="full"
                bg="bg.muted"
                color={look.color}
                flexShrink={0}
              >
                <look.icon />
              </Flex>
              <Box flex="1" minW={0}>
                <Text fontWeight="medium" lineClamp={1}>
                  {row.title}
                </Text>
                {row.subtitle && (
                  <Text fontSize="sm" color="fg.muted" lineClamp={1}>
                    {row.subtitle}
                  </Text>
                )}
              </Box>
              <Box textAlign="right" flexShrink={0}>
                <Text fontWeight="semibold" color={look.color} css={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.amountText}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {row.date ? formatBusinessDate(row.date) : ""}
                </Text>
              </Box>
            </Flex>
          </chakra.button>
        </Box>
      );
    })}
  </Box>
);

export default TransactionList;
