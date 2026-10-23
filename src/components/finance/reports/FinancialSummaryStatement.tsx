import { ReactNode } from "react";
import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import {
  FinancialReportAccountRow,
  FinancialReportCategoryTotal,
  FinancialReportMoneyGroup,
} from "components/finance/ledgerReportTypes";
import { FinancialReportPreview } from "helpers/financialReport";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  formatReportKobo,
  formatReportPeriod,
  SUMMARY_CATEGORIES_NOTE,
} from "helpers/ledgerReports";
import { formatLagosTimestamp } from "helpers/openingBalances";
import { FigureRow, ReportNotice } from "components/finance/reports/ReportParts";

/** Headings for the groups the report defines; other keys keep their label. */
const RECEIVED_HEADINGS: Record<string, string> = {
  receipts: "Income",
  member_money: "Money received for members",
};
const PAID_HEADINGS: Record<string, string> = {
  expenses: "Expenses",
  member_refunds: "Member money refunded",
};
const RECEIVED_TOTALS: Record<string, string> = {
  receipts: "Total income",
  member_money: "Total received for members",
};
const PAID_TOTALS: Record<string, string> = {
  expenses: "Total expenses",
  member_refunds: "Total refunded to members",
};
/** Member money has no category account: its status is the heading itself. */
const MEMBER_GROUP_NOTES: Record<string, string> = {
  member_money:
    "Dues, levies and other member money held for members. This is a liability, not income.",
  member_refunds: "Member money paid back. This is not an expense.",
};

const SectionHeading = ({ children }: { children: string }) => (
  <Text
    as="h5"
    fontSize="xs"
    fontWeight="bold"
    letterSpacing="wider"
    textTransform="uppercase"
    color="fg.muted"
  >
    {children}
  </Text>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box as="section" aria-label={title} borderTopWidth="1px" borderColor="border.subtle" pt={3}>
    <SectionHeading>{title}</SectionHeading>
    <Box mt={1}>{children}</Box>
  </Box>
);

const CategoryRows = ({
  categories,
  emptyText,
}: {
  categories: FinancialReportCategoryTotal[];
  emptyText: string;
}) => {
  // Zero-value categories are hidden; negative ones (reversals) stay.
  const shown = categories.filter((category) => category.amountKobo !== 0);
  if (shown.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted" py={1}>
        {emptyText}
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      {shown.map((category, index) => (
        <FigureRow
          key={`${category.accountId ?? "member"}-${index}`}
          label={category.name ?? "Unspecified"}
          value={formatKobo(category.amountKobo)}
        />
      ))}
    </Stack>
  );
};

/** One received or paid group. Member money shows only its own total. */
const GroupSection = ({
  group,
  headings,
  totals,
  emptyText,
}: {
  group: FinancialReportMoneyGroup;
  headings: Record<string, string>;
  totals: Record<string, string>;
  emptyText: string;
}) => {
  const title = headings[group.key] ?? group.label;
  const totalLabel = totals[group.key] ?? `Total ${group.label.toLowerCase()}`;
  const memberNote = MEMBER_GROUP_NOTES[group.key];
  return (
    <Section title={title}>
      {memberNote ? (
        <FigureRow strong label={totalLabel} value={formatKobo(group.totalKobo)} hint={memberNote} />
      ) : (
        <>
          <CategoryRows categories={group.categories} emptyText={emptyText} />
          <Box borderTopWidth="1px" borderColor="border.muted" mt={1}>
            <FigureRow strong label={totalLabel} value={formatKobo(group.totalKobo)} />
          </Box>
        </>
      )}
    </Section>
  );
};

