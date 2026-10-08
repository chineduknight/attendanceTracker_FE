import { useState } from "react";
import { Box, Button, Flex, SimpleGrid, Stack, Text, Separator } from "@chakra-ui/react";
import { formatMoney } from "helpers/financeConstants";
import {
  arrearsOf,
  balanceOf,
  expectedOf,
  isDuesObligation,
  isLiable,
  paidOf,
  standingLabel,
} from "helpers/financeCompliance";
import { usePaymentMutations, useFinancialStartDate } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import { ComplianceRow, Obligation } from "components/finance/financeTypes";
import FinanceSheet from "components/finance/FinanceSheet";
import RecordPaymentForm from "components/finance/RecordPaymentForm";
import CorrectPaymentForm from "components/finance/CorrectPaymentForm";
import StartDateForm from "components/finance/StartDateForm";
import { MonthGrid, StandingBadge } from "components/finance/ComplianceVisuals";

interface MemberPaymentSheetProps {
  organisationId: string;
  obligation: Obligation;
  row: ComplianceRow;
  onClose: () => void;
}

const Figure = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Text fontSize="xs" color="gray.500">
      {label}
    </Text>
    <Text fontWeight="bold">{value}</Text>
  </Box>
);

/**
 * Everything about one member for one obligation: where they stand, and —
 * for finance managers — recording money, correcting the record, or setting
 * the start date that makes them accountable at all.
 */
const MemberPaymentSheet = ({ organisationId, obligation, row, onClose }: MemberPaymentSheetProps) => {
  const canManage = usePermissions().has("finance.manage");
  const [mode, setMode] = useState<"record" | "correct">("record");
  const payments = usePaymentMutations(
    { organisationId, obligationId: obligation.id, memberId: row.memberId },
    onClose,
  );
  const startDate = useFinancialStartDate(organisationId);

  const body = () => {
    if (!row.accountable) {
      return (
        <Stack gap={4}>
          <Text>{`${row.name} has no financial start date, so nothing is due from them yet.`}</Text>
          {canManage && (
            <StartDateForm
              memberName={row.name}
              current={null}
              isSaving={startDate.isSaving}
              onSave={async (date) => {
                const saved = await startDate.setOne(row.memberId, date);
                if (saved) onClose();
                return saved;
              }}
            />
          )}
        </Stack>
      );
    }

    return (
      <Stack gap={4}>
        <SimpleGrid columns={3} gap={3}>
          <Figure label="Paid" value={formatMoney(paidOf(row))} />
          {row.arrears !== undefined ? (
            <>
              <Figure label="Behind" value={formatMoney(arrearsOf(row))} />
              <Figure label="Left to pay" value={formatMoney(balanceOf(row))} />
            </>
          ) : (
            <>
              <Figure label="Owing" value={formatMoney(balanceOf(row))} />
              <Figure label="Due" value={formatMoney(expectedOf(row))} />
            </>
          )}
        </SimpleGrid>
        {isDuesObligation(obligation) && mode === "record" && <MonthGrid row={row} />}
        {!isLiable(row) && (
          <Text fontSize="sm" color="gray.500">
            Their financial start date is after this levy's date, so they don't owe it.
          </Text>
        )}

        {canManage && isLiable(row) && (
          <>
            <Separator />
            {mode === "record" ? (
              <>
                {balanceOf(row) > 0 ? (
                  <RecordPaymentForm
                    obligation={obligation}
                    row={row}
                    isSaving={payments.isSaving}
                    onRecord={payments.record}
                  />
                ) : (
                  <Text fontSize="sm" color="gray.500">
                    Nothing left to pay on this obligation.
                  </Text>
                )}
                <Button variant='plain' size="sm" alignSelf="center" onClick={() => setMode("correct")}>
                  Made a mistake? Correct the record
                </Button>
              </>
            ) : (
              <>
                <CorrectPaymentForm
                  obligation={obligation}
                  memberName={row.name}
                  row={row}
                  isSaving={payments.isSaving}
                  onCorrectDues={payments.correctDues}
                  onCorrectLevy={payments.correctLevy}
                />
                <Button variant='plain' size="sm" alignSelf="center" onClick={() => setMode("record")}>
                  Back to record payment
                </Button>
              </>
            )}
          </>
        )}
      </Stack>
    );
  };

  return (
    <FinanceSheet
      isOpen
      onClose={onClose}
      title={
        <Flex align="center" gap={2} wrap="wrap">
          <span>{row.name}</span>
          <StandingBadge row={row} />
        </Flex>
      }
      subtitle={`${obligation.name} · ${standingLabel(row, obligation)}`}
    >
      {body()}
    </FinanceSheet>
  );
};

export default MemberPaymentSheet;
