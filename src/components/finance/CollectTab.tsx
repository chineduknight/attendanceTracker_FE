import { useMemo, useState } from "react";
import { useColorModeValue } from "../ui/color-mode";
import {
  Box,
  Button,
  Center,
  Flex,
  IconButton,
  Input,
  InputGroup,
  
  Menu,
  Progress,
  NativeSelect,
  Spinner,
  Stack,
  Text,
  Portal,
} from "@chakra-ui/react";
import { FaChevronRight, FaEllipsisV, FaFileExcel, FaFilePdf, FaSearch } from "react-icons/fa";
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
  const muted = useColorModeValue("gray.600", "gray.300");
  const behindColor = useColorModeValue("red.600", "red.300");
  const hoverBg = useColorModeValue("gray.50", "whiteAlpha.100");
  const amount = amountLine(row);
  return (
    <GroupedListItem p={0}>
      <Box
        w="full"
        textAlign="left"
        px={{ base: 3, md: 5 }}
        py={3}
        _hover={{ bg: hoverBg }}
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
              <Flex justify="space-between" fontSize="sm" color={muted} gap={2}>
                <Text>{standingLabel(row, obligation)}</Text>
                {amount && (
                  <Text fontWeight="medium" color={amount.isOverdue ? behindColor : muted}>
                    {amount.text}
                  </Text>
                )}
              </Flex>
            </Stack>
            <Box color="gray.400" flexShrink={0} aria-hidden="true" asChild><FaChevronRight /></Box>
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
  const { compliance, isLoading, isError } = useCompliance(organisationId, obligationId);
  const excel = useComplianceExport(organisationId, obligationId, "excel");
  const pdf = useComplianceExport(organisationId, obligationId, "pdf");
  const cardBg = useColorModeValue("white", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");

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
            bg={cardBg}
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
              bg={cardBg}
              disabled={!compliance}><FaEllipsisV /></IconButton></Menu.Trigger>
          <Portal><Menu.Positioner><Menu.Content>
                <Menu.Item
                  onSelect={excel.run}
                  disabled={excel.isExporting}
                  value='item-0'>
                  <FaFileExcel />
                  {excel.isExporting ? "Exporting Excel…" : "Export Excel"}
                </Menu.Item>
                <Menu.Item
                  onSelect={pdf.run}
                  disabled={pdf.isExporting}
                  value='item-1'>
                  <FaFilePdf />
                  {pdf.isExporting ? "Exporting PDF…" : "Export PDF"}
                </Menu.Item>
              </Menu.Content></Menu.Positioner></Portal>
        </Menu.Root>
      </Flex>

      {isLoading && (
        <Center py={10}>
          <Spinner />
        </Center>
      )}
      {isError && <Text color="red.500">Couldn't load this obligation. Please try again.</Text>}

      {compliance && obligation && (
        <>
          <Box bg={cardBg} borderWidth="1px" borderRadius="lg" p={4}>
            <Text fontSize="sm" color={muted}>
              {obligationTerms(obligation)}
            </Text>
            <Flex align="baseline" justify="space-between" mt={2} gap={2} wrap="wrap">
              <Text fontSize="2xl" fontWeight="bold" lineHeight="short">
                {formatMoney(compliance.summary.totalCollected)}
              </Text>
              <Text fontSize="sm" color={muted}>
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
            <Flex justify="space-between" fontSize="sm" color={muted} gap={2} wrap="wrap">
              <Text>{`${formatMoney(compliance.summary.totalOutstanding)} left to collect`}</Text>
              <Text>{`${counts.paid} of ${counts.paid + counts.owing} paid in full`}</Text>
            </Flex>
            {compliance.summary.totalArrears !== undefined && (
              <Button
                variant='plain'
                size="sm"
                mt={2}
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

          <Stack gap={2}>
            <Flex gap={2}>
              <InputGroup
                startElement={<FaSearch />}
                startElementProps={{ pointerEvents: "none", color: "gray.400" }}
              >
                <Input
                  type="search"
                  placeholder={`Search ${memberPlural}`}
                  aria-label={`Search ${memberPlural}`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  bg={cardBg}
                />
              </InputGroup>
              <NativeSelect.Root>
                <NativeSelect.Field
                  aria-label="Sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CollectSort)}
                  bg={cardBg}
                  w={{ base: "40%", md: "48" }}
                  flexShrink={0}>
                  {sortOptions.map((key) => (
                    <option key={key} value={key}>
                      {COLLECT_SORT_LABELS[key]}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Flex>
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
          </Stack>

          {shown.length === 0 ? (
            <Stack align="center" py={8} gap={3} textAlign="center">
              <Text color={muted}>
                {rows.length === 0
                  ? `No ${memberPlural} yet.`
                  : `No ${memberPlural} match your search or filter.`}
              </Text>
              {(search || filter !== "all") && rows.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Show everyone
                </Button>
              )}
            </Stack>
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
