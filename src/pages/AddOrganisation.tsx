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
import { PROTECTED_PATHS } from "routes/pagePath";
import { useNavigate } from "react-router-dom";
import { postRequest, useMutationWrapper } from 'services/api/apiHelper';
import { FaArrowCircleLeft } from 'react-icons/fa'
import { nanoid } from 'nanoid';
import { useForm, SubmitHandler } from "react-hook-form";
import { queryClient } from 'services/api/apiHelper';


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
      url: "/organisations",
      data
    })

    navigate(PROTECTED_PATHS.ALL_ORG)

  }

  const onSubmit: SubmitHandler<Inputs> = details => {
    handleAddOrg(details)
  }


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
            my={12}
          >
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
                bg={"blue.400"}
                color={"white"}
                _hover={{
                  bg: "blue.500",
                }}
                type="submit"
              >
                Submit
              </Button>
            </Stack>
          </Stack>
        </form>

      </Flex>
    </Box >
  );
};

export default AddOrganisation;