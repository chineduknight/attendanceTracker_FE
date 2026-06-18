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
import { MONTHS } from "helpers/financeConstants";
import { Obligation, ComplianceRow } from "components/finance/financeTypes";

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

  const amountPerMonth = obligation.amountPerMonth ?? 0;
  const monthsMap = complianceRow?.months ?? {};
  // Only drive the smart grid when we actually have the member's dues row.
  const hasRow = !!complianceRow && obligation.type === "dues";

  // Leading "not-due" months (from January) are the months before the member's
  // financial start date — the first month they are accountable.
  const startMonth = (() => {
    if (!hasRow) return 1;
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

  // A month is locked (shown but not editable) when it's before the member's
  // start date, or it has already been fully paid.
  const isLockedMonth = (month: number) =>
    hasRow && (month < startMonth || monthsMap[String(month)] === "paid");

  // An editable month is only enabled once every earlier in-scope month is
  // filled — this prevents gaps (e.g. paying Dec while May is empty).
  const isMonthEnabled = (month: number): boolean => {
    if (!hasRow) return true; // no row -> free 12-box grid (fallback)
    if (isLockedMonth(month)) return false;
    for (let k = startMonth; k < month; k++) {
      if ((monthly[String(k)] ?? "") === "") return false;
    }
    return true;
  };

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
    if (next === "correct" && hasRow) {
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
    if (obligation.type === "dues") {
      const monthlyPaid: Record<string, number> = {};
      Object.entries(monthly).forEach(([m, v]) => {
        if (v !== "") monthlyPaid[m] = Number(v);
      });
      correct({ url: financeRequest.PAYMENTS, data: buildDuesCorrectionPayload({ ...base, monthlyPaid }) });
    } else {
      if (!amountPaid) return toast.error("Enter an amount");
      correct({ url: financeRequest.PAYMENTS, data: buildLevyCorrectionPayload({ ...base, amountPaid: Number(amountPaid) }) });
    }
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
          ) : obligation.type === "dues" ? (
            <>
              {hasRow && (
                <Text fontSize="sm" color="gray.500" mb={3}>
                  Paid and pre-start months are locked. Enter payments from the
                  first unpaid month onward — earlier months must be filled first.
                </Text>
              )}
              <SimpleGrid columns={[2, 3, 4]} spacing={3}>
                {MONTHS.map((m) => {
                  const key = String(m.value);
                  const disabled = !isMonthEnabled(m.value);
                  return (
                    <FormControl key={m.value} isDisabled={disabled}>
                      <FormLabel htmlFor={`month-${m.value}`}>{m.label}</FormLabel>
                      <Input
                        id={`month-${m.value}`}
                        aria-label={m.label}
                        type="number"
                        isDisabled={disabled}
                        value={monthly[key] ?? ""}
                        onChange={(e) =>
                          setMonthly((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </FormControl>
                  );
                })}
              </SimpleGrid>
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
    </Modal>
  );
};

export default RecordPaymentModal;
