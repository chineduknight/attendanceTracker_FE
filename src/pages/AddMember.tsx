import {
  Box,
  Flex,
  Checkbox,
  useColorModeValue,
  Text,
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
import { FaPlusSquare } from "react-icons/fa";
import { confirmAlert } from "react-confirm-alert";
import { Q_KEY } from "utils/constant";
import { FieldType } from "./UserModel";

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
  const allMembersURL = convertParamsToString(orgRequest.MEMBERS, {
    organisationId: org.id,
  });
  const { refetch } = useQueryWrapper(["get-member-by-id"], allMembersURL, {
    onSuccess: (data) => {
      const allMembers = data.data;
      const member = allMembers.find((member) => member.id === params.memberId);
      setcurrentMember(member);
    },
    enabled: false,
  });
  useEffect(() => {
    if (params.memberId) {
      setIsUpdating(true);
      refetch();
    } else {
      setIsUpdating(false);
    }
  }, [params.memberId, refetch]);

  const { register, handleSubmit, reset } = useForm<FormData>();
  useEffect(() => {
    if (currentMember && isUpdating) {
      reset(currentMember);
    }
  }, [currentMember, isUpdating, reset]);

  const onSuccess = () => {
    toast.success(
      isUpdating ? "Member updated successfully" : "Member added successfully"
    );
    queryClient.invalidateQueries({ queryKey: [Q_KEY.GET_MEMBERS] });
    navigate(PROTECTED_PATHS.VIEW_MEMBER);
  };

  const modelURL = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });

  const { isLoading: isGettingMembers } = useQueryWrapper(
    ["get-member-model"],
    modelURL,
    {
      onSuccess: (data) => {
        setMembersModel(data?.data.fields);
        const isUpdate = params.memberId !== undefined;
        setIsUpdating(isUpdate);
      },
    }
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

  const onSubmit = handleSubmit((data) => {
    console.log("data:", data);
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
          onClick: () => console.log("Member update canceled"),
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
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff" fontWeight="bold">
          {isUpdating ? "Update Member" : "Add Member"}
        </Text>
      </Flex>
      <>
        {isGettingMembers ? (
          <Box>Loading...</Box>
        ) : (
          <Box>
            <Flex justify="right" mr="6" mt="4">
              {membersModel.length !== 0 && (
                <Button
                  leftIcon={<FaPlusSquare />}
                  colorScheme="blue"
                  variant="outline"
                  onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}
                >
                  Update Model
                </Button>
              )}
            </Flex>
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
                  <Button
                    mt="4"
                    leftIcon={<FaPlusSquare />}
                    colorScheme="blue"
                    variant="outline"
                    onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}
                  >
                    Create Model
                  </Button>
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
