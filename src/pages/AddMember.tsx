import { Box, Flex, Button, Input, Stack, Heading, NativeSelect, Field } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import { FormCheckbox } from "components/ui/checkbox";
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
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FaPlusSquare, FaTrash } from "react-icons/fa";
import { confirmAlert } from "react-confirm-alert";
import { displayMemberFieldLabel, MemberModelField } from "helpers/memberFields";
import PageLoader from "components/PageLoader";
import { Can } from "rbac/Can";
import { queryKeys } from "services/api/queryKeys";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import { LABELS } from "config/presentationLabels";

interface FormData {
  [fieldName: string]: string | boolean;
}

const AddOrUpdateMember = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const [membersModel, setMembersModel] = useState<MemberModelField[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentMember, setcurrentMember] = useState({});
  const navigate = useNavigate();
  const params = useParams();
  const memberURL = convertParamsToString(orgRequest.MEMBER_ONE, {
    organisationId: org.id,
    id: params.memberId as string,
  });
  useQueryWrapper(queryKeys.member(org.id, params.memberId), memberURL, {
    onSuccess: (data) => {
      setcurrentMember(data.data);
      setIsUpdating(true);
    },
    enabled: Boolean(org.id && params.memberId),
  });
  useEffect(() => {
    if (!params.memberId) {
      setIsUpdating(false);
      setcurrentMember({});
    }
  }, [params.memberId]);

  const { register, control, handleSubmit, reset } = useForm<FormData>();
  useEffect(() => {
    if (currentMember && isUpdating) {
      reset(currentMember);
    }
  }, [currentMember, isUpdating, reset]);

  const onSuccess = () => {
    toast.success(
      isUpdating
        ? `${terms.memberSingular} updated successfully`
        : `${terms.memberSingular} added successfully`,
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) });
    navigate(PROTECTED_PATHS.VIEW_MEMBER);
  };

  const modelURL = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });

  const { isFetching: isGettingMembers } = useQueryWrapper(
    queryKeys.memberModel(org.id),
    modelURL,
    {
      onSuccess: (data) => {
        setMembersModel(data?.data.fields);
        const isUpdate = params.memberId !== undefined;
        setIsUpdating(isUpdate);
      },
    },
  );

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

  const handleDeleteMember = () => {
    const url = convertParamsToString(orgRequest.DELETE_MEMBER, {
      organisationId: org.id,
      id: params.memberId as string,
    });
    confirmAlert({
      title: `Delete ${terms.memberSingular}`,
      message: `Are you sure you want to delete this ${lowerTerm(
        terms.memberSingular,
      )}? This cannot be undone.`,
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => deleteMember({ url }),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
  };

  const onSubmit = handleSubmit((data) => {
    confirmAlert({
      title: "Confirmation",
      message: `Are you sure you want to ${
        isUpdating ? "update" : "submit"
      } the ${lowerTerm(terms.memberSingular)}?`,
      buttons: [
        {
          label: "Yes",
          onClick: () => handleAddMember(data),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
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
      } else if (field.type === "option") {
        const fieldValue = isUpdating ? currentMember[field.name] : "";
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
        const fieldValue = isUpdating ? currentMember[field.name] : ""; // Get the current member field value when updating
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

  return (
    <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex justify="flex-end" alignItems="center" mx="6" mt="4">
        {!isGettingMembers && membersModel.length !== 0 && (
          <Can perm="members.manage">
            <Button
              colorPalette="blue"
              variant="outline"
              onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}><FaPlusSquare />{`Update ${LABELS.memberModel(terms)}`}</Button>
          </Can>
        )}
      </Flex>
      <>
        {isGettingMembers ? (
          <PageLoader h="40vh" />
        ) : (
          <Box>
            <Flex mt="40px" align={"center"} justify={"center"}>
              {!isGettingMembers && membersModel.length === 0 ? (
                <Flex
                  flexDir="column"
                  bg="#fff"
                  p="8"
                  rounded={"xl"}
                  boxShadow={"lg"}
                >
                  <Heading>{`You don't have a ${lowerTerm(LABELS.memberModel(terms))} yet`}</Heading>
                  <Can perm="members.manage">
                    <Button
                      mt="4"
                      colorPalette="blue"
                      variant="outline"
                      onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}><FaPlusSquare />{`Create ${LABELS.memberModel(terms)}`}</Button>
                  </Can>
                </Flex>
              ) : (
                <div style={{ width: "90%" }}>
                  <form onSubmit={onSubmit}>
                    <Stack
                      gap={4}
                      w={"full"}
                      maxW={"md"}
                      rounded={"xl"}
                      boxShadow={"lg"}
                      p={6}
                    >
                      {renderFormFields()}
                      <Box>
                        <Button
                          w="full"
                          mt="40px"
                          bg={"blue.400"}
                          color={"white"}
                          _hover={{
                            bg: "blue.500",
                          }}
                          fontWeight="bold"
                          fontSize="15px"
                          type="submit"
                          loading={isLoading}
                        >
                          {isUpdating ? "Update" : "Submit"}
                        </Button>
                      </Box>
                      <Button
                        variant="outline"
                        onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
                      >
                        Cancel
                      </Button>
                      {isUpdating && (
                        <Can perm="members.manage">
                          <Button
                            bg="red.500"
                            color="white"
                            _hover={{ bg: "red.600" }}
                            w="full"
                            mt="8"
                            loading={isDeleting}
                            onClick={handleDeleteMember}><FaTrash />{`Delete ${terms.memberSingular}`}</Button>
                        </Can>
                      )}
                    </Stack>
                  </form>
                </div>
              )}
            </Flex>
          </Box>
        )}
      </>
    </Box>
  );
};

export default AddOrUpdateMember;
