import { Flex, Stack, Text, chakra } from "@chakra-ui/react";
import { FiChevronRight } from "react-icons/fi";
import { monthToDate } from "helpers/booksOverview";
import { formatReportKobo } from "helpers/ledgerReports";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerSummary } from "hooks/useLedgerReports";

/** Income and expenses so far this month, from the server's summary. */
const ThisMonth = ({
  organisationId,
  enabled,
  onOpen,
}: {
  organisationId: string;
  enabled: boolean;
  onOpen: () => void;
}) => {
  const { from, to } = monthToDate(todayInLagos());
  const { report, isLoading, isError } = useLedgerSummary(organisationId, from, to, enabled);
  const known = report?.summaryState === "known" ? report : null;
  const figure = (value: number | undefined) =>
    isLoading ? "…" : known && value !== undefined ? formatReportKobo(value) : isError ? "Couldn't load" : "Not known yet";

  return (
    <chakra.button
      type="button"
      onClick={onOpen}
      w="100%"
      textAlign="left"
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
      bg="bg.panel"
      px={4}
      py={3}
      cursor="pointer"
      _hover={{ bg: "bg.muted" }}
    >
      <Stack gap={2}>
        <Flex justify="space-between" align="center">
          <Text as="h3" fontWeight="semibold">
            This month
          </Text>
          <FiChevronRight aria-hidden />
        </Flex>
        <Flex justify="space-between">
          <Text color="fg.muted">Income</Text>
          <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
            {figure(known?.income.totalKobo)}
          </Text>
        </Flex>
        <Flex justify="space-between">
          <Text color="fg.muted">Expenses</Text>
          <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
            {figure(known?.expense.totalKobo)}
          </Text>
        </Flex>
      </Stack>
    </chakra.button>
  );
};

export default ThisMonth;
