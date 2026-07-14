import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Stack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { currentAttendanceType } from "zStore";
import { queryClient } from "services/api/apiHelper";
import { Q_KEY } from "utils/constant";
import { FaArrowCircleLeft } from "react-icons/fa";
import { useState } from "react";
import { toast } from "react-toastify";
import { useCategories } from "hooks/useCategories";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";

const EMPTY_DETAILS: AttendanceDetails = {
  name: "",
  categoryId: "",
  subCategoryId: "",
  date: "",
};

const CreateAttendance = () => {
  const navigate = useNavigate();
  const [updateCurrentAttendance, org] = useGlobalStore((state) => [
    state.updateCurrentAttendance,
    state.organisation,
  ]);
  const { categories } = useCategories(org.id);
  const [details, setDetails] = useState<AttendanceDetails>(EMPTY_DETAILS);

  const onContinue = () => {
    if (!details.name.trim() || !details.date) {
      toast.error("Name and date are required");
      return;
    }
    const payload: currentAttendanceType = {
      name: details.name.trim(),
      date: details.date,
      ...(details.categoryId ? { categoryId: details.categoryId } : {}),
      ...(details.subCategoryId ? { subCategoryId: details.subCategoryId } : {}),
    };
    updateCurrentAttendance(payload);
    queryClient.invalidateQueries({ queryKey: [Q_KEY.GET_MEMBERS] });
    navigate(PROTECTED_PATHS.MARK_ATTENANCE);
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
          Create Attendance
        </Text>
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
      <Flex>
        <Button mt="4" ml="2" onClick={() => navigate(PROTECTED_PATHS.CATEGORY)}>
          Add Category
        </Button>
        <Button
          mt="4"
          ml="6"
          onClick={() => navigate(PROTECTED_PATHS.SUB_CATEGORY)}
        >
          Add Sub-Category
        </Button>
      </Flex>
      <Flex
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <Stack
          spacing={4}
          w={"full"}
          mt="5rem"
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <AttendanceDetailsForm
            value={details}
            onChange={setDetails}
            categories={categories}
          />
          <Button
            w="full"
            mt="40px"
            bg={"blue.400"}
            color={"white"}
            _hover={{ bg: "blue.500" }}
            fontWeight="bold"
            fontSize="15px"
            onClick={onContinue}
          >
            Continue
          </Button>
        </Stack>
      </Flex>
    </Box>
  );
};

export default CreateAttendance;
