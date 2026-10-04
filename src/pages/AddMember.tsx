import {
  Box,
  Flex,
  Checkbox,
  useColorModeValue,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Heading,
  Select,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
  deleteRequest,
  postRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FaPlusSquare, FaTrash } from "react-icons/fa";
import { confirmAlert } from "react-confirm-alert";
import { FieldType } from "./UserModel";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { queryKeys } from "services/api/queryKeys";

interface FormData {
  [fieldName: string]: string;
}

const AddOrUpdateMember = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [membersModel, setMembersModel] = useState<FieldType[]>([]);
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

  const { register, handleSubmit, reset } = useForm<FormData>();
  useEffect(() => {
    if (currentMember && isUpdating) {
      reset(currentMember);
    }
  }, [currentMember, isUpdating, reset]);

  const onSuccess = () => {
    toast.success(
      isUpdating ? "Member updated successfully" : "Member added successfully",
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
      toast.success("Member deleted successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.members(org.id) });
      navigate(PROTECTED_PATHS.VIEW_MEMBER);
    },
    (error: any) => {
      const message =
        error?.response?.data?.error ?? "Failed to delete member.";
      toast.error(message);
    },
  );

  const handleDeleteMember = () => {
    const url = convertParamsToString(orgRequest.DELETE_MEMBER, {
      organisationId: org.id,
      id: params.memberId as string,
    });
    confirmAlert({
      title: "Delete Member",
      message:
        "Are you sure you want to delete this member? This cannot be undone.",
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
      } the member?`,
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
    return membersModel.map((field) => {
      if (field.type === "checkbox") {
        const fieldValue = isUpdating ? currentMember[field.name] : false; // Get the current member field value when updating
        return (
          <FormControl key={field._id} id={field.name}>
            <FormLabel>{capitalize(field.name)}</FormLabel>
            <Checkbox
              {...register(field.name)}
              colorScheme="blue"
              defaultChecked={fieldValue} // Set the default checked value for the checkbox
            />
          </FormControl>
        );
      } else if (field.type === "option") {
        const fieldValue = isUpdating ? currentMember[field.name] : "";
        return (
          <FormControl
            key={field._id}
            id={field.name}
            isRequired={field.required}
          >
            <FormLabel>{capitalize(field.name)}</FormLabel>
            <Select
              defaultValue={fieldValue}
              {...register(field.name, { required: field.required })}
            >
              {Array.isArray(field.options) &&
                field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
            </Select>
          </FormControl>
        );
      } else {
        const fieldValue = isUpdating ? currentMember[field.name] : ""; // Get the current member field value when updating
        return (
          <FormControl
            key={field._id}
            id={field.name}
            isRequired={field.required}
          >
            <FormLabel>{capitalize(field.name)}</FormLabel>
            <Input
              type={field.type}
              defaultValue={fieldValue}
              {...register(field.name, { required: field.required })}
            />
          </FormControl>
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
              leftIcon={<FaPlusSquare />}
              colorScheme="blue"
              variant="outline"
              onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}
            >
              Update Model
            </Button>
          </Can>
        )}
      </Flex>
      <>
        {isGettingMembers ? (
          <LoadingSpinner h="40vh" />
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
                  <Heading>You don't have a model yet</Heading>
                  <Can perm="members.manage">
                    <Button
                      mt="4"
                      leftIcon={<FaPlusSquare />}
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}
                    >
                      Create Model
                    </Button>
                  </Can>
                </Flex>
              ) : (
                <div style={{ width: "90%" }}>
                  <form onSubmit={onSubmit}>
                    <Stack
                      spacing={4}
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
                          isLoading={isLoading}
                          // onClick={onSubmit}
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
                            leftIcon={<FaTrash />}
                            bg="red.500"
                            color="white"
                            _hover={{ bg: "red.600" }}
                            w="full"
                            mt="8"
                            isLoading={isDeleting}
                            onClick={handleDeleteMember}
                          >
                            Delete Member
                          </Button>
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
