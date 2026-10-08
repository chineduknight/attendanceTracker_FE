import { useMemo, useState } from "react";
import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Textarea,
} from "@chakra-ui/react";
import ReactSelect, { SingleValue } from "react-select";
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
      <ModalHeader>{`Add ${member} to this ${session}`}</ModalHeader>
      <ModalCloseButton isDisabled={isSaving} />
      <ModalBody>
        <Text mb={2}>
          {`Use this only when the ${member} was not expected for this ${session} but physically attended.`}
        </Text>
        <Text mb={4} fontSize="sm" color="gray.500">
          {`This changes this ${session} only. It does not change eligibility, leave, or future ${lowerTerm(
            terms.attendancePlural
          )}.`}
        </Text>
        <FormControl isRequired mb={4}>
          <FormLabel htmlFor="manual-member-select">
            {terms.memberSingular}
          </FormLabel>
          <ReactSelect
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
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
          />
        </FormControl>
        <FormControl isRequired mb={4}>
          <FormLabel>{`${terms.attendanceSingular} status`}</FormLabel>
          {allowedStatuses.length ? (
            <Select
              value={status}
              placeholder={allowedStatuses.length > 1 ? "Choose a status" : undefined}
              onChange={(event) => setStatus(event.target.value)}
            >
              {allowedStatuses.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          ) : (
            <Text color="red.500" fontSize="sm">
              No active present status is configured for this organisation.
            </Text>
          )}
        </FormControl>
        <FormControl>
          <FormLabel>Reason (optional)</FormLabel>
          <Textarea
            value={reason}
            maxLength={MANUAL_ADDITION_REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Joined the sectional rehearsal"
          />
          <FormHelperText>
            {`${reason.length}/${MANUAL_ADDITION_REASON_MAX} characters`}
          </FormHelperText>
        </FormControl>
      </ModalBody>
      <ModalFooter gap={3}>
        <Button
          variant="outline"
          colorScheme="gray"
          onClick={onClose}
          isDisabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          colorScheme="blue"
          isDisabled={!canSubmit}
          isLoading={isSaving}
          onClick={() => canSubmit && onSubmit({ memberId, status, reason })}
        >
          {`Add ${member}`}
        </Button>
      </ModalFooter>
    </>
  );
};

/**
 * Deliberate dialog for adding a member who was not expected but physically
 * attended. Offers only active present-behavior statuses; the caller decides
 * whether the addition goes to the backend or into a new session's draft.
 */
const ManualMemberDialog = ({ isOpen, ...formProps }: ManualMemberDialogProps) => (
  <Modal
    isOpen={isOpen}
    onClose={formProps.isSaving ? () => undefined : formProps.onClose}
    isCentered
  >
    <ModalOverlay />
    <ModalContent>
      <ManualMemberForm {...formProps} />
    </ModalContent>
  </Modal>
);

export default ManualMemberDialog;
