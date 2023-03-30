import { Box, Flex } from "@chakra-ui/layout";
import {
  useColorModeValue,
  Text,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Select,
  Checkbox,
} from "@chakra-ui/react";
import { useState } from "react";
import { nanoid } from "nanoid";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
const UserModel = () => {
  const inputType = [
    "text",
    "email",
    "number",
    "tel",
    "checkbox",
    "date",
    "color",
    "password",
  ];

  const [fields] = useState([
    {
      id: nanoid(),
      title: "",
      type: "",
      required: false,
    },
    {
      id: nanoid(),
      title: "",
      type: "",
      required: false,
    },
  ]);

  const navigate = useNavigate();
  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff" fontWeight="bold">
          User Model
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
          // my={12}
        >
          <FormControl id="email" isRequired>
            <Box borderBottom="1px dashed gray" pb="3">
              <Box>
                <FormLabel mb="0">Title</FormLabel>
                <Input
                  placeholder="name"
                  _placeholder={{ color: "gray.500" }}
                  type="text"
                  w="100%"
                  value="Name"
                  disabled
                />
              </Box>
              <Box>
                <FormLabel mb="0" mt="3">
                  Form Type
                </FormLabel>

                <Select placeholder="Select option" disabled value="text">
                  {inputType.map((input) => (
                    <option key={nanoid()} value={input}>
                      {input}
                    </option>
                  ))}
                </Select>
              </Box>
              <Checkbox mt="2" defaultChecked disabled>
                required
              </Checkbox>
            </Box>
          </FormControl>
          {fields.map((field) => (
            <FormControl id="email" isRequired>
              <Box borderBottom="1px dashed gray" pb="3">
                <Box>
                  <FormLabel mb="0">Title</FormLabel>
                  <Input
                    placeholder="name"
                    _placeholder={{ color: "gray.500" }}
                    type="text"
                    w="100%"
                  />
                </Box>
                <Box>
                  <FormLabel mb="0" mt="3">
                    Form Type
                  </FormLabel>

                  <Select placeholder="Select option" value="text">
                    {inputType.map((input) => (
                      <option key={nanoid()} value={input}>
                        {input}
                      </option>
                    ))}
                  </Select>
                </Box>
                <Checkbox mt="2" defaultChecked={field.required}>
                  required
                </Checkbox>
              </Box>
            </FormControl>
          ))}

          <Button
            variant="link"
            w="max-content"
            color="#fff"
            bg="gray"
            p="2"
            textDecoration="none"
          >
            + Add More
          </Button>
          <Stack spacing={6}>
            <Button
              onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
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
    </Box>
  );
};

export default UserModel;
