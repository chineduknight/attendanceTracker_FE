import {
  Text,
  Box,
  useColorModeValue,
  Flex,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
} from "@chakra-ui/react";
<<<<<<< HEAD:src/pages/AddOrganisation.tsx
import { PROTECTED_PATHS } from "routes/pagePath";
import { useNavigate } from "react-router-dom";
import { postRequest, useMutationWrapper } from 'services/api/apiHelper';
import { FaArrowCircleLeft } from 'react-icons/fa'
import { nanoid } from 'nanoid';
import { useForm, SubmitHandler } from "react-hook-form";
import { queryClient } from 'services/api/apiHelper';
import { orgRequest } from 'services';


type Inputs = {
  name: string,
  imageURL: string,
}

const AddOrganisation = () => {

  const navigate = useNavigate();

  const { register, handleSubmit } = useForm<Inputs>();

  const onSuccess = (data) => {
    queryClient.invalidateQueries({ queryKey: ["all-organisations"] })
  }

  const { mutate } = useMutationWrapper(postRequest, onSuccess)

  const handleAddOrg = (details) => {

    const data = {
      id: nanoid(),
      name: details.name,
      imageURL: "https://picsum.photos/200/300"
    }


    mutate({
      url: orgRequest.ORGANISATION,
      data
    })

    navigate(PROTECTED_PATHS.ALL_ORG)

  }

  const onSubmit: SubmitHandler<Inputs> = details => {
    handleAddOrg(details)
  }

=======

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
>>>>>>> Connected the Add member and create model to the API:src/pages/AddMember.tsx

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>

      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          New Organisation
        </Text>
      </Flex>
      <Button
        onClick={() => navigate(PROTECTED_PATHS.ALL_ORG)}

        mt='10px'
        ml='10px'
        color={"white"}

        _hover={{
          bg: "blue.500",
        }}
      >
        <FaArrowCircleLeft /> Back
      </Button>

      <Flex
<<<<<<< HEAD:src/pages/AddOrganisation.tsx
=======
        mt="40px"
>>>>>>> Connected the Add member and create model to the API:src/pages/AddMember.tsx
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
<<<<<<< HEAD:src/pages/AddOrganisation.tsx

        <form onSubmit={handleSubmit(onSubmit)}>

=======
        <form onSubmit={handleSubmit(onSubmit)} style={{ width: "90%" }}>
>>>>>>> Connected the Add member and create model to the API:src/pages/AddMember.tsx
          <Stack
            spacing={4}
            w={"full"}
            maxW={"md"}
            bg={useColorModeValue("white", "gray.700")}
            rounded={"xl"}
            boxShadow={"lg"}
            p={6}
            my={12}
          >
<<<<<<< HEAD:src/pages/AddOrganisation.tsx
            <FormControl
              id="email"
              isRequired>
              <FormLabel>Organisation Name</FormLabel>
              <Input
                placeholder="Seat of wisdom presidium"
                _placeholder={{ color: "gray.500" }}
                type="name"
                {...register("name", { required: true })}
              />
            </FormControl>
            <FormControl id="password">
              <FormLabel>Image Url</FormLabel>
              <Input
                type="imageURL"

                {...register("imageURL", { required: true })}
              />
            </FormControl>
            <Stack spacing={6}>
              <Button
=======
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
>>>>>>> Connected the Add member and create model to the API:src/pages/AddMember.tsx
                bg={"blue.400"}
                color={"white"}
                _hover={{
                  bg: "blue.500",
                }}
<<<<<<< HEAD:src/pages/AddOrganisation.tsx
                type="submit"
=======
                fontWeight="bold"
                fontSize="15px"
                type="submit"
                isLoading={isLoading}
>>>>>>> Connected the Add member and create model to the API:src/pages/AddMember.tsx
              >
                Submit
              </Button>
            </Stack>
          </Stack>
        </form>

      </Flex>
    </Box>
  );
};

<<<<<<< HEAD:src/pages/AddOrganisation.tsx
export default AddOrganisation;
=======
export default AddMember;
>>>>>>> Connected the Add member and create model to the API:src/pages/AddMember.tsx
