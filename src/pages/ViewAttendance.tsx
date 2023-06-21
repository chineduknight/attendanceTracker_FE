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
import { useParams } from "react-router-dom";
import { attendanceRequest } from "services";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { format } from "date-fns";
import { Q_KEY } from 'utils/constant';

type MemberType = {
  isPresent: boolean;
  memberId: string;
  _id: string;
  member: {
    name: string;
  };
};

type AttendanceInfoType = {
  name: string;
  date: Date;
  present: number;
  absent: number;
};
const Attendance = () => {
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [filterName, setFilterName] = useState<MemberType[]>([]);
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>();
  const onSuccess = (data) => {
    const unsorted = data.data.attendance;
    const members = unsorted.sort((a, b) => {
      // Sort by isPresent first
      if (a.isPresent && !b.isPresent) {
        return -1;
      }
      if (!a.isPresent && b.isPresent) {
        return 1;
      }

      // If isPresent is the same for both, sort by name
      return a.member.name.localeCompare(b.member.name);
    });

    const presentCount = members.reduce(
      (count, member) => count + (member.isPresent ? 1 : 0),
      0
    );
    const absentCount = members.length - presentCount;

    setAttendanceInfo({
      ...data.data,
      present: presentCount,
      absent: absentCount,
    });

    setAllMembers(members);
    setFilterName(members);
  };
  const param = useParams();
  const url = convertParamsToString(attendanceRequest.GET_ATTENDANCE, {
    organisationId: org.id,
    id: param.id as string,
  });

  useQueryWrapper([Q_KEY.GET_MEMBERS], url, {
    onSuccess,
  });

  const handleSearch = useCallback(
    (e) => {
      const query = e.target.value.toLowerCase();
      setFilterName(
        allMembers.filter((member) =>
          member.member.name.toLowerCase().includes(query)
        )
      );
    },
    [allMembers]
  );

  const formattedDate = attendanceInfo?.date
    ? format(new Date(attendanceInfo.date), "EEE dd MMM yy")
    : "";
  const handleSendToWhatsapp = () => {
    const presentMembers = allMembers
      .filter((item) => item.isPresent)
      .map((item) => item.member.name);

    const absentMembers = allMembers
      .filter((item) => !item.isPresent)
      .map((item) => item.member.name);

    const title = `Attendance Info\n\n${attendanceInfo?.name}\nDate:${formattedDate}\n`;
    const presentMembersString =
      presentMembers.length > 0
        ? `*Present Members:(${attendanceInfo?.present})*` +
          presentMembers.map((member) => "\n" + member).join("")
        : "";

    const absentMembersString =
      absentMembers.length > 0
        ? `\n*Absent Members:(${attendanceInfo?.absent})*` +
          absentMembers.map((member) => "\n" + member).join("")
        : "";

    const message = [title, presentMembersString, absentMembersString]
      .filter(Boolean)
      .join("\n");

    const phoneNumber = "+2348032374369"; // replace with the actual phone number
    const whatsappLink = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
      message
    )}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Attendance Information",
          text: message,
        })
        .then(() => console.log("Successful share"))
        .catch((error) => console.log("Error sharing", error));
    } else {
      window.open(whatsappLink);
    }
  };

  const downloadURl = convertParamsToString(attendanceRequest.EXPORT, {
    organisationId: org.id,
    id: param.id as string,
  });
  const { refetch, isFetching } = useQueryWrapper(
    ["export-excel"],
    downloadURl,
    {
      enabled: false,
      onSuccess: (data) => {
        window.open(data.data);
      },
    }
  );

  const sendToExcel = () => {
    refetch();
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
          View Attendance
        </Text>
      </Flex>
      <Container>
        <Flex mt="4" justifyContent="space-between">
          <Button onClick={handleSendToWhatsapp}>Share</Button>
          <Button onClick={sendToExcel} isLoading={isFetching}>
            Export to Excel
          </Button>
        </Flex>

        <Flex mt="4" alignItems="center" justifyContent="space-between">
          <Heading fontSize="22px">{attendanceInfo?.name}</Heading>
          <Text>{formattedDate}</Text>
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
            Present: <strong>{attendanceInfo?.present} </strong>
          </Text>
          <Text>
            Absent: <strong>{attendanceInfo?.absent} </strong>
          </Text>
        </Flex>
        <Box mt="4" overflow="scroll" maxH="500px">
          {filterName.map((item) => AttendCard(item))}
        </Box>
      </Container>
    </Box>
  );
};

export default Attendance;
function AttendCard(item: MemberType): JSX.Element {
  return (
    <Button
      variant="unstyled"
      display="block"
      w="full"
      mt="3"
      border="1px solid green"
      key={item.memberId}
      bg={item.isPresent ? "green" : ""}
      color={item.isPresent ? "#fff" : ""}
    >
      {item.member.name}
    </Button>
  );
}
