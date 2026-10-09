import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Menu,
  Progress,
  NativeSelect,
  Stack,
  Text,
  Portal,
} from "@chakra-ui/react";
import { FaChevronRight, FaEllipsisV, FaFileExcel, FaFilePdf } from "react-icons/fa";
import { formatMoney } from "helpers/financeConstants";
import {
  arrearsOf,
  balanceOf,
  COLLECT_SORT_LABELS,
  CollectFilter,
  CollectSort,
  collectionPct,
  filterCounts,
  formatBusinessDate,
  formatPct,
  hasArrearsLens,
  isDuesObligation,
  isLiable,
  standingLabel,
  visibleRows,
} from "helpers/financeCompliance";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { useCompliance, useComplianceExport } from "hooks/useFinance";
import { ComplianceRow, Obligation } from "components/finance/financeTypes";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import FilterChips from "components/finance/FilterChips";
import MemberPaymentSheet from "components/finance/MemberPaymentSheet";
import { MonthStrip, StandingBadge } from "components/finance/ComplianceVisuals";
import PageLoader from "components/PageLoader";
import PinnedSearchBar from "components/PinnedSearchBar";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { usePinnedSearch } from "hooks/usePinnedSearch";

interface CollectTabProps {
  organisationId: string;
  obligations: readonly Obligation[];
  obligationId: string;
  onObligationChange: (id: string) => void;
}

const obligationTerms = (obligation: Obligation) =>
  isDuesObligation(obligation)
    ? `${formatMoney(obligation.amountPerMonth ?? 0)} per month · ${obligation.year ?? ""}`
    : `${formatMoney(obligation.amount ?? 0)} one-off${
        obligation.date ? ` · ${formatBusinessDate(obligation.date)}` : ""
      }`;

/**
 * The amount a row leads with: what is overdue when the backend measures
 * arrears, otherwise the whole-year balance (the only figure available).
 */
const amountLine = (row: ComplianceRow): { text: string; isOverdue: boolean } | null => {
  if (!row.accountable || !isLiable(row)) return null;
  if (row.arrears !== undefined) {
    return arrearsOf(row) > 0
      ? { text: `${formatMoney(arrearsOf(row))} behind`, isOverdue: true }
      : null;
  }
  return balanceOf(row) > 0
    ? { text: `${formatMoney(balanceOf(row))} owing`, isOverdue: false }
    : null;
};

const MemberRow = ({
  row,
  obligation,
  onOpen,
}: {
  row: ComplianceRow;
  obligation: Obligation;
  onOpen: () => void;
}) => {
  const amount = amountLine(row);
  return (
    <GroupedListItem p={0}>
      <Box
        w="full"
        textAlign="left"
        px={{ base: 3, md: 5 }}
        py={3}
        css={{ "@media (hover: hover)": { "&:hover": { bg: "bg.muted" } } }}
        _focusVisible={{ boxShadow: "outline", outline: "none" }}
        asChild><button type="button" onClick={onOpen}>
          <Flex align="center" gap={3}>
            <Stack gap={1.5} flex="1" minW={0}>
              <Flex align="center" gap={2} justify="space-between">
                <Text fontWeight="semibold" lineClamp={1}>
                  {row.name}
                </Text>
                <StandingBadge row={row} />
              </Flex>
              {isDuesObligation(obligation) && row.accountable && <MonthStrip row={row} />}
              <Flex justify="space-between" fontSize="sm" color="fg.muted" gap={2}>
                <Text>{standingLabel(row, obligation)}</Text>
                {amount && (
                  <Text fontWeight="medium" color={amount.isOverdue ? "red.fg" : "fg.muted"}>
                    {amount.text}
                  </Text>
                )}
              </Flex>
            </Stack>
            <Box color="fg.subtle" flexShrink={0} aria-hidden="true" asChild><FaChevronRight /></Box>
          </Flex>
        </button></Box>
    </GroupedListItem>
  );
};

/**
 * The page finance officers live on: pick an obligation, see who has paid,
 * tap a member to record money. Figures come straight from the compliance
 * report; the list only searches, filters and orders them.
 */
