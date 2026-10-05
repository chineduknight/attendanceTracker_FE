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
  Container,
} from "@chakra-ui/react";
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
import { FaFileExcel, FaShareAlt, FaTrash } from "react-icons/fa";
import { toast } from "react-toastify";
import ReactSelect, { MultiValue } from "react-select";
import { queryKeys } from "services/api/queryKeys";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import AttendanceMemberRow from "components/attendance/AttendanceMemberRow";
import StatusCountSummary from "components/attendance/StatusCountSummary";
import { buildAttendanceShareMessage } from "helpers/attendanceShareMessage";

type StatusOption = {
  value: string;
  label: string;
};

type MemberType = {
  /** Configured status key; may be inactive or unknown on historical records. */
  attendanceStatus: string;
  memberId: string;
  _id: string;
  member: {
    name: string;
    status: string;
    gender?: string;
    part?: string;
  };
};

type AttendanceInfoType = {
  name: string;
  date: Date;
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
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([ALL]);
  const [attendanceFilter, setAttendanceFilter] = useState<string[]>([ALL]);
  const statuses = useAttendanceStatuses();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>();
  const navigate = useNavigate();
  const onSuccess = (data) => {
    const unsorted = data.data.attendance.filter((a) => a.member != null);
    // Configured status order first; unknown historical statuses sort last.
    const members = unsorted.sort(
      (a, b) =>
        statuses.rank(a.attendanceStatus) - statuses.rank(b.attendanceStatus) ||
        a.member.name.localeCompare(b.member.name),
    );

    setAttendanceInfo({ name: data.data.name, date: data.data.date });

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
      "export-excel",
      org.id,
      param.id,
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
          error?.response?.data?.error ?? "Failed to delete attendance.";
        toast.error(message);
      },
    );

  const handleDelete = () => {
    confirmAlert({
      title: "Delete Attendance",
      message:
        "Are you sure you want to delete this attendance record? This cannot be undone.",
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
  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Container>
        {isLoadingAttendance ? (
          <LoadingSpinner h="40vh" text="Loading attendance..." />
        ) : (
          <>
            <Flex mt="4" justifyContent="flex-end">
              <Flex gap={2}>
                <Button
                  onClick={handleSendToWhatsapp}
                  leftIcon={<FaShareAlt />}
                >
                  Share
                </Button>
                <Button
                  onClick={sendToExcel}
                  isLoading={isFetching}
                  leftIcon={<FaFileExcel />}
                  bg="green.500"
                  color="white"
                  _hover={{ bg: "green.600" }}
                >
                  Export to Excel
                </Button>
              </Flex>
            </Flex>

            <Flex mt="4" alignItems="center" justifyContent="space-between">
              <Heading fontSize="22px">{attendanceInfo?.name}</Heading>
              <Text>{formattedDate}</Text>
            </Flex>
            <Flex mt="4" gap={2} direction={{ base: "column", sm: "row" }}>
              <InputGroup>
                <InputLeftElement pointerEvents="none" />
                <Input
                  type="search"
                  placeholder="Search member"
                  onChange={handleSearch}
                />
              </InputGroup>
              <Box minW={{ base: "100%", sm: "200px" }}>
                <ReactSelect
                  isMulti
                  aria-label="Filter by attendance status"
                  placeholder="Filter by attendance"
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
              <Box minW={{ base: "100%", sm: "200px" }}>
                <ReactSelect
                  isMulti
                  aria-label="Filter by member status"
                  placeholder="Filter by member status"
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
            {filteredMembers.length === 0 && (
              <Box mt="4">
                <Text ml="4" fontWeight="bold">
                  No member found
                </Text>
              </Box>
            )}
            <StatusCountSummary counts={filteredCounts} />
            <Box mt="4" overflow="scroll" maxH="500px">
              {filteredMembers.map((item) => (
                <AttendanceMemberRow
                  key={item.memberId}
                  memberId={item.memberId}
                  name={item.member.name}
                  status={statuses.resolve(item.attendanceStatus)}
                />
              ))}
            </Box>
            <Button
              onClick={handleDelete}
              isLoading={isDeleting}
              leftIcon={<FaTrash />}
              bg="red.500"
              color="white"
              _hover={{ bg: "red.600" }}
              w="full"
              mt="4"
              mb="8"
            >
              Delete Attendance
            </Button>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Attendance;
