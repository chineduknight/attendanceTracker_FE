import { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, SimpleGrid, Stack, Text, Separator } from "@chakra-ui/react";
import { formatMoney } from "helpers/financeConstants";
import {
  arrearsOf,
  balanceOf,
  expectedOf,
  isDuesObligation,
  isLiable,
  isUnknownAmount,
  paidOf,
  standingLabel,
  UNAPPLIED_CREDIT_EXPLANATION,
  unappliedCreditOf,
} from "helpers/financeCompliance";
import { correctionGuardOf, sameCorrectionGuard } from "helpers/correctionGuard";
import { CorrectionRejection, usePaymentMutations, useFinancialStartDate } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import { ComplianceRow, CorrectionGuard, Obligation } from "components/finance/financeTypes";
import FinanceSheet from "components/finance/FinanceSheet";
import RecordPaymentForm from "components/finance/RecordPaymentForm";
import CorrectPaymentForm from "components/finance/CorrectPaymentForm";
import StartDateForm from "components/finance/StartDateForm";
import { MonthGrid, StandingBadge } from "components/finance/ComplianceVisuals";

interface MemberPaymentSheetProps {
  organisationId: string;
  obligation: Obligation;
  /** The member's latest row: it follows refetches while the sheet is open. */
  row: ComplianceRow;
  /** When `row` was fetched. */
  rowUpdatedAt: number;
  onReload: () => void;
  isReloading: boolean;
  onClose: () => void;
}

/**
 * What the officer saw when they opened the correction editor. The guard is
 * captured here, once, and only this copy is ever sent: picking up a newer
 * guard for values typed against older figures would defeat the check.
 */
interface CorrectionSnapshot {
  row: ComplianceRow;
  guard: CorrectionGuard | null;
}

export const MISSING_GUARD_MESSAGE =
  "Please refresh the page after the Finance update before correcting this payment. Recording new payments still works.";
export const OUTDATED_APP_MESSAGE =
  "This correction wasn't saved because this page is older than the latest Finance update. Refresh the page, then make the correction again.";

/**
 * The correction's figures are out of date: the backend refused it (409), or
 * a refetch showed the record changed while the editor was open. The entered
 * values are already gone; the officer reloads, reviews and starts again.
 */
const RecordChangedNotice = ({
  memberName,
  refused,
  reloaded,
  isReloading,
  onReload,
  onReview,
}: {
  memberName: string;
  refused: boolean;
  reloaded: boolean;
  isReloading: boolean;
  onReload: () => void;
  onReview: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Move focus here so keyboard and screen-reader users land on the news.
  useEffect(() => ref.current?.focus(), []);
  return (
    <Stack
      ref={ref}
      tabIndex={-1}
      role="alert"
      gap={2}
      p={3}
      borderWidth="1px"
      borderColor="border.warning"
      bg="bg.warning"
      borderRadius="md"
      outline="none"
    >
      <Text fontWeight="semibold" color="fg.warning">
        Record changed
      </Text>
      <Text fontSize="sm">
        {refused
          ? `Your correction was not saved. Someone changed this payment record or ${memberName}'s financial start date after you opened it.`
          : `This payment record or ${memberName}'s financial start date changed while you were correcting it, so your entries were cleared.`}
      </Text>
      <Text fontSize="sm">Reload and review the latest figures, then enter the correction again.</Text>
      {reloaded ? (
        <Button size="sm" minH="44px" colorPalette="purple" onClick={onReview}>
          Review and correct again
        </Button>
      ) : (
        <Button size="sm" minH="44px" colorPalette="purple" loading={isReloading} loadingText="Reloading…" onClick={onReload}>
          Reload latest
        </Button>
      )}
    </Stack>
  );
};

const Figure = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Text fontSize="xs" color="fg.muted">
      {label}
    </Text>
    <Text fontWeight="bold">{value}</Text>
  </Box>
);

/** Retained history the member's current start date doesn't apply. */
const CreditNote = ({ row }: { row: ComplianceRow }) => {
  const credit = unappliedCreditOf(row);
  if (credit <= 0 && !row.invalidStoredAmount) return null;
  return (
    <Stack gap={1}>
      {credit > 0 && (
        <>
          <Text fontSize="sm" fontWeight="medium">{`Unapplied credit: ${formatMoney(credit)}`}</Text>
          <Text fontSize="xs" color="fg.muted">
            {UNAPPLIED_CREDIT_EXPLANATION}
          </Text>
        </>
      )}
      {row.invalidStoredAmount && (
        <Text fontSize="sm" color="fg.error">
          This payment record holds an invalid amount, so what was paid is unknown. It needs an admin review.
        </Text>
      )}
    </Stack>
  );
};

/**
 * The form, seeded from the snapshot and bound to its guard. Without a guard
 * (an older backend) it stays visible but cannot save.
 */
const CorrectionEditor = ({
  correction: { row, guard },
  obligation,
  isSaving,
  onCorrectDues,
  onCorrectLevy,
}: {
  correction: CorrectionSnapshot;
  obligation: Obligation;
  isSaving: boolean;
  onCorrectDues: (monthlyPaid: Record<string, number>, replace: boolean, guard: CorrectionGuard) => void;
  onCorrectLevy: (amountPaid: number, replace: boolean, guard: CorrectionGuard) => void;
}) => (
  <CorrectPaymentForm
    obligation={obligation}
    memberName={row.name}
    row={row}
    isSaving={isSaving}
    locked={!guard}
    onCorrectDues={(monthlyPaid, replace) => guard && onCorrectDues(monthlyPaid, replace, guard)}
    onCorrectLevy={(amountPaid, replace) => guard && onCorrectLevy(amountPaid, replace, guard)}
  />
);

