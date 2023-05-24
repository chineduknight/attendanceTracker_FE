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
} from "@chakra-ui/react";
import { useNavigate,useParams } from "react-router-dom";
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
import { useState } from "react";
import { toast } from "react-toastify";
import { FaPlusSquare } from "react-icons/fa";

interface MemberField {
  _id: string;
  name: string;
  type: string;
  required: boolean;
}

interface FormData {
  [fieldName: string]: string;
}

const AddMember = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [membersModel, setMembersModel] = useState<MemberField[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const navigate = useNavigate();
  const params = useParams();
  console.log("params:", params.memberId)
  
  const { register, handleSubmit } = useForm<FormData>();

  const onSuccess = () => {
    toast.success(isUpdating ? "Member updated successfully" : "Member added successfully");
    queryClient.invalidateQueries({ queryKey: ["all-members"] });
    navigate(PROTECTED_PATHS.DASHBOARD);
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

  const handleAddMember = (data: FormData) => {
    const url = convertParamsToString(orgRequest.MEMBERS, {
      organisationId: org.id,
    });

    mutate({
      url,
      data,
    });
  };

  const onSubmit = handleSubmit(handleAddMember);
  // Render the form fields based on the members' model
  const renderFormFields = () => {
    return membersModel.map((field) => {
      if (field.type === "checkbox") {
        return (
          <FormControl key={field._id} id={field.name}>
            <FormLabel>{capitalize(field.name)}</FormLabel>
            <Checkbox {...register(field.name)} colorScheme="blue" />
          </FormControl>
        );
      } else {
        return (
          <FormControl
            key={field._id}
            id={field.name}
            isRequired={field.required}
          >
            <FormLabel>{capitalize(field.name)}</FormLabel>
            <Input
              type={field.type}
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
          <Box>Loading</Box>
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
                <form onSubmit={onSubmit} style={{ width: "90%" }}>
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
              )}
            </Flex>
          </Box>
        )}
      </>
    </Box>
  );
};

export default AddMember;
