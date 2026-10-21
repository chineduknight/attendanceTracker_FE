import { useContext, useState } from "react";
import { Box, Checkbox, Flex, Stack, Text } from "@chakra-ui/react";
import { SelectOption } from "components/ui/themed-select";
import {
  MEMBER_MONEY_PURPOSES,
  MEMBER_MONEY_PURPOSE_LABELS,
  MemberMoneyPurpose,
  MemberReceiptDraft,
  PostingMethod,
  RefundDraft,
} from "components/finance/ledgerPostingTypes";
import {
  Actions,
  DateAndAmount,
  Feedback,
  FormHeading,
  FormLockContext,
  LockableFields,
  PostingFormProps,
  SelectField,
  TextField,
  accountOptions,
  methodOptions,
  nameOf,
} from "components/finance/postings/PostingForms";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  MEMBER_MONEY_SOURCE_KIND_LABELS,
  MemberMoneySource,
  memberMoneySourceRef,
} from "helpers/memberMoney";
import {
  POSTING_TEXT_LIMITS,
  memberReceiptDraftIssue,
  nairaToKobo,
  postingAmountIssue,
  refundDraftIssue,
} from "helpers/ledgerPostings";

const purposeOptions: SelectOption<MemberMoneyPurpose>[] = MEMBER_MONEY_PURPOSES.map(
  (purpose) => ({ value: purpose, label: MEMBER_MONEY_PURPOSE_LABELS[purpose] }),
);

/** The attestation the server requires as `receivedAfterOpeningCount: true`. */
const ReceivedAfterOpeningCount = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => {
  const locked = useContext(FormLockContext);
  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
      <Checkbox.Root
        checked={checked}
        disabled={locked}
        onCheckedChange={({ checked: next }) => onChange(next === true)}
        alignItems="flex-start"
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control mt={0.5} />
        <Checkbox.Label>
          This money was received after the opening count (required)
        </Checkbox.Label>
      </Checkbox.Root>
      <Text fontSize="sm" color="fg.muted" mt={1} pl={7}>
        Money that was already counted in the opening balances is never recorded again
        as a member receipt.
      </Text>
    </Box>
  );
};

export interface MemberReceiptFormProps extends PostingFormProps {
  /** null when this officer can't read the member list: no member hint is offered. */
  memberOptions: readonly SelectOption[] | null;
  /** null while obligations are unavailable: no obligation hint is offered. */
  obligationOptions: readonly SelectOption[] | null;
}

export const MemberReceiptForm = ({
  accounts,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
  memberOptions,
  obligationOptions,
}: MemberReceiptFormProps) => {
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [method, setMethod] = useState<PostingMethod>("cash");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [purpose, setPurpose] = useState<MemberMoneyPurpose | "">("");
  const [memberId, setMemberId] = useState("");
  const [obligationId, setObligationId] = useState("");
  const [receivedAfterOpeningCount, setReceivedAfterOpeningCount] = useState(false);
  const [externalReference, setExternalReference] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);

  const amountKobo = nairaToKobo(amountRaw);
  const draft: MemberReceiptDraft = {
    businessDate,
    amountKobo: amountKobo ?? 0,
    toAccountId,
    method,
    counterpartyName,
    purpose,
    memberId,
    obligationId,
    receivedAfterOpeningCount,
    externalReference,
    evidenceReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null ? null : memberReceiptDraftIssue(draft, { ...context, accounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null || !purpose) return;
    onSubmit(
      { operation: "member_receipt", memberReceipt: { ...draft, amountKobo } },
      {
        operation: "member_receipt",
        amountKobo,
        businessDate,
        method,
        fromAccountName: null,
        toAccountName: nameOf(accounts, toAccountId),
        categoryName: null,
        counterpartyName: counterpartyName.trim(),
        purpose,
        sourceNumber: null,
      },
    );
  };

  return (
    <Stack gap={4}>
      <FormHeading>Member money in</FormHeading>
      <Text fontSize="sm" color="fg.muted">
        Record dues or levy money a member paid in. It is held for members until it is
        matched later; a member's ordinary donation is a normal Money in receipt instead.
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
        <TextField
          label="Paid by"
          value={counterpartyName}
          onChange={setCounterpartyName}
          maxLength={POSTING_TEXT_LIMITS.counterpartyName}
          helper="Required. The name of the person who paid. At most 120 characters."
          required
        />
        <SelectField
          label="What the money is for (required)"
          value={purpose}
          options={purposeOptions}
          onChange={(value) => setPurpose(value as MemberMoneyPurpose)}
          placeholder="Choose dues, levy or not specified"
          helper="Choose Not specified when the payer didn't say."
        />
        {memberOptions && (
          <SelectField
            label="Member (optional)"
            value={memberId}
            options={memberOptions}
            onChange={setMemberId}
            onClear={() => setMemberId("")}
            placeholder="Search for a member"
            helper="A tag for later matching. It doesn't record a payment for this member."
            searchable
          />
        )}
        {obligationOptions && (
          <SelectField
            label="Obligation (optional)"
            value={obligationId}
            options={obligationOptions}
            onChange={setObligationId}
            onClear={() => setObligationId("")}
            placeholder="Choose a dues or levy obligation"
            helper="A tag for later matching. It doesn't mark the obligation as paid."
          />
        )}
        <ReceivedAfterOpeningCount
          checked={receivedAfterOpeningCount}
          onChange={setReceivedAfterOpeningCount}
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
          label="Evidence reference"
          value={evidenceReference}
          onChange={setEvidenceReference}
          maxLength={POSTING_TEXT_LIMITS.evidenceReference}
          helper="Optional. Where the receipt or bank evidence is kept."
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
        label="Record member money"
        colorPalette="green"
      />
    </Stack>
  );
};

