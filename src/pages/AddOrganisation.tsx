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
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { postRequest, useMutationWrapper } from 'services/api/apiHelper';
import { FaArrowCircleLeft } from 'react-icons/fa'
import { nanoid } from 'nanoid';

const AddOrganisation = () => {
  const navigate = useNavigate();
  // console.log("data:", data)

  const onSuccess = (data) => {
    console.log("data:", data)

  }
  const { mutate } = useMutationWrapper(postRequest, onSuccess)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function newOrganisation(e) {
    let input = e.target
    if (input.name === 'email') {
      setEmail(input.value)
    } else if (input.name === 'password') {
      setPassword(input.value)
    }
  }
  const handleAddOrg = () => {
    console.log(`organisation registered with ${email} and ${password}`)
    const data = {
      id: nanoid(),
      name: email,
      imageURL: password
    }
    mutate({
      url: "/organisations",
      data
    })
    navigate(PROTECTED_PATHS.ALL_ORG)
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
              type="text"
              name="email"
              value={email}
              onChange={newOrganisation}
            />
          </FormControl>
          <FormControl id="password">
            <FormLabel>Image Url</FormLabel>
            <Input
              type="text"
              name="password"
              value={password}
              onChange={newOrganisation}
            />
          </FormControl>
          <Stack spacing={6}>
            <Button
              onClick={handleAddOrg}
              bg={"blue.400"}
              color={"white"}
              _hover={{
                bg: "blue.500",
              }}
            >
              Submit
            </Button>
          </Stack>
        </Stack>
      </Flex>
    </Box >
  );
};

export default AddOrganisation;
