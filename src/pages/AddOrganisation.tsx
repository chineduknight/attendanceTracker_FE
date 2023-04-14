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
import { useQueryWrapper } from 'services/api/apiHelper';
import { orgRequest } from 'services/api/request';
import { FaArrowCircleLeft } from 'react-icons/fa'
const AddOrganisation = () => {
  const navigate = useNavigate();
  const { data } = useQueryWrapper(["my-key"], orgRequest.ORG);
  console.log("data:", data)
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
          <FormControl id="email" isRequired>
            <FormLabel>Organisation Name</FormLabel>
            <Input
              placeholder="Seat of wisdom presidium"
              _placeholder={{ color: "gray.500" }}
              type="text"
            />
          </FormControl>
          <FormControl id="password">
            <FormLabel>Image Url</FormLabel>
            <Input type="text" />
          </FormControl>
          <Stack spacing={6}>
            <Button
              onClick={() => navigate(PROTECTED_PATHS.ALL_ORG)}
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
      <Button
        onClick={() => navigate(PROTECTED_PATHS.ALL_ORG)}
        bg={"blue.400"}
        color={"white"}
        ml='455px'
        _hover={{
          bg: "blue.500",
        }}
      >
        <FaArrowCircleLeft /> Back
      </Button>
    </Box>
  );
};

export default AddOrganisation;
