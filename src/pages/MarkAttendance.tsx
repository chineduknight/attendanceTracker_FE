import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Input,
  Heading,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  IconButton,
  Icon,
  Container,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  useDisclosure,
} from "@chakra-ui/react";
import { FaSearch, FaPencilAlt, FaUserPlus } from "react-icons/fa";
import { FiX } from "react-icons/fi";
import { convertParamsToString } from "helpers/stringManipulations";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest } from "services";
import {
  postRequest,
  putRequest,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { confirmAlert } from "react-confirm-alert";
import _ from "lodash";
import { toast } from "react-toastify";
import LoadingSpinner from "components/LoadingSpinner";
import { useCategories } from "hooks/useCategories";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
import { queryKeys } from "services/api/queryKeys";
import { reconcileAttendanceDraft } from "helpers/attendanceDraft";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import AttendanceMemberRow from "components/attendance/AttendanceMemberRow";
import StatusCountSummary, {
  formatStatusCounts,
} from "components/attendance/StatusCountSummary";
import QuickMarkToolbar, {
  QuickMarkMode,
} from "components/attendance/QuickMarkToolbar";
import VisibleBulkActions from "components/attendance/VisibleBulkActions";
import { usePersistedRoster } from "hooks/usePersistedRoster";
import {
  AttendanceEligibilityRule,
  filterEligibleMembers,
  normalizeEligibilityRules,
} from "helpers/attendanceEligibility";
import ExpectedRosterSummary from "components/attendance/ExpectedRosterSummary";
import { useMembers } from "hooks/useMembers";
import { useMemberModel } from "hooks/useMemberModel";
import { memberFieldLabeler } from "helpers/memberFields";
import UnresolvedRosterEntries from "components/attendance/UnresolvedRosterEntries";
import {
  isManualEntry,
  splitStoredRoster,
  UnresolvedRosterEntry,
} from "helpers/storedRoster";
import {
  restoreStatuses,
  StatusSnapshot,
  updateStatuses,
} from "helpers/attendanceBulk";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import { useAttendanceAvailabilityForDate } from "hooks/useAttendanceAvailability";
import { filterAvailableMembers } from "helpers/attendanceAvailability";
import {
  isActivePresentStatus,
  manualCandidates,
  ManualDraftMember,
  nextPresentStatus,
  reconcileManualDraft,
  toManualAdditionPayload,
} from "helpers/manualAttendance";
import ManualMemberDialog from "components/attendance/ManualMemberDialog";

export type MemberType = {
  /** A configured status key of the selected organisation. */
  attendanceStatus: string;
  name: string;
  id: string;
};

/** A saved draft, or null when there is none or it can't be read. */
const readDraft = (storageKey: string): unknown => {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
};

const MarkAttendanceSession = () => {
  const terms = useTerms();
  const [searchQuery, setSearchQuery] = useState("");
  const [org, currentAttendance, setAttendance] = useGlobalStore((state) => [
    state.organisation,
    state.currentAttendance,
    state.updateCurrentAttendance,
  ]);
  const params = useParams();
  const isUpdate = params.attendanceId !== undefined;
  const draftIdentity = isUpdate
    ? params.attendanceId
    : `${currentAttendance.date || "undated"}-${
        currentAttendance.name || "untitled"
      }`;
  const localStorageKey = `attendance-draft-${org.id}-${draftIdentity}`;
  // Its own key, so drafts saved before manual additions existed stay valid.
  const manualStorageKey = `attendance-manual-draft-${org.id}-${draftIdentity}`;
  // Every roster change goes through commitMembers so the draft never diverges.
  // `allMembers` is only ever the expected roster.
  const [allMembers, commitMembers] =
    usePersistedRoster<MemberType>(localStorageKey);
  // Members who were not expected but physically attended, added to this
  // session only. Kept apart so they never count as (or become) expected.
  const [manualMembers, commitManual] =
    usePersistedRoster<ManualDraftMember>(manualStorageKey);
  const [isAddingMember, setIsAddingMember] = useState(false);
  // Component-local: a remount (organisation/session change) resets to Cycle.
  const [quickMarkMode, setQuickMarkMode] = useState<QuickMarkMode>(null);
  // Previous statuses of the last bulk change; null when there is nothing to undo.
  const [undoSnapshot, setUndoSnapshot] = useState<StatusSnapshot | null>(null);
  // A new session's expected roster comes from its rules; an existing session's
  // roster is the stored snapshot and its rules are display-only metadata.
  const sessionRules = useMemo(
    () => normalizeEligibilityRules(currentAttendance.eligibilityRules),
    [currentAttendance.eligibilityRules]
  );
  const [recordRules, setRecordRules] = useState<AttendanceEligibilityRule[]>(
    []
  );
  // Stored roster entries whose member no longer resolves: shown read-only and
  // never submitted, so the backend keeps their stored status.
  const [unresolvedEntries, setUnresolvedEntries] = useState<
    UnresolvedRosterEntry[]
  >([]);
  const displayedRules = isUpdate ? recordRules : sessionRules;
  // Labels only: the rules (and the roster they froze) stay keyed by storage key.
  const { fields: memberFields } = useMemberModel(org.id);
  const labelFor = useMemo(
    () => memberFieldLabeler(memberFields),
    [memberFields]
  );
  const { categories } = useCategories(org.id);
  const detailsDrawer = useDisclosure();
  const statuses = useAttendanceStatuses();

  // Edit mode shows the session-details form, driven by the loaded currentAttendance.
  const details: AttendanceDetails = {
    name: currentAttendance.name ?? "",
    categoryId: currentAttendance.categoryId ?? "",
    subCategoryId: currentAttendance.subCategoryId ?? "",
    date: (currentAttendance.date ?? "").slice(0, 10),
  };
  const {
    unavailableMemberIds,
    isLoading: availabilityLoading,
    isFetching: availabilityFetching,
    isSuccess: availabilitySuccess,
    isError: availabilityFailed,
    refetch: refetchAvailability,
  } = useAttendanceAvailabilityForDate(org.id, details.date, {
    enabled: !isUpdate,
  });

  const onDetailsChange = (next: AttendanceDetails) => {
    setAttendance({
      ...currentAttendance,
      name: next.name,
      date: next.date,
      categoryId: next.categoryId || null,
      subCategoryId: next.subCategoryId || null,
    });
  };

  // The session roster: expected members, then manual additions. Both are
  // ordinary rows for search and counts; only their status rules differ.
  const sessionRoster = useMemo<MemberType[]>(
    () => [...allMembers, ...manualMembers],
    [allMembers, manualMembers]
  );
  const manualIds = useMemo(
    () => new Set(manualMembers.map((member) => member.id)),
    [manualMembers]
  );

  // filtered list + status counts are pure derivations of the roster/search,
  // so we compute them here instead of storing (and hand-syncing) extra state.
  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return sessionRoster.filter((member) =>
      member.name.toLowerCase().includes(query)
    );
  }, [sessionRoster, searchQuery]);
  // Edit counts include any inactive historical status still on the record.
  const statusCounts = useMemo(
    () => statuses.countStatuses(sessionRoster.map((m) => m.attendanceStatus)),
    [sessionRoster, statuses]
  );

  const unresolvedManualCount = unresolvedEntries.filter(isManualEntry).length;
  const expectedRosterSize =
    allMembers.length + unresolvedEntries.length - unresolvedManualCount;
  const manualCount = manualMembers.length + unresolvedManualCount;

  // A new session's roster comes from the canonical members cache (cached data
  // included), so it is ready on mount and re-derived after every refetch.
  const {
    members: currentMembers,
    isSuccess: membersLoaded,
    isError: membersFailed,
    refetch: refetchMembers,
  } = useMembers(org.id, { enabled: !isUpdate });
  const [rosterReady, setRosterReady] = useState(false);

  // Only members expected under the session's rules are kept, then any
  // locally-saved draft is reconciled against them: members who were removed
  // or stopped matching drop out, and newly matching members (or stale draft
  // statuses) start at the organisation's default status.
  useEffect(() => {
    if (
      isUpdate ||
      !membersLoaded ||
      !availabilitySuccess ||
      availabilityFetching
    )
      return;
    const roster = filterAvailableMembers(
      filterEligibleMembers(currentMembers, sessionRules),
      unavailableMemberIds
    ).sort((a, b) => a.name.localeCompare(b.name));

    // A manual addition who has since become expected moves onto the expected
    // roster with the status already chosen, so nobody is submitted twice.
    const { manual, promoted } = reconcileManualDraft(
      readDraft(manualStorageKey),
      new Set(roster.map((member) => member.id)),
      currentMembers,
      statuses
    );
    commitMembers(() =>
      reconcileAttendanceDraft(readDraft(localStorageKey), roster, statuses).map(
        (member) => {
          const status = promoted.get(member.id);
          return status ? { ...member, attendanceStatus: status } : member;
        }
      )
    );
    commitManual(() => manual);
    setRosterReady(true);
  }, [
    isUpdate,
    membersLoaded,
    availabilitySuccess,
    availabilityFetching,
    currentMembers,
    sessionRules,
    unavailableMemberIds,
    statuses,
    localStorageKey,
    manualStorageKey,
    commitMembers,
    commitManual,
  ]);

  // Callback when updating attendance – load saved attendance data
  const onGetAttandanceSuccess = (res) => {
    const currentAtt = _.pick(res.data, [
      "name",
      "date",
      "organisationId",
      "categoryId",
      "subCategoryId",
    ]);
    setAttendance(currentAtt);
    setRecordRules(normalizeEligibilityRules(res.data.eligibilityRules));
    // Only entries whose member still resolves are editable; the rest stay on
    // the frozen roster as read-only placeholders.
    // The stored roster is historical truth: rules and availability are never
    // re-run, and manual entries stay manual whatever the current rules say.
    const { resolved, unresolved } = splitStoredRoster(res.data.attendance);
    setUnresolvedEntries(unresolved);
    const toRow = (attend: (typeof resolved)[number]): MemberType => ({
      id: attend.memberId,
      name: attend.member.name,
      // Kept verbatim, even when the status has since been deactivated.
      attendanceStatus: attend.attendanceStatus,
    });
    commitMembers(() =>
      resolved.filter((attend) => !isManualEntry(attend)).map(toRow)
    );
    commitManual(() => resolved.filter(isManualEntry).map(toRow));
  };

  const attendUrl = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: params.attendanceId as string,
  });
  // Query for fetching attendance details when updating
  const { isLoading: isGettingAttendance } = useQueryWrapper(
    queryKeys.attendance(org.id, params.attendanceId),
    attendUrl,
    {
      onSuccess: onGetAttandanceSuccess,
      enabled: isUpdate,
      // A refocus refetch would re-run onSuccess and overwrite the user's
      // in-progress name/category/date/member edits with the server values.
      refetchOnWindowFocus: false,
    }
  );

  const isLoadingData = isUpdate
    ? isGettingAttendance
    : !rosterReady &&
      !membersFailed &&
      !availabilityFailed &&
      !availabilityLoading &&
      !availabilityFetching;
  const rosterFailed =
    !isUpdate && !rosterReady && (membersFailed || availabilityFailed);

  // A new session re-reads the roster but keeps its marks (e.g. after the
  // backend rejects a submit because the expected roster changed). An edit
  // discards local changes and reloads the stored record.
  const onRefresh = () => {
    setUndoSnapshot(null);
    if (isUpdate) {
      localStorage.removeItem(localStorageKey);
      localStorage.removeItem(manualStorageKey);
      window.location.reload();
      return;
    }
    setRosterReady(false);
    void Promise.all([refetchMembers(), refetchAvailability()]);
  };

  const handleSearch = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  // A quick-mark mode only ever holds an active status; anything else is Cycle.
  const selectedStatus =
    quickMarkMode !== null && statuses.isActive(quickMarkMode)
      ? statuses.resolve(quickMarkMode)
      : null;

  // A manually-added member records physical attendance, so they may only
  // ever hold an active present-behavior status — never Excused or Absent.
  const mayTakeStatus = useCallback(
    (memberId: string, status: string) =>
      !manualIds.has(memberId) || isActivePresentStatus(statuses, status),
    [manualIds, statuses]
  );
  // Tapping a manual row does nothing while a non-present mode is selected.
  const manualRowsLocked =
    selectedStatus !== null && selectedStatus.behavior !== "present";

  // Tapping a member assigns the selected status, or in Cycle mode advances
  // them through the organisation's active statuses (a manual member only
  // through the present ones). A manual edit makes any pending bulk Undo
  // stale, so it is discarded.
  const markMember = useCallback(
    (memberId: string) => {
      const isManual = manualIds.has(memberId);
      if (selectedStatus && !mayTakeStatus(memberId, selectedStatus.key)) {
        return;
      }
      const nextStatus = selectedStatus
        ? () => selectedStatus.key
        : isManual
        ? (key: string) => nextPresentStatus(statuses, key)
        : statuses.next;
      const mark = <T extends MemberType>(current: T[]) =>
        updateStatuses(current, new Set([memberId]), nextStatus).members;
      if (isManual) commitManual(mark);
      else commitMembers(mark);
      setUndoSnapshot(null);
    },
    [commitManual, commitMembers, manualIds, mayTakeStatus, selectedStatus, statuses]
  );

  // Bulk actions touch only the visible members that may take the status, so
  // e.g. Reset to the default absent status skips manual additions.
  const bulkTargets = (status: string) =>
    new Set(
      filteredMembers
        .filter((member) => mayTakeStatus(member.id, status))
        .map((member) => member.id)
    );

  const setVisibleStatus = (status: string) => {
    const targets = bulkTargets(status);
    const snapshot = new Map<string, string>();
    const apply = <T extends MemberType>(current: T[]) => {
      const update = updateStatuses(current, targets, () => status);
      update.snapshot.forEach((previous, id) => snapshot.set(id, previous));
      return update.members;
    };
    commitMembers(apply);
    commitManual(apply);
    setUndoSnapshot(snapshot);
  };

  const undoBulkChange = () => {
    if (!undoSnapshot) return;
    commitMembers((current) => restoreStatuses(current, undoSnapshot));
    commitManual((current) => restoreStatuses(current, undoSnapshot));
    setUndoSnapshot(null);
  };

  // New session only: manual additions live in the draft until submit.
  const manualCandidateList = useMemo(
    () =>
      manualCandidates(
        currentMembers,
        sessionRoster.map((member) => member.id)
      ),
    [currentMembers, sessionRoster]
  );
  const addManualMember = ({
    memberId,
    status,
    reason,
  }: {
    memberId: string;
    status: string;
    reason: string;
  }) => {
    const member = manualCandidateList.find((m) => m.id === memberId);
    if (!member || !isActivePresentStatus(statuses, status)) return;
    const trimmed = reason.trim();
    commitManual((current) => [
      ...current.filter((m) => m.id !== memberId),
      {
        id: member.id,
        name: member.name,
        attendanceStatus: status,
        ...(trimmed ? { reason: trimmed } : {}),
      },
    ]);
    setUndoSnapshot(null);
    setIsAddingMember(false);
  };
  const removeManualMember = (memberId: string) => {
    commitManual((current) => current.filter((m) => m.id !== memberId));
    setUndoSnapshot(null);
  };
  const session = lowerTerm(terms.attendanceSingular);

  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const onSubmitSuccess = () => {
    isSubmittingRef.current = false;
    setUndoSnapshot(null);
    localStorage.removeItem(localStorageKey);
    localStorage.removeItem(manualStorageKey);
    toast.success(
      isUpdate
        ? `${terms.attendanceSingular} Updated`
        : `${terms.attendanceSingular} Created successfully`
    );
    navigate(PROTECTED_PATHS.ALL_ATTENDANCE);
  };

  const { mutate, isLoading } = useMutationWrapper(
    isUpdate ? putRequest : postRequest,
    onSubmitSuccess,
    (error: any) => {
      isSubmittingRef.current = false;
      if (error?.response?.status === 401) return;
      const message = error?.response?.data?.error;
      toast.error(`${message ?? "An error occured"}`);
    }
  );

  const sendAttandanceToAPI = useCallback(() => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const toStatus = (member: MemberType) => ({
      memberId: member.id,
      status: member.attendanceStatus,
    });
    // An update sends every stored entry's status only; the backend keeps the
    // manual provenance. A new session sends manual additions separately, and
    // never a member who is also on the expected roster.
    const expectedIds = new Set(allMembers.map((member) => member.id));
    const manualAdditions = manualMembers
      .filter((member) => !expectedIds.has(member.id))
      .map((member) =>
        toManualAdditionPayload({
          memberId: member.id,
          status: member.attendanceStatus,
          reason: member.reason ?? "",
        })
      );
    // Only the session fields the API accepts — never stray persisted state.
    // Rules only define a NEW session's roster; an update never re-resolves it.
    const data = {
      ..._.pick(currentAttendance, [
        "name",
        "date",
        "categoryId",
        "subCategoryId",
      ]),
      organisationId: org.id,
      ...(isUpdate ? {} : { eligibilityRules: sessionRules }),
      memberStatuses: (isUpdate ? sessionRoster : allMembers).map(toStatus),
      ...(!isUpdate && manualAdditions.length ? { manualAdditions } : {}),
    };
    const upateUrl = convertParamsToString(
      attendanceRequest.UPDATE_ATTENDANCE,
      {
        attendanceId: params.attendanceId as string,
      }
    );
    mutate({
      url: isUpdate ? upateUrl : attendanceRequest.ATTENDANCE,
      data,
    });
  }, [
    allMembers,
    manualMembers,
    sessionRoster,
    currentAttendance,
    org.id,
    params.attendanceId,
    mutate,
    isUpdate,
    sessionRules,
  ]);

  const onSubmit = () => {
    confirmAlert({
      title: "Please verify count",
      message: `${formatStatusCounts(
        statusCounts
      )}. Are you sure you want to submit?`,
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => sendAttandanceToAPI(),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Container>
        <Flex alignItems="center" justifyContent="space-between" mt="4" gap={2}>
          <Heading fontSize="22px" noOfLines={1}>
            {`${terms.memberPlural} ${currentAttendance.name}`}
          </Heading>
          <Flex gap={2} alignItems="center" flexShrink={0}>
            {isUpdate && (
              <IconButton
                aria-label={`Edit ${lowerTerm(
                  terms.attendanceSingular
                )} details`}
                icon={<FaPencilAlt />}
                variant="outline"
                colorScheme="blue"
                onClick={detailsDrawer.onOpen}
              />
            )}
            <Button variant="logout" onClick={onRefresh}>
              Refresh
            </Button>
          </Flex>
        </Flex>
        {isLoadingData ? (
          <LoadingSpinner
            h="45vh"
            text={`Loading ${lowerTerm(terms.memberPlural)}...`}
          />
        ) : rosterFailed ? (
          <Text mt="6" color="red.500">
            {availabilityFailed
              ? `${terms.attendanceSingular} availability could not be loaded. Use Refresh to try again.`
              : `${terms.memberPlural} could not be loaded. Use Refresh to try again.`}
          </Text>
        ) : !isUpdate && (availabilityLoading || availabilityFetching) ? (
          <Text mt="6" color="gray.600">
            Checking {lowerTerm(terms.attendanceSingular)} availability...
          </Text>
        ) : (
          <>
            <ExpectedRosterSummary
              title={`Expected roster: ${expectedRosterSize} ${lowerTerm(
                expectedRosterSize === 1
                  ? terms.memberSingular
                  : terms.memberPlural
              )}`}
              rules={displayedRules}
              labelFor={labelFor}
              manualCount={manualCount}
              rosterCount={expectedRosterSize + manualCount}
            />
            {!isUpdate && (
              <Button
                mt="3"
                size="sm"
                variant="outline"
                leftIcon={<FaUserPlus />}
                onClick={() => setIsAddingMember(true)}
              >
                {`Add ${lowerTerm(terms.memberSingular)} to this ${session}`}
              </Button>
            )}
            <QuickMarkToolbar
              statuses={statuses.active}
              mode={selectedStatus?.key ?? null}
              onModeChange={setQuickMarkMode}
            />
            <InputGroup mt="4">
              <InputLeftElement pointerEvents="none">
                <Icon as={FaSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                type="text"
                placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
                value={searchQuery}
                onChange={handleSearch}
              />
              {searchQuery && (
                <InputRightElement>
                  <IconButton
                    aria-label="Clear search"
                    icon={<FiX />}
                    size="sm"
                    variant="ghost"
                    onClick={() => setSearchQuery("")}
                  />
                </InputRightElement>
              )}
            </InputGroup>
            <VisibleBulkActions
              applyCount={
                selectedStatus ? bulkTargets(selectedStatus.key).size : 0
              }
              resetCount={bulkTargets(statuses.defaultStatus.key).size}
              selectedStatus={selectedStatus}
              defaultStatus={statuses.defaultStatus}
              canUndo={undoSnapshot !== null}
              onApply={() =>
                selectedStatus && setVisibleStatus(selectedStatus.key)
              }
              onReset={() => setVisibleStatus(statuses.defaultStatus.key)}
              onUndo={undoBulkChange}
            />
            {filteredMembers.some((member) => manualIds.has(member.id)) && (
              <Text mt="2" fontSize="sm" color="gray.500">
                {`${terms.memberPlural} added manually can only be marked with a present status${
                  manualRowsLocked ? ", so tapping them does nothing in this mode" : ""
                }. Bulk actions to other statuses skip them.`}
              </Text>
            )}
            {filteredMembers.length === 0 && (
              <Box mt="4">
                <Text ml="4" fontWeight="bold">
                  {`No ${lowerTerm(terms.memberSingular)} found`}
                </Text>
              </Box>
            )}
            <StatusCountSummary counts={statusCounts} />
            <Box mt="4" overflow="auto" maxHeight="300px">
              {filteredMembers.map((item) => {
                const isManual = manualIds.has(item.id);
                return (
                  <AttendanceMemberRow
                    key={item.id}
                    memberId={item.id}
                    name={item.name}
                    status={statuses.resolve(item.attendanceStatus)}
                    onToggle={
                      isManual && manualRowsLocked ? undefined : markMember
                    }
                    isManual={isManual}
                    accessory={
                      isManual && !isUpdate ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          aria-label={`Remove ${item.name} from this ${session}`}
                          onClick={() => removeManualMember(item.id)}
                        >
                          Remove
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </Box>
            <UnresolvedRosterEntries
              entries={unresolvedEntries}
              statuses={statuses}
            />
            <Button
              onClick={onSubmit}
              w="full"
              mt="8"
              isLoading={isLoading}
              isDisabled={
                sessionRoster.length === 0 ||
                (isUpdate && (!details.name.trim() || !details.date))
              }
            >
              {isUpdate ? "Update" : "Submit"}
            </Button>
            <Button
              onClick={() => navigate(-1)}
              w="full"
              variant="logout"
              mt="4"
              isDisabled={isLoading}
            >
              Cancel
            </Button>
          </>
        )}
      </Container>

      {!isUpdate && (
        <ManualMemberDialog
          isOpen={isAddingMember}
          candidates={manualCandidateList}
          statuses={statuses}
          onSubmit={addManualMember}
          onClose={() => setIsAddingMember(false)}
        />
      )}

      {isUpdate && (
        <Drawer
          isOpen={detailsDrawer.isOpen}
          placement="right"
          onClose={detailsDrawer.onClose}
          size={{ base: "full", md: "md" }}
        >
          <DrawerOverlay />
          <DrawerContent>
            <DrawerCloseButton />
            <DrawerHeader>{`${terms.attendanceSingular} details`}</DrawerHeader>
            <DrawerBody>
              <AttendanceDetailsForm
                value={details}
                onChange={onDetailsChange}
                categories={categories}
              />
            </DrawerBody>
            <DrawerFooter>
              <Button
                w="full"
                variant="primary"
                onClick={detailsDrawer.onClose}
              >
                Done
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
    </Box>
  );
};

/**
 * Remounts the marking session whenever the organisation or the session being
 * edited changes, so the quick-mark mode, search and any pending Undo never
 * carry over to a different roster.
 */
const MarkAttendance = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  const { attendanceId } = useParams();
  return (
    <MarkAttendanceSession key={`${organisationId}:${attendanceId ?? "new"}`} />
  );
};

export default MarkAttendance;
