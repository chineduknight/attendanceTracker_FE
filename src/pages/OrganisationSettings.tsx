import { useRef, useState } from "react";
import {
  Box,
  Flex,
  Button,
  Stack,
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  Input,
  Switch,
  Avatar,
  Divider,
  useColorModeValue,
} from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import { Can } from "rbac/Can";
import { usePermissions } from "rbac/usePermissions";
import { orgRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import {
  putRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  buildOrgUpdatePayload,
  OrgSettingsForm,
  OrgUpdatePayload,
} from "helpers/orgPayloads";
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
      terminology: effectiveTerminology(org),
      featureVisibility: effectiveFeatureVisibility(org),
    },
  });
  // The body last sent, so a reply from an older backend still updates nav.
  const lastPayload = useRef<OrgUpdatePayload | null>(null);

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
        terminology: effectiveTerminology(data),
        featureVisibility: effectiveFeatureVisibility(data),
      });
      setStatusRows(toStatusRows(data.attendanceStatuses));
      setStatusErrors([]);
    },
  });

  const { mutate, isLoading: isSaving } = useMutationWrapper(
    putRequest,
    (res: any) => {
      // PUT returns org fields but NOT permissions/isOwner/roleName —
      // merge over the selected org so RBAC state is preserved. Statuses,
      // terminology and visibility apply immediately to marking and nav.
      setOrg({
        ...org,
        attendanceStatuses: toStatusDefinitions(statusRows),
        ...(lastPayload.current && {
          terminology: lastPayload.current.terminology,
          featureVisibility: lastPayload.current.featureVisibility,
        }),
        ...res.data,
      });
      setStatusRows((rows) => rows.map((row) => ({ ...row, persisted: true })));
      // Refresh this organisation's detail only — never another tenant's.
      queryClient.invalidateQueries({ queryKey: queryKeys.organisation(org.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations });
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
    const payload = buildOrgUpdatePayload(form, statusRows);
    lastPayload.current = payload;
    mutate({ url, data: payload });
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
                spacing={4}
                w="full"
                maxW="lg"
                bg={cardBg}
                rounded="xl"
                boxShadow="lg"
                p={6}
                my={12}
                mx="auto"
              >
                <FormControl isInvalid={Boolean(errors.name)} isRequired>
                  <FormLabel>Organisation Name</FormLabel>
                  <Input
                    placeholder="Seat of wisdom presidium"
                    {...register("name", {
                      validate: (v) =>
                        v.trim().length > 0 || "Name is required",
                    })}
                  />
                  <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={Boolean(errors.image)}>
                  <FormLabel>Logo URL</FormLabel>
                  <Flex align="center" gap={3}>
                    <Avatar
                      name={watch("name")}
                      src={watch("image")}
                      size="md"
                      bg={watch("image") ? "white" : undefined}
                      borderWidth="2px"
                      borderColor="blue.400"
                    />
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
                  <FormErrorMessage>{errors.image?.message}</FormErrorMessage>
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">Collapse attendance by day</FormLabel>
                  <Switch {...register("collapseAttendanceByDay")} />
                </FormControl>

                <FormControl isInvalid={Boolean(errors.maxAttendanceEdits)}>
                  <FormLabel>Max attendance edits</FormLabel>
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
                  <FormHelperText>
                    0 disables editing for all records. Leave blank to use the
                    default ({DEFAULT_MAX_EDITS}).
                  </FormHelperText>
                  <FormErrorMessage>
                    {errors.maxAttendanceEdits?.message}
                  </FormErrorMessage>
                </FormControl>

                <Divider />
                <AttendanceStatusesEditor
                  rows={statusRows}
                  onChange={onStatusRowsChange}
                  errors={statusErrors}
                  isReadOnly={!canManage}
                />

                <Divider />
                <TerminologySettings
                  register={register}
                  errors={errors}
                  isReadOnly={!canManage}
                />

                <Divider />
                <FeatureVisibilitySettings
                  register={register}
                  errors={errors}
                  isReadOnly={!canManage}
                />

                <Can perm="settings.manage">
                  <Button variant="primary" type="submit" isLoading={isSaving}>
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
