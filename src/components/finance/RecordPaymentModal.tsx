import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { toast } from "react-toastify";
import { financeRequest } from "services";
import { useMutationWrapper, postRequest, putRequest } from "services/api/apiHelper";
import {
  buildRecordPaymentPayload,
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
} from "helpers/financePayloads";
import { MONTHS, formatMoney } from "helpers/financeConstants";
import { Obligation, ComplianceRow } from "components/finance/financeTypes";
import ConfirmModal from "components/finance/ConfirmModal";

type PendingCorrection = {
  body: string;
  confirmLabel: string;
  confirmColorScheme: string;
  run: () => void;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
  obligation: Obligation;
  memberId: string;
  memberName: string;
  onSuccess: () => void;
  /** The member's current compliance row for this obligation (dues only).
   *  When provided, the Correct grid pre-fills paid months, locks them and any
   *  pre-start months, and forces sequential entry (no gaps). */
  complianceRow?: ComplianceRow;
}

type Mode = "record" | "correct";

const RecordPaymentModal = ({
  isOpen,
  onClose,
  organisationId,
  obligation,
  memberId,
  memberName,
  onSuccess,
  complianceRow,
}: Props) => {
  const [mode, setMode] = useState<Mode>("record");
  const [amount, setAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [monthly, setMonthly] = useState<Record<string, string>>({});
  const [pendingCorrection, setPendingCorrection] = useState<PendingCorrection | null>(null);

  const amountPerMonth = obligation.amountPerMonth ?? 0;
  const monthsMap = complianceRow?.months ?? {};
  const isDues = obligation.type === "dues";

  // Leading "not-due" months (from January) are the months before the member's
  // financial start date — the first month they are accountable.
  const startMonth = (() => {
    let s = 1;
    for (let m = 1; m <= 12; m++) {
      if (monthsMap[String(m)] === "not-due") s = m + 1;
      else break;
    }
    return Math.min(s, 12);
  })();

  // Payments fill sequentially, so paid months are contiguous and at most one
  // month is partial. Derive each month's current amount from the row.
  const paidCount = Object.values(monthsMap).filter((st) => st === "paid").length;
  const partialAmount = Math.max(
    0,
    (complianceRow?.totalPaid ?? 0) - paidCount * amountPerMonth
  );

  const prefillFor = (month: number): string => {
    const st = monthsMap[String(month)];
    if (st === "paid") return String(amountPerMonth);
    if (st === "partial") return partialAmount ? String(partialAmount) : "";
    return "";
  };

  // A month is "complete" when it holds the full monthly amount.
  const valueOf = (month: number) => monthly[String(month)] ?? "";
  const isComplete = (month: number) =>
    valueOf(month) !== "" && Number(valueOf(month)) >= amountPerMonth;

  // The active boundary: the first month (from the start month) that isn't yet
  // fully paid. Only this month and the last fully-paid month before it are
  // editable — so entry stays sequential but the most recent payment can still
  // be reduced or deleted (which reopens the month before it).
  const cursor = (() => {
    for (let m = startMonth; m <= 12; m++) {
      if (!isComplete(m)) return m;
    }
    return 13; // every accountable month is fully paid
  })();

  const isMonthEditable = (month: number) =>
    month >= startMonth && (month === cursor || month === cursor - 1);

  // Each month accepts at most the monthly amount (a final month may be partial).
  const setMonthValue = (month: number, raw: string) => {
    let v = raw;
    if (v !== "") {
      let n = Number(v);
      if (Number.isNaN(n) || n < 0) n = 0;
      if (amountPerMonth > 0 && n > amountPerMonth) n = amountPerMonth;
      v = String(n);
    }
    setMonthly((prev) => ({ ...prev, [String(month)]: v }));
  };

  const fillAll = () => {
    const next: Record<string, string> = {};
    for (let m = startMonth; m <= 12; m++) next[String(m)] = String(amountPerMonth);
    setMonthly(next);
  };

  const clearAll = () => setMonthly({});

  const done = () => {
    toast.success("Payment saved");
    onSuccess();
    onClose();
  };

  const { mutate: record, isLoading: recording } = useMutationWrapper(postRequest, done);
  const { mutate: correct, isLoading: correcting } = useMutationWrapper(putRequest, done);

  const base = { organisationId, obligationId: obligation.id, memberId };

  const switchMode = (next: Mode) => {
    setMode(next);
    setAmount("");
    setAmountPaid("");
    if (next === "correct" && isDues) {
      // Seed the grid with what's already paid (paid + partial months).
      const seed: Record<string, string> = {};
      for (let m = startMonth; m <= 12; m++) {
        const v = prefillFor(m);
        if (v !== "") seed[String(m)] = v;
      }
      setMonthly(seed);
    } else {
      setMonthly({});
    }
  };

  const submit = () => {
    if (mode === "record") {
      if (!amount) return toast.error("Enter an amount");
      record({ url: financeRequest.PAYMENTS, data: buildRecordPaymentPayload({ ...base, amount: Number(amount) }) });
      return;
    }
    // Corrections overwrite the member's record, so confirm before submitting.
    if (obligation.type === "dues") {
      const monthlyPaid: Record<string, number> = {};
      Object.entries(monthly).forEach(([m, v]) => {
        if (v !== "") monthlyPaid[m] = Number(v);
      });
      const count = Object.keys(monthlyPaid).length;
      const total = Object.values(monthlyPaid).reduce((s, n) => s + n, 0);
      setPendingCorrection({
        body:
          count === 0
            ? `This clears all recorded payments for ${memberName} on ${obligation.name}.`
            : `Set ${memberName}'s payments on ${obligation.name} to ${formatMoney(total)} across ${count} month(s)? This overwrites the current record.`,
        confirmLabel: count === 0 ? "Yes, clear" : "Yes, update",
        confirmColorScheme: count === 0 ? "red" : "purple",
        run: () =>
          correct({
            url: financeRequest.PAYMENTS,
            data: buildDuesCorrectionPayload({ ...base, monthlyPaid }),
          }),
      });
    } else {
      if (!amountPaid) return toast.error("Enter an amount");
      setPendingCorrection({
        body: `Set ${memberName}'s paid amount on ${obligation.name} to ${formatMoney(Number(amountPaid))}? This overwrites the current record.`,
        confirmLabel: "Yes, update",
        confirmColorScheme: "purple",
        run: () =>
          correct({
            url: financeRequest.PAYMENTS,
            data: buildLevyCorrectionPayload({ ...base, amountPaid: Number(amountPaid) }),
          }),
      });
    }
  };

  const runCorrection = () => {
    pendingCorrection?.run();
    setPendingCorrection(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Payment — {memberName}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <ButtonGroup isAttached mb={4}>
            <Button
              colorScheme={mode === "record" ? "blue" : "gray"}
              variant={mode === "record" ? "solid" : "outline"}
              onClick={() => switchMode("record")}
            >
              Record
            </Button>
            <Button
              colorScheme={mode === "correct" ? "blue" : "gray"}
              variant={mode === "correct" ? "solid" : "outline"}
              onClick={() => switchMode("correct")}
            >
              Correct
            </Button>
          </ButtonGroup>

          {mode === "record" ? (
            <FormControl>
              <FormLabel htmlFor="amount">Amount</FormLabel>
              <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {obligation.type === "dues" && (
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Auto-fills the earliest unpaid months.
                </Text>
              )}
            </FormControl>
          ) : isDues ? (
            <>
              <Text fontSize="sm" color="gray.500" mb={3}>
                Fill months in order from the first available one (up to{" "}
                {formatMoney(amountPerMonth)} each). A month unlocks once the
                previous is fully paid; clearing a month reopens the one before it.
              </Text>
              <SimpleGrid columns={[2, 3, 4]} spacing={3}>
                {MONTHS.map((m) => {
                  const key = String(m.value);
                  const disabled = !isMonthEditable(m.value);
                  return (
                    <FormControl key={m.value} isDisabled={disabled}>
                      <FormLabel htmlFor={`month-${m.value}`}>{m.label}</FormLabel>
                      <Input
                        id={`month-${m.value}`}
                        aria-label={m.label}
                        type="number"
                        min={0}
                        max={amountPerMonth}
                        isDisabled={disabled}
                        value={monthly[key] ?? ""}
                        onChange={(e) => setMonthValue(m.value, e.target.value)}
                      />
                    </FormControl>
                  );
                })}
              </SimpleGrid>
              <Flex gap={3} mt={4}>
                <Button size="sm" variant="outline" colorScheme="blue" onClick={fillAll}>
                  Fill all
                </Button>
                <Button size="sm" variant="outline" colorScheme="gray" onClick={clearAll}>
                  Clear all
                </Button>
              </Flex>
            </>
          ) : (
            <FormControl>
              <FormLabel htmlFor="amountPaid">Total amount paid</FormLabel>
              <Input
                id="amountPaid"
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </FormControl>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button colorScheme="green" variant="solid" onClick={submit} isLoading={recording || correcting}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>

      <ConfirmModal
        isOpen={!!pendingCorrection}
        title="Confirm correction"
        body={pendingCorrection?.body ?? ""}
        confirmLabel={pendingCorrection?.confirmLabel}
        confirmColorScheme={pendingCorrection?.confirmColorScheme}
        onConfirm={runCorrection}
        onClose={() => setPendingCorrection(null)}
      />
    </Modal>
  );
};

export default RecordPaymentModal;
