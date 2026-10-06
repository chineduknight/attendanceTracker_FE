import { useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  Stack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
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
import LoadingSpinner from "components/LoadingSpinner";
import ModelFieldCard from "components/members/ModelFieldCard";
import { useMemberModel } from "hooks/useMemberModel";
import { MemberModelField } from "helpers/memberFields";
import {
  EditorField,
  FieldErrors,
  editorFieldKey,
  isNameField,
  isSavedField,
  keyFromLabel,
  newDraftField,
  toEditorFields,
  toModelPayload,
  validateEditorFields,
} from "helpers/memberModelEditor";

interface ModelFormProps {
  organisationId: string;
  savedFields: MemberModelField[];
}

/** Applies an edit; a new field's key follows its label until edited directly. */
const applyPatch = (field: EditorField, patch: Partial<EditorField>): EditorField => {
  const next = { ...field, ...patch };
  if (patch.label !== undefined && !isSavedField(field) && !field.keyEdited) {
    next.name = keyFromLabel(patch.label);
  }
  return next;
};

const ModelForm = ({ organisationId, savedFields }: ModelFormProps) => {
  const navigate = useNavigate();
  // Initialised once from the loaded model, so a background refetch can't wipe
  // unsaved edits. The parent remounts this form on organisation change.
  const [fields, setFields] = useState<EditorField[]>(() => toEditorFields(savedFields));
  const [errors, setErrors] = useState<Map<string, FieldErrors>>(new Map());
  const [serverError, setServerError] = useState<string | null>(null);
  const isUpdating = savedFields.length > 0;

  const updateField = (key: string, patch: Partial<EditorField>) =>
    setFields((current) =>
      current.map((field) => (editorFieldKey(field) === key ? applyPatch(field, patch) : field)),
    );
  const removeField = (key: string) =>
    setFields((current) => current.filter((field) => editorFieldKey(field) !== key));

  const { mutate, isLoading } = useMutationWrapper(
    postRequest,
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memberModel(organisationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(organisationId) });
      toast.success(isUpdating ? "Model updated successfully" : "Model created successfully");
      navigate(PROTECTED_PATHS.ADD_MEMBER);
    },
    (error: any) => {
      if (error?.response?.status === 401) return;
      const message: string =
        error?.response?.data?.error ?? "The model could not be saved. Please try again.";
      setServerError(message);
      toast.error(message);
    },
  );

  const handleSubmit = () => {
    const nextErrors = validateEditorFields(fields);
    setErrors(nextErrors);
    setServerError(null);
    if (nextErrors.size) {
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
      spacing={4}
      w="full"
      maxW="md"
      bg={useColorModeValue("white", "gray.700")}
      rounded="xl"
      boxShadow="lg"
      p={{ base: 4, sm: 6 }}
    >
      <Text fontSize="sm" color="gray.500">
        Labels are what officers see and can be changed at any time. Internal keys
        identify stored member data and stay fixed once saved.
      </Text>
      {serverError && (
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      {fields.map((field, index) => {
        const key = editorFieldKey(field);
        const pinned = isNameField(field, index);
        return (
          <ModelFieldCard
            key={key}
            field={field}
            isPinned={pinned}
            errors={errors.get(key)}
            onChange={(patch) => updateField(key, patch)}
            onRemove={!pinned && !isSavedField(field) ? () => removeField(key) : undefined}
          />
        );
      })}
      <Button
        leftIcon={<FaPlusCircle aria-hidden />}
        variant="logout"
        w="max-content"
        onClick={() => setFields((current) => [...current, newDraftField()])}
      >
        Add field
      </Button>
      <Stack spacing={3}>
        <Button onClick={handleSubmit} isLoading={isLoading}>
          {isUpdating ? "Update" : "Submit"}
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
};

const MemberModelEditor = ({ organisationId }: { organisationId: string }) => {
  const { fields, isSuccess, isError } = useMemberModel(organisationId);
  if (isError) {
    return <Text color="red.500">The member model could not be loaded. Please refresh.</Text>;
  }
  if (!isSuccess) return <LoadingSpinner h="40vh" text="Loading member model..." />;
  return <ModelForm organisationId={organisationId} savedFields={fields} />;
};

/**
 * Configures the organisation's member fields. Remounted per organisation so
 * fields, draft IDs and unsaved edits never leak between tenants.
 */
const UserModel = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  return (
    <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")} py={6} px={4}>
      <Flex justify="center">
        <MemberModelEditor key={organisationId} organisationId={organisationId} />
      </Flex>
    </Box>
  );
};

export default UserModel;
