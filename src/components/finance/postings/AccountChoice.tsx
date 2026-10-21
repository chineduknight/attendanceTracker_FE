import { useContext, useId } from "react";
import { Box, Grid, Text, chakra } from "@chakra-ui/react";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { FormLockContext, SelectField } from "components/finance/postings/PostingForms";

const CARD_LIMIT = 3;

/**
 * The cash or bank account for an entry, always on screen. Up to three
 * accounts are tappable cards; more fall back to a dropdown.
 */
const AccountChoice = ({
  label,
  accounts,
  value,
  onChange,
  placeholder = "Choose a cash or bank account",
}: {
  label: string;
  accounts: readonly LedgerAccount[];
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
}) => {
  const locked = useContext(FormLockContext);
  const labelId = useId();

  if (accounts.length > CARD_LIMIT) {
    return (
      <SelectField
        label={label}
        value={value}
        options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  }

  return (
    <Box>
      <Text id={labelId} fontWeight="medium" mb={1.5}>
        {label}
      </Text>
      {accounts.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          No cash or bank account can be used yet.
        </Text>
      ) : (
        <Grid role="radiogroup" aria-labelledby={labelId} templateColumns="repeat(auto-fill, minmax(130px, 1fr))" gap={2}>
          {accounts.map((account) => {
            const selected = account.id === value;
            return (
              <chakra.button
                key={account.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => onChange(account.id)}
                minH="56px"
                px={3}
                py={2}
                textAlign="left"
                borderRadius="md"
                borderWidth={selected ? "2px" : "1px"}
                borderColor={selected ? "teal.solid" : "border"}
                bg={selected ? "teal.subtle" : "bg.panel"}
                cursor="pointer"
                _disabled={{ opacity: 0.6, cursor: "not-allowed" }}
              >
                <Text fontWeight="semibold" lineClamp={1}>
                  {account.name}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {account.subtype === "bank" ? "Bank" : "Cash"}
                </Text>
              </chakra.button>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default AccountChoice;
