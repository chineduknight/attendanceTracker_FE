import { FormEvent, useState } from "react";
import { Button, Flex, InputGroup, Stack, Field } from "@chakra-ui/react";
import { AmountInput } from "components/ui/amount-input";
import { FaMoneyBillWave } from "react-icons/fa";
import { formatMoney } from "helpers/financeConstants";
import {
  balanceOf,
  duesPaymentHint,
  isDuesObligation,
  quickAmounts,
} from "helpers/financeCompliance";
import { ComplianceRow, Obligation } from "components/finance/financeTypes";

interface RecordPaymentFormProps {
  obligation: Obligation;
  row: ComplianceRow;
  isSaving: boolean;
  onRecord: (amount: number) => void;
}

/**
 * New money in. The backend applies it (dues fill the earliest unpaid months)
 * and rejects anything over the balance; the form only previews and guards.
 */
const RecordPaymentForm = ({ obligation, row, isSaving, onRecord }: RecordPaymentFormProps) => {
  const [raw, setRaw] = useState("");
  const amount = Number(raw);
  const balance = balanceOf(row);
  const overBalance = raw !== "" && amount > balance;
  const isValid = raw !== "" && amount > 0 && !overBalance;
  const hint = isDuesObligation(obligation) ? duesPaymentHint(obligation, row, amount) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) onRecord(amount);
  };

  return (
    <Stack gap={3} asChild><form onSubmit={submit}>
        <Field.Root invalid={overBalance}>
          <Field.Label htmlFor="record-amount">Amount received</Field.Label>
          <InputGroup startAddon="₦" startAddonProps={{ fontSize: "lg" }}>
            <AmountInput
              size="lg"
              id="record-amount"
              placeholder="0"
              value={raw}
              onChange={setRaw}
            />
          </InputGroup>
          {overBalance ? (
            <Field.ErrorText>{`More than the ${formatMoney(balance)} still owed.`}</Field.ErrorText>
          ) : (
            hint && <Field.HelperText>{hint}</Field.HelperText>
          )}
        </Field.Root>

        <Flex gap={2} wrap="wrap" role="group" aria-label="Quick amounts">
          {quickAmounts(obligation, row).map((option) => (
            <Button
              key={option.label}
              size="sm"
              minH="44px"
              variant="outline"
              borderRadius="full"
              onClick={() => setRaw(String(option.amount))}
            >
              {`${option.label} · ${formatMoney(option.amount)}`}
            </Button>
          ))}
        </Flex>

        <Button
          type="submit"
          size="lg"
          colorPalette="green"
          disabled={!isValid}
          loading={isSaving}><FaMoneyBillWave />{isValid ? `Record ${formatMoney(amount)}` : "Record payment"}</Button>
      </form></Stack>
  );
};

export default RecordPaymentForm;
