import { ReactNode, createContext, useContext, useState } from "react";
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
  context: PostingDateContext;
  isPosting: boolean;
  error: string | null;
  /**
   * Keeps the officer's input on screen but read-only and unsubmittable, e.g.
   * after another tab changed the organisation's posting record.
   */
  locked?: boolean;
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

export const ReceiptForm = ({
  accounts,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
}: PostingFormProps) => {
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState("");
  const [method, setMethod] = useState<PostingMethod>("cash");
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
    toAccountId,
    incomeAccountId,
    method,
    counterpartyName,
    externalReference,
    evidenceReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null ? null : receiptDraftIssue(draft, { ...context, accounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null) return;
    onSubmit(
      { operation: "receipt", receipt: { ...draft, amountKobo } },
      {
        operation: "receipt",
        amountKobo,
        businessDate,
        method,
        fromAccountName: null,
        toAccountName: nameOf(accounts, toAccountId),
        categoryName: nameOf(accounts, incomeAccountId),
      },
    );
  };

  return (
    <Stack gap={4}>
      <FormHeading>Money in</FormHeading>
      <Text fontSize="sm" color="fg.muted">
        Record ordinary income such as a donation, offering or sale. A member's
        ordinary donation is a normal receipt here. This never marks anyone's dues or
        levy as paid; member-money receipts are a separate workflow.
      </Text>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <DateAndAmount
          context={context}
          date={businessDate}
          onDate={setBusinessDate}
          amountRaw={amountRaw}
          onAmount={setAmountRaw}
        />
        <SelectField
          label="Money received into"
          value={toAccountId}
          options={accountOptions(accounts)}
          onChange={setToAccountId}
          placeholder="Choose a cash or bank account"
          helper="Only active cash and bank accounts with a verified opening are offered."
        />
        <SelectField
          label="Income category"
          value={incomeAccountId}
          options={categoryOptions(accounts, "income")}
          onChange={setIncomeAccountId}
          placeholder="Choose an income category"
          helper="Only active income categories are offered."
        />
        <SelectField
          label="Payment method"
          value={method}
          options={methodOptions}
          onChange={(value) => setMethod(value as PostingMethod)}
          placeholder="Choose a payment method"
        />
        <TextField
          label="Received from"
          value={counterpartyName}
          onChange={setCounterpartyName}
          maxLength={POSTING_TEXT_LIMITS.counterpartyName}
          helper="Optional. At most 120 characters."
        />
        <TextField
          label="External reference"
          value={externalReference}
          onChange={setExternalReference}
          maxLength={POSTING_TEXT_LIMITS.externalReference}
          helper="Optional. The bank or payment provider's transaction reference."
        />
        <TextField
          label="Evidence reference"
          value={evidenceReference}
          onChange={setEvidenceReference}
          maxLength={POSTING_TEXT_LIMITS.evidenceReference}
          helper="Optional. Where the receipt, invoice or bank evidence is kept."
        />
        <TextField
          label="Reference"
          value={reference}
          onChange={setReference}
          maxLength={POSTING_TEXT_LIMITS.reference}
          helper="Optional. A short label shown in the journal list."
        />
        <TextField
          label="Note"
          value={note}
          onChange={setNote}
          maxLength={POSTING_TEXT_LIMITS.note}
          helper="Optional. Anything the next officer should know."
          multiline
        />
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={submit}
        label="Post receipt"
        colorPalette="green"
      />
    </Stack>
  );
};

