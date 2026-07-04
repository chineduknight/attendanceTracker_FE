import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Stack,
  Button,
  Badge,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from "services/api/apiHelper";
import { useState } from "react";
import { attendanceRequest } from "services";
import useGlobalStore from "zStore";
import {
  capitalizeFirstLetter,
  convertParamsToString,
} from "helpers/stringManipulations";
import { FaArrowCircleLeft, FaPencilAlt } from "react-icons/fa";
import { format } from "date-fns";
import LoadingSpinner from "components/LoadingSpinner";

type PersonRef = { id: string; name: string };

type AttendanceType = {
  name: string;
  createdAt: string;
  updatedAt: string;
  id: string;
  hasBeenUpdated: boolean;
  date: string;
  dateFormated: number;
  category?: { name: string; status: string } | null;
  createdBy?: PersonRef | null;
  updatedBy?: PersonRef | null;
};

const AllAttendance = () => {
  const navigate = useNavigate();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const pageBg = useColorModeValue("gray.50", "gray.800");
  const cardBg = useColorModeValue("white", "gray.700");

  const [allAttend, setallAttend] = useState<AttendanceType[]>([]);
  const handleGetOrgSuccess = (data) => {
    setallAttend(data.data);
  };

  const url = convertParamsToString(attendanceRequest.ALL_ATTENDANCE, {
    organisationId: org.id,
  });

  const { isFetching } = useQueryWrapper(["all-attendance-12"], url, {
    onSuccess: handleGetOrgSuccess,
  });
  const isLoading = isFetching && allAttend.length === 0;

  function handleNavigate(attendanceInfo) {
    const url = convertParamsToString(PROTECTED_PATHS.ATTENDANCE, {
      id: attendanceInfo.id,
    });
    navigate(url, { state: org });
  }

  return (
    <Box minH={"100vh"} bg={pageBg}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff">Attendance Tracker</Text>
      </Flex>
      <Button
        variant="logout"
        colorScheme="blue"
        onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
        mr={2}
        leftIcon={<FaArrowCircleLeft />}
        m="2"
      >
        Back
      </Button>
      <Stack
        spacing={4}
        w={"full"}
        maxW={"md"}
        bg={cardBg}
        rounded={"xl"}
        boxShadow={"lg"}
        p={6}
        mb={12}
        mt={{ base: 0, md: -10 }}
        mx="auto"
      >
        {isLoading ? (
          <LoadingSpinner h="30vh" text="Loading attendance..." />
        ) : allAttend.length ? (
          <>
            {allAttend
              .sort((a, b) => b.dateFormated - a.dateFormated)
              .map((attendance) => (
                <Flex
                  key={attendance.id}
                  cursor="pointer"
                  borderRadius="10px"
                  alignItems="center"
                  justifyContent="space-between"
                  p="4"
                  mb="10px"
                  border="1px solid rebeccapurple"
                  onClick={() => handleNavigate(attendance)}
                >
                  <Flex
                    alignItems="center"
                    justifyContent="space-between"
                    w="100%"
                  >
                    <Box>
                      <Flex alignItems="center" gap={2}>
                        <Text textAlign="left" fontWeight="semibold">
                          {capitalizeFirstLetter(attendance.name)}
                        </Text>
                        {attendance.hasBeenUpdated && (
                          <Badge colorScheme="orange" fontSize="0.65rem">
                            Edited
                          </Badge>
                        )}
                      </Flex>
                      {attendance.category?.name && (
                        <Badge colorScheme="purple" mt={1}>
                          {attendance.category.name}
                        </Badge>
                      )}
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        {attendance.createdBy?.name &&
                          `by ${attendance.createdBy.name}, `}
                        {format(new Date(attendance.date), "EEE dd MMM yy")},{" "}
                        {format(new Date(attendance.createdAt), "hh:mm a")}
                      </Text>
                    </Box>
                    <Flex>
                      {attendance.hasBeenUpdated ? null : (
                        <Button
                          variant="outline"
                          colorScheme="blue"
                          onClick={(e) => {
                            // This will stop the click event from bubbling up to the parent's onClick
                            e.stopPropagation();
                            const pagePath = convertParamsToString(
                              PROTECTED_PATHS.UPDATE_ATTENANCE,
                              { attendanceId: attendance.id },
                            );
                            navigate(pagePath);
                          }}
                        >
                          <FaPencilAlt />
                        </Button>
                      )}
                    </Flex>
                  </Flex>
                </Flex>
              ))}
          </>
        ) : (
          <Text ml="4" fontWeight="bold">
            No Attendance here, Kindly Create attendance
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default AllAttendance;
