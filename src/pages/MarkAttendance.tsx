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
import { convertParamsToString } from "helpers/stringManipulations";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest, orgRequest } from "services";
import {
  postRequest,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import useGlobalStore from "zStore";

type MemberType = {
  attend: boolean;
  name: string;
  id: string;
};
type AttendanceInfoType = {
  present: number;
  absent: number;
};
const MarkAttendance = () => {
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [filterName, setFilterName] = useState<MemberType[]>([]);
  const [org, currentAttendance] = useGlobalStore((state) => [
    state.organisation,
    state.currentAttendance,
  ]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>({
    present: 0,
    absent: 0,
  });
  const onSuccess = (data) => {
    const unsorted = data.data;
    const members = unsorted.sort((a, b) => a.name.localeCompare(b.name));

    const membersWithAttendStatus = members.map((member) => {
      return {
        ...member,
        attend: false,
      };
    });
    setAllMembers(membersWithAttendStatus);
    setFilterName(membersWithAttendStatus);
    setAttendanceInfo({
      present: 0,
      absent: unsorted.length,
    });
  };
  const url = convertParamsToString(orgRequest.MEMBERS, {
    organisationId: org.id,
  });
  useQueryWrapper(["all-members"], url, {
    onSuccess,
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

  const updateAttendance = useCallback(
    (userId) => {
      setAllMembers((prevMembers) => {
        const updatedMembers = prevMembers.map((member) =>
          member.id === userId ? { ...member, attend: !member.attend } : member
        );

        // Calculate present and absent counts
        const presentCount = updatedMembers.reduce(
          (count, member) => count + (member.attend ? 1 : 0),
          0
        );
        const absentCount = updatedMembers.length - presentCount;
        setAttendanceInfo({
          present: presentCount,
          absent: absentCount,
        });
        // Filter and update the filtered array based on search query
        const filteredMembers = updatedMembers.filter((member) =>
          member.name.toLowerCase().includes(searchQuery)
        );

        setFilterName(filteredMembers);

        return updatedMembers;
      });
    },
    [searchQuery]
  );

  const navigate = useNavigate();

  const onSubmitSuccess = () => {
    navigate(PROTECTED_PATHS.DASHBOARD);
  };

  const { mutate, isLoading } = useMutationWrapper(
    postRequest,
    onSubmitSuccess
  );

  const sendAttandanceToAPI = useCallback(() => {
    const presentMembers = allMembers
      .filter((member) => member.attend)
      .map((member) => member.id);

    const data = {
      ...currentAttendance,
      organisationId: org.id,
      presentMembers,
    };

    mutate({
      // url: `${orgRequest.ORGANISATIONS}/${data.organisationId}/category`,
      url: attendanceRequest.ATTENDANCE,
      data,
    });
  }, [allMembers, currentAttendance, org.id, mutate]);
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
        <Heading mt="4" fontSize="22px">
          Members
        </Heading>

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
            Present: <strong>{attendanceInfo?.present} </strong>
          </Text>
          <Text>
            Absent: <strong>{attendanceInfo?.absent} </strong>
          </Text>
        </Flex>
        <Box mt="4" overflow="scroll" maxHeight="300px">
          {filterName.map((item) => (
            <Button
              variant="unstyled"
              onClick={() => updateAttendance(item.id)}
              display="block"
              w="full"
              mt="3"
              border="1px solid green"
              key={item.id}
              bg={item.attend ? "green" : ""}
              color={item.attend ? "#fff" : ""}
            >
              {item.name}
            </Button>
          ))}
        </Box>
        <Box>
          <Button
            onClick={sendAttandanceToAPI}
            w="full"
            mt="4"
            isLoading={isLoading}
            disabled={attendanceInfo.present === 0}
          >
            Submit
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default MarkAttendance;
