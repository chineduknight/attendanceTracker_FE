import {
  CloseButton,
  Box,
  Flex,
  Text,
  Button,
  Heading,
  IconButton,
  Drawer,
  useDisclosure,
  Portal,
} from "@chakra-ui/react";
import { FaPencilAlt, FaUserPlus } from "react-icons/fa";
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
import useGlobalStore, { currentAttendanceType } from "zStore";
import { useConfirm } from "components/ui/confirm-dialog";
import _ from "lodash";
import { toast } from "react-toastify";
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import { formatSessionDate } from "helpers/sessionDate";
import PinnedSearchBar from "components/PinnedSearchBar";
import { EmptyState, ErrorState } from "components/ui/states";
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
  discardNewAttendanceDraft,
  expectedRosterDraftKey,
  manualRosterDraftKey,
  newAttendanceDraftIdentity,
  newAttendanceDraftToSession,
  readNewAttendanceDraft,
} from "helpers/newAttendanceDraft";
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
import { usePinnedSearch } from "hooks/usePinnedSearch";
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

/**
 * A working session needs both a name and a date; either alone is a half
 * draft that must not be marked as if it were a session.
 */
const hasWorkingSession = (
  attendance: currentAttendanceType | null | undefined,
): boolean => Boolean(attendance?.name?.trim() && attendance?.date);

/**
 * Direct /mark-attendance with nothing to mark: no working session and no
 * unfinished draft for this organisation. Send the officer to start one
 * instead of showing an empty "untitled/undated" marking screen.
 */
const NoUnfinishedSession = () => {
  const navigate = useNavigate();
  const terms = useTerms();
  const session = lowerTerm(terms.attendanceSingular);
  return (
    <PageContainer>
      <Box mt="8">
        <EmptyState
          title={`No ${session} in progress`}
          description={`There is no unfinished ${session} to continue.`}
          action={
            <Button
              variant="solid"
              colorPalette="blue"
              minH="44px"
              onClick={() => navigate(PROTECTED_PATHS.CREATE_ATTENDANCE)}
            >
              {`Create ${session}`}
            </Button>
          }
        />
      </Box>
    </PageContainer>
  );
};

/**
 * Decides what this screen marks, then hands it to the roster: an edit always
 * marks the live stored record; a new session marks the working state, or —
 * when that is empty (a reload or a direct visit) — a draft restored from the
 * organisation's unfinished-draft metadata.
 */
const MarkAttendanceSession = () => {
  const [org, currentAttendance, updateCurrentAttendance] = useGlobalStore(
    (state) => [
      state.organisation,
      state.currentAttendance,
      state.updateCurrentAttendance,
    ],
  );
  const params = useParams();
  const isUpdate = params.attendanceId !== undefined;
  // The new-session working state is fixed at mount: nothing that happens
  // while marking (e.g. a successful submit clearing the store) may swap the
  // session under the officer's marks.
  const [workingSession] = useState<currentAttendanceType | null>(() =>
    isUpdate || !hasWorkingSession(currentAttendance)
      ? null
      : currentAttendance,
  );
  // A direct visit or reload with an empty working store resumes the
  // organisation's unfinished draft, if it has one. Read once: the metadata
  // is cleared on submit and that must not resurrect a session from memory.
  const [resumedSession] = useState<currentAttendanceType | null>(() => {
    if (isUpdate || hasWorkingSession(currentAttendance)) return null;
    const draft = readNewAttendanceDraft(org.id);
    return draft ? newAttendanceDraftToSession(draft) : null;
  });
  // A resumed draft becomes the working state too, so Submit and the Create
  // Attendance discard flow both act on the same session.
  useEffect(() => {
    if (resumedSession) updateCurrentAttendance(resumedSession);
  }, [resumedSession, updateCurrentAttendance]);

  if (isUpdate) {
    return <MarkAttendanceRoster isUpdate session={currentAttendance} />;
  }
  const session = workingSession ?? resumedSession;
  if (!session) return <NoUnfinishedSession />;
  return <MarkAttendanceRoster isUpdate={false} session={session} />;
};

