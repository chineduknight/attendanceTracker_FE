import {
  Box,
  chakra,
  Flex,
  Text,
  Button,
  Heading,
} from "@chakra-ui/react";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useConfirm } from "components/ui/confirm-dialog";
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
import PageLoader from "components/PageLoader";
import {
  FaFileExcel,
  FaShareAlt,
  FaTrash,
  FaUserPlus,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { MultiValue, StylesConfig } from "react-select";
import { ThemedSelect } from "components/ui/themed-select";
import { queryKeys } from "services/api/queryKeys";
import { usePinnedSearch } from "hooks/usePinnedSearch";
import PinnedSearchBar from "components/PinnedSearchBar";
import PageContainer from "components/layout/PageContainer";
import { formatSessionDate } from "helpers/sessionDate";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import AttendanceMemberRow from "components/attendance/AttendanceMemberRow";
import StatusCountSummary from "components/attendance/StatusCountSummary";
import {
  awayForShare,
  buildAttendanceShareMessage,
  ShareMember,
} from "helpers/attendanceShareMessage";
import { effectiveAttendanceShareTemplate } from "helpers/attendanceShareTemplate";
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
import { ConfirmDialog } from "components/ui/confirm-dialog";
import ManualMemberDialog from "components/attendance/ManualMemberDialog";
import { useManualAttendanceMember } from "hooks/useManualAttendanceMember";
import { useMembers } from "hooks/useMembers";
import { manualCandidates } from "helpers/manualAttendance";
import { canChangeStoredRoster } from "helpers/attendanceEdits";
import { fetchAttendanceAvailabilityForDate } from "hooks/useAttendanceAvailability";
import { isValidAvailabilityDate } from "helpers/attendanceAvailability";
import { useShareReport } from "hooks/useShareReport";
import { ShareReportDialog, ShareReportError } from "components/attendance/ShareReport";

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

/**
 * A stored roster row exactly as the attendance API returns it: `member` is
 * null for entries whose profile can no longer be resolved.
 */
type StoredEntryRow = StoredRosterEntry & {
  member: {
    name: string;
    status: string;
    gender?: string;
    part?: string;
  } | null;
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
   * `organisationId:attendanceId` of the session this snapshot was loaded
   * for. Sharing refuses to run against any other session, so a switch in
   * flight can never send the previous session's roster.
   */
  sessionKey: string;
  /**
   * The complete saved roster — resolved and unresolved entries, manual
   * additions included — as the one source for share calculations.
   */
  shareRoster: ShareMember[];
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

/** The small caption above each roster filter. */
const FilterLabel = chakra("label", {
  base: {
    display: "block",
    fontSize: "sm",
    fontWeight: "medium",
    color: "fg.muted",
    mb: 1,
    lineClamp: 1,
  },
});

// The two filters share a 320px row: tighten the padding. "All" has no ✕ — removing it only puts it back — so a tap on the
// chip, in the middle of a narrow control, opens the menu instead.
const COMPACT_FILTER_STYLES: StylesConfig<StatusOption, true> = {
  valueContainer: (base) => ({ ...base, paddingLeft: 8, paddingRight: 2 }),
  multiValueLabel: (base, { data }) =>
    data.value === ALL ? { ...base, paddingRight: 6 } : base,
  multiValueRemove: (base, { data }) =>
    data.value === ALL ? { display: "none" } : base,
};

const Attendance = () => {
  const { confirm, confirmDialog } = useConfirm();
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
  const param = useParams();
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
      // Bound to the session it was loaded for, so a stale snapshot can never
      // be shown or shared under a different session.
      sessionKey: `${org.id}:${param.id}`,
      // Sharing reads the stored roster itself — unresolved and manual
      // entries included — never today's member list.
      shareRoster: (data.data.attendance as StoredEntryRow[]).map((entry) => ({
        attendanceStatus: entry.attendanceStatus,
        member: entry.member
          ? {
              name: entry.member.name,
              status: entry.member.status,
              gender: entry.member.gender,
              part: entry.member.part,
            }
          : null,
      })),
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
  // The session identity the URL currently points at; a snapshot only counts
  // once it was loaded for exactly this session.
  const sessionKey = `${org.id}:${param.id}`;
  const url = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: param.id as string,
  });

  const {
    isFetching: isFetchingAttendance,
    isError: attendanceFailed,
    error: attendanceError,
    refetch: refetchAttendance,
  } = useQueryWrapper(
    queryKeys.attendance(org.id, param.id),
    url,
    {
      onSuccess,
      refetchOnWindowFocus: false,
    },
  );
  // A snapshot counts only for the session in the URL. Until one exists for
  // that session, show the loader (or the load error) — never a previous
  // session's roster, which could otherwise be shown or shared by mistake.
  const snapshotIsCurrent = attendanceInfo?.sessionKey === sessionKey;
  const isLoadingAttendance = !snapshotIsCurrent && !attendanceFailed;

  const { fields: memberFields, isSuccess: memberModelLoaded } = useMemberModel(
    org.id,
  );
  const storedRules = attendanceInfo?.eligibilityRules ?? [];
  const labelFor = useMemo(() => memberFieldLabeler(memberFields), [memberFields]);
  // Only flagged once the current model is known; the roster itself is untouched.
  const rulesOutdated =
    memberModelLoaded && eligibilityIssues(storedRules, memberFields).length > 0;


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

  // Unfiltered, the tally describes the whole saved roster, so it adds the
  // read-only entries whose profile no longer resolves — those rows are
  // always on screen. While any search or filter is active the tally keeps
  // describing exactly the rows that matched, as before.
  const unfiltered =
    searchQuery === "" &&
    statusFilter.includes(ALL) &&
    attendanceFilter.includes(ALL);
  const filteredCounts = useMemo(
    () =>
      statuses.countStatuses([
        ...filteredMembers.map((m) => m.attendanceStatus),
        ...(unfiltered
          ? (attendanceInfo?.unresolved ?? []).map((u) => u.attendanceStatus)
          : []),
      ]),
    [filteredMembers, statuses, unfiltered, attendanceInfo?.unresolved],
  );

  // The stored calendar day, never shifted by the device timezone.
  const formattedDate = formatSessionDate(attendanceInfo?.date);

  // Each Share reads who is away on the session's own date afresh — a
  // period may have been edited or archived since — then builds the message
  // from the complete stored snapshot. Only the current session's snapshot
  // may be shared: switching session or organisation, or reloading it,
  // discards anything prepared or pending (see useShareReport).
  const prepareShareMessage = async (info: AttendanceInfoType) => {
    const sessionDate = formatSessionDate(info.date, "yyyy-MM-dd");
    if (!isValidAvailabilityDate(sessionDate)) {
      throw new Error("This session has no valid date.");
    }
    const periods = await fetchAttendanceAvailabilityForDate(org.id, sessionDate);
    return buildAttendanceShareMessage({
      orgName: org.name,
      sessionName: info.name,
      formattedDate: formatSessionDate(info.date),
      members: info.shareRoster,
      statuses,
      terminology: terms,
      // Read at share time, so a template saved in Settings applies to the
      // next message without reloading the session.
      template: effectiveAttendanceShareTemplate(org),
      away: awayForShare(periods, {
        sessionDate,
        rosterMemberIds: info.rosterMemberIds,
      }),
    });
  };
  const share = useShareReport(
    snapshotIsCurrent && attendanceInfo ? attendanceInfo : null,
    prepareShareMessage,
  );

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

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${terms.attendanceSingular}`,
      body: `Are you sure you want to delete this ${lowerTerm(
        terms.attendanceSingular,
      )} record? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) deleteAttendance({ url: deleteUrl });
  };

  return (
    <PageContainer>
        {isLoadingAttendance ? (
          <PageLoader
            h="40vh"
            label={`Loading ${lowerTerm(terms.attendancePlural)}...`}
          />
        ) : attendanceFailed && !snapshotIsCurrent ? (
          <Box mt="8">
            <ErrorState
              title={`Couldn't load this ${lowerTerm(terms.attendanceSingular)}`}
              description={errorMessage(attendanceError)}
              onRetry={() => refetchAttendance()}
              retrying={isFetchingAttendance}
            />
          </Box>
        ) : (
          <>
            {/* Title first, date beneath it, so a long session name never
                collides with the date on a narrow screen. */}
            <Box>
              <Heading fontSize="22px" lineClamp={2}>
                {attendanceInfo?.name}
              </Heading>
              <Text color="fg.muted" mt={1}>
                {formattedDate}
              </Text>
            </Box>
            {/* Sharing the session just marked is the page's main job, so
                Share leads as the solid action; Excel export is secondary. */}
            <Flex mt="3" gap={2}>
              <Button
                flex="1"
                minH="44px"
                onClick={share.start}
                loading={share.state.phase === "preparing"}
                loadingText="Preparing message..."
              >
                <FaShareAlt />
                Share
              </Button>
              <Button
                flex="1"
                minH="44px"
                onClick={sendToExcel}
                loading={isFetching}
                variant="outline"
                colorPalette="green"
                // "Export to" is dropped on narrow phones so the label fits;
                // the accessible name stays complete.
                aria-label="Export to Excel"
              >
                <FaFileExcel />
                <Box as="span" display={{ base: "none", sm: "inline" }}>
                  Export to
                </Box>
                Excel
              </Button>
            </Flex>
            {share.state.phase === "failed" && (
              <ShareReportError
                error={share.state.error}
                onRetry={share.start}
                onCancel={share.cancel}
              />
            )}
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
                  minH="44px"
                  variant="outline"
                  disabled={!canChangeRoster}
                  onClick={() => setIsAddingMember(true)}><FaUserPlus />{`Add ${memberTerm} to this ${session}`}</Button>
                {!canChangeRoster && (
                  <Text fontSize="sm" color="fg.muted" mt={1}>
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
            {/* Side by side at every width. Neither filter has a clear-all ✕:
                choosing "All" (or a chip's own ✕) already resets it, and the
                44px button left half of a 320px screen showing only "A…". */}
            <Flex mt="4" gap={2}>
              <Box flex="1" minW={0}>
                {/* Both filters read "All" until used: the label says which is which. */}
                <FilterLabel htmlFor="attendance-status-filter">
                  {`${terms.attendanceSingular} status`}
                </FilterLabel>
                <ThemedSelect
                  isMulti
                  inputId="attendance-status-filter"
                  aria-label={`Filter by ${lowerTerm(
                    terms.attendanceSingular,
                  )} status`}
                  placeholder={`${terms.attendanceSingular} status`}
                  options={attendanceOptions}
                  value={selectedAttendanceOptions}
                  isClearable={false}
                  styles={COMPACT_FILTER_STYLES}
                  closeMenuOnSelect={false}
                  onChange={(selected: MultiValue<StatusOption>) =>
                    setAttendanceFilter(nextMultiFilter(selected.map((o) => o.value)))
                  }
                />
              </Box>
              <Box flex="1" minW={0}>
                <FilterLabel htmlFor="member-status-filter">
                  {`${terms.memberSingular} status`}
                </FilterLabel>
                <ThemedSelect
                  isMulti
                  inputId="member-status-filter"
                  aria-label={`Filter by ${lowerTerm(terms.memberSingular)} status`}
                  placeholder={`${terms.memberSingular} status`}
                  options={statusOptions}
                  value={selectedStatusOptions}
                  isClearable={false}
                  styles={COMPACT_FILTER_STYLES}
                  closeMenuOnSelect={false}
                  onChange={(selected: MultiValue<StatusOption>) =>
                    setStatusFilter(nextMultiFilter(selected.map((o) => o.value)))
                  }
                />
              </Box>
            </Flex>
            <StatusCountSummary counts={filteredCounts} />
            {/* Only the search bar is pinned: with the phone keyboard open,
                anything taller would squeeze the results it is filtering. */}
            <PinnedSearchBar
              pinnedSearch={pinnedSearch}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
            />
            {/* The roster scrolls with the page rather than in a nested box. */}
            <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
              {filteredMembers.length === 0 && (
                <EmptyState
                  title={`No ${lowerTerm(terms.memberSingular)} found`}
                  description={searchQuery ? `Nothing matches "${searchQuery}".` : undefined}
                  action={
                    searchQuery ? (
                      <Button variant="outline" colorPalette="gray" onClick={() => setSearchQuery("")}>
                        Clear search
                      </Button>
                    ) : undefined
                  }
                />
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
                          minH="44px"
                          minW="44px"
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
            <Can perm="attendance.manage">
              <Button
                onClick={handleDelete}
                loading={isDeleting}
                variant="solid"
                colorPalette="red"
                w="full"
                mt="4"
                mb="8"><FaTrash />{`Delete ${terms.attendanceSingular}`}</Button>
            </Can>
          </>
        )}

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
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.member.name ?? ""} from this ${session}?`}
        body={`${removing?.member.name ?? ""} was manually added to this ${session}. Removing them deletes this historical attendance entry from this ${session} only.`}
        cancelLabel="Cancel"
        confirmLabel={`Remove from this ${session}`}
        confirmPalette="red"
        loading={isRemoving}
        onConfirm={() =>
          removing &&
          removeMember(removing.memberId, () => {
            toast.success(`${terms.memberSingular} removed from this ${session}.`);
            setRemoving(null);
          })
        }
        onClose={() => !isRemoving && setRemoving(null)}
      />
      <ShareReportDialog
        open={share.state.phase === "ready"}
        message={share.state.phase === "ready" ? share.state.message : ""}
        nativeFailed={share.state.phase === "ready" && share.state.nativeFailed}
        onShare={share.shareNow}
        onClose={share.cancel}
      />
      {confirmDialog}
    </PageContainer>
  );
};

export default Attendance;