const AccountRow = ({ account }: { account: FinancialReportAccountRow }) => {
  const details = [
    account.bankName,
    account.accountNumberLast4 ? `ending ${account.accountNumberLast4}` : null,
    account.state === "brought_in" && account.broughtInOn
      ? `brought into the books ${formatBusinessDate(account.broughtInOn)}`
      : null,
    account.active ? null : "inactive",
  ].filter((part): part is string => Boolean(part));
  return (
    <Flex role="group" aria-label={account.name} justify="space-between" align="baseline" gap={3} py={1}>
      <Box minW={0}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontSize="sm">{account.name}</Text>
          {!account.active && (
            <Badge colorPalette="gray" variant="subtle">
              Inactive
            </Badge>
          )}
        </Flex>
        {details.length > 0 && (
          <Text fontSize="xs" color="fg.muted">
            {details.join(" · ")}
          </Text>
        )}
      </Box>
      <Text
        fontSize="sm"
        flexShrink={0}
        css={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatReportKobo(account.carriedForwardKobo)}
      </Text>
    </Flex>
  );
};

/** The closing balance: the statement's most prominent figure. */
const ClosingBalance = ({ asOf, value }: { asOf: string; value: number | null }) => {
  const label = `Bal as at ${formatBusinessDate(asOf)}`;
  return (
    <Flex
      role="group"
      aria-label={label}
      justify="space-between"
      align="baseline"
      gap={3}
      borderTopWidth="2px"
      borderColor="border"
      pt={3}
    >
      <Text fontSize="md" fontWeight="semibold">
        {label}
      </Text>
      <Text
        fontSize={{ base: "xl", md: "2xl" }}
        fontWeight="bold"
        flexShrink={0}
        css={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatReportKobo(value)}
      </Text>
    </Flex>
  );
};

const excludedText = (account: { name: string; reason: string | null }) => {
  if (account.reason === "never_opened") return `Not included: ${account.name} (never opened, holds nothing).`;
  if (account.reason === "not_yet_in_books")
    return `Not included: ${account.name} (not yet in the books in this period).`;
  return `Not included: ${account.name}.`;
};

/**
 * The Financial Summary, in the same order and using the same figures as the
 * approved Financial Report PDF: B/F, accounts brought in, received, gross,
 * paid, closing, transfers, breakdown. Nothing here adds, nets or re-derives
 * a figure; every amount is a backend value, and an unknown one stays
 * "Unknown" rather than becoming zero.
 */
