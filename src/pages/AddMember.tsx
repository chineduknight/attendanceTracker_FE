import { Box, Button, Flex, Input, Stack, NativeSelect, Field } from "@chakra-ui/react";
import { FormCheckbox } from "components/ui/checkbox";
import { DateField, todayValue } from "components/ui/date-field";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import PageContainer from "components/layout/PageContainer";
import { useNavigate, useParams } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
  deleteRequest,
  postRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { FaPlusSquare, FaTrash } from "react-icons/fa";
import { useConfirm } from "components/ui/confirm-dialog";
import { displayMemberFieldLabel, MemberModelField } from "helpers/memberFields";
import PageLoader from "components/PageLoader";
import { Can } from "rbac/Can";
import { queryKeys } from "services/api/queryKeys";
import { useTerms } from "hooks/useOrgPresentation";
import { useMemberModel } from "hooks/useMemberModel";
import { lowerTerm } from "helpers/organisationPresentation";
import { LABELS } from "config/presentationLabels";

interface FormData {
  [fieldName: string]: string | boolean;
}

type MemberData = Record<string, unknown>;

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}/;

/** A stored date field as the YYYY-MM-DD the date input reads ("" if unset). */
const dateValue = (value: unknown) =>
  typeof value === "string" ? value.match(BUSINESS_DATE)?.[0] ?? "" : "";

// The Birthdays feature reads `dob`: a birth date can't be in the future.
const maxDateFor = (field: MemberModelField) =>
  field.name === "dob" ? todayValue() : undefined;

