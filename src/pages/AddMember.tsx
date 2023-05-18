import { Box, Flex } from "@chakra-ui/layout";
import { useForm, SubmitHandler } from "react-hook-form";
import {
  useColorModeValue,
  Text,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
} from "@chakra-ui/react";

import { useNavigate } from "react-router-dom";
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
import { useState } from "react";
import { toast } from 'react-toastify';

type Inputs = {
  name: "string";
  email: "string";
};
const AddMember = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [membersModel, setMembersModel] = useState<any>([]);
  const onSuccess = () => {
    toast.success("Member added successfully");
    queryClient.invalidateQueries({ queryKey: ["all-members"] });
    navigate(PROTECTED_PATHS.DASHBOARD);
  };
  const modelURL = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });
  useQueryWrapper(["model"], modelURL, {
    onSuccess: (data) => {
      setMembersModel(data?.data.fields);
    },
  });
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const handleAddMember = (data) => {
    const url = convertParamsToString(orgRequest.MEMBERS, {
      organisationId: org.id,
    });
    mutate({
      url: url,
      data,
    });
  };

  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (formData) => {
    handleAddMember(formData);
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff" fontWeight="bold">
          Add Member
        </Text>
      </Flex>

      <Flex
        mt="40px"
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <form onSubmit={handleSubmit(onSubmit)} style={{ width: "90%" }}>
          <Stack
            spacing={4}
            w={"full"}
            maxW={"md"}
            bg={useColorModeValue("white", "gray.700")}
            rounded={"xl"}
            boxShadow={"lg"}
            p={6}
          >
            {membersModel.map((field) => (
              <FormControl key={field._id} id={field.name} isRequired>
                <FormLabel>{capitalize(field.name)} </FormLabel>
                <Input
                  type={field.type}
                  {...register(field.name, { required: field.required })}
                />
              </FormControl>
            ))}

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
                Submit
              </Button>
            </Box>
          </Stack>
        </form>
      </Flex>
    </Box>
  );
};

export default AddMember;
