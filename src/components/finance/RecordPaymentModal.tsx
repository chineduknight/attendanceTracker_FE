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
import { Obligation } from "components/finance/financeTypes";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
  obligation: Obligation;
  memberId: string;
  memberName: string;
  onSuccess: () => void;
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
}: Props) => {
  const [mode, setMode] = useState<Mode>("record");
  const [amount, setAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [monthly, setMonthly] = useState<Record<string, string>>({});

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
    setMonthly({});
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
            <Button colorScheme={mode === "record" ? "blue" : "gray"} onClick={() => switchMode("record")}>
              Record
            </Button>
            <Button colorScheme={mode === "correct" ? "blue" : "gray"} onClick={() => switchMode("correct")}>
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
            <SimpleGrid columns={[2, 3, 4]} spacing={3}>
              {MONTHS.map((m) => (
                <FormControl key={m.value}>
                  <FormLabel htmlFor={`month-${m.value}`}>{m.label}</FormLabel>
                  <Input
                    id={`month-${m.value}`}
                    aria-label={m.label}
                    type="number"
                    value={monthly[String(m.value)] ?? ""}
                    onChange={(e) =>
                      setMonthly((prev) => ({ ...prev, [String(m.value)]: e.target.value }))
                    }
                  />
                </FormControl>
              ))}
            </SimpleGrid>
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
          <Button colorScheme="green" onClick={submit} isLoading={recording || correcting}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RecordPaymentModal;
