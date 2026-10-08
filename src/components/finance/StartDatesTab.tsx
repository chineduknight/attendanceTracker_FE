import { useMemo, useState } from "react";
import { useColorModeValue } from "../ui/color-mode";
import {
  Box,
  Button,
  Center,
  Checkbox,
  Flex,
  Input,
  InputGroup,
  
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { FaChevronRight, FaSearch } from "react-icons/fa";
import { toast } from "react-toastify";
import {
  formatBusinessDate,
  REALLOCATION_WARNING,
  matchesSearch,
  matchesStartDateFilter,
  START_DATE_FILTER_LABELS,
  StartDateFilter,
} from "helpers/financeCompliance";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { useFinanceMembers, useFinancialStartDate } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import { FinanceMember } from "components/finance/financeTypes";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import ConfirmModal from "components/finance/ConfirmModal";
import FilterChips from "components/finance/FilterChips";
import FinanceSheet from "components/finance/FinanceSheet";
import StartDateForm from "components/finance/StartDateForm";

const FILTERS = Object.keys(START_DATE_FILTER_LABELS) as StartDateFilter[];

/**
 * Who is financially accountable, and from when. `financialStartDate` is
 * finance-owned: it is only ever changed here (or from a member's payment
 * sheet), never through the generic member form.
 */
const StartDatesTab = ({ organisationId }: { organisationId: string }) => {
  const terms = useTerms();
  const canManage = usePermissions().has("finance.manage");
  const { members, isLoading } = useFinanceMembers(organisationId);
  const startDate = useFinancialStartDate(organisationId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StartDateFilter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkDate, setBulkDate] = useState("");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [editing, setEditing] = useState<FinanceMember | null>(null);
  const cardBg = useColorModeValue("white", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");
  const hoverBg = useColorModeValue("gray.50", "whiteAlpha.100");

  const memberSingular = lowerTerm(terms.memberSingular);
  const memberPlural = lowerTerm(terms.memberPlural);
  const memberWord = (n: number) => (n === 1 ? memberSingular : memberPlural);

  const searched = useMemo(() => members.filter((m) => matchesSearch(m.name, search)), [members, search]);
  const shown = useMemo(() => searched.filter((m) => matchesStartDateFilter(m, filter)), [searched, filter]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f, searched.filter((m) => matchesStartDateFilter(m, f)).length]),
      ) as Record<StartDateFilter, number>,
    [searched],
  );

  const allShownSelected = shown.length > 0 && shown.every((m) => selected.has(m.id));
  // Only members who already have a date can have payments to re-apply.
  const selectedWithDates = members.filter((m) => selected.has(m.id) && m.financialStartDate).length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      shown.forEach((m) => (allShownSelected ? next.delete(m.id) : next.add(m.id)));
      return next;
    });

  const applyBulk = async () => {
    const ids = Array.from(selected);
    const { ok, failedIds, firstError, rejected } = await startDate.setMany(ids, bulkDate);
    if (rejected) return; // already toasted; keep the selection to retry
    const reason = firstError ? `: ${firstError}` : "";
    if (failedIds.length === 0) toast.success(`Start date set for ${ok} ${memberWord(ok)}`);
    else if (ok > 0) toast.warn(`Set for ${ok}, ${failedIds.length} failed${reason}`);
    else toast.error(`None were set${reason}`);
    // Keep only the failures selected so they can be retried.
    setSelected(new Set(failedIds));
    if (failedIds.length === 0) setBulkDate("");
  };

  if (isLoading) {
    return (
      <Center py={10}>
        <Spinner />
      </Center>
    );
  }

  return (
    <Stack gap={4} pb={selected.size ? 28 : 0}>
      <Box>
        <Text fontWeight="semibold">{`${terms.memberSingular} start dates`}</Text>
        <Text fontSize="sm" color={muted}>
          {`Dues and levies apply to a ${memberSingular} from their financial start date. ${terms.memberPlural} without one owe nothing.`}
        </Text>
      </Box>

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
      <FilterChips<StartDateFilter>
        label="Filter by start date"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: START_DATE_FILTER_LABELS[f], count: counts[f] }))}
      />

      {canManage && shown.length > 0 && (
        <Checkbox.Root onCheckedChange={toggleAllShown} px={1} checked={allShownSelected}><Checkbox.HiddenInput /><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Label>
          <Text fontSize="sm">{`Select all ${shown.length} shown`}</Text>
        </Checkbox.Label></Checkbox.Root>
      )}

      {shown.length === 0 ? (
        <Text color={muted} textAlign="center" py={8}>
          {`No ${memberPlural} match your search or filter.`}
        </Text>
      ) : (
        <GroupedList>
          {shown.map((m) => {
            const details = (
              <Stack gap={0.5} flex="1" minW={0} textAlign="left">
                <Text fontWeight="semibold" lineClamp={1}>
                  {m.name}
                </Text>
                <Text fontSize="sm" color={m.financialStartDate ? muted : "orange.500"}>
                  {m.financialStartDate
                    ? `From ${formatBusinessDate(m.financialStartDate)}`
                    : "No start date"}
                </Text>
              </Stack>
            );
            return (
              <GroupedListItem key={m.id} p={0}>
                <Flex align="center">
                  {canManage && (
                    <Checkbox.Root
                      size="lg"
                      pl={{ base: 3, md: 5 }}
                      py={3}
                      onCheckedChange={() => toggle(m.id)}
                      checked={selected.has(m.id)}><Checkbox.HiddenInput aria-label={`Select ${m.name}`} /><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox.Root>
                  )}
                  {canManage ? (
                    <Flex
                      align="center"
                      flex="1"
                      minW={0}
                      gap={3}
                      px={3}
                      py={3}
                      _hover={{ bg: hoverBg }}
                      _focusVisible={{ boxShadow: "outline", outline: "none" }}
                      aria-label={`Edit start date for ${m.name}`}
                      asChild><button type="button" onClick={() => setEditing(m)}>
                        {details}
                        <Box color="gray.400" aria-hidden="true" asChild><FaChevronRight /></Box>
                      </button></Flex>
                  ) : (
                    <Flex px={{ base: 3, md: 5 }} py={3} flex="1" minW={0}>
                      {details}
                    </Flex>
                  )}
                </Flex>
              </GroupedListItem>
            );
          })}
        </GroupedList>
      )}

      {canManage && selected.size > 0 && (
        <Box
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          zIndex="sticky"
          bg={cardBg}
          borderTopWidth="1px"
          boxShadow="lg"
          px={4}
          pt={3}
          pb="calc(12px + env(safe-area-inset-bottom))"
        >
          <Stack gap={2} maxW="lg" mx="auto">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">{`${selected.size} ${memberWord(selected.size)} selected`}</Text>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </Flex>
            <Flex gap={2}>
              <Input
                type="date"
                aria-label="Start date for selected"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
              <Button
                colorPalette="purple"
                flexShrink={0}
                disabled={!bulkDate}
                loading={startDate.isSaving}
                onClick={() => setConfirmBulk(true)}
              >
                Set date
              </Button>
            </Flex>
          </Stack>
        </Box>
      )}

      {editing && (
        <FinanceSheet
          isOpen
          onClose={() => setEditing(null)}
          title={editing.name}
          subtitle={
            editing.financialStartDate
              ? `Accountable from ${formatBusinessDate(editing.financialStartDate)}`
              : "No financial start date"
          }
        >
          <StartDateForm
            memberName={editing.name}
            current={editing.financialStartDate}
            isSaving={startDate.isSaving}
            onSave={async (date) => {
              const saved = await startDate.setOne(editing.id, date);
              if (saved) setEditing(null);
              return saved;
            }}
          />
        </FinanceSheet>
      )}

      <ConfirmModal
        isOpen={confirmBulk}
        title="Set start date for selected"
        body={
          bulkDate
            ? `Set the financial start date to ${formatBusinessDate(bulkDate)} for ${selected.size} selected ${memberWord(selected.size)}? They will be financially accountable from that month onward.${
                selectedWithDates
                  ? ` ${selectedWithDates} already ${selectedWithDates === 1 ? "has" : "have"} a start date. ${REALLOCATION_WARNING}`
                  : ""
              }`
            : ""
        }
        confirmLabel={`Yes, set ${selected.size}`}
        confirmColorScheme="purple"
        onConfirm={() => {
          setConfirmBulk(false);
          void applyBulk();
        }}
        onClose={() => setConfirmBulk(false)}
      />
    </Stack>
  );
};

export default StartDatesTab;
