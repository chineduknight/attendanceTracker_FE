import { useState } from "react";
import { Field, Stack, Text, Textarea } from "@chakra-ui/react";
import { DateField } from "components/ui/date-field";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  PostingDraft,
  PostingSummary,
  REVERSIBLE_SOURCE_TYPE_LABELS,
  ReversalTarget,
} from "components/finance/ledgerPostingTypes";
import {
  Actions,
  Feedback,
  FormHeading,
  LockableFields,
  earliestPostingDate,
} from "components/finance/postings/PostingForms";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  POSTING_TEXT_LIMITS,
  PostingDateContext,
  reversalDraftIssue,
} from "helpers/ledgerPostings";

export const reversalLabel = (target: ReversalTarget) =>
  [REVERSIBLE_SOURCE_TYPE_LABELS[target.sourceType], target.number].filter(Boolean).join(" ");

/**
 * Date and reason for reversing one journal, then a deliberate confirmation
 * that repeats what will be undone. Only the date and the reason are sent;
 * the server mirrors the original's lines.
 */
const ReversalForm = ({
  original,
  context,
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
}: {
  original: ReversalTarget;
  context: PostingDateContext;
  isPosting: boolean;
  error: string | null;
  locked?: boolean;
  onCancel: () => void;
  onSubmit: (draft: PostingDraft, summary: PostingSummary) => void;
}) => {
  const [businessDate, setBusinessDate] = useState(context.today);
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const draft = { original, businessDate, reason };
  const issue = reversalDraftIssue(draft, context);
  const earliest = [earliestPostingDate(context), original.businessDate]
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
  const label = reversalLabel(original);

  const review = async () => {
    setAttempted(true);
    if (issue) return;
    const confirmed = await confirm({
      title: `Reverse ${label}?`,
      body: (
        <Stack gap={2}>
          <Text>
            {`A new reversal journal will undo ${label} (${formatKobo(
              original.totalKobo,
            )}, dated ${formatBusinessDate(original.businessDate)}).`}
          </Text>
          <Text>{`Reversal date: ${formatBusinessDate(businessDate)}`}</Text>
          <Text>{`Reason: ${reason.trim()}`}</Text>
          <Text fontSize="sm" color="fg.muted">
            The original entry is never edited or deleted. An entry can be reversed only
            once, and a reversal can't itself be reversed.
          </Text>
        </Stack>
      ),
      confirmLabel: "Reverse entry",
      destructive: true,
    });
    if (!confirmed) return;
    onSubmit(
      { operation: "reversal", reversal: draft },
      {
        operation: "reversal",
        amountKobo: original.totalKobo,
        businessDate,
        method: null,
        fromAccountName: null,
        toAccountName: null,
        categoryName: null,
        originalSourceType: original.sourceType,
        originalNumber: original.number,
      },
    );
  };

  return (
    <Stack gap={4}>
      <FormHeading>{`Reverse ${label}`}</FormHeading>
      <Feedback attempted={attempted} issue={issue} error={error} />
      <LockableFields locked={locked}>
        <Field.Root disabled={locked}>
          <Field.Label>Reversal date</Field.Label>
          <DateField
            value={businessDate}
            onChange={setBusinessDate}
            min={earliest}
            max={context.today}
            disabled={locked}
          />
          <Field.HelperText>
            {`A Lagos calendar date, not before the entry (${formatBusinessDate(
              original.businessDate,
            )}), not inside a locked period and not after today.`}
          </Field.HelperText>
        </Field.Root>
        <Field.Root disabled={locked}>
          <Field.Label>Reason (required)</Field.Label>
          <Textarea
            value={reason}
            maxLength={POSTING_TEXT_LIMITS.reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Field.HelperText>
            {`Why this entry is being undone. Saved on the reversal. ${reason.length}/${POSTING_TEXT_LIMITS.reason} characters.`}
          </Field.HelperText>
        </Field.Root>
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked}
        onCancel={onCancel}
        onSubmit={() => void review()}
        label="Review reversal"
        colorPalette="red"
      />
      {confirmDialog}
    </Stack>
  );
};

export default ReversalForm;
