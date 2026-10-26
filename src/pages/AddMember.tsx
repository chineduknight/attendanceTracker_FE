import { Box, Button, Flex, Input, Stack, Field } from "@chakra-ui/react";
import { FormOptionSelect } from "components/ui/themed-select";
import { FormCheckbox } from "components/ui/checkbox";
import { DateField, todayValue } from "components/ui/date-field";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import PageContainer from "components/layout/PageContainer";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useEffect, useState } from "react";
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
import { useDiscardChangesGuard } from "hooks/useUnsavedChangesGuard";
import { hasFormChanges, snapshotOf } from "helpers/formChanges";

interface FormData {
  [fieldName: string]: string | boolean;
}

type MemberData = Record<string, unknown>;

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * The list address an edit was opened from, so saving returns to the same
 * filters and search. Only an in-app path is accepted; a direct visit to the
 * form has no such state and lands on the plain list.
 */
const returnTarget = (state: unknown): string | null => {
  const returnTo = (state as { returnTo?: unknown } | null)?.returnTo;
  return typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//")
    ? returnTo
    : null;
};

/** A stored date field as the YYYY-MM-DD the date input reads ("" if unset). */
const dateValue = (value: unknown) =>
  typeof value === "string" ? value.match(BUSINESS_DATE)?.[0] ?? "" : "";

// The Birthdays feature reads `dob`: a birth date can't be in the future.
const maxDateFor = (field: MemberModelField) =>
  field.name === "dob" ? todayValue() : undefined;

