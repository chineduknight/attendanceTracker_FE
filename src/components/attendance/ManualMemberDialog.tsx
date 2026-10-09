import { useMemo, useState } from "react";
import { CloseButton, Button, NativeSelect, Text, Textarea, Field, Dialog, Portal } from "@chakra-ui/react";
import { SingleValue } from "react-select";
import { ThemedSelect } from "components/ui/themed-select";
import { AttendanceStatusConfig } from "helpers/attendanceStatuses";
import {
  MANUAL_ADDITION_REASON_MAX,
  ManualAdditionInput,
  presentStatuses,
} from "helpers/manualAttendance";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface Candidate {
  id: string;
  name: string;
}

interface ManualMemberDialogProps {
  isOpen: boolean;
  /** Members not on the session roster — never filtered by eligibility/leave. */
  candidates: readonly Candidate[];
  statuses: AttendanceStatusConfig;
  isLoadingCandidates?: boolean;
  candidatesFailed?: boolean;
  isSaving?: boolean;
  /** The caller closes the dialog once the addition has succeeded. */
  onSubmit: (input: ManualAdditionInput) => void;
  onClose: () => void;
}

type CandidateOption = { value: string; label: string };

/** Lives inside the modal content, so every opening starts from a clean form. */
const ManualMemberForm = ({
  candidates,
  statuses,
  isLoadingCandidates = false,
  candidatesFailed = false,
  isSaving = false,
  onSubmit,
  onClose,
}: Omit<ManualMemberDialogProps, "isOpen">) => {
  const terms = useTerms();
  const member = lowerTerm(terms.memberSingular);
  const session = lowerTerm(terms.attendanceSingular);
  const allowedStatuses = useMemo(() => presentStatuses(statuses), [statuses]);
  const options = useMemo<CandidateOption[]>(
    () => candidates.map((c) => ({ value: c.id, label: c.name })),
    [candidates]
  );
  const [memberId, setMemberId] = useState("");
  // A single present-behavior status needs no choosing.
  const [status, setStatus] = useState(
    allowedStatuses.length === 1 ? allowedStatuses[0].key : ""
  );
  const [reason, setReason] = useState("");
  const canSubmit = Boolean(memberId && status) && !isSaving;

  return (
    <>
      <Dialog.Header><Dialog.Title>{`Add ${member} to this ${session}`}</Dialog.Title></Dialog.Header>
      <Dialog.CloseTrigger asChild><CloseButton size="sm" minW="44px" minH="44px" disabled={isSaving} /></Dialog.CloseTrigger>
      <Dialog.Body>
        <Text mb={2}>
          {`Use this only when the ${member} was not expected for this ${session} but physically attended.`}
        </Text>
        <Text mb={4} fontSize="sm" color="gray.500">
          {`This changes this ${session} only. It does not change eligibility, leave, or future ${lowerTerm(
            terms.attendancePlural
          )}.`}
        </Text>
        <Field.Root required mb={4}>
          <Field.Label htmlFor="manual-member-select">
            {terms.memberSingular}
          </Field.Label>
          <ThemedSelect
            inputId="manual-member-select"
            classNamePrefix="manual-member"
            options={options}
            value={options.find((o) => o.value === memberId) ?? null}
            onChange={(selected: SingleValue<CandidateOption>) =>
              setMemberId(selected?.value ?? "")
            }
            isLoading={isLoadingCandidates}
            placeholder={`Search ${member} by name`}
            noOptionsMessage={() =>
              candidatesFailed
                ? `${terms.memberPlural} could not be loaded.`
                : `No other ${lowerTerm(terms.memberPlural)} to add`
            }
          />
        </Field.Root>
        <Field.Root required mb={4}>
          <Field.Label>{`${terms.attendanceSingular} status`}</Field.Label>
          {allowedStatuses.length ? (
            <NativeSelect.Root>
              <NativeSelect.Field
                value={status}
                placeholder={allowedStatuses.length > 1 ? "Choose a status" : undefined}
                onChange={(event) => setStatus(event.target.value)}>
                {allowedStatuses.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          ) : (
            <Text color="red.500" fontSize="sm">
              No active present status is configured for this organisation.
            </Text>
          )}
        </Field.Root>
        <Field.Root>
          <Field.Label>Reason (optional)</Field.Label>
          <Textarea
            value={reason}
            maxLength={MANUAL_ADDITION_REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Joined the sectional rehearsal"
          />
          <Field.HelperText>
            {`${reason.length}/${MANUAL_ADDITION_REASON_MAX} characters`}
          </Field.HelperText>
        </Field.Root>
      </Dialog.Body>
      <Dialog.Footer gap={3}>
        <Button
          variant="outline"
          colorPalette="gray"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          colorPalette="blue"
          disabled={!canSubmit}
          loading={isSaving}
          onClick={() => canSubmit && onSubmit({ memberId, status, reason })}
        >
          {`Add ${member}`}
        </Button>
      </Dialog.Footer>
    </>
  );
};

/**
 * Deliberate dialog for adding a member who was not expected but physically
 * attended. Offers only active present-behavior statuses; the caller decides
 * whether the addition goes to the backend or into a new session's draft.
 */
const ManualMemberDialog = ({ isOpen, ...formProps }: ManualMemberDialogProps) => (
  <Dialog.Root
    open={isOpen}
    placement='center'
    onOpenChange={e => {
      if (!e.open) {
        (formProps.isSaving ? () => undefined : formProps.onClose)();
      }
    }}
  >
    <Portal>

      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <ManualMemberForm {...formProps} />
        </Dialog.Content>
      </Dialog.Positioner>

    </Portal>
  </Dialog.Root>
);

export default ManualMemberDialog;