const AddOrUpdateMember = () => {
  const { confirm, confirmDialog } = useConfirm();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const navigate = useNavigate();
  const params = useParams();
  const isUpdating = Boolean(params.memberId);
  const memberURL = convertParamsToString(orgRequest.MEMBER_ONE, {
    organisationId: org.id,
    id: params.memberId as string,
  });
  const memberQuery = useQueryWrapper(queryKeys.member(org.id, params.memberId), memberURL, {
    enabled: Boolean(org.id && params.memberId),
  });
  const currentMember: MemberData = isUpdating ? memberQuery.data?.data ?? {} : {};
  const model = useMemberModel(org.id);
  const membersModel = model.fields as MemberModelField[];

  const { register, control, handleSubmit, reset } = useForm<FormData>();
  // Seed the form once per member. A background refetch (e.g. returning to
  // the app) must not reset what the officer has typed since.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const member = memberQuery.data?.data as MemberData | undefined;
    if (!params.memberId) {
      // Update -> Add reuses this page: drop the previous member's values.
      if (seededFor.current !== null) reset({});
      seededFor.current = null;
      return;
    }
    if (!member || !model.hasData) return;
    if (seededFor.current === params.memberId) return;
    seededFor.current = params.memberId;
    const values = { ...member } as FormData;
    membersModel
      .filter((field) => field.type === "date")
      .forEach((field) => {
        values[field.name] = dateValue(member[field.name]);
      });
    reset(values);
  }, [memberQuery.data, params.memberId, model.hasData, membersModel, reset]);

  const onSuccess = () => {
    toast.success(
      isUpdating
        ? `${terms.memberSingular} updated successfully`
        : `${terms.memberSingular} added successfully`,
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) });
    navigate(PROTECTED_PATHS.VIEW_MEMBER);
  };

  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const handleAddMember = (formData: FormData) => {
    const url = convertParamsToString(orgRequest.MEMBERS, {
      organisationId: org.id,
    });
    let data: any = formData;
    if (isUpdating) {
      data = {
        ...formData,
        memberId: params.memberId,
      };
    }
    // Add new member
    mutate({
      url,
      data,
    });
  };

  const { mutate: deleteMember, isLoading: isDeleting } = useMutationWrapper(
    deleteRequest,
    () => {
      toast.success(`${terms.memberSingular} deleted successfully`);
      queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) });
      navigate(PROTECTED_PATHS.VIEW_MEMBER);
    },
    (error: any) => {
      const message =
        error?.response?.data?.error ??
        `Failed to delete ${lowerTerm(terms.memberSingular)}.`;
      toast.error(message);
    },
  );

  const handleDeleteMember = async () => {
    const url = convertParamsToString(orgRequest.DELETE_MEMBER, {
      organisationId: org.id,
      id: params.memberId as string,
    });
    const confirmed = await confirm({
      title: `Delete ${terms.memberSingular}`,
      body: `Are you sure you want to delete this ${lowerTerm(
        terms.memberSingular,
      )}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) deleteMember({ url });
  };

  const onSubmit = handleSubmit(async (data) => {
    const confirmed = await confirm({
      title: "Confirmation",
      body: `Are you sure you want to ${
        isUpdating ? "update" : "submit"
      } the ${lowerTerm(terms.memberSingular)}?`,
      confirmLabel: isUpdating ? "Update" : "Submit",
    });
    if (confirmed) handleAddMember(data);
  });

  // Render the form fields based on the members' model
  const renderFormFields = () => {
    // Labels are display-only; every input stays registered under its storage key.
    return membersModel.map((field) => {
      if (field.type === "checkbox") {
        // Controlled: the async reset(currentMember) must reach the visible box.
        return (
          <Field.Root key={field._id ?? field.name} id={field.name}>
            <Field.Label>{displayMemberFieldLabel(field)}</Field.Label>
            <FormCheckbox
              control={control}
              name={field.name}
              label={displayMemberFieldLabel(field)}
              colorPalette="blue"
            />
          </Field.Root>
        );
      } else if (field.type === "date") {
        return (
          <Field.Root
            key={field._id ?? field.name}
            id={field.name}
            required={field.required}
          >
            <Field.Label>{displayMemberFieldLabel(field)}</Field.Label>
            <Controller
              control={control}
              name={field.name}
              defaultValue=""
              rules={{ required: field.required }}
              render={({ field: input }) => (
                <DateField
                  name={input.name}
                  value={typeof input.value === "string" ? input.value : ""}
                  onChange={input.onChange}
                  onBlur={input.onBlur}
                  max={maxDateFor(field)}
                  clearable={!field.required}
                />
              )}
            />
          </Field.Root>
        );
      } else if (field.type === "option") {
        const fieldValue = isUpdating ? (currentMember[field.name] as string) : "";
        return (
          <Field.Root
            key={field._id ?? field.name}
            id={field.name}
            required={field.required}
          >
            <Field.Label>{displayMemberFieldLabel(field)}</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                defaultValue={fieldValue}
                {...register(field.name, { required: field.required })}>
                {Array.isArray(field.options) &&
                  field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        );
      } else {
        const fieldValue = isUpdating ? (currentMember[field.name] as string) : ""; // Get the current member field value when updating
        return (
          <Field.Root
            key={field._id ?? field.name}
            id={field.name}
            required={field.required}
          >
            <Field.Label>{displayMemberFieldLabel(field)}</Field.Label>
            <Input
              type={field.type}
              defaultValue={fieldValue}
              {...register(field.name, { required: field.required })}
            />
          </Field.Root>
        );
      }
    });
  };

  const memberLabel = lowerTerm(terms.memberSingular);
  // Only the first load shows the loader: a background refetch keeps the
  // form (and the officer's edits) on screen.
  const memberLoading = isUpdating && memberQuery.isLoading;
  const memberFailed = isUpdating && memberQuery.isError && !memberQuery.data;
  const modelFailed = model.isError && !model.hasData;

  const body = () => {
    if (model.isLoading || memberLoading) return <PageLoader h="40vh" />;
    if (modelFailed) {
      return (
        <ErrorState
          title={`Couldn't load the ${lowerTerm(LABELS.memberModel(terms))}`}
          description={errorMessage(model.error)}
          onRetry={() => model.refetch()}
        />
      );
    }
    if (memberFailed) {
      return (
        <ErrorState
          title={`Couldn't load this ${memberLabel}`}
          description={errorMessage(memberQuery.error)}
          onRetry={() => memberQuery.refetch()}
        />
      );
    }
    if (membersModel.length === 0) {
      return (
        <EmptyState
          title={`You don't have a ${lowerTerm(LABELS.memberModel(terms))} yet`}
          action={
            <Can perm="members.manage">
              <Button
                colorPalette="blue"
                variant="outline"
                onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}><FaPlusSquare />{`Create ${LABELS.memberModel(terms)}`}</Button>
            </Can>
          }
        />
      );
    }
    return (
      <form onSubmit={onSubmit}>
        <Stack gap={4} bg="bg.panel" rounded="xl" boxShadow="lg" p={{ base: 4, md: 6 }}>
          {renderFormFields()}
          <Box mt="6">
            <Button
              w="full"
              size="lg"
              variant="solid"
              colorPalette="blue"
              fontWeight="bold"
              type="submit"
              loading={isLoading}
            >
              {isUpdating ? "Update" : "Submit"}
            </Button>
          </Box>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          {isUpdating && (
            <Can perm="members.manage">
              <Button
                variant="solid"
                colorPalette="red"
                w="full"
                mt="6"
                loading={isDeleting}
                onClick={handleDeleteMember}><FaTrash />{`Delete ${terms.memberSingular}`}</Button>
            </Can>
          )}
        </Stack>
      </form>
    );
  };

  return (
    <PageContainer width="form">
      {!model.isLoading && membersModel.length !== 0 && (
        <Can perm="members.manage">
          <Flex justify="flex-end" mb={4}>
            <Button
              colorPalette="blue"
              variant="outline"
              onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}><FaPlusSquare />{`Update ${LABELS.memberModel(terms)}`}</Button>
          </Flex>
        </Can>
      )}
      {body()}
      {confirmDialog}
    </PageContainer>
  );
};

export default AddOrUpdateMember;
