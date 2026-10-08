import { useMemo, useState } from "react";
import {
  Button,
  Flex,
  Input,
  NativeSelect,
  Stack,
  Switch,
  Text,
  Textarea,
  Field,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import ReactSelect, { SingleValue } from "react-select";
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
import { ALL_STATUSES, memberHasStatus } from "helpers/welfareReview";
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
  /** Configured member-status options for narrowing the manual picker. */
  memberStatusOptions?: readonly string[];
  /** Initial picker scope (the Welfare status filter); All when omitted. */
  defaultMemberStatus?: string;
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
  memberStatusOptions = [],
  defaultMemberStatus = ALL_STATUSES,
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
  // Starts on the Welfare population, but All stays one click away so
  // Welfare can record events for any member (e.g. a bereavement).
  const [memberStatus, setMemberStatus] = useState<string>(() =>
    defaultMemberStatus !== ALL_STATUSES &&
    memberStatusOptions.includes(defaultMemberStatus)
      ? defaultMemberStatus
      : ALL_STATUSES,
  );
  const [submitted, setSubmitted] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const isEdit = request.mode === "edit";
  const isManualCreate = request.mode === "create" && request.manual;

  const { organisationId } = request;
  const members = useMembers(organisationId, { enabled: isManualCreate });

  const memberOptions = useMemo(
    () =>
      members.members
        .filter((member) => memberHasStatus(member, memberStatus))
        .map((member) => ({ value: member.id, label: member.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members.members, memberStatus],
  );

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
      {/* Full screen on phones with the footer pinned, so Save stays
          reachable above the keyboard and the long form scrolls inside. */}
      <Dialog.Root
        open
        placement='center'
        size={{ base: "full", md: "lg" }}
        scrollBehavior="inside"
        onOpenChange={e => {
          if (!e.open) {
            onClose();
          }
        }}
      >
        <Portal>

          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                {isEdit ? "Edit welfare follow-up" : "Add welfare follow-up"}
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body>
                <Stack gap={4}>
                  <Field.Root
                    invalid={submitted && !resolvedMemberId}
                    required
                  >
                    <Field.Label htmlFor="follow-up-member">Member</Field.Label>
                    {isManualCreate ? (
                      <>
                        <ReactSelect
                          inputId="follow-up-member"
                          classNamePrefix="follow-up-member"
                          options={memberOptions}
                          // Kept visible even if the scope changes after picking.
                          value={
                            memberId
                              ? {
                                  value: memberId,
                                  label:
                                    members.members.find((m) => m.id === memberId)
                                      ?.name ?? "",
                                }
                              : null
                          }
                          onChange={(
                            selected: SingleValue<{ value: string; label: string }>,
                          ) => setMemberId(selected?.value ?? "")}
                          isLoading={members.isLoading}
                          isDisabled={members.isLoading}
                          placeholder={`Search ${lowerTerm(
                            terms.memberPlural,
                          )} by name`}
                          noOptionsMessage={() =>
                            members.isError
                              ? `${terms.memberPlural} could not be loaded.`
                              : `No matching ${lowerTerm(terms.memberPlural)}`
                          }
                          menuPortalTarget={document.body}
                          menuPosition="fixed"
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                        {memberStatusOptions.length > 0 && (
                          <NativeSelect.Root>
                            <NativeSelect.Field
                              aria-label={`Filter ${lowerTerm(
                                terms.memberPlural,
                              )} by status`}
                              size="sm"
                              mt={2}
                              value={memberStatus}
                              onValueChange={(event) =>
                                setMemberStatus(event.target.value)
                              }>
                              <option value={ALL_STATUSES}>All statuses</option>
                              {memberStatusOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </NativeSelect.Field>
                            <NativeSelect.Indicator />
                          </NativeSelect.Root>
                        )}
                        {members.isError && (
                          <Field.ErrorText>
                            Could not load members. Close and try again.
                          </Field.ErrorText>
                        )}
                      </>
                    ) : (
                      <>
                        <Input
                          id="follow-up-member"
                          value={lockedMemberName}
                          readOnly
                          disabled
                        />
                        {isEdit && (
                          <Field.HelperText>
                            The member cannot be changed after logging.
                          </Field.HelperText>
                        )}
                      </>
                    )}
                    {submitted && !resolvedMemberId && (
                      <Field.ErrorText>Select a member.</Field.ErrorText>
                    )}
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label htmlFor="follow-up-date">Date</Field.Label>
                    <Input
                      id="follow-up-date"
                      type="date"
                      value={recordDate}
                      onValueChange={(event) => setRecordDate(event.target.value)}
                    />
                  </Field.Root>

                  <Field.Root invalid={submitted && !reason.trim()} required>
                    <Field.Label htmlFor="follow-up-reason">Reason</Field.Label>
                    <Input
                      id="follow-up-reason"
                      value={reason}
                      maxLength={REASON_MAX_LENGTH}
                      onValueChange={(event) => setReason(event.target.value)}
                    />
                    <Field.ErrorText>Reason is required.</Field.ErrorText>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label htmlFor="follow-up-note">Note</Field.Label>
                    <Textarea
                      id="follow-up-note"
                      value={note}
                      maxLength={NOTE_MAX_LENGTH}
                      onValueChange={(event) => setNote(event.target.value)}
                    />
                    <Field.HelperText>
                      Keep notes brief and relevant. Avoid storing unnecessary
                      sensitive personal information.
                    </Field.HelperText>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label htmlFor="follow-up-open">
                      Keep open for follow-up
                    </Field.Label>
                    <Switch
                      id="follow-up-open"
                      checked={keepOpen}
                      onValueChange={(event) => setKeepOpen(event.target.checked)}
                    />
                  </Field.Root>

                  {keepOpen && (
                    <Field.Root>
                      <Field.Label htmlFor="follow-up-next-date">
                        Next follow-up date
                      </Field.Label>
                      <Input
                        id="follow-up-next-date"
                        type="date"
                        min={recordDate}
                        value={nextFollowUpDate}
                        onValueChange={(event) =>
                          setNextFollowUpDate(event.target.value)
                        }
                      />
                      <Field.HelperText>
                        Optional — an open follow-up can have no date.
                      </Field.HelperText>
                    </Field.Root>
                  )}

                  {(keepOpen || isEdit) && (
                    <Field.Root>
                      <Field.Label htmlFor="follow-up-assignee">Assignment</Field.Label>
                      {canManageAssignedOfficers ? (
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            id="follow-up-assignee"
                            value={assignedToUserId}
                            onValueChange={(event) =>
                              setAssignedToUserId(event.target.value)
                            }>
                            <option value="">Unassigned</option>
                            {assigneeOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
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
                          disabled={isSaving}
                        >
                          Assign to me
                        </Button>
                      )}
                      <Field.HelperText>
                        Optional. Assignment is for visibility only; Presence Pro
                        will not send a notification in this phase.
                      </Field.HelperText>
                    </Field.Root>
                  )}
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                {/* Stacked on phones (Save on top): three buttons need ~350px
                    and would overflow a 375px screen in a row. */}
                <Flex
                  width="100%"
                  direction={{ base: "column-reverse", md: "row" }}
                  align={{ base: "stretch", md: "center" }}
                  justify={{ md: "flex-end" }}
                  gap={3}
                >
                  {isEdit && (
                    <Button
                      colorPalette="red"
                      variant="outline"
                      mr={{ base: 0, md: "auto" }}
                      onClick={() => setArchiveOpen(true)}
                      disabled={isSaving}
                    >
                      Archive record
                    </Button>
                  )}
                  <Button variant="outline" onClick={onClose} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    loading={isSaving}
                  >
                    {isEdit ? "Save changes" : "Save follow-up"}
                  </Button>
                </Flex>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>

        </Portal>
      </Dialog.Root>

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
