import { useState } from "react";
import { Badge, Box, Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { DateField } from "components/ui/date-field";
import { EmptyState } from "components/ui/states";
import { BalancesReport as BalancesReportData } from "components/finance/ledgerReportTypes";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import {
  accountTypeLabel,
  asOfIssue,
  BALANCES_DIRECTION_NOTE,
  BalanceRow,
  balanceGroups,
  formatReportKobo,
  MONEY_TOTAL_UNKNOWN_NOTE,
} from "helpers/ledgerReports";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerBalances } from "hooks/useLedgerReports";
import { FigureRow, ReportGate } from "components/finance/reports/ReportParts";

const BalanceItem = ({ row }: { row: BalanceRow }) => {
  const { account, balance } = row;
  return (
    <GroupedListItem>
      <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
        <Stack gap={0.5} minW={0} flex="1 1 10rem">
          <Text fontWeight="semibold">
            {account?.name ?? `Unknown account (${balance.accountId})`}
          </Text>
          <Flex gap={2} align="center" wrap="wrap">
            <Text fontSize="sm" color="fg.muted">
              {account ? accountTypeLabel(account) : "Account type unavailable"}
            </Text>
            {account?.active !== null && account?.active !== undefined && (
              <Badge colorPalette={account.active ? "green" : "gray"} variant="subtle">
                {account.active ? "Active" : "Inactive"}
              </Badge>
            )}
          </Flex>
        </Stack>
        <Text
          fontWeight="semibold"
          flexShrink={0}
          css={{ fontVariantNumeric: "tabular-nums" }}
          color={balance.balanceKobo === null ? "fg.muted" : undefined}
        >
          {formatReportKobo(balance.balanceKobo)}
        </Text>
      </Flex>
    </GroupedListItem>
  );
};

const BalancesView = ({
  report,
  accounts,
}: {
  report: BalancesReportData;
  accounts: LedgerAccount[];
}) => {
  const groups = balanceGroups(report, accounts);
  return (
    <Stack gap={4}>
      <Text fontWeight="semibold">{`Balances at the end of ${formatBusinessDate(report.asOf)}`}</Text>
      <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" px={{ base: 3, md: 5 }} py={2}>
        <FigureRow
          strong
          label="Total money (cash and bank)"
          value={formatReportKobo(report.moneyTotalKobo)}
          hint={report.moneyTotalKobo === null ? MONEY_TOTAL_UNKNOWN_NOTE : undefined}
        />
      </Box>
      {groups.length === 0 ? (
        <EmptyState title="No finance accounts configured" />
      ) : (
        groups.map((group) => (
          <Box as="section" key={group.key} aria-label={group.title}>
            <Text as="h5" fontSize="sm" fontWeight="semibold" mb={1}>
              {group.title}
            </Text>
            <GroupedList aria-label={`${group.title} balances`}>
              {group.rows.map((row) => (
                <BalanceItem key={row.balance.accountId} row={row} />
              ))}
            </GroupedList>
          </Box>
        ))
      )}
      <Text fontSize="xs" color="fg.muted">
        {BALANCES_DIRECTION_NOTE}
      </Text>
    </Stack>
  );
};

/**
 * Every account's balance at the end of a day (RFC v0.3 §8.4), exactly as
 * the server reports it in the account's normal direction. The money total
 * is the server's; it is never re-added from the rows shown.
 */
const BalancesReport = ({
  organisationId,
  accounts,
  asOf,
  onAsOfChange,
}: {
  organisationId: string;
  accounts: LedgerAccount[] | null;
  /** The applied date, held by the panel; "" asks for the server's default (today in Lagos). */
  asOf: string;
  onAsOfChange: (asOf: string) => void;
}) => {
  const [draft, setDraft] = useState(asOf);
  const today = todayInLagos();
  const issue = asOfIssue(draft, today);
  const query = useLedgerBalances(organisationId, asOf, accounts !== null);

  if (accounts === null) {
    return (
      <EmptyState
        title="Accounts aren't available"
        description="The account list couldn't be loaded, so balances can't be labelled. No figures are shown."
      />
    );
  }

  return (
    <Stack gap={4}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 12rem" invalid={Boolean(issue)}>
          <Field.Label>As of</Field.Label>
          <DateField
            value={draft}
            max={today}
            clearable
            placeholder="Today"
            onChange={setDraft}
          />
        </Field.Root>
        <Button minH="44px" disabled={Boolean(issue) || draft === asOf} onClick={() => onAsOfChange(draft)}>
          Show
        </Button>
      </Flex>
      {issue && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {issue}
        </Text>
      )}
      <ReportGate query={query} name="account balances">
        {(report) => <BalancesView report={report} accounts={accounts} />}
      </ReportGate>
    </Stack>
  );
};

export default BalancesReport;
