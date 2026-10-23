import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import {
  Button,
  Field,
  Flex,
  Input,
  InputGroup,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { addDays, format, parseISO } from "date-fns";
import { AmountInput } from "components/ui/amount-input";
import { DateField } from "components/ui/date-field";
import { OptionSelect, SelectOption } from "components/ui/themed-select";
import {
  ExpenseDraft,
  POSTING_METHODS,
  POSTING_METHOD_LABELS,
  PostingDraft,
  PostingMethod,
  PostingSummary,
  ReceiptDraft,
  TransferDraft,
} from "components/finance/ledgerPostingTypes";
import { LedgerAccount } from "components/finance/ledgerTypes";
import AccountChoice from "components/finance/postings/AccountChoice";
import MethodChips from "components/finance/postings/MethodChips";
import NewCategoryInline from "components/finance/postings/NewCategoryInline";
import { defaultMethodFor, initialAccountId, writeLastAccount } from "helpers/booksLastAccount";
import {
  POSTING_TEXT_LIMITS,
  PostingDateContext,
  expenseDraftIssue,
  nairaToKobo,
  postingAmountIssue,
  postingExpenseCategories,
  postingIncomeCategories,
  postingMoneyAccounts,
  receiptDraftIssue,
  transferDraftIssue,
} from "helpers/ledgerPostings";

export interface PostingFormProps {
  accounts: readonly LedgerAccount[];
  /** Remembers the account last used on this device; omitted, nothing is remembered. */
  organisationId?: string;
  context: PostingDateContext;
  isPosting: boolean;
  error: string | null;
  /**
   * Keeps the officer's input on screen but read-only and unsubmittable, e.g.
   * after another tab changed the organisation's posting record.
   */
  locked?: boolean;
  /**
   * Managers may add a category from inside the form. Creating one never
   * posts money; the form still refuses to submit without a valid category.
   */
  canAddCategory?: boolean;
  onCancel: () => void;
  onSubmit: (draft: PostingDraft, summary: PostingSummary) => void;
}

export const methodOptions: SelectOption<PostingMethod>[] = POSTING_METHODS.map(
  (method) => ({ value: method, label: POSTING_METHOD_LABELS[method] }),
);

export const accountOptions = (accounts: readonly LedgerAccount[]): SelectOption[] =>
  postingMoneyAccounts(accounts).map((account) => ({
    value: account.id,
    label: account.name,
  }));

const categoryOptions = (
  accounts: readonly LedgerAccount[],
  kind: "income" | "expense",
): SelectOption[] =>
  (kind === "income"
    ? postingIncomeCategories(accounts)
    : postingExpenseCategories(accounts)
  ).map((account) => ({ value: account.id, label: account.name }));

export const nameOf = (accounts: readonly LedgerAccount[], id: string): string | null =>
  accounts.find((account) => account.id === id)?.name ?? null;

/** The datepicker disables days before the opening or on/before the lock. */
export const earliestPostingDate = (context: PostingDateContext): string | undefined => {
  const bounds = [context.openingDate];
  if (context.lockedThroughState === "set" && context.lockedThrough) {
    bounds.push(format(addDays(parseISO(context.lockedThrough), 1), "yyyy-MM-dd"));
  }
  const valid = bounds.filter((value): value is string => Boolean(value)).sort();
  return valid.length ? valid[valid.length - 1] : undefined;
};

/**
 * Set by `LockableFields`. Each field disables its own `Field.Root`, which
 * disables the input, textarea, dropdown and date picker inside it.
 */
export const FormLockContext = createContext(false);

export const TextField = ({
  label,
  value,
  onChange,
  maxLength,
  helper,
  required = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  helper: string;
  required?: boolean;
  multiline?: boolean;
}) => {
  const locked = useContext(FormLockContext);
  return (
    <Field.Root disabled={locked}>
      <Field.Label>{required ? `${label} (required)` : label}</Field.Label>
      {multiline ? (
        <Textarea
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <Field.HelperText>{helper}</Field.HelperText>
    </Field.Root>
  );
};

export const SelectField = ({
  label,
  value,
  options,
  onChange,
  placeholder,
  helper,
  searchable = false,
  onClear,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  helper?: string;
  /** Typing to filter, for long lists such as members. */
  searchable?: boolean;
  /** For an optional value: offers a clear button. */
  onClear?: () => void;
}) => {
  const locked = useContext(FormLockContext);
  return (
    <Field.Root disabled={locked}>
      <Field.Label>{label}</Field.Label>
      <OptionSelect
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        isSearchable={searchable}
        onClear={onClear}
      />
      {helper && <Field.HelperText>{helper}</Field.HelperText>}
    </Field.Root>
  );
};

export const DateAndAmount = ({
  context,
  date,
  onDate,
  amountRaw,
  onAmount,
}: {
  context: PostingDateContext;
  date: string;
  onDate: (value: string) => void;
  amountRaw: string;
  onAmount: (value: string) => void;
}) => {
  const locked = useContext(FormLockContext);
  return (
    <>
      <Field.Root disabled={locked}>
        <Field.Label>Business date</Field.Label>
        <DateField
          value={date}
          onChange={onDate}
          min={earliestPostingDate(context)}
          max={context.today}
          disabled={locked}
        />
        <Field.HelperText>
          A Lagos calendar date. It can't be before the opening date or inside a locked
          period.
        </Field.HelperText>
      </Field.Root>
      <Field.Root disabled={locked}>
        <Field.Label>Amount</Field.Label>
        <InputGroup startAddon="₦" startAddonProps={{ fontSize: "lg" }}>
          <AmountInput
            size="lg"
            placeholder="0"
            value={amountRaw}
            onChange={onAmount}
          />
        </InputGroup>
        <Field.HelperText>Enter naira; the server stores whole kobo.</Field.HelperText>
      </Field.Root>
    </>
  );
};

export const Feedback = ({
  attempted,
  issue,
  error,
}: {
  attempted: boolean;
  issue: string | null;
  error: string | null;
}) => (
  <>
    {error && (
      <Text role="alert" fontSize="sm" color="fg.error">
        {error}
      </Text>
    )}
    {attempted && issue && (
      <Text role="alert" fontSize="sm" color="fg.error">
        {issue}
      </Text>
    )}
  </>
);

export const LockableFields = ({ locked, children }: { locked: boolean; children: ReactNode }) => (
  <FormLockContext.Provider value={locked}>
    <Stack gap={4}>{children}</Stack>
  </FormLockContext.Provider>
);

export const Actions = ({
  isPosting,
  locked,
  onCancel,
  onSubmit,
  label,
  colorPalette,
}: {
  isPosting: boolean;
  locked: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  label: string;
  colorPalette: "green" | "red" | "teal";
}) => (
  <Flex gap={2} wrap="wrap">
    <Button variant="outline" onClick={onCancel} disabled={isPosting}>
      Back
    </Button>
    <Button
      colorPalette={colorPalette}
      loading={isPosting}
      disabled={isPosting || locked}
      onClick={onSubmit}
    >
      {label}
    </Button>
  </Flex>
);

export const FormHeading = ({ children }: { children: string }) => (
  <Text as="h3" fontSize="md" fontWeight="semibold">
    {children}
  </Text>
);

/** Amount first, large, with the naira sign. */
export const AmountField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const locked = useContext(FormLockContext);
  return (
    <Field.Root disabled={locked}>
      <Field.Label>Amount</Field.Label>
      <InputGroup startAddon="₦" startAddonProps={{ fontSize: "lg" }}>
        <AmountInput size="lg" placeholder="0" value={value} onChange={onChange} />
      </InputGroup>
    </Field.Root>
  );
};

/** The entry's date: today by default, never in the future or a locked period. */
export const PostingDateField = ({
  context,
  value,
  onChange,
}: {
  context: PostingDateContext;
  value: string;
  onChange: (value: string) => void;
}) => {
  const locked = useContext(FormLockContext);
  return (
    <Field.Root disabled={locked}>
      <Field.Label>Date</Field.Label>
      <DateField
        value={value}
        onChange={onChange}
        min={earliestPostingDate(context)}
        max={context.today}
        disabled={locked}
      />
    </Field.Root>
  );
};

/**
 * Optional details behind one tap. Opens by itself when any of them already
 * holds a value, so nothing typed is ever hidden.
 */
export const AddDetails = ({
  filled,
  hint = "Reference, evidence, note",
  children,
}: {
  filled: boolean;
  hint?: string;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const shown = open || filled;
  return (
    <Stack gap={4}>
      {!filled && (
        <Button
          variant="ghost"
          alignSelf="flex-start"
          minH="44px"
          px={2}
          ml={-2}
          aria-expanded={shown}
          onClick={() => setOpen((value) => !value)}
        >
          {shown ? "Hide details" : "Add details"}
          <Text as="span" fontSize="sm" color="fg.muted" fontWeight="normal">
            {hint}
          </Text>
        </Button>
      )}
      {shown && children}
    </Stack>
  );
};

/** The account picked, and the method following it until the officer picks one. */
const useAccountAndMethod = (
  offered: readonly LedgerAccount[],
  organisationId: string | undefined,
  action: "receipt" | "expense",
) => {
  const [accountId, setAccountIdState] = useState(() => initialAccountId(offered, organisationId, action));
  const [method, setMethodState] = useState<PostingMethod>(() =>
    defaultMethodFor(offered.find((account) => account.id === accountId)),
  );
  const [methodTouched, setMethodTouched] = useState(false);
  return {
    accountId,
    method,
    setAccountId: (next: string) => {
      setAccountIdState(next);
      if (!methodTouched) setMethodState(defaultMethodFor(offered.find((account) => account.id === next)));
    },
    setMethod: (next: PostingMethod) => {
      setMethodTouched(true);
      setMethodState(next);
    },
    hint: methodTouched ? undefined : "Matches the account. Tap to change.",
  };
};

const NEVER_DUES = "This never marks dues or levies as paid.";

export const ReceiptForm = ({
  accounts,
  organisationId,
  context,
  isPosting,
  error,
  locked = false,
  canAddCategory = false,
  onCancel,
  onSubmit,
}: PostingFormProps) => {
  const offered = postingMoneyAccounts(accounts);
  const into = useAccountAndMethod(offered, organisationId, "receipt");
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState("");
  // A category created in this form is selectable before the query reloads.
  const [addedCategories, setAddedCategories] = useState<LedgerAccount[]>([]);
  const categoryAccounts = useMemo(() => {
    const known = new Set(accounts.map((account) => account.id));
    return [...accounts, ...addedCategories.filter((account) => !known.has(account.id))];
  }, [accounts, addedCategories]);
  const incomeOptions = categoryOptions(categoryAccounts, "income");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);

  const amountKobo = nairaToKobo(amountRaw);
  const draft: ReceiptDraft = {
    businessDate,
    amountKobo: amountKobo ?? 0,
    toAccountId: into.accountId,
    incomeAccountId,
    method: into.method,
    counterpartyName,
    externalReference,
    evidenceReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null
      ? null
      : receiptDraftIssue(draft, { ...context, accounts: categoryAccounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null) return;
    if (organisationId) writeLastAccount(organisationId, "receipt", into.accountId);
    onSubmit(
      { operation: "receipt", receipt: { ...draft, amountKobo } },
      {
        operation: "receipt",
        amountKobo,
        businessDate,
        method: into.method,
        fromAccountName: null,
        toAccountName: nameOf(accounts, into.accountId),
        categoryName: nameOf(categoryAccounts, incomeAccountId),
      },
    );
  };

  return (
    <Stack gap={4}>
      <Text fontSize="sm" color="fg.muted">
        {`A donation, offering or sale. ${NEVER_DUES}`}
      </Text>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <AmountField value={amountRaw} onChange={setAmountRaw} />
        <AccountChoice label="Into" accounts={offered} value={into.accountId} onChange={into.setAccountId} />
        <SelectField
          label="Category"
          value={incomeAccountId}
          options={incomeOptions}
          onChange={setIncomeAccountId}
          placeholder="Choose an income category"
          searchable={incomeOptions.length > 8}
        />
        {canAddCategory && organisationId && (
          <NewCategoryInline
            organisationId={organisationId}
            kind="income"
            accounts={categoryAccounts}
            disabled={locked}
            onCreated={(account) => {
              setAddedCategories((current) => [...current, account]);
              setIncomeAccountId(account.id);
            }}
          />
        )}
        <MethodChips value={into.method} onChange={into.setMethod} hint={into.hint} />
        <PostingDateField context={context} value={businessDate} onChange={setBusinessDate} />
        <TextField
          label="Received from"
          value={counterpartyName}
          onChange={setCounterpartyName}
          maxLength={POSTING_TEXT_LIMITS.counterpartyName}
          helper="Optional."
        />
        <TextField
          label="Description"
          value={note}
          onChange={setNote}
          maxLength={POSTING_TEXT_LIMITS.note}
          helper="This description will appear on the financial report."
          required
          multiline
        />
        <AddDetails
          filled={Boolean(externalReference || evidenceReference || reference)}
          hint="Reference and evidence"
        >
          <TextField
            label="External reference"
            value={externalReference}
            onChange={setExternalReference}
            maxLength={POSTING_TEXT_LIMITS.externalReference}
            helper="The bank or payment provider's transaction reference."
          />
          <TextField
            label="Evidence reference"
            value={evidenceReference}
            onChange={setEvidenceReference}
            maxLength={POSTING_TEXT_LIMITS.evidenceReference}
            helper="Where the receipt, invoice or bank evidence is kept."
          />
          <TextField
            label="Reference"
            value={reference}
            onChange={setReference}
            maxLength={POSTING_TEXT_LIMITS.reference}
            helper="A short label shown in the transactions list."
          />
        </AddDetails>
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={submit}
        label="Record money in"
        colorPalette="green"
      />
    </Stack>
  );
};

export const ExpenseForm = ({
  accounts,
  organisationId,
  context,
  isPosting,
  error,
  locked = false,
  canAddCategory = false,
  onCancel,
  onSubmit,
}: PostingFormProps) => {
  const offered = postingMoneyAccounts(accounts);
  const from = useAccountAndMethod(offered, organisationId, "expense");
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  // A category created in this form is selectable before the query reloads.
  const [addedCategories, setAddedCategories] = useState<LedgerAccount[]>([]);
  const categoryAccounts = useMemo(() => {
    const known = new Set(accounts.map((account) => account.id));
    return [...accounts, ...addedCategories.filter((account) => !known.has(account.id))];
  }, [accounts, addedCategories]);
  const expenseOptions = categoryOptions(categoryAccounts, "expense");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);

  const amountKobo = nairaToKobo(amountRaw);
  const draft: ExpenseDraft = {
    businessDate,
    amountKobo: amountKobo ?? 0,
    fromAccountId: from.accountId,
    expenseAccountId,
    method: from.method,
    counterpartyName,
    externalReference,
    evidenceReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null
      ? null
      : expenseDraftIssue(draft, { ...context, accounts: categoryAccounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null) return;
    if (organisationId) writeLastAccount(organisationId, "expense", from.accountId);
    onSubmit(
      { operation: "expense", expense: { ...draft, amountKobo } },
      {
        operation: "expense",
        amountKobo,
        businessDate,
        method: from.method,
        fromAccountName: nameOf(accounts, from.accountId),
        toAccountName: null,
        categoryName: nameOf(categoryAccounts, expenseAccountId),
      },
    );
  };

  return (
    <Stack gap={4}>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <AmountField value={amountRaw} onChange={setAmountRaw} />
        <AccountChoice label="Paid from" accounts={offered} value={from.accountId} onChange={from.setAccountId} />
        <SelectField
          label="Category"
          value={expenseAccountId}
          options={expenseOptions}
          onChange={setExpenseAccountId}
          placeholder="Choose an expense category"
          searchable={expenseOptions.length > 8}
        />
        {canAddCategory && organisationId && (
          <NewCategoryInline
            organisationId={organisationId}
            kind="expense"
            accounts={categoryAccounts}
            disabled={locked}
            onCreated={(account) => {
              setAddedCategories((current) => [...current, account]);
              setExpenseAccountId(account.id);
            }}
          />
        )}
        <TextField
          label="Paid to"
          value={counterpartyName}
          onChange={setCounterpartyName}
          maxLength={POSTING_TEXT_LIMITS.counterpartyName}
          helper="Who was paid."
          required
        />
        <MethodChips value={from.method} onChange={from.setMethod} hint={from.hint} />
        <PostingDateField context={context} value={businessDate} onChange={setBusinessDate} />
        <TextField
          label="Description"
          value={note}
          onChange={setNote}
          maxLength={POSTING_TEXT_LIMITS.note}
          helper="This description will appear on the financial report."
          required
          multiline
        />
        <AddDetails
          filled={Boolean(externalReference || evidenceReference || reference)}
          hint="Reference and evidence"
        >
          <TextField
            label="External reference"
            value={externalReference}
            onChange={setExternalReference}
            maxLength={POSTING_TEXT_LIMITS.externalReference}
            helper="The bank or payment provider's transaction reference."
          />
          <TextField
            label="Evidence reference"
            value={evidenceReference}
            onChange={setEvidenceReference}
            maxLength={POSTING_TEXT_LIMITS.evidenceReference}
            helper="Where the receipt, invoice or bank evidence is kept."
          />
          <TextField
            label="Reference"
            value={reference}
            onChange={setReference}
            maxLength={POSTING_TEXT_LIMITS.reference}
            helper="A short label shown in the transactions list."
          />
        </AddDetails>
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={submit}
        label="Record money out"
        colorPalette="red"
      />
    </Stack>
  );
};

export const TransferForm = ({
  accounts,
  organisationId,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
}: PostingFormProps) => {
  const offered = postingMoneyAccounts(accounts);
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [fromAccountId, setFromAccountId] = useState(() =>
    initialAccountId(offered, organisationId, "transfer-from"),
  );
  const [toAccountId, setToAccountId] = useState("");
  const [method, setMethod] = useState<PostingMethod>("bank_transfer");
  const [externalReference, setExternalReference] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);

  const amountKobo = nairaToKobo(amountRaw);
  const draft: TransferDraft = {
    businessDate,
    amountKobo: amountKobo ?? 0,
    fromAccountId,
    toAccountId,
    method,
    externalReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null ? null : transferDraftIssue(draft, { ...context, accounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null) return;
    if (organisationId) writeLastAccount(organisationId, "transfer-from", fromAccountId);
    onSubmit(
      { operation: "transfer", transfer: { ...draft, amountKobo } },
      {
        operation: "transfer",
        amountKobo,
        businessDate,
        method,
        fromAccountName: nameOf(accounts, fromAccountId),
        toAccountName: nameOf(accounts, toAccountId),
        categoryName: null,
      },
    );
  };

  return (
    <Stack gap={4}>
      <Text fontSize="sm" color="fg.muted">
        Between two of your own accounts. A transfer is neither income nor an expense.
      </Text>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <AmountField value={amountRaw} onChange={setAmountRaw} />
        <AccountChoice
          label="From"
          accounts={offered}
          value={fromAccountId}
          onChange={(value) => {
            setFromAccountId(value);
            if (value === toAccountId) setToAccountId("");
          }}
        />
        <AccountChoice
          label="To"
          accounts={offered.filter((account) => account.id !== fromAccountId)}
          value={toAccountId}
          onChange={setToAccountId}
          placeholder="Choose a different account"
        />
        <MethodChips value={method} onChange={setMethod} />
        <PostingDateField context={context} value={businessDate} onChange={setBusinessDate} />
        <AddDetails filled={Boolean(externalReference || reference || note)}>
          <TextField
            label="External reference"
            value={externalReference}
            onChange={setExternalReference}
            maxLength={POSTING_TEXT_LIMITS.externalReference}
            helper="The bank or payment provider's transaction reference."
          />
          <TextField
            label="Reference"
            value={reference}
            onChange={setReference}
            maxLength={POSTING_TEXT_LIMITS.reference}
            helper="A short label shown in the transactions list."
          />
          <TextField
            label="Note"
            value={note}
            onChange={setNote}
            maxLength={POSTING_TEXT_LIMITS.note}
            helper="Anything the next officer should know."
            multiline
          />
        </AddDetails>
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={submit}
        label="Record transfer"
        colorPalette="teal"
      />
    </Stack>
  );
};
