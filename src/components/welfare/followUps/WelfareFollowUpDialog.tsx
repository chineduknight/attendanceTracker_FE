import { useMemo, useState } from "react";
import {
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { useMembers } from "hooks/useMembers";
import {
  isStaleFollowUpError,
  WelfareFollowUpMutationCallbacks,
} from "hooks/useWelfareFollowUps";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { rbacRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { Officer } from "rbac/types";
import ConfirmModal from "components/finance/ConfirmModal";
import type { InsightVariant } from "components/welfare/AttendanceInsightCard";
import {
  WelfareFollowUp,
  WelfareFollowUpCreatePayload,
  WelfareFollowUpUpdatePayload,
} from "components/welfare/followUps/types";

export const REASON_MAX_LENGTH = 160;
export const NOTE_MAX_LENGTH = 1000;

/**
 * What the dialog was opened for. `organisationId` is captured when opening so
 * a dialog can never submit into an organisation the officer has switched to.
 */
export type WelfareFollowUpDialogRequest =
  | { mode: "create"; organisationId: string; manual: true }
  | {
      mode: "create";
      organisationId: string;
      manual: false;
      source: InsightVariant;
      memberId: string;
      memberName: string | null;
      sourceSignals: string[];
      sourceAsOf: string;
      reason: string;
    }
  | { mode: "edit"; organisationId: string; record: WelfareFollowUp };

interface WelfareFollowUpDialogProps {
  request: WelfareFollowUpDialogRequest;
  /** Local business date used as the default record date. */
  asOf: string;
  /** officers.view — controls whether the general assignee picker is shown. */
  canManageAssignedOfficers: boolean;
  onClose: () => void;
  create: (
    payload: WelfareFollowUpCreatePayload,
    callbacks?: WelfareFollowUpMutationCallbacks,
  ) => void;
  update: (
    id: string,
    payload: WelfareFollowUpUpdatePayload,
    callbacks?: WelfareFollowUpMutationCallbacks,
  ) => void;
  archive: (
    id: string,
    expectedRevision: number,
    callbacks?: WelfareFollowUpMutationCallbacks,
  ) => void;
  isSaving: boolean;
}

/**
 * Create/edit dialog for a Welfare follow-up (§10–§25).
 *
 * Only manage users ever reach this component. Manual creates pick a member
 * from the canonical member list; insight creates lock the member and carry
 * the insight's signals/asOf as immutable provenance. Nothing is written until
 * an explicit save, and the workflow fields stay optional.
 */
const WelfareFollowUpDialog = ({
  request,
  asOf,
  canManageAssignedOfficers,
  onClose,
  create,
  update,
  archive,
  isSaving,
}: WelfareFollowUpDialogProps) => {
  const terms = useTerms();
  const ownerId = useGlobalStore((state) => state.organisation.owner);
  const currentUserId = useGlobalStore((state) => state.user.id);
  const currentUsername = useGlobalStore((state) => state.user.username);

  const [memberId, setMemberId] = useState<string>(() => {
    if (request.mode === "edit") return request.record.memberId;
    return request.manual ? "" : request.memberId;
  });
  const [recordDate, setRecordDate] = useState<string>(() =>
    request.mode === "edit" ? request.record.recordDate : asOf,
  );
  const [reason, setReason] = useState<string>(() => {
    if (request.mode === "edit") return request.record.reason;
    return request.manual ? "" : request.reason;
  });
  const [note, setNote] = useState<string>(() =>
    request.mode === "edit" ? request.record.note ?? "" : "",
  );
  const [keepOpen, setKeepOpen] = useState<boolean>(
    () => request.mode === "edit" && request.record.workflowStatus === "open",
  );
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>(() =>
    request.mode === "edit" ? request.record.nextFollowUpDate ?? "" : "",
  );
  const [assignedToUserId, setAssignedToUserId] = useState<string>(() =>
    request.mode === "edit" ? request.record.assignedTo?.id ?? "" : "",
  );
  const [submitted, setSubmitted] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const isEdit = request.mode === "edit";
  const isManualCreate = request.mode === "create" && request.manual;

  const { organisationId } = request;
  const members = useMembers(organisationId, { enabled: isManualCreate });

  // The officer list is only fetched when the officer holds officers.view —
  // a manage-only user without it must never call this endpoint (§25).
  const officersUrl = convertParamsToString(rbacRequest.OFFICERS, {
    organisationId,
  });
  const { data: officersData } = useQueryWrapper(
    queryKeys.rbac.officers(organisationId),
    officersUrl,
    { enabled: canManageAssignedOfficers && Boolean(organisationId) },
  );
  const officers: Officer[] = useMemo(
    () => officersData?.data ?? [],
    [officersData],
  );

  // Candidates must be able to read Welfare: owner or welfare.view. A record
  // whose assignee no longer matches stays selectable so an unrelated save
  // never silently drops the assignment.
  const assigneeOptions = useMemo(() => {
    const options = officers
      .filter(
        (officer) =>
          officer.userId === ownerId ||
          (officer.permissions ?? []).includes("welfare.view"),
      )
      .map((officer) => ({ id: officer.userId, name: officer.username }));
    if (isEdit) {
      const current = request.record.assignedTo;
      if (current && !options.some((option) => option.id === current.id)) {
        options.push({
          id: current.id,
          name: current.name ?? "Unknown officer",
        });
      }
    }
    return options;
  }, [officers, ownerId, isEdit, request]);

  const lockedMemberName =
    request.mode === "edit"
      ? request.record.member?.name ??
        `Unknown ${lowerTerm(terms.memberSingular)}`
      : request.mode === "create" && !request.manual
      ? request.memberName ?? `Unknown ${lowerTerm(terms.memberSingular)}`
      : "";

  // Name shown for the current assignment selection (used when the officer
  // list is unavailable, so the state change from "Assign to me" stays visible).
  const assignedToName = (() => {
    if (!assignedToUserId) return null;
    if (assignedToUserId === currentUserId) return currentUsername;
    return (
      assigneeOptions.find((option) => option.id === assignedToUserId)?.name ??
      "Unknown user"
    );
  })();

  const resolvedMemberId =
    request.mode === "edit"
      ? request.record.memberId
      : request.manual
      ? memberId
      : request.memberId;

  const handleSave = () => {
    setSubmitted(true);
    const trimmedReason = reason.trim();
    if (!resolvedMemberId || !trimmedReason) return;

    if (request.mode === "create") {
      const payload: WelfareFollowUpCreatePayload = {
        memberId: resolvedMemberId,
        recordDate,
        sourceType: request.manual ? "manual" : request.source,
        sourceSignals: request.manual ? [] : request.sourceSignals,
        sourceAsOf: request.manual ? null : request.sourceAsOf,
        reason: trimmedReason,
        note: note.trim() ? note.trim() : null,
        workflowStatus: keepOpen ? "open" : "closed",
        nextFollowUpDate: keepOpen ? nextFollowUpDate || null : null,
        assignedToUserId: keepOpen ? assignedToUserId || null : null,
      };
      create(payload, {
        onSuccess: () => {
          toast.success("Follow-up saved");
          onClose();
        },
      });
      return;
    }

    const payload: WelfareFollowUpUpdatePayload = {
      expectedRevision: request.record.revision,
      recordDate,
      reason: trimmedReason,
      note: note.trim() ? note.trim() : null,
      workflowStatus: keepOpen ? "open" : "closed",
      assignedToUserId: assignedToUserId || null,
      // Closing clears the next date server-side; only send one while open.
      ...(keepOpen ? { nextFollowUpDate: nextFollowUpDate || null } : {}),
    };
    update(request.record.id, payload, {
      onSuccess: () => {
        toast.success("Follow-up updated");
        onClose();
      },
      // A 409/404 means another officer changed or archived the record:
      // close this editor, keep the backend's "refresh and try again" message
      // and let the invalidated list refetch. Never retry the note silently.
      onError: (error) => {
        if (isStaleFollowUpError(error)) onClose();
      },
    });
  };

  const handleArchive = () => {
    if (request.mode !== "edit") return;
    archive(request.record.id, request.record.revision, {
      onSuccess: () => {
        toast.success("Follow-up archived");
        setArchiveOpen(false);
        onClose();
      },
      onError: (error) => {
        if (isStaleFollowUpError(error)) {
          setArchiveOpen(false);
          onClose();
        }
      },
    });
  };

  return (
    <>
      <Modal isOpen onClose={onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {isEdit ? "Edit welfare follow-up" : "Add welfare follow-up"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl
                isInvalid={submitted && !resolvedMemberId}
                isRequired
              >
                <FormLabel htmlFor="follow-up-member">Member</FormLabel>
                {isManualCreate ? (
                  <>
                    <Select
                      id="follow-up-member"
                      placeholder="Select member"
                      value={memberId}
                      onChange={(event) => setMemberId(event.target.value)}
                      isDisabled={members.isLoading}
                    >
                      {members.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </Select>
                    {members.isError && (
                      <FormErrorMessage>
                        Could not load members. Close and try again.
                      </FormErrorMessage>
                    )}
                  </>
                ) : (
                  <>
                    <Input
                      id="follow-up-member"
                      value={lockedMemberName}
                      isReadOnly
                      isDisabled
                    />
                    {isEdit && (
                      <FormHelperText>
                        The member cannot be changed after logging.
                      </FormHelperText>
                    )}
                  </>
                )}
                {submitted && !resolvedMemberId && (
                  <FormErrorMessage>Select a member.</FormErrorMessage>
                )}
              </FormControl>

              <FormControl isRequired>
                <FormLabel htmlFor="follow-up-date">Date</FormLabel>
                <Input
                  id="follow-up-date"
                  type="date"
                  value={recordDate}
                  onChange={(event) => setRecordDate(event.target.value)}
                />
              </FormControl>

              <FormControl isInvalid={submitted && !reason.trim()} isRequired>
                <FormLabel htmlFor="follow-up-reason">Reason</FormLabel>
                <Input
                  id="follow-up-reason"
                  value={reason}
                  maxLength={REASON_MAX_LENGTH}
                  onChange={(event) => setReason(event.target.value)}
                />
                <FormErrorMessage>Reason is required.</FormErrorMessage>
              </FormControl>

              <FormControl>
                <FormLabel htmlFor="follow-up-note">Note</FormLabel>
                <Textarea
                  id="follow-up-note"
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  onChange={(event) => setNote(event.target.value)}
                />
                <FormHelperText>
                  Keep notes brief and relevant. Avoid storing unnecessary
                  sensitive personal information.
                </FormHelperText>
              </FormControl>

              <FormControl>
                <FormLabel htmlFor="follow-up-open">
                  Keep open for follow-up
                </FormLabel>
                <Switch
                  id="follow-up-open"
                  isChecked={keepOpen}
                  onChange={(event) => setKeepOpen(event.target.checked)}
                />
              </FormControl>

              {keepOpen && (
                <FormControl>
                  <FormLabel htmlFor="follow-up-next-date">
                    Next follow-up date
                  </FormLabel>
                  <Input
                    id="follow-up-next-date"
                    type="date"
                    min={recordDate}
                    value={nextFollowUpDate}
                    onChange={(event) =>
                      setNextFollowUpDate(event.target.value)
                    }
                  />
                  <FormHelperText>
                    Optional — an open follow-up can have no date.
                  </FormHelperText>
                </FormControl>
              )}

              {(keepOpen || isEdit) && (
                <FormControl>
                  <FormLabel htmlFor="follow-up-assignee">Assignment</FormLabel>
                  {canManageAssignedOfficers ? (
                    <Select
                      id="follow-up-assignee"
                      value={assignedToUserId}
                      onChange={(event) =>
                        setAssignedToUserId(event.target.value)
                      }
                    >
                      <option value="">Unassigned</option>
                      {assigneeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Text fontSize="sm">
                      {assignedToName
                        ? `Assigned to: ${assignedToName}`
                        : "Unassigned"}
                    </Text>
                  )}
                  {!canManageAssignedOfficers && (
                    <Button
                      size="xs"
                      variant="outline"
                      mt={2}
                      onClick={() => setAssignedToUserId(currentUserId)}
                      isDisabled={isSaving}
                    >
                      Assign to me
                    </Button>
                  )}
                  <FormHelperText>
                    Optional. Assignment is for visibility only; Presence Pro
                    will not send a notification in this phase.
                  </FormHelperText>
                </FormControl>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Flex width="100%" align="center" gap={3}>
              {isEdit && (
                <Button
                  colorScheme="red"
                  variant="outline"
                  mr="auto"
                  onClick={() => setArchiveOpen(true)}
                  isDisabled={isSaving}
                >
                  Archive record
                </Button>
              )}
              <Button variant="outline" onClick={onClose} isDisabled={isSaving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                isLoading={isSaving}
              >
                {isEdit ? "Save changes" : "Save follow-up"}
              </Button>
            </Flex>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isEdit && (
        <ConfirmModal
          isOpen={archiveOpen}
          title="Archive record"
          body={`Archive the follow-up for ${lockedMemberName}? It will no longer appear in follow-up lists.`}
          confirmLabel="Yes, archive"
          confirmColorScheme="red"
          isLoading={isSaving}
          onConfirm={handleArchive}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </>
  );
};

export default WelfareFollowUpDialog;
