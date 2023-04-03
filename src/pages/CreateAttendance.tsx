import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
} from "@chakra-ui/react";
import { FaHome } from 'react-icons/fa'
import { useState } from "react";
import { nanoid } from "nanoid";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";

const CreateAttendance = () => {
  const navigate = useNavigate();
  const [fields] = useState([
    {
      id: nanoid(),
      title: "name",
      type: "text",
      required: true,
    },
    {
      id: nanoid(),
      title: "category",
      type: "text",
      required: true,
    },
    {
      id: nanoid(),
      title: "sub category",
      type: "text",
      required: true,
    },
    {
      id: nanoid(),
      title: "date",
      type: "date",
      required: true,
    },
  ]);

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Create Attendance
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
        >
          {fields.map((field) => (
            <FormControl key={field.id} isRequired={field.required}>
              <FormLabel textTransform="capitalize" mb="0">
                {field.title}
              </FormLabel>
              <Input type={field.type} />
            </FormControl>
          ))}

          <Box>
            <Button
              w="full"
              mt="40px"
              onClick={() => navigate(PROTECTED_PATHS.MARK_ATTENANCE)}
              bg={"blue.400"}
              color={"white"}
              _hover={{
                bg: "blue.500",
              }}
              fontWeight="bold"
              fontSize="15px"
            >
              Continue
            </Button>
          </Box>
        </Stack>
      </Flex>
    </Box>
  );
};

export default CreateAttendance;
