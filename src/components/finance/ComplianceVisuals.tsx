import { Badge, Box, Flex, SimpleGrid, Text } from "@chakra-ui/react";
import { useColorModeValue } from "../ui/color-mode";
import { MONTHS, statusMeta } from "helpers/financeConstants";
import { isBehind, isLiable, overallStatus } from "helpers/financeCompliance";
import { ComplianceRow, MonthStatus } from "components/finance/financeTypes";

const monthStatus = (row: ComplianceRow, month: number): MonthStatus =>
  row.months?.[String(month)] ?? "not-due";

/** Tinted cell colours that stay readable in light and dark mode. */
const useStatusTint = () => {
  const shade = useColorModeValue("100", "600");
  const text = useColorModeValue("gray.800", "whiteAlpha.900");
  return { tint: (status: MonthStatus) => `${statusMeta(status).scheme}.${shade}`, text };
};

/** Overall standing as a text badge; never colour alone. */
export const StandingBadge = ({ row }: { row: ComplianceRow }) => {
  if (!row.accountable) return <Badge colorPalette="purple">No start date</Badge>;
  if (!isLiable(row)) return <Badge colorPalette="gray">Not liable</Badge>;
  const status = overallStatus(row);
  // With the arrears lens, an unfinished year is only a problem once overdue.
  if (row.arrears !== undefined && status !== "paid") {
    return isBehind(row) ? (
      <Badge colorPalette="red">Behind</Badge>
    ) : (
      <Badge colorPalette="teal">Up to date</Badge>
    );
  }
  const meta = statusMeta(status);
  return <Badge colorPalette={meta.scheme}>{meta.label}</Badge>;
};

/**
 * Compact 12-month strip for a list row. Letters keep each cell's month
 * visible; the whole strip is announced as one readable sentence.
 */
export const MonthStrip = ({ row }: { row: ComplianceRow }) => {
  const { tint, text } = useStatusTint();
  const description = MONTHS.map(
    (m) => `${m.label} ${statusMeta(monthStatus(row, m.value)).label.toLowerCase()}`,
  ).join(", ");
  return (
    <Flex role="img" aria-label={description} gap="2px" w="full" maxW="sm">
      {MONTHS.map((m) => (
        <Box
          key={m.value}
          flex="1"
          h="18px"
          borderRadius="sm"
          bg={tint(monthStatus(row, m.value))}
          color={text}
          fontSize="2xs"
          fontWeight="semibold"
          lineHeight="18px"
          textAlign="center"
          aria-hidden="true"
        >
          {m.label[0]}
        </Box>
      ))}
    </Flex>
  );
};

/** Full month breakdown for the member sheet: month name and status in words. */
export const MonthGrid = ({ row }: { row: ComplianceRow }) => {
  const { tint, text } = useStatusTint();
  return (
    <SimpleGrid as="ul" listStyleType="none" columns={{ base: 4, sm: 6 }} gap={1.5}>
      {MONTHS.map((m) => {
        const status = monthStatus(row, m.value);
        return (
          <Box
            as="li"
            key={m.value}
            bg={tint(status)}
            color={text}
            borderRadius="md"
            px={1}
            py={1.5}
            textAlign="center"
          >
            <Text fontSize="xs" fontWeight="bold">
              {m.label}
            </Text>
            <Text fontSize="2xs">{statusMeta(status).label}</Text>
          </Box>
        );
      })}
    </SimpleGrid>
  );
};
