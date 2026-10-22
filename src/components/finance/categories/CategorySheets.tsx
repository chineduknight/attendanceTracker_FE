import { useState } from "react";
import { Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import FinanceSheet from "components/finance/FinanceSheet";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  CategoryKind,
  checkCategoryName,
  freeName,
} from "helpers/booksCategories";
import {
  MAX_ACCOUNT_NAME_LENGTH,
  MAX_BANK_NAME_LENGTH,
  accountActions,
  type AccountActionContext,
  type CreateAccountPayload,
} from "helpers/ledgerSetup";
import { LedgerAccount } from "components/finance/ledgerTypes";

/**
 * The small sheets behind Categories & Accounts. They carry no write logic of
 * their own: the screen owns `useAccountWrites`, so every request still goes
 * through the durable ledger lifecycle and the unconfirmed-change latch.
 */

const TITLES: Record<CategoryKind, string> = {
  expense: "Add expense category",
  income: "Add income category",
};

interface AddCategorySheetProps {
  kind: CategoryKind;
  accounts: readonly LedgerAccount[];
  isSaving: boolean;
  error: string | null;
  onCreate: (name: string) => void;
  onRestore: (account: LedgerAccount) => void;
  onClose: () => void;
}

export const AddCategorySheet = ({
  kind,
  accounts,
  isSaving,
  error,
  onCreate,
  onRestore,
  onClose,
}: AddCategorySheetProps) => {
  const [name, setName] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const [retired, setRetired] = useState<LedgerAccount | null>(null);

  const submit = () => {
    const check = checkCategoryName(name, kind, accounts);
    if (check.kind === "issue") {
      setIssue(check.message);
      setRetired(null);
      return;
    }
    if (check.kind === "retired") {
      // Never duplicate a retired category: offer to bring it back instead.
      setIssue("A retired category has this name.");
      setRetired(check.account);
      return;
    }
    setIssue(null);
    setRetired(null);
    onCreate(check.name);
  };

  return (
    <FinanceSheet isOpen onClose={onClose} title={TITLES[kind]}>
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted">
          {kind === "expense"
            ? "An expense category groups money paid out, such as transport or utilities."
            : "An income category groups money received, such as donations or an offering."}
        </Text>
        <Field.Root invalid={Boolean(issue)}>
          <Field.Label>Name</Field.Label>
          <Input
            value={name}
            maxLength={MAX_ACCOUNT_NAME_LENGTH}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setIssue(null);
              setRetired(null);
            }}
          />
          {issue && <Field.ErrorText>{issue}</Field.ErrorText>}
        </Field.Root>
        {retired && (
          <Stack gap={2} role="group" aria-label="Retired category">
            <Text fontSize="sm" color="fg.muted">
              {`"${retired.name}" is retired. Restore it instead of adding a duplicate?`}
            </Text>
            <Button
              alignSelf="flex-start"
              colorPalette="teal"
              loading={isSaving}
              onClick={() => onRestore(retired)}
            >
              Restore
            </Button>
          </Stack>
        )}
        {error && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {error}
          </Text>
        )}
        <Flex gap={2} wrap="wrap">
          <Button colorPalette="teal" loading={isSaving} onClick={submit}>
            Add
          </Button>
          <Button variant="outline" disabled={isSaving} onClick={onClose}>
            Cancel
          </Button>
        </Flex>
      </Stack>
    </FinanceSheet>
  );
};

interface AddMoneyAccountSheetProps {
  /** `cash` is only offered when no active cash account exists. */
  mode: "cash" | "bank";
  accounts: readonly LedgerAccount[];
  isSaving: boolean;
  error: string | null;
  onCreate: (payload: CreateAccountPayload) => void;
  onClose: () => void;
}

