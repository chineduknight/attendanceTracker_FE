import { Box, Field, Input, Stack, Text } from "@chakra-ui/react";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { ACCOUNT_CLASS_LABELS, ACCOUNT_SUBTYPE_LABELS, toAccountRole } from "helpers/ledgerSetup";
import { parseNairaToKobo } from "helpers/openingBalances";

const roleText = (account: LedgerAccount) => {
  const role = toAccountRole(account);
  if (!role) return "Account type unavailable";
  return [
    ACCOUNT_CLASS_LABELS[role.class],
    role.subtype ? ACCOUNT_SUBTYPE_LABELS[role.subtype] : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * One explicit amount field per active cash/bank account. A blank field is
 * incomplete on purpose: zero must be entered, never assumed.
 */
const OpeningAccountAmountList = ({
  accounts,
  amounts,
  onChange,
  disabled = false,
  label = "Amount counted at the start of the opening date",
}: {
  accounts: readonly LedgerAccount[];
  amounts: Readonly<Record<string, string>>;
  onChange: (accountId: string, value: string) => void;
  disabled?: boolean;
  label?: string;
}) => (
  <Stack gap={4}>
    {accounts.map((account) => {
      const value = amounts[account.id] ?? "";
      const invalid = value.trim() !== "" && parseNairaToKobo(value) === null;
      return (
        <Field.Root key={account.id} invalid={invalid}>
          <Field.Label>
            {account.name}
            <Text as="span" fontSize="xs" color="fg.muted" ml={2}>
              {roleText(account)}
            </Text>
          </Field.Label>
          <Input
            value={value}
            inputMode="decimal"
            disabled={disabled}
            placeholder="0.00"
            aria-label={`${label} for ${account.name}`}
            onChange={(event) => onChange(account.id, event.target.value)}
          />
          <Field.HelperText>
            Enter 0 when the physical count was zero. Amounts are held as integer kobo.
            {account.bankName
              ? ` ${account.bankName}${account.accountNumberLast4 ? ` ending ${account.accountNumberLast4}` : ""}.`
              : ""}
          </Field.HelperText>
          {invalid && (
            <Field.ErrorText>
              Use a naira amount with at most two decimal places.
            </Field.ErrorText>
          )}
        </Field.Root>
      );
    })}
    {accounts.length === 0 && (
      <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
        <Text fontSize="sm" color="fg.muted">
          No active cash or bank accounts. Add them in the chart of accounts first.
        </Text>
      </Box>
    )}
  </Stack>
);

export default OpeningAccountAmountList;