const FinancialSummaryStatement = ({ report }: { report: FinancialReportPreview }) => {
  const readAt = formatLagosTimestamp(report.readAt);
  const { statement } = report;

  return (
    <Box
      as="section"
      aria-label="Financial summary"
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
      bg="bg.panel"
      px={{ base: 3, md: 5 }}
      py={{ base: 3, md: 4 }}
    >
      <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
        <Stack gap={0.5}>
          <Text as="h4" fontSize="md" fontWeight="bold" letterSpacing="wider" textTransform="uppercase">
            Financial Summary
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {formatReportPeriod(report.period.from, report.period.to)}
          </Text>
        </Stack>
        {report.provisional && (
          <Badge colorPalette="orange" variant="subtle">
            Provisional
          </Badge>
        )}
      </Flex>

      {report.dataState === "unavailable" || !statement ? (
        <Box mt={3}>
          <ReportNotice title="Report unavailable" tone="warning">
            {[
              "The Financial Report isn't available for this period, so no figures are shown.",
              ...report.issues.map((issue) => issue.message),
            ].join(" ")}
          </ReportNotice>
        </Box>
      ) : (
        <Stack gap={3} mt={3}>
          {report.dataState === "incomplete" && (
            <ReportNotice title="Report incomplete" tone="warning">
              {[
                "Some cash or bank balances aren't known for this period, so some balances are shown as Unknown.",
                ...report.issues.map((issue) => issue.message),
              ].join(" ")}
            </ReportNotice>
          )}

          <Box as="section" aria-label="Balance brought forward">
            <FigureRow
              strong
              label="Bal B/F"
              value={formatReportKobo(statement.broughtForwardKobo)}
              hint={
                statement.broughtForwardAsOf
                  ? statement.broughtForwardBasis === "verified_opening"
                    ? `As at ${formatBusinessDate(statement.broughtForwardAsOf)}, the verified opening balance.`
                    : `As at ${formatBusinessDate(statement.broughtForwardAsOf)}.`
                  : undefined
              }
            />
          </Box>

          {statement.broughtInCount > 0 && (
            <Section title="Accounts brought into the books">
              <FigureRow
                strong
                label="Brought into the books"
                value={formatReportKobo(statement.broughtInTotalKobo)}
                hint={`${statement.broughtInCount} ${
                  statement.broughtInCount === 1 ? "opening balance" : "opening balances"
                } added to the books this period. This is not income.`}
              />
            </Section>
          )}

          {statement.receivedGroups
            .filter((group) => group.key === "receipts" || group.count > 0 || group.totalKobo !== 0)
            .map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                headings={RECEIVED_HEADINGS}
                totals={RECEIVED_TOTALS}
                emptyText={`No ${(RECEIVED_HEADINGS[group.key] ?? group.label).toLowerCase()} categories with a balance in this period.`}
              />
            ))}

          <Section title="Gross balance">
            <FigureRow strong label="Gross balance" value={formatReportKobo(statement.grossBalanceKobo)} />
          </Section>

          {statement.paidGroups
            .filter((group) => group.key === "expenses" || group.count > 0 || group.totalKobo !== 0)
            .map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                headings={PAID_HEADINGS}
                totals={PAID_TOTALS}
                emptyText={`No ${(PAID_HEADINGS[group.key] ?? group.label).toLowerCase()} categories with a balance in this period.`}
              />
            ))}

          <ClosingBalance asOf={statement.carriedForwardAsOf} value={statement.carriedForwardKobo} />

          {statement.transfersCount > 0 && (
            <Section title="Transfers between own accounts">
              <FigureRow
                strong
                label="Moved between own accounts"
                value={formatReportKobo(statement.transfersTotalKobo)}
                hint={`${statement.transfersCount} ${
                  statement.transfersCount === 1 ? "transfer" : "transfers"
                }. Not income and not expenses.`}
              />
            </Section>
          )}

          <Section title="Breakdown">
            {report.accounts && report.accounts.length > 0 ? (
              <Stack gap={0}>
                {/* Cash before bank; within each, the server's order. */}
                {[...(report.accounts ?? [])]
                  .sort((left, right) => (left.kind === right.kind ? 0 : left.kind === "cash" ? -1 : 1))
                  .map((account) => (
                    <AccountRow key={account.accountId} account={account} />
                  ))}
              </Stack>
            ) : (
              <Text fontSize="sm" color="fg.muted" py={1}>
                No cash or bank accounts are reported for this period.
              </Text>
            )}
            {report.memberMoneyHeldAtEndKobo !== null && report.memberMoneyHeldAtEndKobo !== 0 && (
              <Box borderTopWidth="1px" borderColor="border.muted" mt={1}>
                <FigureRow
                  label="Of this balance, held for members"
                  value={formatKobo(report.memberMoneyHeldAtEndKobo)}
                  hint="Dues and levies received into the books and not yet allocated."
                />
              </Box>
            )}
          </Section>

          <Box pt={1}>
            <Text fontSize="xs" color="fg.muted">
              {SUMMARY_CATEGORIES_NOTE}
            </Text>
            {report.excludedAccounts.map((account, index) => (
              <Text key={`${account.name}-${index}`} fontSize="xs" color="fg.muted">
                {excludedText(account)}
              </Text>
            ))}
            {readAt && (
              <Text fontSize="xs" color="fg.muted">
                {`Figures as at ${readAt}.`}
              </Text>
            )}
            {report.provisional && (
              <Text fontSize="xs" color="fg.muted">
                {report.lockedThrough
                  ? `Provisional: entries dated after ${formatBusinessDate(report.lockedThrough)} can still change.`
                  : "Provisional: the period isn't locked, so these figures may change."}
              </Text>
            )}
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default FinancialSummaryStatement;