export const AddMoneyAccountSheet = ({
  mode,
  accounts,
  isSaving,
  error,
  onCreate,
  onClose,
}: AddMoneyAccountSheetProps) => {
  const [name, setName] = useState(() =>
    mode === "cash" ? freeName("Cash in hand", accounts) : "",
  );
  const [bankName, setBankName] = useState("");
  const [last4, setLast4] = useState("");
  const [issue, setIssue] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setIssue("Enter an account name.");
      return;
    }
    if (trimmed.length > MAX_ACCOUNT_NAME_LENGTH) {
      setIssue(`Account names can be at most ${MAX_ACCOUNT_NAME_LENGTH} characters.`);
      return;
    }
    if (bankName.trim().length > MAX_BANK_NAME_LENGTH) {
      setIssue(`Bank names can be at most ${MAX_BANK_NAME_LENGTH} characters.`);
      return;
    }
    if (last4.trim() && !/^[0-9]{4}$/.test(last4.trim())) {
      setIssue("Use exactly the last 4 digits of the account number.");
      return;
    }
    setIssue(null);
    if (mode === "cash") {
      onCreate({ name: trimmed, class: "asset", subtype: "cash" });
      return;
    }
    const payload: CreateAccountPayload = {
      name: trimmed,
      class: "asset",
      subtype: "bank",
    };
    // Bank metadata is captured once here; the update API cannot change it.
    if (bankName.trim()) payload.bankName = bankName.trim();
    if (last4.trim()) payload.accountNumberLast4 = last4.trim();
    onCreate(payload);
  };

  return (
    <FinanceSheet
      isOpen
      onClose={onClose}
      title={mode === "cash" ? "Add Cash in hand" : "Add bank account"}
    >
      <Stack gap={4}>
        <Field.Root invalid={Boolean(issue)}>
          <Field.Label>Account name</Field.Label>
          <Input
            value={name}
            maxLength={MAX_ACCOUNT_NAME_LENGTH}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setIssue(null);
            }}
          />
          {issue && <Field.ErrorText>{issue}</Field.ErrorText>}
        </Field.Root>
        {mode === "bank" && (
          <>
            <Field.Root>
              <Field.Label>Bank (optional)</Field.Label>
              <Input
                value={bankName}
                maxLength={MAX_BANK_NAME_LENGTH}
                autoComplete="off"
                onChange={(event) => setBankName(event.target.value)}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>Last 4 digits (optional)</Field.Label>
              <Input
                value={last4}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                onChange={(event) => setLast4(event.target.value)}
              />
              <Field.HelperText>
                Only the last four digits are stored. Never enter a full account number.
              </Field.HelperText>
            </Field.Root>
          </>
        )}
        {error && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {error}
          </Text>
        )}
        <Flex gap={2} wrap="wrap">
          <Button colorPalette="teal" loading={isSaving} onClick={submit}>
            {mode === "cash" ? "Add Cash in hand" : "Add bank account"}
          </Button>
          <Button variant="outline" disabled={isSaving} onClick={onClose}>
            Cancel
          </Button>
        </Flex>
      </Stack>
    </FinanceSheet>
  );
};

interface AccountActionsSheetProps {
  account: LedgerAccount;
  context: AccountActionContext;
  subtitle?: string | null;
  isSaving: boolean;
  error: string | null;
  onRename: (name: string) => void;
  onSetActive: (active: boolean) => void;
  onClose: () => void;
}

/**
 * Rename, Retire and Restore for one row. Retire asks first; Restore does not.
 * The backend refuses a retire that would strand a balance, and its message
 * is shown as it comes back.
 */
export const AccountActionsSheet = ({
  account,
  context,
  subtitle,
  isSaving,
  error,
  onRename,
  onSetActive,
  onClose,
}: AccountActionsSheetProps) => {
  const [name, setName] = useState(account.name);
  const [issue, setIssue] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const allowance = accountActions(account, context);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setIssue("Enter a name.");
      return;
    }
    if (trimmed.length > MAX_ACCOUNT_NAME_LENGTH) {
      setIssue(`Use ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (trimmed === account.name) {
      onClose();
      return;
    }
    setIssue(null);
    onRename(trimmed);
  };

  const retire = async () => {
    const confirmed = await confirm({
      title: `Retire ${account.name}?`,
      body: "It won't be offered for new entries. Past entries keep it. You can restore it later.",
      confirmLabel: "Retire",
      destructive: true,
    });
    if (confirmed) onSetActive(false);
  };

  return (
    <FinanceSheet isOpen onClose={onClose} title={account.name} subtitle={subtitle ?? undefined}>
      <Stack gap={4}>
        {allowance.canRename && (
          <Stack gap={3}>
            <Field.Root invalid={Boolean(issue)}>
              <Field.Label>Name</Field.Label>
              <Input
                value={name}
                maxLength={MAX_ACCOUNT_NAME_LENGTH}
                onChange={(event) => {
                  setName(event.target.value);
                  setIssue(null);
                }}
              />
              {issue && <Field.ErrorText>{issue}</Field.ErrorText>}
            </Field.Root>
            <Button
              alignSelf="flex-start"
              colorPalette="teal"
              loading={isSaving}
              onClick={saveName}
            >
              Save
            </Button>
          </Stack>
        )}
        {error && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {error}
          </Text>
        )}
        <Flex gap={2} wrap="wrap">
          {allowance.canDeactivate && (
            <Button
              variant="outline"
              colorPalette="red"
              loading={isSaving}
              onClick={() => void retire()}
            >
              Retire
            </Button>
          )}
          {allowance.canReactivate && (
            <Button variant="outline" loading={isSaving} onClick={() => onSetActive(true)}>
              Restore
            </Button>
          )}
          <Button variant="ghost" disabled={isSaving} onClick={onClose}>
            Close
          </Button>
        </Flex>
        {allowance.note && (
          <Text fontSize="sm" color="fg.muted">
            {allowance.note}
          </Text>
        )}
      </Stack>
      {confirmDialog}
    </FinanceSheet>
  );
};
