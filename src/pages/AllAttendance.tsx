import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Stack,
  Button,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from "services/api/apiHelper";
import { useState } from "react";
import { attendanceRequest } from "services";
import useGlobalStore from "zStore";
import { convertParamsToString } from "helpers/stringManipulations";
import { FaArrowCircleLeft, FaPencilAlt } from "react-icons/fa";
import { format } from "date-fns";

type AttendanceType = {
  name: string;
  image: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  id: string;
  hasBeenUpdated: boolean;
  date: string;
  dateFormated: number;
};

const AllAttendance = () => {
  const navigate = useNavigate();
  const [org] = useGlobalStore((state) => [state.organisation]);

  const [allAttend, setallAttend] = useState<AttendanceType[]>([]);
  const handleGetOrgSuccess = (data) => {
    setallAttend(data.data);
  };

  const url = convertParamsToString(attendanceRequest.ALL_ATTENDANCE, {
    organisationId: org.id,
  });

  useQueryWrapper(["all-attendance-12"], url, {
    onSuccess: handleGetOrgSuccess,
  });

  function handleNavigate(attendanceInfo) {
    const url = convertParamsToString(PROTECTED_PATHS.ATTENDANCE, {
      id: attendanceInfo.id,
    });
    navigate(url, { state: org });
  }

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
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
        bg={useColorModeValue("white", "gray.700")}
        rounded={"xl"}
        boxShadow={"lg"}
        p={6}
        mb={12}
        mt={{ base: 0, md: -10 }}
        mx="auto"
      >
        {allAttend.length ? (
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
                      <Text textAlign="left">{attendance.name}</Text>
                      <Text>
                        {format(new Date(attendance.date), "EEE dd MMM yy")}
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
                              { attendanceId: attendance.id }
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