/** The marking roster: expected members, manual additions, quick marks. */
const MarkAttendanceRoster = ({
  isUpdate,
  session,
}: {
  isUpdate: boolean;
  session: currentAttendanceType;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const terms = useTerms();
  const [searchQuery, setSearchQuery] = useState("");
  // While the search box has focus the phone keyboard covers half the screen,
  // so the sticky action bar steps aside to leave that room for results.
  const pinnedSearch = usePinnedSearch(searchQuery);
  const [org, setAttendance] = useGlobalStore((state) => [
    state.organisation,
    state.updateCurrentAttendance,
  ]);
  const clearCurrentAttendance = useGlobalStore(
    (state) => state.clearCurrentAttendance,
  );
  const params = useParams();
  // The roster draft identity: an edit uses the attendance id (its own key
  // namespace); a new session uses its date-name identity, shared with
  // Create Attendance and the discard cleanup.
  const draftIdentity = isUpdate
    ? (params.attendanceId as string)
    : newAttendanceDraftIdentity(session);
  const localStorageKey = expectedRosterDraftKey(org.id, draftIdentity);
  // Its own key, so drafts saved before manual additions existed stay valid.
  const manualStorageKey = manualRosterDraftKey(org.id, draftIdentity);
  // Every roster change goes through commitMembers so the draft never diverges.
  // `allMembers` is only ever the expected roster. An edit keeps its roster in
  // memory only — it has no resumable draft, unlike a new session.
  const [allMembers, commitMembers] = usePersistedRoster<MemberType>(
    localStorageKey,
    { persist: !isUpdate },
  );
  // Members who were not expected but physically attended, added to this
  // session only. Kept apart so they never count as (or become) expected.
  const [manualMembers, commitManual] = usePersistedRoster<ManualDraftMember>(
    manualStorageKey,
    { persist: !isUpdate },
  );
  const [isAddingMember, setIsAddingMember] = useState(false);
  // Component-local: a remount (organisation/session change) resets to Cycle.
  const [quickMarkMode, setQuickMarkMode] = useState<QuickMarkMode>(null);
  // Previous statuses of the last bulk change; null when there is nothing to undo.
  const [undoSnapshot, setUndoSnapshot] = useState<StatusSnapshot | null>(null);
  // A new session's expected roster comes from its rules; an existing session's
  // roster is the stored snapshot and its rules are display-only metadata.
  const sessionRules = useMemo(
    () => normalizeEligibilityRules(session.eligibilityRules),
    [session.eligibilityRules],
  );
  const [recordRules, setRecordRules] = useState<AttendanceEligibilityRule[]>(
    [],
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
    [memberFields],
  );
  const { categories } = useCategories(org.id);
  const detailsDrawer = useDisclosure();
  const statuses = useAttendanceStatuses();

  // Edit mode shows the session-details form, driven by the loaded session.
  const details: AttendanceDetails = {
    name: session.name ?? "",
    categoryId: session.categoryId ?? "",
    subCategoryId: session.subCategoryId ?? "",
    date: (session.date ?? "").slice(0, 10),
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
      ...session,
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
    [allMembers, manualMembers],
  );
  const manualIds = useMemo(
    () => new Set(manualMembers.map((member) => member.id)),
    [manualMembers],
  );

  // filtered list + status counts are pure derivations of the roster/search,
  // so we compute them here instead of storing (and hand-syncing) extra state.
  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return sessionRoster.filter((member) =>
      member.name.toLowerCase().includes(query),
    );
  }, [sessionRoster, searchQuery]);
  // Edit counts include any inactive historical status still on the record.
  const statusCounts = useMemo(
    () => statuses.countStatuses(sessionRoster.map((m) => m.attendanceStatus)),
    [sessionRoster, statuses],
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
      unavailableMemberIds,
    ).sort((a, b) => a.name.localeCompare(b.name));

    // A manual addition who has since become expected moves onto the expected
    // roster with the status already chosen, so nobody is submitted twice.
    const { manual, promoted } = reconcileManualDraft(
      readDraft(manualStorageKey),
      new Set(roster.map((member) => member.id)),
      currentMembers,
      statuses,
    );
    commitMembers(() =>
      reconcileAttendanceDraft(
        readDraft(localStorageKey),
        roster,
        statuses,
      ).map((member) => {
        const status = promoted.get(member.id);
        return status ? { ...member, attendanceStatus: status } : member;
      }),
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
    const toRow = (attend: typeof resolved[number]): MemberType => ({
      id: attend.memberId,
      name: attend.member.name,
      // Kept verbatim, even when the status has since been deactivated.
      attendanceStatus: attend.attendanceStatus,
    });
    commitMembers(() =>
      resolved.filter((attend) => !isManualEntry(attend)).map(toRow),
    );
    commitManual(() => resolved.filter(isManualEntry).map(toRow));
  };

  const attendUrl = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: params.attendanceId as string,
  });
  // Query for fetching attendance details when updating
  const {
    isLoading: isGettingAttendance,
    isFetching: isFetchingAttendance,
    isError: attendanceLoadErrored,
    data: storedAttendance,
    refetch: refetchAttendance,
  } = useQueryWrapper(
    queryKeys.attendance(org.id, params.attendanceId),
    attendUrl,
    {
      onSuccess: onGetAttandanceSuccess,
      enabled: isUpdate,
      // A refocus refetch would re-run onSuccess and overwrite the user's
      // in-progress name/category/date/member edits with the server values.
      refetchOnWindowFocus: false,
    },
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
  // An edit whose stored session never loaded: say so rather than showing an
  // empty roster (Submit is already blocked on an empty roster).
  const storedLoadFailed =
    isUpdate && attendanceLoadErrored && !storedAttendance;
  // Retrying a failed load only refetches. Unlike Refresh in edit mode, it
  // never discards a draft or reloads the page.
  const retryRoster = () =>
    void Promise.all([refetchMembers(), refetchAvailability()]);

  // A new session re-reads the roster but keeps its marks (e.g. after the
  // backend rejects a submit because the expected roster changed). An edit
  // discards local changes and reloads the stored record.
  const onRefresh = () => {
    setUndoSnapshot(null);
    if (isUpdate) {
      // An edit has no persisted draft to discard; reloading re-reads the
      // stored record.
      window.location.reload();
      return;
    }
    setRosterReady(false);
    void Promise.all([refetchMembers(), refetchAvailability()]);
  };

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
    [manualIds, statuses],
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
    [
      commitManual,
      commitMembers,
      manualIds,
      mayTakeStatus,
      selectedStatus,
      statuses,
    ],
  );

  // Bulk actions touch only the visible members that may take the status, so
  // e.g. Reset to the default absent status skips manual additions.
  const bulkTargets = (status: string) =>
    new Set(
      filteredMembers
        .filter((member) => mayTakeStatus(member.id, status))
        .map((member) => member.id),
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
        sessionRoster.map((member) => member.id),
      ),
    [currentMembers, sessionRoster],
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
  const sessionTerm = lowerTerm(terms.attendanceSingular);

  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const onSubmitSuccess = () => {
    isSubmittingRef.current = false;
    setUndoSnapshot(null);
    if (!isUpdate) {
      // Only a stored create finishes the draft: its metadata and both roster
      // drafts go together. An update never touches them, so an unfinished
      // new session survives editing an old attendance.
      discardNewAttendanceDraft(org.id, session);
    }
    // A finished (or updated) record is no longer the app's working state.
    clearCurrentAttendance();
    toast.success(
      isUpdate
        ? `${terms.attendanceSingular} Updated`
        : `${terms.attendanceSingular} Created successfully`,
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
    },
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
        }),
      );
    // Only the session fields the API accepts — never stray persisted state.
    // Rules only define a NEW session's roster; an update never re-resolves it.
    const data = {
      ..._.pick(session, ["name", "date", "categoryId", "subCategoryId"]),
      organisationId: org.id,
      ...(isUpdate ? {} : { eligibilityRules: sessionRules }),
      memberStatuses: (isUpdate ? sessionRoster : allMembers).map(toStatus),
      ...(!isUpdate && manualAdditions.length ? { manualAdditions } : {}),
    };
    const upateUrl = convertParamsToString(
      attendanceRequest.UPDATE_ATTENDANCE,
      {
        attendanceId: params.attendanceId as string,
      },
    );
    mutate({
      url: isUpdate ? upateUrl : attendanceRequest.ATTENDANCE,
      data,
    });
  }, [
    allMembers,
    manualMembers,
    sessionRoster,
    session,
    org.id,
    params.attendanceId,
    mutate,
    isUpdate,
    sessionRules,
  ]);

  const onSubmit = async () => {
    const confirmed = await confirm({
      title: "Please verify count",
      body: `${formatStatusCounts(
        statusCounts,
      )}. Are you sure you want to submit?`,
      confirmLabel: isUpdate ? "Update" : "Submit",
    });
    if (confirmed) sendAttandanceToAPI();
  };

  return (
    <PageContainer>
      <Flex alignItems="flex-start" justifyContent="space-between" gap={2}>
        {/* The session name alone (the old "Members …" prefix left only
              "Choristers…" visible on a phone), with its date beneath. In an
              edit both follow the details drawer. */}
        <Box minW={0}>
          <Heading fontSize="22px" lineClamp={2}>
            {isUpdate ? details.name : session.name}
          </Heading>
          <Text color="fg.muted" mt={1}>
            {formatSessionDate(isUpdate ? details.date : session.date)}
          </Text>
        </Box>
        <Flex gap={2} alignItems="center" flexShrink={0}>
          {isUpdate && (
            <IconButton
              aria-label={`Edit ${lowerTerm(terms.attendanceSingular)} details`}
              variant="outline"
              colorPalette="blue"
              minW="44px"
              h="44px"
              onClick={detailsDrawer.onOpen}
            >
              <FaPencilAlt />
            </IconButton>
          )}
          <Button
            variant="outline"
            colorPalette="blue"
            minH="44px"
            onClick={onRefresh}
          >
            Refresh
          </Button>
        </Flex>
      </Flex>
      {isLoadingData ? (
        <PageLoader
          h="45vh"
          label={`Loading ${lowerTerm(terms.memberPlural)}...`}
        />
      ) : storedLoadFailed ? (
        <Box mt="8">
          <ErrorState
            title={`Couldn't load this ${lowerTerm(terms.attendanceSingular)}`}
            onRetry={() => refetchAttendance()}
            retrying={isFetchingAttendance}
          />
        </Box>
      ) : rosterFailed ? (
        <Box mt="8">
          <ErrorState
            title={
              availabilityFailed
                ? `${terms.attendanceSingular} availability could not be loaded`
                : `${terms.memberPlural} could not be loaded`
            }
            onRetry={retryRoster}
          />
        </Box>
      ) : !isUpdate && (availabilityLoading || availabilityFetching) ? (
        <Text mt="6" color="fg.muted">
          Checking {lowerTerm(terms.attendanceSingular)} availability...
        </Text>
      ) : (
        <>
          <ExpectedRosterSummary
            title={`Expected roster: ${expectedRosterSize} ${lowerTerm(
              expectedRosterSize === 1
                ? terms.memberSingular
                : terms.memberPlural,
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
              minH="44px"
              variant="outline"
              onClick={() => setIsAddingMember(true)}
            >
              <FaUserPlus />
              {`Add ${lowerTerm(terms.memberSingular)} to this ${sessionTerm}`}
            </Button>
          )}
          <QuickMarkToolbar
            statuses={statuses.active}
            mode={selectedStatus?.key ?? null}
            onModeChange={setQuickMarkMode}
          />
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
            <Text mt="2" fontSize="sm" color="fg.muted">
              {`${
                terms.memberPlural
              } added manually can only be marked with a present status${
                manualRowsLocked
                  ? ", so tapping them does nothing in this mode"
                  : ""
              }. Bulk actions to other statuses skip them.`}
            </Text>
          )}
          <StatusCountSummary counts={statusCounts} />
          {/* Searching is how officers find people on a long roster, often
                with the keyboard open, so only the search bar stays pinned —
                anything taller would squeeze the results it is filtering. */}
          <PinnedSearchBar
            pinnedSearch={pinnedSearch}
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
          />
          <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
            {filteredMembers.length === 0 && (
              <EmptyState
                title={`No ${lowerTerm(terms.memberSingular)} found`}
                description={
                  searchQuery ? `Nothing matches "${searchQuery}".` : undefined
                }
                action={
                  searchQuery ? (
                    <Button
                      variant="outline"
                      colorPalette="gray"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear search
                    </Button>
                  ) : undefined
                }
              />
            )}
            {/* The roster scrolls with the page: a nested scroll box left a
                  few rows visible and fought the page for every swipe. */}
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
                        minH="44px"
                        minW="44px"
                        variant="ghost"
                        colorPalette="red"
                        aria-label={`Remove ${item.name} from this ${sessionTerm}`}
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
          <Flex
            position="sticky"
            bottom={0}
            zIndex="sticky"
            display={pinnedSearch.isFocused ? "none" : "flex"}
            gap={3}
            mt="6"
            mx={-4}
            px={4}
            pt={3}
            pb="calc(12px + env(safe-area-inset-bottom))"
            bg="bg.subtle"
            borderTopWidth="1px"
          >
            <Button
              onClick={() => navigate(-1)}
              flex="1"
              variant="outline"
              colorPalette="gray"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              flex="2"
              loading={isLoading}
              disabled={
                sessionRoster.length === 0 ||
                (isUpdate && (!details.name.trim() || !details.date))
              }
            >
              {isUpdate ? "Update" : "Submit"}
            </Button>
          </Flex>
        </>
      )}

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
        <Drawer.Root
          open={detailsDrawer.open}
          placement="end"
          size={{ base: "full", md: "md" }}
          onOpenChange={(e) => {
            if (!e.open) {
              detailsDrawer.onClose();
            }
          }}
        >
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content>
                <Drawer.CloseTrigger asChild>
                  <CloseButton size="sm" minW="44px" minH="44px" />
                </Drawer.CloseTrigger>
                <Drawer.Header>
                  <Drawer.Title>{`${terms.attendanceSingular} details`}</Drawer.Title>
                </Drawer.Header>
                <Drawer.Body>
                  <AttendanceDetailsForm
                    value={details}
                    onChange={onDetailsChange}
                    categories={categories}
                  />
                </Drawer.Body>
                <Drawer.Footer>
                  <Button
                    w="full"
                    variant="primary"
                    onClick={detailsDrawer.onClose}
                  >
                    Done
                  </Button>
                </Drawer.Footer>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      )}
      {confirmDialog}
    </PageContainer>
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
