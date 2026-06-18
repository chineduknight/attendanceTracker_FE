import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
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

const ComplianceTab = ({ organisationId, obligationId, onSetStartDate }: Props) => {
  const [payFor, setPayFor] = useState<ComplianceRow | null>(null);

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

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Heading size="md">{obligation?.name} compliance</Heading>
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

      <Box overflowX="auto">
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th>Name</Th>
              {isDues ? (
                <>
                  {MONTHS.map((m) => (
                    <Th key={m.value}>{m.label}</Th>
                  ))}
                  <Th>Paid</Th>
                  <Th>Balance</Th>
                  <Th>%</Th>
                </>
              ) : (
                <>
                  <Th>Status</Th>
                  <Th>Paid</Th>
                  <Th>Balance</Th>
                </>
              )}
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {payload.rows.map((row) => {
              if (!row.accountable) {
                return (
                  <Tr key={row.memberId}>
                    <Td>{row.name}</Td>
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
              return (
                <Tr key={row.memberId}>
                  <Td>{row.name}</Td>
                  {isDues ? (
                    <>
                      {MONTHS.map((m) => {
                        const status = row.months?.[String(m.value)] ?? "not-due";
                        return (
                          <Td
                            key={m.value}
                            bg={monthStatusColor(status)}
                            title={status}
                          />
                        );
                      })}
                      <Td>{formatMoney(row.totalPaid ?? 0)}</Td>
                      <Td>{formatMoney(row.balance ?? 0)}</Td>
                      <Td>{row.compliance ?? 0}%</Td>
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
          onSuccess={invalidate}
        />
      )}
    </Box>
  );
};

export default ComplianceTab;
