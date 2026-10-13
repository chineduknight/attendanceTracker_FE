import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaPlusCircle } from "react-icons/fa";
import {
  postRequest,
  queryClient,
  useMutationWrapper,
} from "services/api/apiHelper";
import { orgRequest } from "services";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import { ErrorState, errorMessage } from "components/ui/states";
import ModelFieldCard from "components/members/ModelFieldCard";
import { useMemberModel } from "hooks/useMemberModel";
import { MemberModelField } from "helpers/memberFields";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import {
  EditorField,
  FieldErrors,
  keyFromLabel,
  newDraftField,
  toEditorFields,
  toModelPayload,
  validateEditorFields,
} from "helpers/memberModelEditor";
import { LABELS } from "config/presentationLabels";

const NO_ERRORS = new Map<string, FieldErrors>();

interface ModelFormProps {
  organisationId: string;
  savedFields: MemberModelField[];
}

/** Applies an edit; a new field's key follows its label until edited directly. */
const applyPatch = (field: EditorField, patch: Partial<EditorField>): EditorField => {
  const next = { ...field, ...patch };
  if (patch.label !== undefined && !field.persisted && !field.keyEdited) {
    next.name = keyFromLabel(patch.label);
  }
  return next;
};

const ModelForm = ({ organisationId, savedFields }: ModelFormProps) => {
  const navigate = useNavigate();
  const terms = useTerms();
  // Initialised once from the loaded model, so a background refetch can't wipe
  // unsaved edits. The parent remounts this form on organisation change.
  const [fields, setFields] = useState<EditorField[]>(() => toEditorFields(savedFields));
  // Errors appear after the first save attempt, then track every edit.
  const [submitted, setSubmitted] = useState(false);
  const errors = useMemo(
    () => (submitted ? validateEditorFields(fields) : NO_ERRORS),
    [submitted, fields],
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const isUpdating = savedFields.length > 0;

  const updateField = (key: string, patch: Partial<EditorField>) =>
    setFields((current) =>
      current.map((field) => (field.reactKey === key ? applyPatch(field, patch) : field)),
    );
  const removeField = (key: string) =>
    setFields((current) => current.filter((field) => field.reactKey !== key));

  const { mutate, isLoading } = useMutationWrapper(
    postRequest,
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memberModel(organisationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(organisationId) });
      const model = LABELS.memberModel(terms);
      toast.success(`${model} ${isUpdating ? "updated" : "created"} successfully`);
      navigate(PROTECTED_PATHS.ADD_MEMBER);
    },
    (error: any) => {
      if (error?.response?.status === 401) return;
      const message: string =
        error?.response?.data?.error ??
        `The ${lowerTerm(LABELS.memberModel(terms))} could not be saved. Please try again.`;
      setServerError(message);
      toast.error(message);
    },
  );

  const handleSubmit = () => {
    setSubmitted(true);
    setServerError(null);
    if (validateEditorFields(fields).size) {
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    mutate({
      url: convertParamsToString(orgRequest.CONFIG_MODEL, { organisationId }),
      data: { fields: toModelPayload(fields) },
    });
  };

  return (
    <Stack
      gap={4}
      bg="bg.panel"
      rounded="xl"
      boxShadow="lg"
      p={{ base: 4, md: 6 }}
    >
      <Text fontSize="sm" color="fg.muted">
        {`Labels are what ${lowerTerm(terms.officerPlural)} see and can be changed at any time. Internal keys identify stored ${lowerTerm(terms.memberSingular)} data and stay fixed once saved.`}
      </Text>
      {serverError && (
        <Alert.Root status="error" borderRadius="md">
          <Alert.Indicator />
          <Alert.Description>{serverError}</Alert.Description>
        </Alert.Root>
      )}
      {fields.map((field) => (
        <ModelFieldCard
          key={field.reactKey}
          field={field}
          errors={errors.get(field.reactKey)}
          onChange={(patch) => updateField(field.reactKey, patch)}
          onRemove={
            field.pinned || field.persisted ? undefined : () => removeField(field.reactKey)
          }
        />
      ))}
      <Button
        variant="outline"
        colorPalette="blue"
        w="max-content"
        onClick={() => setFields((current) => [...current, newDraftField()])}
      >
        <FaPlusCircle aria-hidden />
        Add field
      </Button>
      <Stack gap={3} mt={4}>
        <Button
          size="lg"
          variant="solid"
          colorPalette="blue"
          fontWeight="bold"
          onClick={handleSubmit}
          loading={isLoading}
        >
          {isUpdating ? "Update" : "Submit"}
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
};

/**
 * Seeds the form once from a fresh copy of the model (not a possibly stale
 * cache entry), then keeps it mounted: later refetches or refetch failures
 * never replace or unmount the officer's unsaved edits.
 */
const MemberModelEditor = ({ organisationId }: { organisationId: string }) => {
  const terms = useTerms();
  const { fields, hasData, isError, isFetchedAfterMount, error, refetch } = useMemberModel(organisationId, {
    refetchOnWindowFocus: false,
  });
  const [seed, setSeed] = useState<MemberModelField[] | null>(null);
  useEffect(() => {
    if (seed === null && hasData && (isFetchedAfterMount || isError)) setSeed(fields);
  }, [seed, hasData, isFetchedAfterMount, isError, fields]);

  if (seed) return <ModelForm organisationId={organisationId} savedFields={seed} />;
  if (isError && !hasData) {
    return (
      <ErrorState
        title={`Couldn't load the ${lowerTerm(LABELS.memberModel(terms))}`}
        description={errorMessage(error)}
        onRetry={() => refetch()}
      />
    );
  }
  return (
    <PageLoader
      h="40vh"
      label={`Loading ${lowerTerm(terms.memberSingular)} model...`}
    />
  );
};

/**
 * Configures the organisation's member fields. Remounted per organisation so
 * fields, draft IDs and unsaved edits never leak between tenants.
 */
const UserModel = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  return (
    <PageContainer width="form">
      <MemberModelEditor key={organisationId} organisationId={organisationId} />
    </PageContainer>
  );
};

export default UserModel;
