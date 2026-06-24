import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Tfoot,
  Th,
  Thead,
  Tr,
  Badge,
} from "@chakra-ui/react";
import { FaFileExcel, FaFilePdf, FaMoneyBillWave } from "react-icons/fa";
import { toast } from "react-toastify";
import { financeRequest } from "services";
import { useQueryWrapper, queryClient } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { monthStatusColor, MONTHS, formatMoney } from "helpers/financeConstants";
import {
  ComplianceResponse,
  ComplianceRow,
  Obligation,
} from "components/finance/financeTypes";
import RecordPaymentModal from "components/finance/RecordPaymentModal";

interface Props {
  organisationId: string;
  obligationId: string;
  onSetStartDate: (memberId: string) => void;
}

type StatusFilter =
  | "all"
  | "paid"
  | "partial"
  | "unpaid"
  | "outstanding"
  | "not-accountable";

type SortKey = "" | "name" | "paid" | "balance" | "compliance";

const OVERALL_BADGE_COLOR: Record<string, string> = {
  paid: "green",
  partial: "yellow",
  unpaid: "red",
};

// Sticky styles keep the # and Name columns visible while the month grid scrolls
// horizontally, and the header row visible while the body scrolls vertically.
// zIndex order: body sticky col (1) < sticky header row (2) < sticky corner (3).
const NUM_W = "44px";
const STICKY_NUM = {
  position: "sticky" as const,
  left: 0,
  width: NUM_W,
  minWidth: NUM_W,
  bg: "white",
  zIndex: 1,
};
const STICKY_NAME = {
  position: "sticky" as const,
  left: NUM_W,
  bg: "white",
  zIndex: 1,
};
const HEADER_CELL = { position: "sticky" as const, top: 0, bg: "white", zIndex: 2 };
const HEADER_NUM = {
  position: "sticky" as const,
  top: 0,
  left: 0,
  width: NUM_W,
  minWidth: NUM_W,
  bg: "white",
  zIndex: 3,
};
const HEADER_NAME = {
  position: "sticky" as const,
  top: 0,
  left: NUM_W,
  bg: "white",
  zIndex: 3,
};
// Vertical gridlines so each month cell maps clearly to its column.
const MONTH_CELL = {
  borderLeftWidth: "1px",
  borderRightWidth: "1px",
  borderColor: "gray.200",
};

const LEGEND = [
  { status: "paid" as const, label: "Paid" },
  { status: "partial" as const, label: "Partial" },
  { status: "unpaid" as const, label: "Unpaid" },
  { status: "not-due" as const, label: "Not due / before start" },
];

