import { Box, Flex, useColorModeValue, Text, Stack } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from "services/api/apiHelper";
import { useState } from "react";
import { attendanceRequest } from "services";
import useGlobalStore from "zStore";
import { convertParamsToString } from "helpers/stringManipulations";

type AttendanceType = {
  name: string;
  image: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  id: string;
};

const AllAttendance = () => {
  const navigate = useNavigate();
  const [org] = useGlobalStore((state) => [state.organisation]);

  const [allOrg, setAllOrg] = useState<AttendanceType[]>([]);
  const handleGetOrgSuccess = (data) => {
    setAllOrg(data.data);
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
      <Stack
        spacing={4}
        w={"full"}
        maxW={"md"}
        bg={useColorModeValue("white", "gray.700")}
        rounded={"xl"}
        boxShadow={"lg"}
        p={6}
        my={12}
        mx="auto"
      >
        {allOrg.length ? (
          <>
            {allOrg.map((org) => (
              <Flex
                key={org.id}
                cursor="pointer"
                borderRadius="10px"
                alignItems="center"
                justifyContent="space-between"
                p="4"
                mb="10px"
                border="1px solid rebeccapurple"
                onClick={() => handleNavigate(org)}
              >
                <Flex alignItems="center">
                  <Text ml="4" textAlign="left">
                    {org.name}
                  </Text>
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
