import { useState } from "react";
import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { MONTHS, formatMoney } from "helpers/financeConstants";
import { firstLiableMonth, paidOf } from "helpers/financeCompliance";
import { ComplianceRow, Obligation } from "components/finance/financeTypes";
import ConfirmModal from "components/finance/ConfirmModal";

interface CorrectPaymentFormProps {
  obligation: Obligation;
  memberName: string;
  /** The member's current compliance row; seeds and locks the dues grid. */
  row?: ComplianceRow;
  isSaving: boolean;
  onCorrectDues: (monthlyPaid: Record<string, number>) => void;
  onCorrectLevy: (amountPaid: number) => void;
}

interface PendingCorrection {
  body: string;
  confirmLabel: string;
  confirmColorScheme: string;
  run: () => void;
}

/**
 * Overwrites a member's record for one obligation — an admin fix, so every
 * save is confirmed. Dues are entered month by month in order with no gaps:
 * only the first not-fully-paid month and the last fully-paid one before it
 * are editable, so the most recent payment can still be reduced.
 */
const CorrectPaymentForm = ({
  obligation,
  memberName,
  row,
  isSaving,
  onCorrectDues,
  onCorrectLevy,
}: CorrectPaymentFormProps) => {
  const isDues = obligation.type === "dues";
  const amountPerMonth = obligation.amountPerMonth ?? 0;
  const monthsMap = row?.months ?? {};
  // No liable month this year (13) locks the whole grid.
  const startMonth = row ? firstLiableMonth(row) ?? 13 : 1;

  // Payments fill sequentially, so at most one month is partial; its amount
  // is what the total holds beyond the fully-paid months.
  const paidCount = Object.values(monthsMap).filter((s) => s === "paid").length;
  const partialAmount = Math.max(0, (row?.totalPaid ?? 0) - paidCount * amountPerMonth);

  const [monthly, setMonthly] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (let m = startMonth; m <= 12; m++) {
      const status = monthsMap[String(m)];
      if (status === "paid") seed[String(m)] = String(amountPerMonth);
      else if (status === "partial" && partialAmount) seed[String(m)] = String(partialAmount);
    }
    return seed;
  });
  const [amountPaid, setAmountPaid] = useState(() => (row && !isDues ? String(paidOf(row)) : ""));
  const [pending, setPending] = useState<PendingCorrection | null>(null);

  const valueOf = (month: number) => monthly[String(month)] ?? "";
  const isComplete = (month: number) =>
    valueOf(month) !== "" && Number(valueOf(month)) >= amountPerMonth;

  const cursor = (() => {
    for (let m = startMonth; m <= 12; m++) if (!isComplete(m)) return m;
    return 13;
  })();
  const isEditable = (month: number) =>
    month >= startMonth && (month === cursor || month === cursor - 1);

  // Each month holds at most the monthly amount (a final month may be partial).
  const setMonthValue = (month: number, raw: string) => {
    let value = raw;
    if (value !== "") {
      let n = Number(value);
      if (Number.isNaN(n) || n < 0) n = 0;
      if (amountPerMonth > 0 && n > amountPerMonth) n = amountPerMonth;
      value = String(n);
    }
    setMonthly((prev) => ({ ...prev, [String(month)]: value }));
  };

  const fillAll = () => {
    const next: Record<string, string> = {};
    for (let m = startMonth; m <= 12; m++) next[String(m)] = String(amountPerMonth);
    setMonthly(next);
  };

  const requestSave = () => {
    if (isDues) {
      const monthlyPaid: Record<string, number> = {};
      Object.entries(monthly).forEach(([m, v]) => {
        if (v !== "") monthlyPaid[m] = Number(v);
      });
      const count = Object.keys(monthlyPaid).length;
      const total = Object.values(monthlyPaid).reduce((s, n) => s + n, 0);
      setPending({
        body:
          count === 0
            ? `This clears all recorded payments for ${memberName} on ${obligation.name}.`
            : `Set ${memberName}'s payments on ${obligation.name} to ${formatMoney(total)} across ${count} month(s)? This overwrites the current record.`,
        confirmLabel: count === 0 ? "Yes, clear" : "Yes, update",
        confirmColorScheme: count === 0 ? "red" : "purple",
        run: () => onCorrectDues(monthlyPaid),
      });
      return;
    }
    if (amountPaid === "") return;
    setPending({
      body: `Set ${memberName}'s paid amount on ${obligation.name} to ${formatMoney(Number(amountPaid))}? This overwrites the current record.`,
      confirmLabel: "Yes, update",
      confirmColorScheme: "purple",
      run: () => onCorrectLevy(Number(amountPaid)),
    });
  };

  return (
    <Stack spacing={3}>
      {isDues ? (
        <>
          <Text fontSize="sm" color="gray.500">
            {`Fill months in order (up to ${formatMoney(amountPerMonth)} each). A month unlocks once the previous one is fully paid; clearing a month reopens the one before it.`}
          </Text>
          <SimpleGrid columns={{ base: 3, sm: 4 }} spacing={2}>
            {MONTHS.map((m) => {
              const disabled = !isEditable(m.value);
              return (
                <FormControl key={m.value} isDisabled={disabled}>
                  <FormLabel htmlFor={`month-${m.value}`} fontSize="sm" mb={1}>
                    {m.label}
                  </FormLabel>
                  <Input
                    id={`month-${m.value}`}
                    aria-label={m.label}
                    type="number"
                    inputMode="decimal"
                    size="sm"
                    min={0}
                    max={amountPerMonth}
                    isDisabled={disabled}
                    value={valueOf(m.value)}
                    onChange={(e) => setMonthValue(m.value, e.target.value)}
                  />
                </FormControl>
              );
            })}
          </SimpleGrid>
          <Flex gap={2}>
            <Button size="sm" variant="outline" colorScheme="blue" onClick={fillAll}>
              Fill all
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMonthly({})}>
              Clear all
            </Button>
          </Flex>
        </>
      ) : (
        <FormControl>
          <FormLabel htmlFor="correct-amount-paid">Total amount paid</FormLabel>
          <Input
            id="correct-amount-paid"
            type="number"
            inputMode="decimal"
            min={0}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
        </FormControl>
      )}

      <Button colorScheme="purple" onClick={requestSave} isLoading={isSaving}>
        Save correction
      </Button>

      <ConfirmModal
        isOpen={!!pending}
        title="Confirm correction"
        body={pending?.body ?? ""}
        confirmLabel={pending?.confirmLabel}
        confirmColorScheme={pending?.confirmColorScheme}
        onConfirm={() => {
          pending?.run();
          setPending(null);
        }}
        onClose={() => setPending(null)}
      />
    </Stack>
  );
};

export default CorrectPaymentForm;
