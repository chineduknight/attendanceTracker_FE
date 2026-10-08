import { useRef, useState } from "react";
import { useColorModeValue } from "components/ui/color-mode";
import {
  Box,
  Flex,
  Button,
  Stack,
  Input,
  Switch,
  Avatar,
  Heading,
  Text,
  Separator,
  Field,
} from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import { Can } from "rbac/Can";
import { usePermissions } from "rbac/usePermissions";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm, withArticle } from "helpers/organisationPresentation";
import { isAttendanceEligibilityEnabled } from "helpers/attendanceEligibility";
import { orgRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import {
  putRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { buildOrgUpdatePayload, OrgSettingsForm } from "helpers/orgPayloads";
import {
  effectiveFeatureVisibility,
  effectiveTerminology,
} from "helpers/organisationPresentation";
import {
  FeatureVisibilitySettings,
  TerminologySettings,
} from "components/settings/PresentationSettings";
import LoadingSpinner from "components/LoadingSpinner";
import AttendanceStatusesEditor from "components/settings/AttendanceStatusesEditor";
import {
  StatusRow,
  toStatusDefinitions,
  toStatusRows,
  validateStatusRows,
} from "helpers/attendanceStatusSettings";
import {
  DEFAULT_WELFARE_REVIEW_WINDOW_DAYS,
  effectiveWelfareSettings,
  welfareReviewWindowError,
} from "helpers/welfareSettings";

const DEFAULT_MAX_EDITS = 1;

const isUrl = (value: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const OrganisationSettings = () => {
  const [org, setOrg] = useGlobalStore((s) => [
    s.organisation,
    s.updateOrganisation,
  ]);
  const terms = useTerms();
  const cardBg = useColorModeValue("white", "gray.700");
  const pageBg = useColorModeValue("gray.50", "gray.800");
  const canManage = usePermissions().has("settings.manage");
  const [statusRows, setStatusRows] = useState<StatusRow[]>(() =>
    toStatusRows(org.attendanceStatuses),
  );
  const [statusErrors, setStatusErrors] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<OrgSettingsForm>({
    defaultValues: {
      name: "",
      image: "",
      collapseAttendanceByDay: false,
      maxAttendanceEdits: "",
      attendanceEligibilityEnabled: isAttendanceEligibilityEnabled(org),
      welfareReviewWindowDays: String(
        effectiveWelfareSettings(org).reviewWindowDays,
      ),
      terminology: effectiveTerminology(org),
      featureVisibility: effectiveFeatureVisibility(org),
    },
  });
  // Only a backend that returns presentation settings can store them; an
  // older validator would reject the whole save if they were sent.
  const [presentationSupported, setPresentationSupported] = useState(false);
  // Likewise, only a backend that returns the eligibility switch accepts it.
  const [eligibilitySettingSupported, setEligibilitySettingSupported] =
    useState(false);
  // And only a backend that serialises welfare settings accepts them back.
  const [welfareSettingsSupported, setWelfareSettingsSupported] =
    useState(false);
  // The organisation a save was submitted for; its reply may land after a switch.
  const savingOrgId = useRef<string | null>(null);
  // The eligibility switch as submitted, when the backend supports it.
  const savingEligibility = useRef<boolean | undefined>(undefined);
  // The review window as submitted, when the backend supports it.
  const savingWelfareWindow = useRef<number | undefined>(undefined);

  const url = convertParamsToString(orgRequest.ORGANISATION_ONE, { id: org.id });

  const { isFetching } = useQueryWrapper(queryKeys.organisation(org.id), url, {
    enabled: Boolean(org.id),
    refetchOnWindowFocus: false,
    onSuccess: (res: any) => {
      const data = res.data;
      reset({
        name: data.name ?? "",
        image: data.image ?? "",
        collapseAttendanceByDay: Boolean(data.collapseAttendanceByDay),
        maxAttendanceEdits:
          data.maxAttendanceEdits == null
            ? ""
            : String(data.maxAttendanceEdits),
        attendanceEligibilityEnabled: isAttendanceEligibilityEnabled(data),
        welfareReviewWindowDays: String(
          effectiveWelfareSettings(data).reviewWindowDays,
        ),
        terminology: effectiveTerminology(data),
        featureVisibility: effectiveFeatureVisibility(data),
      });
      setPresentationSupported(
        data.terminology != null && data.featureVisibility != null,
      );
      setEligibilitySettingSupported(
        typeof data.attendanceEligibilityEnabled === "boolean",
      );
      setWelfareSettingsSupported(
        typeof data.welfareSettings?.reviewWindowDays === "number",
      );
      setStatusRows(toStatusRows(data.attendanceStatuses));
      setStatusErrors([]);
    },
  });

  const { mutate, isLoading: isSaving } = useMutationWrapper(
    putRequest,
    (res: any) => {
      // A reply for an organisation the officer has since switched away from
      // must not re-select it.
      const current = useGlobalStore.getState().organisation;
      if (current.id !== savingOrgId.current) return;
      // PUT returns org fields but NOT permissions/isOwner/roleName —
      // merge over the selected org so RBAC state is preserved. Statuses,
      // terminology, visibility and eligibility apply immediately to marking,
      // nav and Create Attendance.
      setOrg({
        ...current,
        attendanceStatuses: toStatusDefinitions(statusRows),
        ...(savingEligibility.current !== undefined && {
          attendanceEligibilityEnabled: savingEligibility.current,
        }),
        ...(savingWelfareWindow.current !== undefined && {
          welfareSettings: { reviewWindowDays: savingWelfareWindow.current },
        }),
        ...res.data,
      });
      setStatusRows((rows) => rows.map((row) => ({ ...row, persisted: true })));
      // Refresh this organisation's detail only — never another tenant's.
      queryClient.invalidateQueries({ queryKey: queryKeys.organisation(org.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations });
      // A new review window changes this organisation's Welfare overview.
      queryClient.invalidateQueries({ queryKey: queryKeys.welfare.root(org.id) });
      toast.success("Settings saved");
    },
  );

  const onStatusRowsChange = (rows: StatusRow[]) => {
    setStatusRows(rows);
    if (statusErrors.length) setStatusErrors(validateStatusRows(rows));
  };

  const onSubmit = (form: OrgSettingsForm) => {
    const errors = validateStatusRows(statusRows);
    setStatusErrors(errors);
    if (errors.length) return;
    const data = buildOrgUpdatePayload(form, statusRows, {
      includePresentation: presentationSupported,
      includeEligibilitySetting: eligibilitySettingSupported,
      includeWelfareSettings: welfareSettingsSupported,
    });
    savingOrgId.current = org.id;
    savingEligibility.current = data.attendanceEligibilityEnabled;
    savingWelfareWindow.current = data.welfareSettings?.reviewWindowDays;
    mutate({ url, data });
  };

  return (
    <RequirePermission perm="settings.view">
      <Box minH="100vh" bg={pageBg}>
        {isFetching ? (
          <LoadingSpinner h="30vh" text="Loading settings..." />
        ) : (
          <Flex align="center" justify="center">
            <form onSubmit={handleSubmit(onSubmit)} style={{ width: "80%" }}>
              <Stack
                gap={4}
                w="full"
                maxW="lg"
                bg={cardBg}
                rounded="xl"
                boxShadow="lg"
                p={6}
                my={12}
                mx="auto"
              >
                <Field.Root invalid={Boolean(errors.name)} required>
                  <Field.Label>Organisation Name</Field.Label>
                  <Input
                    placeholder="Seat of wisdom presidium"
                    {...register("name", {
                      validate: (v) =>
                        v.trim().length > 0 || "Name is required",
                    })}
                  />
                  <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
                </Field.Root>

                <Field.Root invalid={Boolean(errors.image)}>
                  <Field.Label>Logo URL</Field.Label>
                  <Flex align="center" gap={3}>
                    <Avatar.Root
                      size="md"
                      bg={watch("image") ? "white" : undefined}
                      borderWidth="2px"
                      borderColor="blue.400"><Avatar.Fallback name={watch("name")} /><Avatar.Image src={watch("image")} /></Avatar.Root>
                    <Input
                      placeholder="https://cdn.example.com/logo.png"
                      {...register("image", {
                        validate: (v) =>
                          v.trim() === "" ||
                          isUrl(v.trim()) ||
                          "Enter a valid URL",
                      })}
                    />
                  </Flex>
                  <Field.ErrorText>{errors.image?.message}</Field.ErrorText>
                </Field.Root>

                <Separator />
                <Heading size="sm">{`${terms.attendanceSingular} settings`}</Heading>

                <Field.Root display="flex" alignItems="center">
                  <Field.Label mb="0">{`Collapse ${lowerTerm(
                    terms.attendanceSingular,
                  )} by day`}</Field.Label>
                  <Switch {...register("collapseAttendanceByDay")} />
                </Field.Root>

                <Field.Root invalid={Boolean(errors.maxAttendanceEdits)}>
                  <Field.Label>{`Max ${lowerTerm(
                    terms.attendanceSingular,
                  )} edits`}</Field.Label>
                  <Input
                    type="number"
                    placeholder={`${DEFAULT_MAX_EDITS} (default)`}
                    {...register("maxAttendanceEdits", {
                      validate: (v) => {
                        if (v.trim() === "") return true;
                        const n = Number(v);
                        if (!Number.isInteger(n)) return "Must be a whole number";
                        if (n < 0 || n > 100) return "Must be between 0 and 100";
                        return true;
                      },
                    })}
                  />
                  <Field.HelperText>
                    0 disables editing for all records. Leave blank to use the
                    default ({DEFAULT_MAX_EDITS}).
                  </Field.HelperText>
                  <Field.ErrorText>
                    {errors.maxAttendanceEdits?.message}
                  </Field.ErrorText>
                </Field.Root>

                {eligibilitySettingSupported && (
                  <Field.Root>
                    <Flex align="center" justify="space-between" gap={3}>
                      <Field.Label htmlFor="attendanceEligibilityEnabled" mb="0">
                        {`Use ${lowerTerm(
                          terms.attendanceSingular,
                        )} eligibility rules`}
                      </Field.Label>
                      <Switch
                        id="attendanceEligibilityEnabled"
                        disabled={!canManage}
                        {...register("attendanceEligibilityEnabled")}
                      />
                    </Flex>
                    <Field.HelperText>
                      {`Allow ${lowerTerm(
                        terms.officerPlural,
                      )} to choose which ${lowerTerm(
                        terms.memberPlural,
                      )} are expected for ${withArticle(
                        lowerTerm(terms.attendanceSingular),
                      )}.`}{" "}
                      Useful for sectional rehearsals, committees and other
                      restricted sessions.
                    </Field.HelperText>
                  </Field.Root>
                )}


                <Separator />
                <AttendanceStatusesEditor
                  rows={statusRows}
                  onChange={onStatusRowsChange}
                  errors={statusErrors}
                  isReadOnly={!canManage}
                />

                {welfareSettingsSupported && (
                  <>
                    <Separator />
                    <Box>
                      <Heading size="sm">Welfare &amp; Engagement</Heading>
                      <Text fontSize="sm" color="gray.500">
                        How Presence Pro compares the recent and previous
                        periods when it looks for people who may need a check-in
                        or deserve encouragement.
                      </Text>
                    </Box>

                    <Field.Root
                      invalid={Boolean(errors.welfareReviewWindowDays)}
                    >
                      <Field.Label>Review window (days)</Field.Label>
                      <Input
                        type="number"
                        readOnly={!canManage}
                        placeholder={`${DEFAULT_WELFARE_REVIEW_WINDOW_DAYS} (default)`}
                        {...register("welfareReviewWindowDays", {
                          validate: (v) => welfareReviewWindowError(v) ?? true,
                        })}
                      />
                      <Field.HelperText>
                        Presence Pro compares the most recent period with the
                        immediately preceding period of the same length.
                        <br />
                        Choose a shorter window for organisations that meet
                        several times a week and a longer window for
                        organisations that meet less often.
                        <br />
                        Frequent meetings: 7–14 days. Monthly meetings: around
                        30 days.
                      </Field.HelperText>
                      <Field.ErrorText>
                        {errors.welfareReviewWindowDays?.message}
                      </Field.ErrorText>
                    </Field.Root>
                  </>
                )}

                {presentationSupported && (
                  <>
                    <Separator />
                    <TerminologySettings
                      register={register}
                      errors={errors}
                      isReadOnly={!canManage}
                    />

                    <Separator />
                    <FeatureVisibilitySettings
                      register={register}
                      errors={errors}
                      isReadOnly={!canManage}
                    />
                  </>
                )}

                <Can perm="settings.manage">
                  <Button variant="primary" type="submit" loading={isSaving}>
                    Save
                  </Button>
                </Can>
              </Stack>
            </form>
          </Flex>
        )}
      </Box>
    </RequirePermission>
  );
};

export default OrganisationSettings;
