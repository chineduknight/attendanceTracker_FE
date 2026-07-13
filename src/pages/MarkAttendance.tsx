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
} from "@chakra-ui/react";
import { FaSearch } from "react-icons/fa";
import { FiX } from "react-icons/fi";
import { convertParamsToString } from "helpers/stringManipulations";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest, orgRequest } from "services";
import {
  postRequest,
  putRequest,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { confirmAlert } from "react-confirm-alert";
import { Q_KEY } from "utils/constant";
import _ from "lodash";
import { toast } from "react-toastify";
import LoadingSpinner from "components/LoadingSpinner";

export type AttendanceStatus = "absent" | "present" | "apology";

export type MemberType = {
  attendanceStatus: AttendanceStatus;
  name: string;
  id: string;
};

type AttendanceInfoType = {
  present: number;
  apology: number;
  absent: number;
};

// Tapping a member cycles their status in this order.
const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
  absent: "present",
  present: "apology",
  apology: "absent",
};

/** Tally statuses in a single pass — this runs on every toggle. */
const computeCounts = (members: MemberType[]): AttendanceInfoType =>
  members.reduce(
    (acc, member) => {
      acc[member.attendanceStatus] += 1;
      return acc;
    },
    { present: 0, apology: 0, absent: 0 }
  );

// One member button. Memoized so toggling a single member only re-renders that
// row, not the whole (potentially large) roster.
const MemberRow = memo(
  ({
    member,
    onToggle,
  }: {
    member: MemberType;
    onToggle: (id: string) => void;
  }) => (
    <Button
      variant="unstyled"
      onClick={() => onToggle(member.id)}
      display="block"
      w="full"
      mt="3"
      border="1px solid green"
      bg={
        member.attendanceStatus === "present"
          ? "green"
          : member.attendanceStatus === "apology"
          ? "orange"
          : ""
      }
      color={member.attendanceStatus === "absent" ? "" : "#fff"}
    >
      {member.name}
    </Button>
  )
);
MemberRow.displayName = "MemberRow";

