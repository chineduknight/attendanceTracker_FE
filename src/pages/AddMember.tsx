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
import { confirmAlert } from 'react-confirm-alert';
import { Q_KEY } from 'utils/constant';

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

  const { register, handleSubmit } = useForm<FormData>();

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
    confirmAlert({
      title: 'Confirmation',
      message: `Are you sure you want to ${isUpdating ? 'update' : 'submit'} the member?`,
      buttons: [
        {
          label: 'Yes',
          onClick: () => handleAddMember(data)
        },
        {
          label: 'No',
          onClick: () => console.log('Member update canceled')
        }
      ]
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
              defaultValue={fieldValue} // Set the default value for the input field
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
                // <form onSubmit={onSubmit} style={{ width: "90%" }}>
                <div  style={{ width: "90%" }}>
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
                        type="button" // Change type to "button" instead of "submit"
                        isLoading={isLoading}
                        onClick={onSubmit}
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
                </div>
              )}
            </Flex>
          </Box>
        )}
      </>
    </Box>
  );
};

export default AddMember;