const CollectTab = ({ organisationId, obligations, obligationId, onObligationChange }: CollectTabProps) => {
  const terms = useTerms();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CollectFilter>("all");
  const [sort, setSort] = useState<CollectSort>("name");
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const { compliance, isLoading, isError, error, refetch, isRefetching } = useCompliance(
    organisationId,
    obligationId,
  );
  const pinnedSearch = usePinnedSearch(search);
  const excel = useComplianceExport(organisationId, obligationId, "excel");
  const pdf = useComplianceExport(organisationId, obligationId, "pdf");

  const rows = useMemo(() => compliance?.rows ?? [], [compliance]);
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const arrearsLens = hasArrearsLens(rows);
  const sortOptions = (Object.keys(COLLECT_SORT_LABELS) as CollectSort[]).filter(
    (key) => arrearsLens || key !== "behind",
  );
  const shown = useMemo(() => visibleRows(rows, { search, filter, sort }), [rows, search, filter, sort]);
  const obligation = compliance?.obligation ?? obligations.find((o) => o.id === obligationId);
  // Read the open member from the latest rows, so a refetch never shows stale figures.
  const openRow = openMemberId ? rows.find((r) => r.memberId === openMemberId) : undefined;
  const memberPlural = lowerTerm(terms.memberPlural);

  return (
    <Stack gap={4}>
      <Flex gap={2} align="center">
        <NativeSelect.Root>
          <NativeSelect.Field
            aria-label="Obligation"
            value={obligationId}
            onChange={(e) => onObligationChange(e.target.value)}
            bg="bg.panel"
            fontWeight="semibold">
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Menu.Root positioning={{
          placement: 'bottom-end'
        }}>
          <Menu.Trigger asChild><IconButton
              aria-label="Export"
              variant="outline"
              bg="bg.panel"
              minW="44px"
              h="44px"
              flexShrink={0}
              disabled={!compliance}><FaEllipsisV /></IconButton></Menu.Trigger>
          <Portal><Menu.Positioner><Menu.Content>
                <Menu.Item
                  onSelect={excel.run}
                  disabled={excel.isExporting}
                  minH="44px"
                  value="excel">
                  <FaFileExcel />
                  {excel.isExporting ? "Exporting Excel…" : "Export Excel"}
                </Menu.Item>
                <Menu.Item
                  onSelect={pdf.run}
                  disabled={pdf.isExporting}
                  minH="44px"
                  value="pdf">
                  <FaFilePdf />
                  {pdf.isExporting ? "Exporting PDF…" : "Export PDF"}
                </Menu.Item>
              </Menu.Content></Menu.Positioner></Portal>
        </Menu.Root>
      </Flex>

      {isLoading && (
        <PageLoader h="30vh" label="Loading obligation..." />
      )}
      {isError && !compliance && (
        <ErrorState
          title="Couldn't load this obligation"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      )}

      {compliance && obligation && (
        <>
          <Box bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="lg" p={4}>
            <Text fontSize="sm" color="fg.muted">
              {obligationTerms(obligation)}
            </Text>
            <Flex align="baseline" justify="space-between" mt={2} gap={2} wrap="wrap">
              <Text fontSize="2xl" fontWeight="bold" lineHeight="short">
                {formatMoney(compliance.summary.totalCollected)}
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {`collected · ${formatPct(collectionPct(compliance.summary))}`}
              </Text>
            </Flex>
            <Progress.Root
              value={collectionPct(compliance.summary)}
              colorPalette="green"
              size="sm"
              borderRadius="full"
              my={2}
              aria-label="Share collected">
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <Flex justify="space-between" fontSize="sm" color="fg.muted" gap={2} wrap="wrap">
              <Text>{`${formatMoney(compliance.summary.totalOutstanding)} left to collect`}</Text>
              <Text>{`${counts.paid} of ${counts.paid + counts.owing} paid in full`}</Text>
            </Flex>
            {compliance.summary.totalArrears !== undefined && (
              <Button
                variant="plain"
                size="sm"
                minH="44px"
                px={0}
                mt={1}
                colorPalette={compliance.summary.totalArrears > 0 ? "red" : "teal"}
                disabled={!compliance.summary.behindMembers}
                onClick={() => {
                  setFilter("behind");
                  setSort("behind");
                }}
              >
                {compliance.summary.totalArrears > 0
                  ? `${formatMoney(compliance.summary.totalArrears)} overdue · ${compliance.summary.behindMembers ?? counts.behind} behind`
                  : "No one is behind"}
              </Button>
            )}
          </Box>

          {/* Only the search bar pins (see PinnedSearchBar); sort and the
              filter chips share the row below it. */}
          <Stack gap={2}>
            <PinnedSearchBar
              pinnedSearch={pinnedSearch}
              value={search}
              onChange={setSearch}
              placeholder={`Search ${memberPlural}`}
              mt={0}
            />
            <Flex gap={2} align="center">
              <Box flex="1" minW={0}>
                <FilterChips<CollectFilter>
                  label="Filter by payment status"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All", count: counts.all },
                    ...(arrearsLens
                      ? [{ value: "behind" as const, label: "Behind", count: counts.behind }]
                      : []),
                    {
                      value: "owing",
                      label: arrearsLens ? "Not paid in full" : "Owing",
                      count: counts.owing,
                    },
                    { value: "paid", label: "Paid", count: counts.paid },
                    { value: "not-set", label: "No start date", count: counts["not-set"] },
                  ]}
                />
              </Box>
              <NativeSelect.Root w="auto" flexShrink={0}>
                <NativeSelect.Field
                  aria-label="Sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CollectSort)}
                  bg="bg.panel"
                  maxW={{ base: "9rem", md: "48" }}>
                  {sortOptions.map((key) => (
                    <option key={key} value={key}>
                      {COLLECT_SORT_LABELS[key]}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Flex>
          </Stack>

          <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
            {shown.length === 0 ? (
              <EmptyState
                title={
                  rows.length === 0
                    ? `No ${memberPlural} yet`
                    : `No ${memberPlural} match your search or filter`
                }
                action={
                  (search || filter !== "all") &&
                  rows.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Show everyone
                    </Button>
                  )
                }
              />
            ) : (
              <GroupedList>
                {shown.map((row) => (
                  <MemberRow
                    key={row.memberId}
                    row={row}
                    obligation={obligation}
                    onOpen={() => setOpenMemberId(row.memberId)}
                  />
                ))}
              </GroupedList>
            )}
          </Box>
        </>
      )}

      {openRow && obligation && (
        <MemberPaymentSheet
          key={`${obligation.id}:${openRow.memberId}`}
          organisationId={organisationId}
          obligation={obligation}
          row={openRow}
          onClose={() => setOpenMemberId(null)}
        />
      )}
    </Stack>
  );
};

export default CollectTab;
