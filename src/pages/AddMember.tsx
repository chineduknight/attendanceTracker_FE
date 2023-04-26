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

import { nanoid } from "nanoid";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { postRequest, queryClient, useMutationWrapper } from "services/api/apiHelper";

type Inputs = {
  name: 'string',
  email: 'string'
}
const AddMember = () => {
  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["all-members"] })
  }


  const { mutate } = useMutationWrapper(postRequest, onSuccess)


  const handleAddMember = (formData) => {

    const data = {
      id: nanoid(),
      name: formData.name,
      email: formData.email
    }


    mutate({
      url: "/members",
      data,

    })
    navigate(PROTECTED_PATHS.MARK_ATTENANCE)
  }


  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = formData => {
    handleAddMember(formData)
  }


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
        mt='40px'
        align={"center"}
        justify={"center"}

        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack
            spacing={4}
            w={"full"}
            maxW={"md"}
            bg={useColorModeValue("white", "gray.700")}
            rounded={"xl"}
            boxShadow={"lg"}
            p={6}
          >

            <FormControl
              id="name"
              isRequired>
              <FormLabel> Name</FormLabel>
              <Input
                type='name'
                {...register("name", { required: true })}
              />
            </FormControl>

            <FormControl
              id="email"
              isRequired>
              <FormLabel>Email</FormLabel>
              <Input
                type='email'
                {...register("email", { required: true })}
              />
            </FormControl>


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
                type='submit'
              >
                Submit
              </Button>
            </Box>
          </Stack>
        </form>
      </Flex>
    </Box >
  );
};

export default AddMember;