const ComplianceTab = ({ organisationId, obligationId, onSetStartDate }: Props) => {
  const [payFor, setPayFor] = useState<ComplianceRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // --- ALL hooks unconditionally at the top ---

  const complianceUrl = obligationId
    ? convertParamsToString(financeRequest.COMPLIANCE, {
        organisationId,
        id: obligationId,
      })
    : "";

  const { data, isLoading } = useQueryWrapper(
    ["finance-compliance", organisationId, obligationId],
    complianceUrl,
    { enabled: Boolean(obligationId) }
  );

  const excelUrl = obligationId
    ? convertParamsToString(financeRequest.COMPLIANCE_EXPORT_EXCEL, {
        organisationId,
        id: obligationId,
      })
    : "";

  const pdfUrl = obligationId
    ? convertParamsToString(financeRequest.COMPLIANCE_EXPORT_PDF, {
        organisationId,
        id: obligationId,
      })
    : "";

  const handleExportSuccess = (response: any, fmt: "Excel" | "PDF") => {
    const exportUrl =
      typeof response?.data === "string" ? response.data.trim() : "";
    if (exportUrl) {
      window.open(exportUrl, "_blank", "noopener,noreferrer");
      return;
    }
    toast.error(
      typeof response?.error === "string"
        ? response.error
        : `Failed to export ${fmt}.`
    );
  };

  const handleExportError = (err: any, fmt: "Excel" | "PDF") => {
    const statusCode = err?.response?.status;
    if (statusCode === 401) return;
    const apiError = err?.response?.data?.error;
    let message: string;
    if (Array.isArray(apiError)) {
      message = apiError.filter(Boolean).join(", ");
    } else if (typeof apiError === "string" && apiError.trim()) {
      message = apiError;
    } else {
      message = `Failed to export ${fmt}. Please try again.`;
    }
    toast.error(message);
  };

  const { refetch: refetchExcel, isFetching: isExportingExcel } =
    useQueryWrapper(
      ["finance-compliance-export-excel", organisationId, obligationId],
      excelUrl,
      {
        enabled: false,
        onSuccess: (r: any) => handleExportSuccess(r, "Excel"),
        onError: (err: any) => handleExportError(err, "Excel"),
      }
    );

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    ["finance-compliance-export-pdf", organisationId, obligationId],
    pdfUrl,
    {
      enabled: false,
      onSuccess: (r: any) => handleExportSuccess(r, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    }
  );

  // --- Conditional early returns AFTER all hooks ---

  if (!obligationId) {
    return (
      <Text>Select an obligation from the Obligations tab to view compliance.</Text>
    );
  }

  if (isLoading) return <Spinner />;

  const payload: ComplianceResponse | undefined = data?.data;

  if (!payload) return <Text>No compliance data.</Text>;

  const obligation = payload.obligation as Obligation | undefined;
  const isDues = obligation?.type === "dues";

  const invalidate = () =>
    queryClient.invalidateQueries(["finance-compliance", organisationId, obligationId]);

  // A member's overall status across the obligation, used for the status filter
  // and the per-row summary badge.
  const overallStatus = (row: ComplianceRow): "paid" | "partial" | "unpaid" => {
    if (isDues) {
      const due = Object.values(row.months ?? {}).filter((s) => s !== "not-due");
      if (due.length === 0) return "paid";
      if (due.every((s) => s === "paid")) return "paid";
      if (due.every((s) => s === "unpaid")) return "unpaid";
      return "partial";
    }
    return (row.status as "paid" | "partial" | "unpaid") ?? "unpaid";
  };

  const paidOf = (row: ComplianceRow) => (isDues ? row.totalPaid : row.paid) ?? 0;
  const balanceOf = (row: ComplianceRow) => row.balance ?? 0;

  // The API's `compliance` field counts fully-paid months, so a sub-month
  // partial reads 0%. Compute an amount-based percentage so any payment shows.
  const compliancePct = (row: ComplianceRow) => {
    const expected = row.totalExpected ?? paidOf(row) + balanceOf(row);
    if (!expected) return 0;
    return (paidOf(row) / expected) * 100;
  };
  const formatPct = (n: number) => (n > 0 && n < 1 ? "<1%" : `${Math.round(n)}%`);

  const term = search.trim().toLowerCase();
  const filteredRows = payload.rows.filter((row) => {
    if (term && !row.name.toLowerCase().includes(term)) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "not-accountable") return !row.accountable;
    if (!row.accountable) return false; // status filters apply to accountable members
    if (statusFilter === "outstanding") return overallStatus(row) !== "paid";
    return overallStatus(row) === statusFilter;
  });

  const displayRows = sortKey
    ? [...filteredRows].sort((a, b) => {
        // Non-accountable rows have no figures — always keep them last.
        if (a.accountable !== b.accountable) return a.accountable ? -1 : 1;
        let cmp = 0;
        if (sortKey === "name") cmp = a.name.localeCompare(b.name);
        else if (sortKey === "paid") cmp = paidOf(a) - paidOf(b);
        else if (sortKey === "balance") cmp = balanceOf(a) - balanceOf(b);
        else if (sortKey === "compliance")
          cmp = compliancePct(a) - compliancePct(b);
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filteredRows;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const accountableShown = displayRows.filter((r) => r.accountable);
  const totalsPaid = accountableShown.reduce((s, r) => s + paidOf(r), 0);
  const totalsBalance = accountableShown.reduce((s, r) => s + balanceOf(r), 0);

  const totalCols = isDues ? 18 : 6; // #, Name, [grid...], Action

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Box>
          <Heading size="md">{obligation?.name} compliance</Heading>
          <Text fontSize="sm" color="gray.600">
            {isDues
              ? `${formatMoney(obligation?.amountPerMonth ?? 0)} / month`
              : `${formatMoney(obligation?.amount ?? 0)} one-off levy`}
          </Text>
        </Box>
        <Flex gap={2}>
          <Button
            leftIcon={<FaFileExcel />}
            size="sm"
            colorScheme="green"
            variant="outline"
            isLoading={isExportingExcel}
            onClick={() => refetchExcel()}
          >
            Excel
          </Button>
          <Button
            leftIcon={<FaFilePdf />}
            size="sm"
            colorScheme="red"
            variant="outline"
            isLoading={isExportingPdf}
            onClick={() => refetchPdf()}
          >
            PDF
          </Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={[2, 4]} spacing={4} mb={6}>
        <Stat>
          <StatLabel>Members</StatLabel>
          <StatNumber>{payload.summary.totalMembers}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>Accountable</StatLabel>
          <StatNumber>{payload.summary.accountableMembers}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>Collected</StatLabel>
          <StatNumber>{formatMoney(payload.summary.totalCollected)}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>Outstanding</StatLabel>
          <StatNumber>{formatMoney(payload.summary.totalOutstanding)}</StatNumber>
        </Stat>
      </SimpleGrid>

      <Flex gap={3} mb={3} wrap="wrap" align="center">
        <Input
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxW="xs"
          size="sm"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          maxW="2xs"
          size="sm"
        >
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
          <option value="outstanding">Outstanding (owing)</option>
          <option value="not-accountable">Not accountable</option>
        </Select>
        <Text fontSize="sm" color="gray.500">
          Showing {displayRows.length} of {payload.rows.length}
        </Text>
      </Flex>

      <Flex gap={4} mb={3} wrap="wrap" align="center">
        {LEGEND.map((item) => (
          <Flex key={item.status} align="center" gap={1.5}>
            <Box
              w="14px"
              h="14px"
              borderRadius="sm"
              borderWidth="1px"
              borderColor="gray.300"
              bg={monthStatusColor(item.status)}
            />
            <Text fontSize="xs" color="gray.600">
              {item.label}
            </Text>
          </Flex>
        ))}
      </Flex>

      <Box overflow="auto" maxH={["60vh", "70vh"]}>
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th sx={HEADER_NUM}>#</Th>
              <Th sx={HEADER_NAME} cursor="pointer" onClick={() => toggleSort("name")}>
                Name{sortArrow("name")}
              </Th>
              {isDues ? (
                <>
                  {MONTHS.map((m) => (
                    <Th key={m.value} sx={{ ...HEADER_CELL, ...MONTH_CELL }}>
                      {m.label}
                    </Th>
                  ))}
                  <Th sx={HEADER_CELL} cursor="pointer" onClick={() => toggleSort("paid")}>
                    Paid{sortArrow("paid")}
                  </Th>
                  <Th sx={HEADER_CELL} cursor="pointer" onClick={() => toggleSort("balance")}>
                    Balance{sortArrow("balance")}
                  </Th>
                  <Th sx={HEADER_CELL} cursor="pointer" onClick={() => toggleSort("compliance")}>
                    %{sortArrow("compliance")}
                  </Th>
                </>
              ) : (
                <>
                  <Th sx={HEADER_CELL}>Status</Th>
                  <Th sx={HEADER_CELL} cursor="pointer" onClick={() => toggleSort("paid")}>
                    Paid{sortArrow("paid")}
                  </Th>
                  <Th sx={HEADER_CELL} cursor="pointer" onClick={() => toggleSort("balance")}>
                    Balance{sortArrow("balance")}
                  </Th>
                </>
              )}
              <Th sx={HEADER_CELL}>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {displayRows.length === 0 && (
              <Tr>
                <Td colSpan={totalCols}>
                  <Text color="gray.500" py={2}>
                    No members match your search or filter.
                  </Text>
                </Td>
              </Tr>
            )}
            {displayRows.map((row, index) => {
              if (!row.accountable) {
                return (
                  <Tr key={row.memberId}>
                    <Td sx={STICKY_NUM}>{index + 1}</Td>
                    <Td sx={STICKY_NAME}>{row.name}</Td>
                    {/* colSpan: dues = 12 months + Paid/Balance/% + Action = 16; levy = Status/Paid/Balance + Action = 4 */}
                    <Td colSpan={isDues ? 16 : 4}>
                      <Flex align="center" gap={3}>
                        <Badge colorScheme="gray">not accountable</Badge>
                        <Button
                          size="xs"
                          colorScheme="purple"
                          variant="outline"
                          onClick={() => onSetStartDate(row.memberId)}
                        >
                          Set start date
                        </Button>
                      </Flex>
                    </Td>
                  </Tr>
                );
              }
              const os = overallStatus(row);
              return (
                <Tr key={row.memberId}>
                  <Td sx={STICKY_NUM}>{index + 1}</Td>
                  <Td sx={STICKY_NAME}>
                    <Flex align="center" gap={2}>
                      <Text>{row.name}</Text>
                      {isDues && (
                        <Badge colorScheme={OVERALL_BADGE_COLOR[os]}>{os}</Badge>
                      )}
                    </Flex>
                  </Td>
                  {isDues ? (
                    <>
                      {MONTHS.map((m) => {
                        const status = row.months?.[String(m.value)] ?? "not-due";
                        return (
                          <Td
                            key={m.value}
                            bg={monthStatusColor(status)}
                            sx={MONTH_CELL}
                            title={`${m.label}: ${status} — click to record`}
                            cursor="pointer"
                            onClick={() => setPayFor(row)}
                          />
                        );
                      })}
                      <Td>{formatMoney(row.totalPaid ?? 0)}</Td>
                      <Td>{formatMoney(row.balance ?? 0)}</Td>
                      <Td>{formatPct(compliancePct(row))}</Td>
                    </>
                  ) : (
                    <>
                      <Td bg={monthStatusColor(row.status ?? "not-due")}>
                        {row.status}
                      </Td>
                      <Td>{formatMoney(row.paid ?? 0)}</Td>
                      <Td>{formatMoney(row.balance ?? 0)}</Td>
                    </>
                  )}
                  <Td>
                    <Button
                      size="xs"
                      colorScheme="green"
                      variant="solid"
                      leftIcon={<FaMoneyBillWave />}
                      onClick={() => setPayFor(row)}
                    >
                      Record payment
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
          {accountableShown.length > 0 && (
            <Tfoot>
              <Tr fontWeight="bold">
                <Td sx={STICKY_NUM} />
                <Td sx={STICKY_NAME}>Total</Td>
                {isDues ? (
                  <>
                    {MONTHS.map((m) => (
                      <Td key={m.value} sx={MONTH_CELL} />
                    ))}
                    <Td>{formatMoney(totalsPaid)}</Td>
                    <Td>{formatMoney(totalsBalance)}</Td>
                    <Td />
                  </>
                ) : (
                  <>
                    <Td />
                    <Td>{formatMoney(totalsPaid)}</Td>
                    <Td>{formatMoney(totalsBalance)}</Td>
                  </>
                )}
                <Td />
              </Tr>
            </Tfoot>
          )}
        </Table>
      </Box>

      {payFor && obligation && (
        <RecordPaymentModal
          isOpen={!!payFor}
          onClose={() => setPayFor(null)}
          organisationId={organisationId}
          obligation={obligation}
          memberId={payFor.memberId}
          memberName={payFor.name}
          complianceRow={payFor}
          onSuccess={invalidate}
        />
      )}
    </Box>
  );
};

export default ComplianceTab;
