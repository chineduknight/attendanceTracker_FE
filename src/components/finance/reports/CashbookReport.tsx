import { useState } from "react";
import { Badge, Box, Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { DateField } from "components/ui/date-field";
import { EmptyState } from "components/ui/states";
import { OptionSelect } from "components/ui/themed-select";
import { CashbookItem, CashbookPage } from "components/finance/ledgerReportTypes";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { journalTypeLabel } from "helpers/ledgerReversals";
import {
  CASHBOOK_NOT_DUES_NOTE,
  CASHBOOK_ORDER_NOTE,
  CASHBOOK_UNKNOWN_NOTE,
  cashbookAccountLabel,
  cashbookAccounts,
  cashbookDays,
  cashbookReference,
  formatReportKobo,
  formatSignedKobo,
  reportRangeIssue,
} from "helpers/ledgerReports";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerCashbook } from "hooks/useLedgerReports";
import { FigureRow, ReportGate, ReportNotice } from "components/finance/reports/ReportParts";

const CashbookRow = ({ item }: { item: CashbookItem }) => {
  const { journal } = item;
  const typeLabel = journalTypeLabel(journal.sourceType);
  const description = journal.note ?? journal.counterpartyName ?? typeLabel;
  const directionLabel = item.direction === "in" ? "Money in" : "Money out";
  // Receipts and expenses are labelled "Money in"/"Money out" already; the
  // type line is only shown when it adds something (transfer, reversal...).
  const showType = typeLabel !== description && typeLabel !== directionLabel;
  return (
    <GroupedListItem>
      <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
        <Stack gap={0.5} minW={0} flex="1 1 12rem">
          <Text fontWeight="semibold">{cashbookReference(item)}</Text>
          <Text fontSize="sm" color="fg.muted">
            {description}
          </Text>
          {showType && (
            <Text fontSize="xs" color="fg.muted">
              {typeLabel}
            </Text>
          )}
        </Stack>
        <Stack gap={0.5} align="flex-end" flexShrink={0}>
          <Text
            fontWeight="semibold"
            color={item.direction === "in" ? "green.fg" : "fg"}
            css={{ fontVariantNumeric: "tabular-nums" }}
            aria-label={`${directionLabel} ${formatReportKobo(item.amountKobo)}`}
          >
            {formatSignedKobo(item.direction, item.amountKobo)}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {directionLabel}
          </Text>
          <Text fontSize="sm" css={{ fontVariantNumeric: "tabular-nums" }}>
            {`Balance ${formatReportKobo(item.runningBalanceKobo)}`}
          </Text>
        </Stack>
      </Flex>
    </GroupedListItem>
  );
};

const CashbookPageView = ({ page, isFirstPage }: { page: CashbookPage; isFirstPage: boolean }) => {
  const days = cashbookDays(page);
  const unknown = page.balanceState === "unknown";
  return (
    <Stack gap={3}>
      <Flex align="center" gap={2} wrap="wrap">
        <Text fontWeight="semibold">{page.account.name}</Text>
        {page.account.active === false && (
          <Badge colorPalette="gray" variant="subtle">
            Inactive
          </Badge>
        )}
        {page.account.openingVerified === false && (
          <Badge colorPalette="orange" variant="subtle">
            Opening not verified
          </Badge>
        )}
      </Flex>
      {unknown && <ReportNotice title="Balance unknown" tone="warning">{CASHBOOK_UNKNOWN_NOTE}</ReportNotice>}
      <FigureRow
        strong
        label={page.items.length ? "Balance before these entries" : "Balance at the start of this period"}
        value={formatReportKobo(page.balanceBeforeKobo)}
      />
      {days.length === 0 ? (
        <EmptyState
          title="No entries in this period"
          description="Nothing moved in or out of this account in the chosen period."
        />
      ) : (
        days.map((day, index) => {
          const continuesNext = index === days.length - 1 && page.nextCursor !== null;
          const mayContinueFromPrevious = index === 0 && !isFirstPage;
          return (
            <Box as="section" key={`${day.date}-${index}`} aria-label={`Entries on ${formatBusinessDate(day.date)}`}>
              <Text as="h5" fontSize="sm" fontWeight="semibold" mb={1}>
                {formatBusinessDate(day.date)}
              </Text>
              {mayContinueFromPrevious && (
                <Text fontSize="xs" color="fg.muted" mb={1}>
                  Earlier entries for this day may be on the previous page.
                </Text>
              )}
              <GroupedList aria-label={`Cashbook entries on ${formatBusinessDate(day.date)}`}>
                {day.items.map((item) => (
                  <CashbookRow key={item.journal.id} item={item} />
                ))}
              </GroupedList>
              <FigureRow
                strong
                label={`Closing balance, ${formatBusinessDate(day.date)}`}
                hint={
                  continuesNext
                    ? "This day may continue on the next page. The closing balance covers the whole day."
                    : undefined
                }
                value={formatReportKobo(day.closingKobo)}
              />
            </Box>
          );
        })
      )}
    </Stack>
  );
};