const AddOrUpdateMemberForm = () => {
  const { confirm, confirmDialog } = useConfirm();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const isUpdating = Boolean(params.memberId);
  const memberURL = convertParamsToString(orgRequest.MEMBER_ONE, {
    organisationId: org.id,
    id: params.memberId as string,
  });
  const memberQuery = useQueryWrapper(queryKeys.member(org.id, params.memberId), memberURL, {
    enabled: Boolean(org.id && params.memberId),
  });
  const model = useMemberModel(org.id);
  const membersModel = model.fields as MemberModelField[];

  const { register, control, handleSubmit, reset, watch, getValues } = useForm<FormData>();
  // Seed the form once per member, from the first response fetched after
  // this page opened. A cached copy (served first, then refetched) may
  // predate the officer's last save; editing it would write old values back.
  // Once seeded, background refetches (e.g. returning to the app) never
  // reset what the officer has typed since.
  const [seed, setSeed] = useState<{ memberId: string; values: FormData } | null>(null);
  const seededFor = seed?.memberId ?? null;
  // Inputs mount once seeded, so their defaults are the seeded snapshot,
  // never a later refetch.
  const currentMember: FormData = isUpdating && seed ? seed.values : {};
  const freshMember =
    memberQuery.isFetchedAfterMount && !memberQuery.isError
      ? (memberQuery.data?.data as MemberData | undefined)
      : undefined;
  useEffect(() => {
    if (!params.memberId) {
      // Update -> Add reuses this page: drop the previous member's values.
      if (seededFor !== null) {
        reset({});
        setSeed(null);
      }
      return;
    }
    if (!freshMember || !model.hasData || seededFor === params.memberId) return;
    const member = freshMember;
    const values = { ...member } as FormData;
    membersModel
      .filter((field) => field.type === "date")
      .forEach((field) => {
        values[field.name] = dateValue(member[field.name]);
      });
    reset(values);
    setSeed({ memberId: params.memberId, values });
  }, [freshMember, params.memberId, model.hasData, membersModel, reset, seededFor]);

  const memberLabel = lowerTerm(terms.memberSingular);
  // Until the form is seeded from a fresh response: an error (even with a
  // cached copy, which may be out of date) or the loader. After that, a
  // background refetch, failed or not, keeps the form and the officer's edits.
  const seeded = seededFor === params.memberId;

  // The form as first shown: the loaded member (or a blank new one) after
  // every field has mounted with its default, so neither loading nor an
  // option's preselected first value counts as a change. Taken once per
  // form; refetches of the member or the model never move it.
  const formShown =
    model.hasData && membersModel.length > 0 && (!isUpdating || seeded);
  const formKey = formShown ? params.memberId ?? "new" : null;
  const [baseline, setBaseline] = useState<{ key: string; values: FormData } | null>(null);
  useEffect(() => {
    if (formKey && baseline?.key !== formKey) {
      setBaseline({ key: formKey, values: snapshotOf(getValues()) });
    }
  }, [formKey, baseline, getValues]);
  const formValues = watch();
  const hasUnsavedChanges =
    formKey !== null &&
    baseline?.key === formKey &&
    hasFormChanges(baseline.values, formValues);
  const releaseLeaveGuard = useDiscardChangesGuard(
    hasUnsavedChanges,
    isUpdating ? `this ${memberLabel}` : `this new ${memberLabel}`,
    confirm,
  );

  const onSuccess = () => {
    toast.success(
      isUpdating
        ? `${terms.memberSingular} updated successfully`
        : `${terms.memberSingular} added successfully`,
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) });
    // ["member", org, id] is not under ["members", org]: refresh it too, so
    // reopening this member never starts from the pre-save copy.
    if (params.memberId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.member(org.id, params.memberId) });
    }
  };

  // Passed per call, so it only runs while this form is still open: an
  // officer who left mid-request is never pulled back to the list, and the
  // leave guard of whatever screen they are on now is left alone.
  const leaveForList = {
    onSuccess: () => {
      // Saved or deleted: moving on to the list must not ask.
      releaseLeaveGuard();
      navigate(returnTarget(location.state) ?? PROTECTED_PATHS.VIEW_MEMBER);
    },
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
    mutate({ url, data }, leaveForList);
  };

  const { mutate: deleteMember, isLoading: isDeleting } = useMutationWrapper(
    deleteRequest,
    () => {
      toast.success(`${terms.memberSingular} deleted successfully`);
      queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) });
      queryClient.removeQueries({ queryKey: queryKeys.member(org.id, params.memberId) });
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
    // Deleted after its own confirmation: there is nothing left to discard.
    // A failed delete keeps the form and its guard.
    if (confirmed) deleteMember({ url }, leaveForList);
  };

  // Locked while a save or delete is in flight: either one navigates away on
  // success, so an edit made meanwhile would be lost without a question.
  const locked = isLoading || isDeleting;

  const onSubmit = handleSubmit(async (data) => {
    // Enter in a field submits the form even while Update shows its spinner.
    if (locked) return;
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
              disabled={locked}
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
                  disabled={locked}
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
            <FormOptionSelect
              control={control}
              name={field.name}
              rules={{ required: field.required }}
              isDisabled={locked}
              options={(Array.isArray(field.options) ? field.options : []).map(
                (option) => ({ value: option, label: option }),
              )}
              // As the native select did: with nothing stored, the first
              // option is shown and saved.
              defaultValue={
                fieldValue ||
                (Array.isArray(field.options) ? field.options[0] : undefined)
              }
            />
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
              readOnly={locked}
              {...register(field.name, { required: field.required })}
            />
          </Field.Root>
        );
      }
    });
  };

  const memberFailed = isUpdating && !seeded && memberQuery.isError;
  const memberLoading = isUpdating && !seeded && !memberFailed;
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
              disabled={isDeleting}
            >
              {isUpdating ? "Update" : "Submit"}
            </Button>
          </Box>
          <Button variant="outline" disabled={locked} onClick={() => navigate(-1)}>
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
                disabled={isLoading}
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
              disabled={locked}
              onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}><FaPlusSquare />{`Update ${LABELS.memberModel(terms)}`}</Button>
          </Flex>
        </Can>
      )}
      {body()}
      {confirmDialog}
    </PageContainer>
  );
};

/**
 * Remounted per organisation and per member, so the loaded member, the
 * form's values and its unsaved-changes baseline never carry over to another
 * organisation or member (values are keyed by field name, which they share).
 * Add and Update are the same component to the router, so without this a
 * save still in flight from Update would count as the new Add form's own.
 */
const AddOrUpdateMember = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  const { memberId } = useParams();
  return <AddOrUpdateMemberForm key={`${organisationId}:${memberId ?? "new"}`} />;
};

export default AddOrUpdateMember;
