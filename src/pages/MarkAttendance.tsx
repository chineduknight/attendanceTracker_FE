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
import { FaSearch, FaPencilAlt } from "react-icons/fa";
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
import { splitStoredRoster, UnresolvedRosterEntry } from "helpers/storedRoster";
import {
  restoreStatuses,
  StatusSnapshot,
  updateStatuses,
} from "helpers/attendanceBulk";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import { useAttendanceAvailabilityForDate } from "hooks/useAttendanceAvailability";
import { filterAvailableMembers } from "helpers/attendanceAvailability";

export type MemberType = {
  /** A configured status key of the selected organisation. */
  attendanceStatus: string;
  name: string;
  id: string;
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
  // Every roster change goes through commitMembers so the draft never diverges.
  const [allMembers, commitMembers] =
    usePersistedRoster<MemberType>(localStorageKey);
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

  // filtered list + status counts are pure derivations of allMembers/searchQuery,
  // so we compute them here instead of storing (and hand-syncing) extra state.
  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return allMembers.filter((member) =>
      member.name.toLowerCase().includes(query)
    );
  }, [allMembers, searchQuery]);
  // Edit counts include any inactive historical status still on the record.
  const statusCounts = useMemo(
    () => statuses.countStatuses(allMembers.map((m) => m.attendanceStatus)),
    [allMembers, statuses]
  );

  const expectedRosterSize = allMembers.length + unresolvedEntries.length;

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
    if (isUpdate || !membersLoaded || !availabilitySuccess) return;
    const roster = filterAvailableMembers(
      filterEligibleMembers(currentMembers, sessionRules),
      unavailableMemberIds
    ).sort((a, b) => a.name.localeCompare(b.name));

    let draft: unknown = null;
    const localAttendance = localStorage.getItem(localStorageKey);
    if (localAttendance) {
      try {
        draft = JSON.parse(localAttendance);
      } catch {
        draft = null;
      }
    }

    commitMembers(() => reconcileAttendanceDraft(draft, roster, statuses));
    setRosterReady(true);
  }, [
    isUpdate,
    membersLoaded,
    availabilitySuccess,
    currentMembers,
    sessionRules,
    unavailableMemberIds,
    statuses,
    localStorageKey,
    commitMembers,
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
    const { resolved, unresolved } = splitStoredRoster(res.data.attendance);
    setUnresolvedEntries(unresolved);
    const updatedMembers = resolved.map((attend) => ({
      id: attend.memberId,
      name: attend.member.name,
      // Kept verbatim, even when the status has since been deactivated.
      attendanceStatus: attend.attendanceStatus,
    }));
    commitMembers(() => updatedMembers);
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

  // Tapping a member assigns the selected status, or in Cycle mode advances
  // them through the organisation's active statuses. A manual edit makes any
  // pending bulk Undo stale, so it is discarded.
  const markMember = useCallback(
    (memberId: string) => {
      const nextStatus = selectedStatus
        ? () => selectedStatus.key
        : statuses.next;
      commitMembers(
        (current) =>
          updateStatuses(current, new Set([memberId]), nextStatus).members
      );
      setUndoSnapshot(null);
    },
    [commitMembers, selectedStatus, statuses]
  );

  // Bulk actions touch only the members the current search shows.
  const setVisibleStatus = (status: string) => {
    const visibleIds = new Set(filteredMembers.map((member) => member.id));
    let snapshot: StatusSnapshot = new Map();
    commitMembers((current) => {
      const update = updateStatuses(current, visibleIds, () => status);
      snapshot = update.snapshot;
      return update.members;
    });
    setUndoSnapshot(snapshot);
  };

  const undoBulkChange = () => {
    if (!undoSnapshot) return;
    commitMembers((current) => restoreStatuses(current, undoSnapshot));
    setUndoSnapshot(null);
  };

  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const onSubmitSuccess = () => {
    isSubmittingRef.current = false;
    setUndoSnapshot(null);
    localStorage.removeItem(localStorageKey);
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
      memberStatuses: allMembers.map((member) => ({
        memberId: member.id,
        status: member.attendanceStatus,
      })),
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
              ? "Attendance availability could not be loaded. Use Refresh to try again."
              : `${terms.memberPlural} could not be loaded. Use Refresh to try again.`}
          </Text>
        ) : !isUpdate && (availabilityLoading || availabilityFetching) ? (
          <Text mt="6" color="gray.600">
            Checking attendance availability...
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
            />
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
              visibleCount={filteredMembers.length}
              selectedStatus={selectedStatus}
              defaultStatus={statuses.defaultStatus}
              canUndo={undoSnapshot !== null}
              onApply={() =>
                selectedStatus && setVisibleStatus(selectedStatus.key)
              }
              onReset={() => setVisibleStatus(statuses.defaultStatus.key)}
              onUndo={undoBulkChange}
            />
            {filteredMembers.length === 0 && (
              <Box mt="4">
                <Text ml="4" fontWeight="bold">
                  {`No ${lowerTerm(terms.memberSingular)} found`}
                </Text>
              </Box>
            )}
            <StatusCountSummary counts={statusCounts} />
            <Box mt="4" overflow="auto" maxHeight="300px">
              {filteredMembers.map((item) => (
                <AttendanceMemberRow
                  key={item.id}
                  memberId={item.id}
                  name={item.name}
                  status={statuses.resolve(item.attendanceStatus)}
                  onToggle={markMember}
                />
              ))}
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
                allMembers.length === 0 ||
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
