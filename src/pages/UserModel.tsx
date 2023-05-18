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
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import useGlobalStore from "zStore";
import _ from "lodash";
import { toast } from "react-toastify";
import { useNavigate } from 'react-router-dom';
import { PROTECTED_PATHS } from 'routes/pagePath';
const UserModel = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
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
const navigate  = useNavigate()
  const [fields, setFields] = useState([
    {
      id: nanoid(),
      name: "name",
      type: "text",
      required: true,
    },
   
    {
      id: nanoid(),
      name: "",
      type: "text",
      required: true,
    },
    {
      id: nanoid(),
      name: "",
      type: "text",
      required: true,
    },
  ]);
  const handleAddMore = () => {
    setFields([
      ...fields,
      {
        id: nanoid(),
        name: "",
        type: "text",
        required: false,
      },
    ]);
  };
  const handleChangeInput = (id, event) => {
    const isCheckBox = event.target.name === "required";
    const newInputFields = fields.map((field) => {
      if (id === field.id) {
        return {
          ...field,
          [event.target.name]: isCheckBox
            ? event.target.checked
            : event.target.value,
        };
      }
      return field;
    });
    setFields(newInputFields);
  };

  const onSuccess = (data) => {
    toast.success(data.data);
    navigate(PROTECTED_PATHS.DASHBOARD)
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);
  const handleSubmit = () => {
    const url = convertParamsToString(orgRequest.CONFIG_MODEL, {
      organisationId: org.id,
    });

    const fieldsWithoutId = fields.map((field) => _.omit(field, ["id"]));

    mutate({
      url,
      data: { fields: fieldsWithoutId },
    });
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
        >
          
          {fields.map((field, index) => (
            <FormControl id={`field-${index}`} isRequired key={field.id}>
              <Box borderBottom="1px dashed gray" pb="3">
                <Box>
                  <FormLabel mb="0">Title</FormLabel>
                  <Input
                    placeholder="name"
                    _placeholder={{ color: "gray.500" }}
                    type="text"
                    w="100%"
                    value={field.name}
                    name="name"
                    disabled={index===0}
                    onChange={(event) => handleChangeInput(field.id, event)}
                  />
                </Box>
                <Box>
                  <FormLabel mb="0" mt="3">
                    Form Type
                  </FormLabel>

                  <Select
                    placeholder="Select option"
                    value={field.type}
                    name="type"
                    disabled={index===0}
                    onChange={(event) => handleChangeInput(field.id, event)}
                  >
                    {inputType.map((input) => (
                      <option key={input} value={input}>
                        {input}
                      </option>
                    ))}
                  </Select>
                </Box>
                <Checkbox
                  mt="2"
                  disabled={index===0}
                  defaultChecked={field.required}
                  name="required"
                  onChange={(event) => {
                    handleChangeInput(field.id, event);
                  }}
                >
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
            onClick={handleAddMore}
          >
            + Add More
          </Button>
          <Stack spacing={6}>
            <Button
              onClick={handleSubmit}
              bg={"blue.400"}
              color={"white"}
              _hover={{ bg: "blue.500" }}
              isLoading={isLoading}
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