/** What a refund returns money from, as the server reported it. */
const SourceFacts = ({ source }: { source: MemberMoneySource }) => (
  <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
    <Flex justify="space-between" gap={3} wrap="wrap">
      <Text fontWeight="semibold">{source.number}</Text>
      <Text fontSize="sm" color="fg.muted">
        {MEMBER_MONEY_SOURCE_KIND_LABELS[source.kind]}
      </Text>
    </Flex>
    <Text fontSize="sm">{`Paid by: ${source.payerName ?? "not recorded"}`}</Text>
    <Text fontSize="sm">{`Received: ${formatBusinessDate(source.businessDate)}`}</Text>
    <Text fontSize="sm" fontWeight="medium">
      {`Still held: ${formatKobo(source.remainingKobo)}`}
    </Text>
  </Box>
);

export interface RefundFormProps extends PostingFormProps {
  source: MemberMoneySource;
}

export const RefundForm = ({
  accounts,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
  source,
}: RefundFormProps) => {
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [method, setMethod] = useState<PostingMethod>("cash");
  // The payer is the usual recipient; the officer can change it.
  const [counterpartyName, setCounterpartyName] = useState(source.payerName ?? "");
  const [reason, setReason] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);

  const amountKobo = nairaToKobo(amountRaw);
  const draft: RefundDraft = {
    source: memberMoneySourceRef(source),
    businessDate,
    amountKobo: amountKobo ?? 0,
    fromAccountId,
    method,
    counterpartyName,
    reason,
    externalReference,
    evidenceReference,
    reference,
    note,
  };
  const issue =
    (amountKobo === null ? null : refundDraftIssue(draft, { ...context, accounts })) ??
    postingAmountIssue(amountRaw);

  const submit = () => {
    setAttempted(true);
    if (issue || amountKobo === null) return;
    onSubmit(
      { operation: "refund", refund: { ...draft, amountKobo } },
      {
        operation: "refund",
        amountKobo,
        businessDate,
        method,
        fromAccountName: nameOf(accounts, fromAccountId),
        toAccountName: null,
        categoryName: null,
        counterpartyName: counterpartyName.trim(),
        purpose: null,
        sourceNumber: source.number,
      },
    );
  };

  return (
    <Stack gap={4}>
      <FormHeading>Refund member money</FormHeading>
      <Text fontSize="sm" color="fg.muted">
        Record money paid back from what is still held for this source. A refund can't be
        more than what is still held or dated before the money was received.
      </Text>
      <SourceFacts source={source} />
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
          label="Paid back from"
          value={fromAccountId}
          options={accountOptions(accounts)}
          onChange={setFromAccountId}
          placeholder="Choose a cash or bank account"
          helper="Only active cash and bank accounts with a verified opening are offered."
        />
        <TextField
          label="Paid to"
          value={counterpartyName}
          onChange={setCounterpartyName}
          maxLength={POSTING_TEXT_LIMITS.counterpartyName}
          helper="Required. Who received the refund. At most 120 characters."
          required
        />
        <TextField
          label="Reason"
          value={reason}
          onChange={setReason}
          maxLength={POSTING_TEXT_LIMITS.reason}
          helper="Required. Why the money is being returned. At most 500 characters."
          required
          multiline
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
          label="Evidence reference"
          value={evidenceReference}
          onChange={setEvidenceReference}
          maxLength={POSTING_TEXT_LIMITS.evidenceReference}
          helper="Optional. Where the refund evidence is kept."
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
        label="Record refund"
        colorPalette="red"
      />
    </Stack>
  );
};
