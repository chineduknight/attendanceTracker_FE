import { Box, Flex, Text, Button, Stack, Heading } from "@chakra-ui/react";
import PageContainer from "components/layout/PageContainer";
import { ErrorState } from "components/ui/states";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { currentAttendanceType } from "zStore";
import { queryClient } from "services/api/apiHelper";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useConfirm } from "components/ui/confirm-dialog";
import { formatSessionDate } from "helpers/sessionDate";
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
  eligibilityFields,
  isAttendanceEligibilityEnabled,
  normalizeEligibilityRules,
  filterEligibleMembers,
} from "helpers/attendanceEligibility";
import { queryKeys } from "services/api/queryKeys";
import { Can } from "rbac/Can";
import { useTerms } from "hooks/useOrgPresentation";
import { useAttendanceAvailabilityForDate } from "hooks/useAttendanceAvailability";
import {
  filterAvailableMembers,
  isValidAvailabilityDate,
} from "helpers/attendanceAvailability";
import { lowerTerm, withArticle } from "helpers/organisationPresentation";
import { todayBusinessDate } from "helpers/financeCompliance";
import {
  NewAttendanceDraft,
  discardNewAttendanceDraft,
  newAttendanceDraftToSession,
  readNewAttendanceDraft,
  writeNewAttendanceDraft,
} from "helpers/newAttendanceDraft";

const NO_RULES: AttendanceEligibilityRule[] = [];

// Most sessions are recorded on the day they happen, so start on today's
// local business date; the officer can still pick any other date.
const initialDetails = (): AttendanceDetails => ({
  name: "",
  categoryId: "",
  subCategoryId: "",
  date: todayBusinessDate(),
});

