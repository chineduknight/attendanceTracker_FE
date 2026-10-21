import { Box, Button, Field, Flex, Input, Stack, Text, Textarea } from "@chakra-ui/react";
import { OptionSelect } from "components/ui/themed-select";
import {
  MEMBER_MONEY_PURPOSES,
  MemberMoneyDraft,
  MemberMoneyPurpose,
  emptyMemberMoneyDraft,
  memberMoneyDraftProblem,
} from "helpers/openingBalances";

const PURPOSE_LABELS: Record<MemberMoneyPurpose, string> = {
  dues: "Dues",
  levy: "Levy",
  unspecified: "Unspecified",
};

const PURPOSE_OPTIONS = MEMBER_MONEY_PURPOSES.map((value) => ({
  value,
  label: PURPOSE_LABELS[value],
}));

/**
 * Optional individually identified opening member money (RFC §5.6.5).
 *
 * Each item is its own payer/purpose/amount/evidence record. The client never
 * sends a holding-account total: the backend sums these items into the
 * holding-account line.
 */
const OpeningMemberMoneyEditor = ({
  drafts,
  onChange,
  disabled = false,
}: {
  drafts: readonly MemberMoneyDraft[];
  onChange: (drafts: MemberMoneyDraft[]) => void;
  disabled?: boolean;
}) => {
  const update = (index: number, patch: Partial<MemberMoneyDraft>) =>
    onChange(drafts.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)));

  return (
    <Stack gap={3}>
      <Box>
        <Text fontWeight="semibold" fontSize="sm">
          Opening member money (optional)
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Record only money physically held for a member at the start of the opening date
          that is not yet recorded in dues or levy records. Each item is individually
          refundable later. Leaving this empty puts all counted money in opening balance
          equity.
        </Text>
      </Box>

      {drafts.map((draft, index) => {
        const problem = memberMoneyDraftProblem(draft);
        return (
          <Box
            key={draft.key}
            borderWidth="1px"
            borderColor="border"
            borderRadius="md"
            p={3}
          >
            <Stack gap={3}>
              <Flex justify="space-between" align="center" gap={2}>
                <Text fontSize="sm" fontWeight="semibold">
                  Item {index + 1}
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  colorPalette="red"
                  disabled={disabled}
                  onClick={() => onChange(drafts.filter((_, position) => position !== index))}
                >
                  Remove
                </Button>
              </Flex>

              <Field.Root>
                <Field.Label>Payer name</Field.Label>
                <Input
                  value={draft.payerName}
                  maxLength={120}
                  disabled={disabled}
                  onChange={(event) => update(index, { payerName: event.target.value })}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Purpose</Field.Label>
                <OptionSelect<MemberMoneyPurpose>
                  value={draft.purpose}
                  options={PURPOSE_OPTIONS}
                  isDisabled={disabled}
                  onChange={(value) => update(index, { purpose: value })}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Amount held</Field.Label>
                <Input
                  value={draft.amount}
                  inputMode="decimal"
                  disabled={disabled}
                  placeholder="0.00"
                  onChange={(event) => update(index, { amount: event.target.value })}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Supporting evidence</Field.Label>
                <Textarea
                  value={draft.evidence}
                  maxLength={500}
                  disabled={disabled}
                  placeholder="e.g. Envelope 7, receipt book p.12"
                  onChange={(event) => update(index, { evidence: event.target.value })}
                />
              </Field.Root>

              <Flex gap={3} wrap="wrap">
                <Field.Root flex="1" minW="180px">
                  <Field.Label>Member ID (optional)</Field.Label>
                  <Input
                    value={draft.memberId}
                    disabled={disabled}
                    onChange={(event) => update(index, { memberId: event.target.value })}
                  />
                </Field.Root>
                <Field.Root flex="1" minW="180px">
                  <Field.Label>Obligation ID (optional)</Field.Label>
                  <Input
                    value={draft.obligationId}
                    disabled={disabled}
                    onChange={(event) => update(index, { obligationId: event.target.value })}
                  />
                </Field.Root>
              </Flex>
              <Text fontSize="xs" color="fg.muted">
                Member and obligation references are hints only and must belong to this
                organisation. They do not mark dues or a levy as paid.
              </Text>

              {draft.payerName.trim() && problem && (
                <Text role="alert" fontSize="sm" color="fg.error">
                  {problem}
                </Text>
              )}
            </Stack>
          </Box>
        );
      })}

      <Button
        alignSelf="flex-start"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...drafts, emptyMemberMoneyDraft()])}
      >
        Add member-money item
      </Button>
    </Stack>
  );
};

export default OpeningMemberMoneyEditor;