/** What the cashbook shows; held by the panel so it survives a tab switch. */
export interface CashbookView {
  /** "" until the officer picks one: the first account is shown. */
  accountId: string;
  /** The applied window; "" for an open end. */
  from: string;
  to: string;
  /** Cursors of the pages visited; the last is the page shown ("" = first). */
  cursors: string[];
}

export const INITIAL_CASHBOOK_VIEW: CashbookView = { accountId: "", from: "", to: "", cursors: [""] };

/**
 * One cash or bank account's cashbook (RFC v0.3 §5.5): the server's rows,
 * running balances and whole-day closings, a page at a time. Nothing is
 * summed here; an unknown balance reads "Unknown", never ₦0. A different
 * account or window starts again at the first page, so a cursor never
 * travels to another report.
 */
const CashbookReport = ({
  organisationId,
  accounts,
  view,
  onViewChange,
}: {
  organisationId: string;
  accounts: LedgerAccount[] | null;
  view: CashbookView;
  onViewChange: (view: CashbookView) => void;
}) => {
  const options = cashbookAccounts(accounts);
  const [draft, setDraft] = useState({ from: view.from, to: view.to });
  const today = todayInLagos();
  const issue = reportRangeIssue(draft.from, draft.to, today);

  // The first account (active first) until the officer picks one; a choice
  // that has left the list falls back the same way, from its first page.
  const chosenKept = options.some((account) => account.id === view.accountId);
  const chosen = chosenKept ? view.accountId : (options[0]?.id ?? "");
  const cursors = chosenKept ? view.cursors : [""];
  const cursor = cursors[cursors.length - 1];
  const setCursors = (next: string[]) => onViewChange({ ...view, accountId: chosen, cursors: next });

  const query = useLedgerCashbook(
    organisationId,
    chosen,
    { from: view.from, to: view.to, cursor },
    Boolean(chosen),
  );

  if (accounts === null) {
    return (
      <EmptyState
        title="Accounts aren't available"
        description="The account list couldn't be loaded, so no cashbook can be chosen."
      />
    );
  }
  if (options.length === 0) {
    return (
      <EmptyState
        title="No cash or bank accounts yet"
        description="A cashbook is kept for each cash and bank account in the chart of accounts."
      />
    );
  }

  const applyRange = () => {
    if (!issue) onViewChange({ ...view, accountId: chosen, ...draft, cursors: [""] });
  };

  return (
    <Stack gap={4}>
      <Field.Root>
        <Field.Label>Account</Field.Label>
        <OptionSelect
          value={chosen}
          options={options.map((account) => ({ value: account.id, label: cashbookAccountLabel(account) }))}
          onChange={(accountId) => onViewChange({ ...view, accountId, cursors: [""] })}
        />
      </Field.Root>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>From</Field.Label>
          <DateField
            value={draft.from}
            max={today}
            clearable
            placeholder="Earliest"
            range={{ role: "start", start: draft.from, end: draft.to }}
            onChange={(from) => setDraft((current) => ({ ...current, from }))}
          />
        </Field.Root>
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>To</Field.Label>
          <DateField
            value={draft.to}
            max={today}
            clearable
            placeholder="Latest"
            range={{ role: "end", start: draft.from, end: draft.to }}
            onChange={(to) => setDraft((current) => ({ ...current, to }))}
          />
        </Field.Root>
        <Button
          minH="44px"
          disabled={Boolean(issue) || (draft.from === view.from && draft.to === view.to)}
          onClick={applyRange}
        >
          Show
        </Button>
      </Flex>
      {issue && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {issue}
        </Text>
      )}
      <Text fontSize="sm" color="fg.muted">
        {CASHBOOK_ORDER_NOTE}
      </Text>

      <ReportGate query={query} name="cashbook">
        {(page) => (
          <Stack gap={3}>
            <CashbookPageView page={page} isFirstPage={cursors.length === 1} />
            <Flex justify="space-between" align="center" gap={2} wrap="wrap">
              <Button
                variant="outline"
                minH="44px"
                disabled={cursors.length === 1}
                onClick={() => setCursors(cursors.slice(0, -1))}
              >
                Previous page
              </Button>
              <Text fontSize="sm" color="fg.muted">{`Page ${cursors.length}`}</Text>
              <Button
                variant="outline"
                minH="44px"
                disabled={page.nextCursor === null || query.isFetching}
                onClick={() => {
                  const next = page.nextCursor;
                  if (next) setCursors([...cursors, next]);
                }}
              >
                Next page
              </Button>
            </Flex>
          </Stack>
        )}
      </ReportGate>
      <Text fontSize="xs" color="fg.muted">
        {CASHBOOK_NOT_DUES_NOTE}
      </Text>
    </Stack>
  );
};

export default CashbookReport;
