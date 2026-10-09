import { useState } from "react";
import { Button, Flex, Stack, Field } from "@chakra-ui/react";
import { DateField } from "components/ui/date-field";
import { CLEAR_WARNING, formatBusinessDate, REALLOCATION_WARNING } from "helpers/financeCompliance";
import { ConfirmDialog } from "components/ui/confirm-dialog";

interface StartDateFormProps {
  memberName: string;
  current: string | null;
  isSaving: boolean;
  /** Resolves true once saved, so the caller can close its sheet. */
  onSave: (date: string | null) => Promise<boolean>;
}

type Pending = { date: string | null };

/**
 * Sets or clears one member's financial start date. Liability changes are
 * critical finance actions, so both directions are confirmed first.
 */
const StartDateForm = ({ memberName, current, isSaving, onSave }: StartDateFormProps) => {
  // The stored value is a business date; read its calendar day only.
  const currentDay = current?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  const [date, setDate] = useState(currentDay);
  const [pending, setPending] = useState<Pending | null>(null);
  const unchanged = date === currentDay;

  const confirmBody = (target: Pending) =>
    target.date
      ? `Set ${memberName}'s financial start date to ${formatBusinessDate(target.date)}? They will be financially accountable from that month onward.${current ? ` ${REALLOCATION_WARNING}` : ""}`
      : `Clear ${memberName}'s financial start date? They will no longer be financially accountable. ${CLEAR_WARNING}`;

  return (
    <Stack gap={3}>
      <Field.Root>
        <Field.Label>Financial start date</Field.Label>
        <DateField value={date} onChange={setDate} />
        <Field.HelperText>Dues and levies apply from this month onward.</Field.HelperText>
      </Field.Root>
      <Flex gap={3}>
        {current && (
          <Button
            flex="1"
            variant="outline"
            colorPalette="red"
            disabled={isSaving}
            onClick={() => setPending({ date: null })}
          >
            Clear
          </Button>
        )}
        <Button
          flex="2"
          colorPalette="purple"
          disabled={!date || unchanged}
          loading={isSaving}
          onClick={() => setPending({ date })}
        >
          {current ? "Update start date" : "Set start date"}
        </Button>
      </Flex>

      <ConfirmDialog
        open={!!pending}
        title={pending?.date ? "Set financial start date" : "Clear financial start date"}
        body={pending ? confirmBody(pending) : ""}
        confirmLabel={pending?.date ? "Yes, set date" : "Yes, clear"}
        confirmPalette={pending?.date ? "purple" : "red"}
        onConfirm={() => {
          if (pending) void onSave(pending.date);
          setPending(null);
        }}
        onClose={() => setPending(null)}
      />
    </Stack>
  );
};

export default StartDateForm;