const MarkAttendance = () => {
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [org, currentAttendance, setAttendance] = useGlobalStore((state) => [
    state.organisation,
    state.currentAttendance,
    state.updateCurrentAttendance,
  ]);
  const params = useParams();
  const isUpdate = params.attendanceId !== undefined;
  const localStorageKey = `attendance-${org.id}`;

  // filtered list + status counts are pure derivations of allMembers/searchQuery,
  // so we compute them here instead of storing (and hand-syncing) extra state.
  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return allMembers.filter((member) =>
      member.name.toLowerCase().includes(query)
    );
  }, [allMembers, searchQuery]);
  const attendanceInfo = useMemo(() => computeCounts(allMembers), [allMembers]);

  // Callback for fetching all members (new attendance marking)
  const onGetMembersSuccess = (data) => {
    const members = [...data.data].sort((a, b) => a.name.localeCompare(b.name));

    // Resume from a locally-saved draft if one exists, otherwise start everyone
    // off as "absent".
    const localAttendance = localStorage.getItem(localStorageKey);
    if (localAttendance) {
      const parsedLocal = JSON.parse(localAttendance);
      if (parsedLocal.length > 0) {
        setAllMembers(parsedLocal);
        return;
      }
    }
    setAllMembers(
      members.map((member) => ({ ...member, attendanceStatus: "absent" }))
    );
  };

  // Query to fetch members (only when not updating)
  const { isLoading: isGettingMembers } = useQueryWrapper(
    [Q_KEY.GET_MEMBERS],
    convertParamsToString(orgRequest.MEMBERS, { organisationId: org.id }),
    {
      onSuccess: onGetMembersSuccess,
      enabled: !isUpdate,
    }
  );

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
    // Transform API response to MemberType array (must include attendanceStatus)
    // Filter out entries whose member was deleted (member == null), otherwise
    // reading attend.member.name throws and the list renders empty.
    const updatedMembers = res.data.attendance
      .filter((attend) => attend.member != null)
      .map((attend) => ({
        id: attend.memberId,
        name: attend.member.name,
        attendanceStatus: attend.attendanceStatus, // expects "present", "apology" or "absent"
      }));
    localStorage.setItem(localStorageKey, JSON.stringify(updatedMembers));
    setAllMembers(updatedMembers);
  };

  const attendUrl = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: params.attendanceId as string,
  });
  // Query for fetching attendance details when updating
  const { isLoading: isGettingAttendance } = useQueryWrapper(
    [Q_KEY.GET_ATTENDANCE],
    attendUrl,
    {
      onSuccess: onGetAttandanceSuccess,
      enabled: isUpdate,
    }
  );

  const isLoadingData = isUpdate ? isGettingAttendance : isGettingMembers;

  const handleSearch = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  // Cycle a member's status: absent -> present -> apology -> absent
  const updateAttendance = useCallback(
    (userId) => {
      setAllMembers((prevMembers) => {
        const updatedMembers = prevMembers.map((member) => {
          if (member.id !== userId) return member;
          return {
            ...member,
            attendanceStatus: NEXT_STATUS[member.attendanceStatus] ?? "present",
          };
        });
        localStorage.setItem(localStorageKey, JSON.stringify(updatedMembers));
        return updatedMembers;
      });
    },
    [localStorageKey]
  );

  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const onSubmitSuccess = () => {
    isSubmittingRef.current = false;
    localStorage.removeItem(localStorageKey);
    toast.success(
      isUpdate ? "Attendance Updated" : "Attendance Created successfully"
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
    const presentMembers = allMembers
      .filter((member) => member.attendanceStatus === "present")
      .map((member) => member.id);
    const apologisedMembers = allMembers
      .filter((member) => member.attendanceStatus === "apology")
      .map((member) => member.id);

    const data: any = {
      ...currentAttendance,
      organisationId: org.id,
      presentMembers,
    };
    if (apologisedMembers.length) {
      data.apologisedMembers = apologisedMembers;
    }
    const upateUrl = convertParamsToString(attendanceRequest.UPDATE_ATTENDANCE, {
      attendanceId: params.attendanceId as string,
    });
    mutate({
      url: isUpdate ? upateUrl : attendanceRequest.ATTENDANCE,
      data,
    });
  }, [allMembers, currentAttendance, org.id, params.attendanceId, mutate, isUpdate]);

  const onSubmit = () => {
    confirmAlert({
      title: "Please verify count",
      message: `Are you sure you want to submit?`,
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
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Mark Attendance
        </Text>
      </Flex>
      <Container>
        <Flex alignItems="center" justifyContent="space-between" mt="4">
          <Heading fontSize="22px">
            {`Members ${currentAttendance.name}`}
          </Heading>
          <Button
            variant="logout"
            onClick={() => {
              localStorage.removeItem(localStorageKey);
              window.location.reload();
            }}
          >
            Refresh
          </Button>
        </Flex>
        {isLoadingData ? (
          <LoadingSpinner h="45vh" text="Loading members..." />
        ) : (
          <>
            <InputGroup mt="4">
              <InputLeftElement pointerEvents="none">
                <Icon as={FaSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                type="text"
                placeholder="Search member"
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
            {filteredMembers.length === 0 && (
              <Box mt="4">
                <Text ml="4" fontWeight="bold">
                  No member found
                </Text>
              </Box>
            )}
            <Flex mt="2" justifyContent="space-between">
              <Text>
                Present: <strong>{attendanceInfo.present}</strong>
              </Text>
              <Text>
                Apology: <strong>{attendanceInfo.apology}</strong>
              </Text>
              <Text>
                Absent: <strong>{attendanceInfo.absent}</strong>
              </Text>
            </Flex>
            <Box mt="4" overflow="auto" maxHeight="300px">
              {filteredMembers.map((item) => (
                <MemberRow key={item.id} member={item} onToggle={updateAttendance} />
              ))}
            </Box>
            <Button
              onClick={onSubmit}
              w="full"
              mt="8"
              isLoading={isLoading}
              isDisabled={attendanceInfo.present === 0}
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
    </Box>
  );
};

export default MarkAttendance;
