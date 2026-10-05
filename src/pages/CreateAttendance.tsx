import {
  Box,
  Flex,
  useColorModeValue,
  Button,
  Stack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { currentAttendanceType } from "zStore";
import { queryClient } from "services/api/apiHelper";
import { useState } from "react";
import { toast } from "react-toastify";
import { useCategories } from "hooks/useCategories";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
import AttendanceTemplatePicker, {
  TemplateDetails,
} from "components/attendance/AttendanceTemplatePicker";
import { queryKeys } from "services/api/queryKeys";
import { Can } from "rbac/Can";

const EMPTY_DETAILS: AttendanceDetails = {
  name: "",
  categoryId: "",
  subCategoryId: "",
  date: "",
};

const CreateAttendanceForm = ({ organisationId }: { organisationId: string }) => {
  const navigate = useNavigate();
  const updateCurrentAttendance = useGlobalStore(
    (state) => state.updateCurrentAttendance,
  );
  const { categories, isLoading: isLoadingCategories } =
    useCategories(organisationId);
  const [details, setDetails] = useState<AttendanceDetails>(EMPTY_DETAILS);

  // A template fills everything but the date, which belongs to this session.
  const applyTemplate = (templateDetails: TemplateDetails) =>
    setDetails((current) => ({ ...current, ...templateDetails }));

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
    queryClient.invalidateQueries({ queryKey: queryKeys.members(organisationId) });
    navigate(PROTECTED_PATHS.MARK_ATTENANCE);
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Can perm="categories.manage">
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
      </Can>
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
          <AttendanceTemplatePicker
            organisationId={organisationId}
            details={details}
            categories={categories}
            categoriesLoaded={!isLoadingCategories}
            onApply={applyTemplate}
          />
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

/**
 * Remounts the form whenever the selected organisation changes, so no entered
 * details or selected template from one organisation survive into another.
 */
const CreateAttendance = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  return (
    <CreateAttendanceForm key={organisationId} organisationId={organisationId} />
  );
};

export default CreateAttendance;