/**
 * Everything about one member for one obligation: where they stand, and —
 * for finance managers — recording money, correcting the record, or setting
 * the start date that makes them accountable at all.
 */
const MemberPaymentSheet = ({
  organisationId,
  obligation,
  row,
  rowUpdatedAt,
  onReload,
  isReloading,
  onClose,
}: MemberPaymentSheetProps) => {
  const canManage = usePermissions().has("finance.manage");
  // null: recording. Lives only in this sheet (keyed by obligation and member,
  // inside a workspace keyed by organisation), so it is never persisted and
  // never survives a switch.
  const [correction, setCorrection] = useState<CorrectionSnapshot | null>(null);
  const [rejection, setRejection] = useState<{ reason: CorrectionRejection; rowsAt: number } | null>(null);
  const rowUpdatedAtRef = useRef(rowUpdatedAt);
  rowUpdatedAtRef.current = rowUpdatedAt;
  const payments = usePaymentMutations(
    { organisationId, obligationId: obligation.id, memberId: row.memberId },
    onClose,
    (reason) => setRejection({ reason, rowsAt: rowUpdatedAtRef.current }),
  );
  const openCorrection = () => {
    setCorrection({ row, guard: correctionGuardOf(row) });
    setRejection(null);
  };
  const closeCorrection = () => {
    setCorrection(null);
    setRejection(null);
  };
  const refused = rejection?.reason === "conflict";
  const changedUnderneath = !!correction && !sameCorrectionGuard(correction.guard, correctionGuardOf(row));
  // After a 409 the rows on screen predate it; only a later fetch may seed a
  // new correction. The 409 invalidates (cancelling any fetch in flight), so
  // every fetch that lands afterwards was made after the refusal.
  const reloaded = !refused || rowUpdatedAt > rejection.rowsAt;
  const startDate = useFinancialStartDate(organisationId);

  const body = () => {
    if (!row.accountable) {
      return (
        <Stack gap={4}>
          <Text>{`${row.name} has no financial start date, so nothing is due from them yet.`}</Text>
          <CreditNote row={row} />
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

    // An invalid stored amount means paid / behind / left to pay are unknown,
    // not zero: show that instead of a misleading figure.
    const unknown = isUnknownAmount(row);
    const money = (value: number) => (unknown ? "Unknown" : formatMoney(value));

    return (
      <Stack gap={4}>
        <SimpleGrid columns={3} gap={3}>
          <Figure label="Paid" value={money(paidOf(row))} />
          {unknown ? (
            <>
              <Figure label="Left to pay" value="Unknown" />
              <Figure label="Due" value={formatMoney(expectedOf(row))} />
            </>
          ) : row.arrears !== undefined ? (
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
        <CreditNote row={row} />
        {isDuesObligation(obligation) && !correction && <MonthGrid row={row} />}
        {!isLiable(row) && (
          <Text fontSize="sm" color="fg.muted">
            {isDuesObligation(obligation)
              ? "Their financial start date is after this dues year, so they don't owe it."
              : "Their financial start date is after this levy's date, so they don't owe it."}
          </Text>
        )}

        {canManage && isLiable(row) && (
          <>
            <Separator />
            {!correction ? (
              <>
                {unknown ? (
                  <Text fontSize="sm" color="fg.muted">
                    New payments are paused for this record until an admin reviews or corrects it.
                  </Text>
                ) : balanceOf(row) > 0 ? (
                  <RecordPaymentForm
                    obligation={obligation}
                    row={row}
                    isSaving={payments.isSaving}
                    onRecord={payments.record}
                  />
                ) : (
                  <Text fontSize="sm" color="fg.muted">
                    Nothing left to pay on this obligation.
                  </Text>
                )}
                <Button variant="plain" size="sm" minH="44px" alignSelf="center" onClick={openCorrection}>
                  Made a mistake? Correct the record
                </Button>
              </>
            ) : (
              <>
                {refused || changedUnderneath ? (
                  <RecordChangedNotice
                    memberName={row.name}
                    refused={refused}
                    reloaded={reloaded}
                    isReloading={isReloading}
                    onReload={onReload}
                    onReview={openCorrection}
                  />
                ) : (
                  <>
                    {!correction.guard && (
                      <Text role="status" fontSize="sm" color="fg.warning">
                        {MISSING_GUARD_MESSAGE}
                      </Text>
                    )}
                    {rejection?.reason === "outdated" && (
                      <Text role="alert" fontSize="sm" color="fg.error">
                        {OUTDATED_APP_MESSAGE}
                      </Text>
                    )}
                    <CorrectionEditor
                      correction={correction}
                      obligation={obligation}
                      isSaving={payments.isSaving}
                      onCorrectDues={payments.correctDues}
                      onCorrectLevy={payments.correctLevy}
                    />
                  </>
                )}
                <Button variant="plain" size="sm" minH="44px" alignSelf="center" onClick={closeCorrection}>
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