const CreateAttendanceForm = ({
  organisationId,
}: {
  organisationId: string;
}) => {
  const navigate = useNavigate();
  const terms = useTerms();
  const session = lowerTerm(terms.attendanceSingular);
  const updateCurrentAttendance = useGlobalStore(
    (state) => state.updateCurrentAttendance
  );
  const [currentAttendance, clearCurrentAttendance] = useGlobalStore(
    (state) => [state.currentAttendance, state.clearCurrentAttendance]
  );
  const { confirm, confirmDialog } = useConfirm();
  // The organisation's unfinished draft, read once per mount: this page only
  // resolves it (continue or discard), never edits it. The component is keyed
  // by organisation id, so switching organisations re-reads it.
  const [draft, setDraft] = useState<NewAttendanceDraft | null>(() =>
    readNewAttendanceDraft(organisationId)
  );
  // Off, the page behaves as if eligibility did not exist: no editor, no
  // member-field dependency, and every new session expects everyone.
  const eligibilityEnabled = useGlobalStore((state) =>
    isAttendanceEligibilityEnabled(state.organisation)
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
  const [details, setDetails] = useState<AttendanceDetails>(initialDetails);
  const [eligibilityRules, setEligibilityRules] = useState<
    AttendanceEligibilityRule[]
  >([]);
  const {
    unavailableMemberIds,
    isLoading: availabilityLoading,
    isFetching: availabilityFetching,
    isSuccess: availabilitySuccess,
    isError: availabilityFailed,
    refetch: refetchAvailability,
  } = useAttendanceAvailabilityForDate(organisationId, details.date);

  // Rules entered while eligibility was on never leak into an Everyone session.
  const activeRules = eligibilityEnabled ? eligibilityRules : NO_RULES;
  const optionFields = useMemo(
    () => eligibilityFields(memberFields),
    [memberFields]
  );
  const rawEligibleMembers = useMemo(
    () =>
      eligibilityEnabled
        ? filterEligibleMembers(members, activeRules)
        : members,
    [activeRules, eligibilityEnabled, members]
  );
  const rawEligibilityCount =
    eligibilityEnabled && membersLoaded ? rawEligibleMembers.length : null;
  const validDate = isValidAvailabilityDate(details.date);
  const availabilityReady =
    !validDate || (availabilitySuccess && !availabilityFetching);
  const finalExpectedMembers = useMemo(
    () =>
      availabilityReady
        ? filterAvailableMembers(rawEligibleMembers, unavailableMemberIds)
        : [],
    [availabilityReady, rawEligibleMembers, unavailableMemberIds]
  );
  const finalExpectedCount = availabilityReady
    ? finalExpectedMembers.length
    : null;
  const unavailableExpectedCount = availabilityReady
    ? rawEligibleMembers.length - finalExpectedMembers.length
    : 0;
  // Availability emptying the expected roster still allows the session: a
  // member who physically attended can be added manually on the next step.
  // Nobody matching at all (no members, or rules matching nobody) does not.
  const noEligibleMembers = membersLoaded && rawEligibleMembers.length === 0;

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
      // Stamped so the working state can never be marked under another org.
      organisationId,
      ...(details.categoryId ? { categoryId: details.categoryId } : {}),
      ...(details.subCategoryId
        ? { subCategoryId: details.subCategoryId }
        : {}),
      eligibilityRules: normalizeEligibilityRules(activeRules),
    };
    updateCurrentAttendance(payload);
    // From here on the draft is real: it stays resumable (or discardable)
    // until a successful create clears it. Just opening this page — or
    // typing — never writes one.
    writeNewAttendanceDraft(organisationId, payload);
    queryClient.invalidateQueries({
      queryKey: queryKeys.members(organisationId),
    });
    navigate(PROTECTED_PATHS.MARK_ATTENANCE);
  };

  // Restore the saved session exactly as Continue left it; Mark Attendance
  // reconciles the persisted roster drafts itself.
  const resumeDraft = () => {
    if (!draft) return;
    updateCurrentAttendance(newAttendanceDraftToSession(draft));
    navigate(PROTECTED_PATHS.MARK_ATTENANCE);
  };

  const discardDraft = async () => {
    if (!draft) return;
    const confirmed = await confirm({
      title: `Discard unfinished ${session}?`,
      body: `"${draft.name}" and the marks saved with it will be lost. This can't be undone.`,
      confirmLabel: "Discard",
      destructive: true,
    });
    if (!confirmed) return;
    discardNewAttendanceDraft(organisationId, draft);
    // The working state may still be pointing at the discarded draft — but
    // must keep pointing at anything that is not that same session (another
    // organisation's working session, or an untagged legacy one).
    const workingIsThisDraft =
      currentAttendance.name === draft.name &&
      currentAttendance.date === draft.date &&
      (!currentAttendance.organisationId ||
        currentAttendance.organisationId === organisationId);
    if (workingIsThisDraft) {
      clearCurrentAttendance();
    }
    setDraft(null);
  };

  // An unfinished draft replaces the creation form: it must not be silently
  // overwritten, so Continue and Discard are the only ways forward.
  if (draft) {
    return (
      <PageContainer width="form">
        <Stack
          gap={5}
          bg="bg.panel"
          rounded="xl"
          boxShadow="lg"
          p={{ base: 4, md: 6 }}
        >
          <Box>
            <Heading fontSize="22px">{`Unfinished ${session}`}</Heading>
            <Text fontWeight="bold" fontSize="lg" mt={4} lineClamp={2}>
              {draft.name}
            </Text>
            <Text color="fg.muted" mt={1}>
              {formatSessionDate(draft.date)}
            </Text>
          </Box>
          <Text>
            {`You started marking this ${session} but haven't submitted it yet.`}
          </Text>
          <Stack gap={3}>
            <Button w="full" size="lg" minH="44px" onClick={resumeDraft}>
              Continue marking
            </Button>
            <Button
              w="full"
              size="lg"
              minH="44px"
              variant="outline"
              colorPalette="gray"
              onClick={discardDraft}
            >
              Discard and create new
            </Button>
          </Stack>
        </Stack>
        {confirmDialog}
      </PageContainer>
    );
  }

  return (
    <PageContainer width="form">
      <Can perm="categories.manage">
        <Flex gap={2} flexWrap="wrap" mb={4}>
          <Button
            variant="outline"
            colorPalette="blue"
            onClick={() => navigate(PROTECTED_PATHS.CATEGORY)}
          >
            {`Add ${terms.categorySingular}`}
          </Button>
          <Button
            variant="outline"
            colorPalette="blue"
            onClick={() => navigate(PROTECTED_PATHS.SUB_CATEGORY)}
          >
            {`Add ${terms.subCategorySingular}`}
          </Button>
        </Flex>
      </Can>
      <Stack
        gap={4}
        bg="bg.panel"
        rounded="xl"
        boxShadow="lg"
        p={{ base: 4, md: 6 }}
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
        {details.date && (availabilityLoading || availabilityFetching) && (
          <Text color="fg.muted">
            Checking {lowerTerm(terms.attendanceSingular)} availability...
          </Text>
        )}
        {details.date && availabilityFailed && !availabilityFetching && (
          <ErrorState
            title={`${terms.attendanceSingular} availability could not be loaded`}
            description="Try again before continuing."
            onRetry={() => refetchAvailability()}
          />
        )}
        {validDate && availabilityReady && unavailableExpectedCount > 0 && (
          <Box borderWidth="1px" borderRadius="md" p={3}>
            <Text fontWeight="bold">
              {terms.attendanceSingular} availability
            </Text>
            <Text fontSize="sm">
              {unavailableExpectedCount}{" "}
              {unavailableExpectedCount === 1
                ? lowerTerm(terms.memberSingular)
                : lowerTerm(terms.memberPlural)}{" "}
              {unavailableExpectedCount === 1 ? "is" : "are"} unavailable on
              this date.
            </Text>
            <Text fontSize="sm">
              Final expected roster: {finalExpectedCount}{" "}
              {finalExpectedCount === 1
                ? lowerTerm(terms.memberSingular)
                : lowerTerm(terms.memberPlural)}
              .
            </Text>
          </Box>
        )}
        {validDate && availabilityReady && finalExpectedCount === 0 && (
          <Box>
            <Text color="fg.error">
              No {lowerTerm(terms.memberPlural)} are available for this{" "}
              {lowerTerm(terms.attendanceSingular)}.
            </Text>
            {!noEligibleMembers && (
              <Text fontSize="sm" color="fg.muted">
                {`You can still continue and add ${withArticle(
                  lowerTerm(terms.memberSingular)
                )} who physically attended.`}
              </Text>
            )}
          </Box>
        )}
        {eligibilityEnabled && (
          <AttendanceEligibilityEditor
            fields={optionFields}
            fieldsStatus={
              memberModelLoaded
                ? "ready"
                : memberModelFailed
                ? "error"
                : "loading"
            }
            rules={eligibilityRules}
            onChange={setEligibilityRules}
            expectedCount={rawEligibilityCount}
            totalCount={members.length}
          />
        )}

        <Button
          w="full"
          mt="6"
          size="lg"
          variant="solid"
          colorPalette="blue"
          fontWeight="bold"
          disabled={
            !membersLoaded ||
            !availabilityReady ||
            availabilityLoading ||
            availabilityFetching ||
            availabilityFailed ||
            noEligibleMembers
          }
          onClick={onContinue}
        >
          Continue
        </Button>
      </Stack>
    </PageContainer>
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
    <CreateAttendanceForm
      key={organisationId}
      organisationId={organisationId}
    />
  );
};

export default CreateAttendance;