export const ExpenseForm = ({
  accounts,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
}: PostingFormProps) => {
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [method, setMethod] = useState<PostingMethod>("cash");
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
    fromAccountId,
    expenseAccountId,
    method,
    counterpartyName,
    externalReference,
    evidenceReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null ? null : expenseDraftIssue(draft, { ...context, accounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null) return;
    onSubmit(
      { operation: "expense", expense: { ...draft, amountKobo } },
      {
        operation: "expense",
        amountKobo,
        businessDate,
        method,
        fromAccountName: nameOf(accounts, fromAccountId),
        toAccountName: null,
        categoryName: nameOf(accounts, expenseAccountId),
      },
    );
  };

  return (
    <Stack gap={4}>
      <FormHeading>Money out</FormHeading>
      <Text fontSize="sm" color="fg.muted">
        Record money spent from a cash or bank account. The payee is required.
      </Text>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <DateAndAmount
          context={context}
          date={businessDate}
          onDate={setBusinessDate}
          amountRaw={amountRaw}
          onAmount={setAmountRaw}
        />
        <SelectField
          label="Paid from"
          value={fromAccountId}
          options={accountOptions(accounts)}
          onChange={setFromAccountId}
          placeholder="Choose a cash or bank account"
          helper="Only active cash and bank accounts with a verified opening are offered."
        />
        <SelectField
          label="Expense category"
          value={expenseAccountId}
          options={categoryOptions(accounts, "expense")}
          onChange={setExpenseAccountId}
          placeholder="Choose an expense category"
          helper="Only active expense categories are offered."
        />
        <SelectField
          label="Payment method"
          value={method}
          options={methodOptions}
          onChange={(value) => setMethod(value as PostingMethod)}
          placeholder="Choose a payment method"
        />
        <TextField
          label="Paid to"
          value={counterpartyName}
          onChange={setCounterpartyName}
          maxLength={POSTING_TEXT_LIMITS.counterpartyName}
          helper="Required. Who received the money. At most 120 characters."
          required
        />
        <TextField
          label="External reference"
          value={externalReference}
          onChange={setExternalReference}
          maxLength={POSTING_TEXT_LIMITS.externalReference}
          helper="Optional. The bank or payment provider's transaction reference."
        />
        <TextField
          label="Evidence reference"
          value={evidenceReference}
          onChange={setEvidenceReference}
          maxLength={POSTING_TEXT_LIMITS.evidenceReference}
          helper="Optional. Where the receipt, invoice or bank evidence is kept."
        />
        <TextField
          label="Reference"
          value={reference}
          onChange={setReference}
          maxLength={POSTING_TEXT_LIMITS.reference}
          helper="Optional. A short label shown in the journal list."
        />
        <TextField
          label="Note"
          value={note}
          onChange={setNote}
          maxLength={POSTING_TEXT_LIMITS.note}
          helper="Optional. Anything the next officer should know."
          multiline
        />
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={submit}
        label="Post expense"
        colorPalette="red"
      />
    </Stack>
  );
};

export const TransferForm = ({
  accounts,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
}: PostingFormProps) => {
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
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

  const toOptions = accountOptions(accounts).filter(
    (option) => option.value !== fromAccountId,
  );

  return (
    <Stack gap={4}>
      <FormHeading>Transfer money</FormHeading>
      <Text fontSize="sm" color="fg.muted">
        Move money between two of your own cash or bank accounts. A transfer is neither
        income nor an expense.
      </Text>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <DateAndAmount
          context={context}
          date={businessDate}
          onDate={setBusinessDate}
          amountRaw={amountRaw}
          onAmount={setAmountRaw}
        />
        <SelectField
          label="Transfer from"
          value={fromAccountId}
          options={accountOptions(accounts)}
          onChange={(value) => {
            setFromAccountId(value);
            if (value === toAccountId) setToAccountId("");
          }}
          placeholder="Choose a cash or bank account"
          helper="Only active cash and bank accounts with a verified opening are offered."
        />
        <SelectField
          label="Transfer to"
          value={toAccountId}
          options={toOptions}
          onChange={setToAccountId}
          placeholder="Choose a different account"
          helper="The receiving account must be different from the sending account."
        />
        <SelectField
          label="Payment method"
          value={method}
          options={methodOptions}
          onChange={(value) => setMethod(value as PostingMethod)}
          placeholder="Choose a payment method"
        />
        <TextField
          label="External reference"
          value={externalReference}
          onChange={setExternalReference}
          maxLength={POSTING_TEXT_LIMITS.externalReference}
          helper="Optional. The bank or payment provider's transaction reference."
        />
        <TextField
          label="Reference"
          value={reference}
          onChange={setReference}
          maxLength={POSTING_TEXT_LIMITS.reference}
          helper="Optional. A short label shown in the journal list."
        />
        <TextField
          label="Note"
          value={note}
          onChange={setNote}
          maxLength={POSTING_TEXT_LIMITS.note}
          helper="Optional. Anything the next officer should know."
          multiline
        />
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={submit}
        label="Post transfer"
        colorPalette="teal"
      />
    </Stack>
  );
};
