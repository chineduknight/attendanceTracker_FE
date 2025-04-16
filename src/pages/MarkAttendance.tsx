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
  Skeleton,
} from "@chakra-ui/react";
import { convertParamsToString } from "helpers/stringManipulations";
import { useCallback, useState } from "react";
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

export type MemberType = {
  attendanceStatus: "absent" | "present" | "apology";
  name: string;
  id: string;
};

type AttendanceInfoType = {
  present: number;
  apology: number;
  absent: number;
};

const MarkAttendance = () => {
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [filterName, setFilterName] = useState<MemberType[]>([]);
  const [org, currentAttendance, setAttendance] = useGlobalStore((state) => [
    state.organisation,
    state.currentAttendance,
    state.updateCurrentAttendance,
  ]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>({
    present: 0,
    apology: 0,
    absent: 0,
  });
  const params = useParams();
  const isUpdate = params.attendanceId !== undefined;
  const localStorageKey = `attendance-${org.id}`;

  // Callback for fetching all members (new attendance marking)
  const onGetMembersSuccess = (data) => {
    console.log("data:", data);
    const unsorted = data.data;
    const members = unsorted.sort((a, b) => a.name.localeCompare(b.name));
    // Default every member to "absent"
    const membersWithAttendStatus = members.map((member) => ({
      ...member,
      attendanceStatus: "absent",
    }));

    const localAttendance = localStorage.getItem(localStorageKey);
    if (localAttendance) {
      const parsedLocal = JSON.parse(localAttendance);
      if (parsedLocal.length > 0) {
        setAllMembers(parsedLocal);
        setFilterName(parsedLocal);
        const presentCount = parsedLocal.filter(
          (member) => member.attendanceStatus === "present"
        ).length;
        const apologyCount = parsedLocal.filter(
          (member) => member.attendanceStatus === "apology"
        ).length;
        const absentCount = parsedLocal.filter(
          (member) => member.attendanceStatus === "absent"
        ).length;
        setAttendanceInfo({
          present: presentCount,
          apology: apologyCount,
          absent: absentCount,
        });
      } else {
        // If localStorage exists but is empty, use fetched data.
        setAllMembers(membersWithAttendStatus);
        setFilterName(membersWithAttendStatus);
        setAttendanceInfo({
          present: 0,
          apology: 0,
          absent: membersWithAttendStatus.length,
        });
      }
    } else {
      // For a new attendance marking, all members default to absent
      setAllMembers(membersWithAttendStatus);
      setFilterName(membersWithAttendStatus);
      setAttendanceInfo({
        present: 0,
        apology: 0,
        absent: membersWithAttendStatus.length,
      });
    }
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
    const updatedMembers = res.data.attendance.map((attend) => ({
      id: attend.memberId,
      name: attend.member.name,
      attendanceStatus: attend.attendanceStatus, // expects "present", "apology" or "absent"
    }));
    // Store in localStorage and update state
    localStorage.setItem(localStorageKey, JSON.stringify(updatedMembers));
    setAllMembers(updatedMembers);
    setFilterName(updatedMembers);
    const presentCount = updatedMembers.filter(
      (m) => m.attendanceStatus === "present"
    ).length;
    const apologyCount = updatedMembers.filter(
      (m) => m.attendanceStatus === "apology"
    ).length;
    const absentCount = updatedMembers.filter(
      (m) => m.attendanceStatus === "absent"
    ).length;
    setAttendanceInfo({
      present: presentCount,
      apology: apologyCount,
      absent: absentCount,
    });
  };

  const attendUrl = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: params.attendanceId as string,
  });
  // Query for fetching attendance details when updating
  useQueryWrapper([Q_KEY.GET_ATTENDANCE], attendUrl, {
    onSuccess: onGetAttandanceSuccess,
    enabled: isUpdate,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const handleSearch = useCallback(
    (e) => {
      const query = e.target.value.toLowerCase();
      setSearchQuery(query);
      setFilterName(
        allMembers.filter((member) => member.name.toLowerCase().includes(query))
      );
    },
    [allMembers]
  );

  // Toggle a member's attendance status by cycling through: absent -> present -> apology -> absent
  const updateAttendance = useCallback(
    (userId) => {
      setAllMembers((prevMembers) => {
        const updatedMembers = prevMembers.map((member) => {
          if (member.id !== userId) return member;
          let newStatus = member.attendanceStatus;
          if (!newStatus || newStatus === "absent") {
            newStatus = "present";
          } else if (newStatus === "present") {
            newStatus = "apology";
          } else if (newStatus === "apology") {
            newStatus = "absent";
          }
          return { ...member, attendanceStatus: newStatus };
        });
        const presentCount = updatedMembers.filter(
          (m) => m.attendanceStatus === "present"
        ).length;
        const apologyCount = updatedMembers.filter(
          (m) => m.attendanceStatus === "apology"
        ).length;
        const absentCount = updatedMembers.filter(
          (m) => m.attendanceStatus === "absent"
        ).length;
        setAttendanceInfo({
          present: presentCount,
          apology: apologyCount,
          absent: absentCount,
        });
        const filteredMembers = updatedMembers.filter((member) =>
          member.name.toLowerCase().includes(searchQuery)
        );
        setFilterName(filteredMembers);
        localStorage.setItem(localStorageKey, JSON.stringify(updatedMembers));
        return updatedMembers;
      });
    },
    [localStorageKey, searchQuery]
  );

  const navigate = useNavigate();
  const onSubmitSuccess = () => {
    // Clear local storage once submitted
    console.log("clearing local storage");
    localStorage.removeItem(localStorageKey);
    console.log("cleared local storage");
    toast.success(
      isUpdate ? "Attendance Updated" : "Attendance Created successfully"
    );
    navigate(PROTECTED_PATHS.ALL_ATTENDANCE);
  };

  const { mutate, isLoading } = useMutationWrapper(
    isUpdate ? putRequest : postRequest,
    onSubmitSuccess
  );

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

  const sendAttandanceToAPI = useCallback(() => {
    const presentMembers = allMembers
      .filter((member) => member.attendanceStatus === "present")
      .map((member) => member.id);
    const apologisedMembers = allMembers
      .filter((member) => member.attendanceStatus === "apology")
      .map((member) => member.id);

    const data = {
      ...currentAttendance,
      organisationId: org.id,
      presentMembers,
      apologisedMembers,
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
  ]);

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
        <Flex alignItems="center" justifyContent="space-between">
          <Heading mt="4" fontSize="22px">
            {` Members ${currentAttendance.name}`}
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
        <InputGroup mt="4">
          <InputLeftElement pointerEvents="none" />
          <Input
            type="search"
            placeholder="Search member"
            onChange={handleSearch}
          />
        </InputGroup>
        {filterName.length === 0 && (
          <Box mt="4">
            <Text ml="4" fontWeight="bold">
              No member found
            </Text>
          </Box>
        )}
        <Flex mt="2" justifyContent="space-between">
          <Text>
            Present: <strong>{attendanceInfo?.present}</strong>
          </Text>
          <Text>
            Apology: <strong>{attendanceInfo?.apology}</strong>
          </Text>
          <Text>
            Absent: <strong>{attendanceInfo?.absent}</strong>
          </Text>
        </Flex>
        <Box mt="4" overflow="scroll" maxHeight="300px">
          {filterName.map((item) => (
            <Skeleton key={item.id} isLoaded={!isGettingMembers}>
              <Button
                variant="unstyled"
                onClick={() => updateAttendance(item.id)}
                display="block"
                w="full"
                mt="3"
                border="1px solid green"
                bg={
                  item.attendanceStatus === "present"
                    ? "green"
                    : item.attendanceStatus === "apology"
                    ? "orange"
                    : ""
                }
                color={
                  item.attendanceStatus === "present" ||
                  item.attendanceStatus === "apology"
                    ? "#fff"
                    : ""
                }
              >
                {item.name}
              </Button>
            </Skeleton>
          ))}
        </Box>
        <Button
          onClick={onSubmit}
          w="full"
          mt="8"
          isLoading={isLoading}
          disabled={attendanceInfo.present === 0}
        >
          {isUpdate ? "Update" : "Submit"}
        </Button>
        <Button
          onClick={() => navigate(-1)}
          w="full"
          variant="logout"
          mt="4"
          disabled={isLoading}
        >
          Cancel
        </Button>
      </Container>
    </Box>
  );
};

export default MarkAttendance;
