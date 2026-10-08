import {
  Box,
  Flex,
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
} from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { confirmAlert } from "react-confirm-alert";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest } from "services";
import {
  deleteRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { format } from "date-fns";
import LoadingSpinner from "components/LoadingSpinner";
import {
  FaFileExcel,
  FaSearch,
  FaShareAlt,
  FaTrash,
  FaUserPlus,
} from "react-icons/fa";
import { FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import ReactSelect, { MultiValue } from "react-select";
import { queryKeys } from "services/api/queryKeys";
import { usePinnedSearch } from "hooks/usePinnedSearch";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import AttendanceMemberRow from "components/attendance/AttendanceMemberRow";
import StatusCountSummary from "components/attendance/StatusCountSummary";
import { buildAttendanceShareMessage } from "helpers/attendanceShareMessage";
import {
  AttendanceEligibilityRule,
  eligibilityIssues,
  normalizeEligibilityRules,
} from "helpers/attendanceEligibility";
import { useMemberModel } from "hooks/useMemberModel";
import { memberFieldLabeler } from "helpers/memberFields";
import ExpectedRosterSummary from "components/attendance/ExpectedRosterSummary";
import UnresolvedRosterEntries from "components/attendance/UnresolvedRosterEntries";
import {
  isManualEntry,
  splitStoredRoster,
  StoredRosterEntry,
  UnresolvedRosterEntry,
} from "helpers/storedRoster";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import AnalyticsInclusionPanel from "components/attendance/AnalyticsInclusionPanel";
import {
  AnalyticsInclusion,
  toAnalyticsInclusion,
} from "helpers/attendanceAnalyticsInclusion";
import { Can } from "rbac/Can";
import ConfirmModal from "components/finance/ConfirmModal";
import ManualMemberDialog from "components/attendance/ManualMemberDialog";
import { useManualAttendanceMember } from "hooks/useManualAttendanceMember";
import { useMembers } from "hooks/useMembers";
import { manualCandidates } from "helpers/manualAttendance";
import { canChangeStoredRoster } from "helpers/attendanceEdits";

type StatusOption = {
  value: string;
  label: string;
};

type MemberType = StoredRosterEntry & {
  /** Configured status key; may be inactive or unknown on historical records. */
  attendanceStatus: string;
  _id: string;
  member: {
    name: string;
    status: string;
    gender?: string;
    part?: string;
  };
};

/** Reason and date of a manual addition, for anyone who can view the session. */
const manualAdditionNote = (entry: MemberType): string | undefined => {
  if (!isManualEntry(entry)) return undefined;
  const parts = [
    entry.manualAdditionReason ? `Reason: ${entry.manualAdditionReason}` : "",
    entry.manuallyAddedAt
      ? `Added ${format(new Date(entry.manuallyAddedAt), "dd MMM yyyy")}`
      : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
};

type AttendanceInfoType = {
  name: string;
  date: Date;
  /**
   * Expected entries of the stored roster snapshot, including those whose
   * member profile no longer resolves — never recomputed from current members
   * and never counting manual additions.
   */
  expectedCount: number;
  manualCount: number;
  rosterCount: number;
  /** Every stored member id, resolvable or not — never a manual candidate. */
  rosterMemberIds: string[];
  /** Display hint only; the backend decides whether an edit is still allowed. */
  canChangeRoster: boolean;
  unresolved: UnresolvedRosterEntry[];
  eligibilityRules: AttendanceEligibilityRule[];
  analyticsInclusion: AnalyticsInclusion;
};

// "All" sentinel shared by both multi-selects: selecting it clears the others.
const ALL = "all";
const nextMultiFilter = (values: string[]): string[] => {
  const last = values[values.length - 1];
  if (last === undefined || last === ALL) return [ALL];
  return values.filter((v) => v !== ALL);
};
const activeFilterValues = (filter: string[]) => filter.filter((v) => v !== ALL);

const Attendance = () => {
  const terms = useTerms();
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const pinnedSearch = usePinnedSearch(searchQuery);
  const [statusFilter, setStatusFilter] = useState<string[]>([ALL]);
  const [attendanceFilter, setAttendanceFilter] = useState<string[]>([ALL]);
  const statuses = useAttendanceStatuses();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>();
  const navigate = useNavigate();
  const onSuccess = (data) => {
    const {
      resolved: unsorted,
      unresolved,
      expectedCount,
      manualCount,
      rosterCount,
    } = splitStoredRoster<MemberType>(data.data.attendance);
    // Configured status order first; unknown historical statuses sort last.
    const members = unsorted.sort(
      (a, b) =>
        statuses.rank(a.attendanceStatus) - statuses.rank(b.attendanceStatus) ||
        a.member.name.localeCompare(b.member.name),
    );

    setAttendanceInfo({
      name: data.data.name,
      date: data.data.date,
      expectedCount,
      manualCount,
      rosterCount,
      rosterMemberIds: data.data.attendance.map(
        (entry: MemberType) => entry.memberId,
      ),
      canChangeRoster: canChangeStoredRoster(data.data),
      unresolved,
      eligibilityRules: normalizeEligibilityRules(data.data.eligibilityRules),
      analyticsInclusion: toAnalyticsInclusion(data.data),
    });

    setAllMembers(members);
  };
  const param = useParams();
  const url = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: param.id as string,
  });

  const { isFetching: isFetchingAttendance } = useQueryWrapper(
    queryKeys.attendance(org.id, param.id),
    url,
    {
      onSuccess,
      refetchOnWindowFocus: false,
    },
  );
  const isLoadingAttendance = isFetchingAttendance && allMembers.length === 0;

  const { fields: memberFields, isSuccess: memberModelLoaded } = useMemberModel(
    org.id,
  );
  const storedRules = attendanceInfo?.eligibilityRules ?? [];
  const labelFor = useMemo(() => memberFieldLabeler(memberFields), [memberFields]);
  // Only flagged once the current model is known; the roster itself is untouched.
  const rulesOutdated =
    memberModelLoaded && eligibilityIssues(storedRules, memberFields).length > 0;

  const handleSearch = useCallback((e) => setSearchQuery(e.target.value), []);

  const statusOptions = useMemo<StatusOption[]>(() => {
    const unique = Array.from(
      new Set(allMembers.map((m) => m.member.status).filter(Boolean)),
    );
    return [
      { value: ALL, label: "All" },
      ...unique.map((s) => ({ value: s, label: capitalize(s) })),
    ];
  }, [allMembers]);

  const selectedStatusOptions = useMemo(
    () => statusOptions.filter((o) => statusFilter.includes(o.value)),
    [statusOptions, statusFilter],
  );

  // Active statuses plus any inactive/unknown status recorded on this session.
  // Active statuses plus any inactive/unknown status recorded on this session.
  const attendanceOptions = useMemo<StatusOption[]>(
    () => [
      { value: ALL, label: "All" },
      ...statuses
        .legendFor(allMembers.map((m) => m.attendanceStatus))
        .map((status) => ({ value: status.key, label: status.label })),
    ],
    [allMembers, statuses],
  );

  const selectedAttendanceOptions = useMemo(
    () => attendanceOptions.filter((o) => attendanceFilter.includes(o.value)),
    [attendanceOptions, attendanceFilter],
  );

  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const memberStatuses = activeFilterValues(statusFilter);
    const attendanceStatuses = activeFilterValues(attendanceFilter);
    return allMembers.filter(
      (m) =>
        m.member.name.toLowerCase().includes(query) &&
        (memberStatuses.length === 0 ||
          memberStatuses.includes(m.member.status)) &&
        (attendanceStatuses.length === 0 ||
          attendanceStatuses.includes(m.attendanceStatus)),
    );
  }, [allMembers, searchQuery, statusFilter, attendanceFilter]);

  const filteredCounts = useMemo(
    () => statuses.countStatuses(filteredMembers.map((m) => m.attendanceStatus)),
    [filteredMembers, statuses],
  );

  const formattedDate = attendanceInfo?.date
    ? format(new Date(attendanceInfo.date), "EEE dd MMM yy")
    : "";

  const handleSendToWhatsapp = () => {
    const message = buildAttendanceShareMessage({
      orgName: org.name,
      sessionName: attendanceInfo?.name ?? "",
      formattedDate,
      members: allMembers,
      statuses,
      terminology: terms,
    });
    if (navigator.share) {
      navigator.share({ title: "", text: message }).catch(() => {
        /* user dismissed the native share sheet */
      });
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const downloadURl = useMemo(() => {
    const base = convertParamsToString(attendanceRequest.EXPORT, {
      organisationId: org.id,
      id: param.id as string,
    });
    const query = new URLSearchParams();
    const memberStatuses = activeFilterValues(statusFilter);
    if (memberStatuses.length) query.set("status", memberStatuses.join(","));
    const attendanceStatuses = activeFilterValues(attendanceFilter);
    if (attendanceStatuses.length) {
      query.set("attendanceStatus", attendanceStatuses.join(","));
    }
    const search = query.toString();
    return search ? `${base}?${search}` : base;
  }, [org.id, param.id, statusFilter, attendanceFilter]);

  const { refetch, isFetching } = useQueryWrapper(
    [
      ...queryKeys.attendanceExport(org.id, param.id as string),
      statusFilter.join(","),
      attendanceFilter.join(","),
    ],
    downloadURl,
    {
      enabled: false,
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        window.open(data.data);
      },
      onError: (error: any) => {
        const message =
          error?.response?.data?.error ?? "Failed to export. Please try again.";
        toast.error(message);
      },
    },
  );

  const sendToExcel = () => {
    refetch();
  };

  const deleteUrl = convertParamsToString(attendanceRequest.DELETE_ATTENDANCE, {
    organisationId: org.id,
    id: param.id as string,
  });

  const { mutate: deleteAttendance, isLoading: isDeleting } =
    useMutationWrapper(
      deleteRequest,
      () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.attendances(org.id) });
        navigate(PROTECTED_PATHS.ALL_ATTENDANCE);
      },
      (error: any) => {
        const message =
          error?.response?.data?.error ??
          `Failed to delete ${lowerTerm(terms.attendanceSingular)}.`;
        toast.error(message);
      },
    );

  // Manual one-session exceptions. The roster on screen only changes once the
  // backend confirms and the session is refetched.
  const session = lowerTerm(terms.attendanceSingular);
  const memberTerm = lowerTerm(terms.memberSingular);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [removing, setRemoving] = useState<MemberType | null>(null);
  const { addMember, removeMember, isAdding, isRemoving } =
    useManualAttendanceMember(org.id, param.id as string);
  const {
    members: currentMembers,
    isLoading: membersLoading,
    isError: membersFailed,
  } = useMembers(org.id, { enabled: isAddingMember });
  const candidates = useMemo(
    () => manualCandidates(currentMembers, attendanceInfo?.rosterMemberIds ?? []),
    [currentMembers, attendanceInfo?.rosterMemberIds],
  );
  const canChangeRoster = attendanceInfo?.canChangeRoster ?? false;

  const handleDelete = () => {
    confirmAlert({
      title: `Delete ${terms.attendanceSingular}`,
      message: `Are you sure you want to delete this ${lowerTerm(
        terms.attendanceSingular,
      )} record? This cannot be undone.`,
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => deleteAttendance({ url: deleteUrl }),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
  };
  const pageBg = useColorModeValue("gray.50", "gray.800");

  return (
    <Box minH={"100vh"} bg={pageBg}>
      <Container>
        {isLoadingAttendance ? (
          <LoadingSpinner
            h="40vh"
            text={`Loading ${lowerTerm(terms.attendancePlural)}...`}
          />
        ) : (
          <>
            {/* Title first, date beneath it, so a long session name never
                collides with the date on a narrow screen. */}
            <Box mt="4">
              <Heading fontSize="22px" lineClamp={2}>
                {attendanceInfo?.name}
              </Heading>
              <Text color="gray.600" mt={1}>
                {formattedDate}
              </Text>
            </Box>
            {/* Sharing the session just marked is the page's main job, so
                Share leads as the solid action; Excel export is secondary. */}
            <Flex mt="3" gap={2}>
              <Button flex="1" onClick={handleSendToWhatsapp}><FaShareAlt />Share
                              </Button>
              <Button
                flex="1"
                onClick={sendToExcel}
                loading={isFetching}
                variant="outline"
                colorPalette="green"><FaFileExcel />Export to Excel
                              </Button>
            </Flex>
            {attendanceInfo && (
              <ExpectedRosterSummary
                title={`Expected ${lowerTerm(terms.memberPlural)}: ${attendanceInfo.expectedCount}`}
                rules={storedRules}
                isOutdated={rulesOutdated}
                labelFor={labelFor}
                manualCount={attendanceInfo.manualCount}
                rosterCount={attendanceInfo.rosterCount}
              />
            )}
            {attendanceInfo && (
              <Can perm="attendance.manage">
                <Button
                  mt="3"
                  size="sm"
                  variant="outline"
                  disabled={!canChangeRoster}
                  onClick={() => setIsAddingMember(true)}><FaUserPlus />{`Add ${memberTerm} to this ${session}`}</Button>
                {!canChangeRoster && (
                  <Text fontSize="sm" color="gray.500" mt={1}>
                    {`No edits remain for this ${session}.`}
                  </Text>
                )}
              </Can>
            )}
            {attendanceInfo && (
              <AnalyticsInclusionPanel
                organisationId={org.id}
                attendanceId={param.id as string}
                inclusion={attendanceInfo.analyticsInclusion}
              />
            )}
            {/* Side by side even on a phone: each filter takes half the width,
                so the placeholders stay short while aria-labels keep the
                full wording. */}
            <Flex mt="4" gap={2}>
              <Box flex="1" minW={0}>
                <ReactSelect
                  isMulti
                  aria-label={`Filter by ${lowerTerm(
                    terms.attendanceSingular,
                  )} status`}
                  placeholder={`${terms.attendanceSingular} status`}
                  options={attendanceOptions}
                  value={selectedAttendanceOptions}
                  closeMenuOnSelect={false}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                  onChange={(selected: MultiValue<StatusOption>) =>
                    setAttendanceFilter(nextMultiFilter(selected.map((o) => o.value)))
                  }
                />
              </Box>
              <Box flex="1" minW={0}>
                <ReactSelect
                  isMulti
                  aria-label={`Filter by ${lowerTerm(terms.memberSingular)} status`}
                  placeholder={`${terms.memberSingular} status`}
                  options={statusOptions}
                  value={selectedStatusOptions}
                  closeMenuOnSelect={false}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                  onChange={(selected: MultiValue<StatusOption>) =>
                    setStatusFilter(nextMultiFilter(selected.map((o) => o.value)))
                  }
                />
              </Box>
            </Flex>
            <StatusCountSummary counts={filteredCounts} />
            {/* Only the search bar is pinned: with the phone keyboard open,
                anything taller would squeeze the results it is filtering. */}
            <Box
              ref={pinnedSearch.barRef}
              position="sticky"
              top={0}
              zIndex="sticky"
              bg={pageBg}
              mx={-4}
              px={4}
              py={2}
              mt="2"
            >
              <InputGroup>
                <InputLeftElement pointerEvents="none">
                  <Icon color="gray.400" asChild><FaSearch /></Icon>
                </InputLeftElement>
                <Input
                  type="text"
                  placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
                  value={searchQuery}
                  onChange={handleSearch}
                  {...pinnedSearch.inputProps}
                />
                {searchQuery && (
                  <InputRightElement>
                    <IconButton
                      aria-label="Clear search"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSearchQuery("")}><FiX /></IconButton>
                  </InputRightElement>
                )}
              </InputGroup>
            </Box>
            {/* The roster scrolls with the page rather than in a nested box. */}
            <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
              {filteredMembers.length === 0 && (
                <Box mt="4">
                  <Text ml="4" fontWeight="bold">
                    {`No ${lowerTerm(terms.memberSingular)} found`}
                  </Text>
                </Box>
              )}
              {filteredMembers.map((item) => (
                <AttendanceMemberRow
                  key={item.memberId}
                  memberId={item.memberId}
                  name={item.member.name}
                  status={statuses.resolve(item.attendanceStatus)}
                  isManual={isManualEntry(item)}
                  note={manualAdditionNote(item)}
                  accessory={
                    isManualEntry(item) ? (
                      <Can perm="attendance.manage">
                        <Button
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          aria-label={`Remove ${item.member.name} from this ${session}`}
                          disabled={!canChangeRoster}
                          onClick={() => setRemoving(item)}
                        >
                          Remove
                        </Button>
                      </Can>
                    ) : undefined
                  }
                />
              ))}
            </Box>
            {attendanceInfo && (
              <UnresolvedRosterEntries
                entries={attendanceInfo.unresolved}
                statuses={statuses}
              />
            )}
            <Button
              onClick={handleDelete}
              loading={isDeleting}
              bg="red.500"
              color="white"
              _hover={{ bg: "red.600" }}
              w="full"
              mt="4"
              mb="8"><FaTrash />{`Delete ${terms.attendanceSingular}`}</Button>
          </>
        )}
      </Container>

      <ManualMemberDialog
        isOpen={isAddingMember}
        candidates={candidates}
        statuses={statuses}
        isLoadingCandidates={membersLoading}
        candidatesFailed={membersFailed}
        isSaving={isAdding}
        onSubmit={(input) =>
          addMember(input, () => {
            toast.success(`${terms.memberSingular} added to this ${session}.`);
            setIsAddingMember(false);
          })
        }
        onClose={() => setIsAddingMember(false)}
      />
      <ConfirmModal
        isOpen={removing !== null}
        title={`Remove ${removing?.member.name ?? ""} from this ${session}?`}
        body={`${removing?.member.name ?? ""} was manually added to this ${session}. Removing them deletes this historical attendance entry from this ${session} only.`}
        cancelLabel="Cancel"
        confirmLabel={`Remove from this ${session}`}
        confirmColorScheme="red"
        isLoading={isRemoving}
        onConfirm={() =>
          removing &&
          removeMember(removing.memberId, () => {
            toast.success(`${terms.memberSingular} removed from this ${session}.`);
            setRemoving(null);
          })
        }
        onClose={() => !isRemoving && setRemoving(null)}
      />
    </Box>
  );
};

export default Attendance;
