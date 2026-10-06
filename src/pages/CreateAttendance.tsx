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
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useCategories } from "hooks/useCategories";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
import AttendanceTemplatePicker, {
  AppliedTemplate,
} from "components/attendance/AttendanceTemplatePicker";
import AttendanceEligibilityEditor from "components/attendance/AttendanceEligibilityEditor";
import { useMembers } from "hooks/useMembers";
import { useMemberModel } from "hooks/useMemberModel";
import {
  AttendanceEligibilityRule,
  countEligibleMembers,
  eligibilityFields,
  isAttendanceEligibilityEnabled,
  normalizeEligibilityRules,
} from "helpers/attendanceEligibility";
import { queryKeys } from "services/api/queryKeys";
import { Can } from "rbac/Can";
import { useTerms } from "hooks/useOrgPresentation";

const NO_RULES: AttendanceEligibilityRule[] = [];

const EMPTY_DETAILS: AttendanceDetails = {
  name: "",
  categoryId: "",
  subCategoryId: "",
  date: "",
};

const CreateAttendanceForm = ({ organisationId }: { organisationId: string }) => {
  const navigate = useNavigate();
  const terms = useTerms();
  const updateCurrentAttendance = useGlobalStore(
    (state) => state.updateCurrentAttendance,
  );
  // Off, the page behaves as if eligibility did not exist: no editor, no
  // member-field dependency, and every new session expects everyone.
  const eligibilityEnabled = useGlobalStore((state) =>
    isAttendanceEligibilityEnabled(state.organisation),
  );
  const {
    categories,
    isSuccess: categoriesLoaded,
    isError: categoriesFailed,
  } = useCategories(organisationId);
  const {
    fields: memberFields,
    isSuccess: memberModelLoaded,
    isError: memberModelFailed,
  } = useMemberModel(organisationId, { enabled: eligibilityEnabled });
  const { members, isSuccess: membersLoaded } = useMembers(organisationId);
  const [details, setDetails] = useState<AttendanceDetails>(EMPTY_DETAILS);
  const [eligibilityRules, setEligibilityRules] = useState<
    AttendanceEligibilityRule[]
  >([]);

  // Rules entered while eligibility was on never leak into an Everyone session.
  const activeRules = eligibilityEnabled ? eligibilityRules : NO_RULES;
  const optionFields = useMemo(() => eligibilityFields(memberFields), [memberFields]);
  const expectedCount =
    eligibilityEnabled && membersLoaded
      ? countEligibleMembers(members, activeRules)
      : null;

  // A template fills everything but the date, which belongs to this session.
  const applyTemplate = (applied: AppliedTemplate) => {
    setDetails((current) => ({ ...current, ...applied.details }));
    setEligibilityRules(applied.eligibilityRules);
  };

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
      eligibilityRules: normalizeEligibilityRules(activeRules),
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
            {`Add ${terms.categorySingular}`}
          </Button>
          <Button
            mt="4"
            ml="6"
            onClick={() => navigate(PROTECTED_PATHS.SUB_CATEGORY)}
          >
            {`Add ${terms.subCategorySingular}`}
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
            eligibilityRules={activeRules}
            eligibilityEnabled={eligibilityEnabled}
            categories={categories}
            memberFields={memberFields}
            setupLoaded={
              categoriesLoaded && (!eligibilityEnabled || memberModelLoaded)
            }
            setupFailed={
              categoriesFailed || (eligibilityEnabled && memberModelFailed)
            }
            onApply={applyTemplate}
          />
          <AttendanceDetailsForm
            value={details}
            onChange={setDetails}
            categories={categories}
          />
          {eligibilityEnabled && (
            <AttendanceEligibilityEditor
              fields={optionFields}
              fieldsStatus={
                memberModelLoaded ? "ready" : memberModelFailed ? "error" : "loading"
              }
              rules={eligibilityRules}
              onChange={setEligibilityRules}
              expectedCount={expectedCount}
              totalCount={members.length}
            />
          )}

          <Button
            w="full"
            mt="40px"
            bg={"blue.400"}
            color={"white"}
            _hover={{ bg: "blue.500" }}
            fontWeight="bold"
            fontSize="15px"
            isDisabled={expectedCount === 0}
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
 * details, eligibility rules or selected template from one organisation
 * survive into another.
 */
const CreateAttendance = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  return (
    <CreateAttendanceForm key={organisationId} organisationId={organisationId} />
  );
};

export default CreateAttendance;
