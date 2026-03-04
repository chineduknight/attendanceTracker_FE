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
import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { attendanceRequest } from "services";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { format } from "date-fns";
import { Q_KEY } from "utils/constant";
import LoadingSpinner from "components/LoadingSpinner";
import { FaArrowCircleLeft, FaFileExcel, FaShareAlt } from "react-icons/fa";

type MemberType = {
  attendanceStatus: "absent" | "present" | "apology";
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
  present: number;
  apology: number;
  absent: number;
};
const Attendance = () => {
  const [allMembers, setAllMembers] = useState<MemberType[]>([]);
  const [filterName, setFilterName] = useState<MemberType[]>([]);
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfoType>();
  const navigate = useNavigate();
  const onSuccess = (data) => {
    const unsorted = data.data.attendance;
    const statusOrder = { present: 0, apology: 1, absent: 2 };
    const members = unsorted.sort((a, b) => {
      return (
        statusOrder[a.attendanceStatus] - statusOrder[b.attendanceStatus] ||
        a.member.name.localeCompare(b.member.name)
      );
    });

    const presentCount = members.filter(
      (member) => member.attendanceStatus === "present",
    ).length;
    const apologyCount = members.filter(
      (member) => member.attendanceStatus === "apology",
    ).length;
    const absentCount = members.filter(
      (member) => member.attendanceStatus === "absent",
    ).length;

    setAttendanceInfo({
      ...data.data,
      present: presentCount,
      apology: apologyCount,
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

  const { isFetching: isLoadingAttendance } = useQueryWrapper(
    [Q_KEY.GET_MEMBERS],
    url,
    {
      onSuccess,
    },
  );

  const handleSearch = useCallback(
    (e) => {
      const query = e.target.value.toLowerCase();
      setFilterName(
        allMembers.filter((member) =>
          member.member.name.toLowerCase().includes(query),
        ),
      );
    },
    [allMembers],
  );

  const formattedDate = attendanceInfo?.date
    ? format(new Date(attendanceInfo.date), "EEE dd MMM yy")
    : "";

  const handleSendToWhatsapp = () => {
    // Group present members by their part
    const presentMembersByPart = allMembers
      .filter(
        (item) =>
          item.attendanceStatus === "present" ||
          item.attendanceStatus === "apology",
      )
      .reduce((acc, item) => {
        // Use "others" if member.part is missing.
        const part = item.member.part
          ? item.member.part.toLowerCase()
          : "others";
        if (!acc[part]) {
          acc[part] = [];
        }
        // Add prefix based on gender
        const prefix =
          item.member.gender && item.member.gender.toLowerCase() === "male"
            ? "Bro "
            : "Sis ";
        const nameWithPrefix =
          prefix +
          item.member.name +
          (item.attendanceStatus === "apology" ? " (Apology)" : "");
        acc[part].push(nameWithPrefix);
        return acc;
      }, {});

    // Define the desired order for known choir parts.
    const orderedParts = ["soprano", "alto", "tenor", "bass"];
    let presentMembersString = "";

    // Process the known parts first.
    orderedParts.forEach((part) => {
      if (presentMembersByPart[part] && presentMembersByPart[part].length > 0) {
        // Sort alphabetically ignoring the prefix.
        presentMembersByPart[part].sort((a, b) => {
          const nameA = a.replace(/^(Bro |Sis )/, "").toLowerCase();
          const nameB = b.replace(/^(Bro |Sis )/, "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        presentMembersString +=
          `*${capitalize(part)}*\n` +
          presentMembersByPart[part].join("\n") +
          "\n\n";
      }
    });

    // Process any extra parts (including "others") that are not in the orderedParts array.
    const extraParts = Object.keys(presentMembersByPart).filter(
      (part) => !orderedParts.includes(part),
    );
    extraParts.sort().forEach((part) => {
      if (presentMembersByPart[part] && presentMembersByPart[part].length > 0) {
        presentMembersByPart[part].sort((a, b) => {
          const nameA = a.replace(/^(Bro |Sis )/, "").toLowerCase();
          const nameB = b.replace(/^(Bro |Sis )/, "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        presentMembersString +=
          `*${capitalize(part)}*\n` +
          presentMembersByPart[part].join("\n") +
          "\n\n";
      }
    });

    // Absent members: Only display the count.
    const allAbsentMembers = allMembers.filter(
      (item) => item.attendanceStatus === "absent",
    );
    console.log("allAbsentMembers:", allAbsentMembers);
    const absentCount = allAbsentMembers.filter(
      (item) => item.member.status === "active",
    ).length;
    const absentMembersString = `*Absent Members:(${absentCount})*`;

    const presentCount = allMembers.filter(
      (item) => item.attendanceStatus === "present",
    ).length;
    const apologyCount = allMembers.filter(
      (item) => item.attendanceStatus === "apology",
    ).length;
    const title = `Attendance Info\n\n${attendanceInfo?.name}\nDate: ${formattedDate}\nPresent (${presentCount})\nApology (${apologyCount})\n`;
    const message = [title, presentMembersString, absentMembersString]
      .filter(Boolean)
      .join("\n");

    console.log("message:", message);
    const phoneNumber = "+2348032374369"; // replace with the actual phone number
    const whatsappLink = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
      message,
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
    },
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
        {isLoadingAttendance ? (
          <LoadingSpinner h="40vh" text="Loading attendance..." />
        ) : (
          <>
            <Flex mt="4" justifyContent="space-between">
              <Button
                variant="logout"
                colorScheme="blue"
                onClick={() => navigate(-1)}
                leftIcon={<FaArrowCircleLeft />}
              >
                Back
              </Button>
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
                Apology: <strong>{attendanceInfo?.apology} </strong>
              </Text>
              <Text>
                Absent: <strong>{attendanceInfo?.absent} </strong>
              </Text>
            </Flex>
            <Box mt="4" overflow="scroll" maxH="500px">
              {filterName.map((item) => AttendCard(item))}
            </Box>
          </>
        )}
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
      {item.member.name}
    </Button>
  ) as JSX.Element;
}
