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
  Select,
  Checkbox,
} from "@chakra-ui/react";
import { useState } from "react";
import {
  postRequest,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";

import { orgRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import useGlobalStore from "zStore";
import _ from "lodash";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { FaPlusCircle, FaTimesCircle } from "react-icons/fa";

interface FieldType {
  _id: string;
  name: string;
  type: string;
  required: boolean;
  }

const UserModel = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const inputTypes = [
    "text",
    "email",
    "number",
    "tel",
    "checkbox",
    "date",
    "color",
    "password",
  ];
  const navigate = useNavigate();

  const [fields, setFields] = useState<FieldType[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const url = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });
  const getModelSuccess = (response) => {
    let modelFields = response.data.fields;
    setIsUpdating(true);

    if (modelFields.length === 0) {
      const newField = {
        _id: `field-0`,
        name: "name",
        type: "text",
        required: true,
      };
      modelFields = [newField];
      setIsUpdating(false);
    }
    setFields(modelFields);
  };
  useQueryWrapper(["get-model"], url, { onSuccess: getModelSuccess });

  const handleAddMore = () => {
    const newField = {
      _id: `field-${fields.length}`,
      name: "",
      type: "text",
      required: false,
    };

    setFields([...fields, newField]);
  };

  const handleRemove = (_id) => {
    const updatedFields = fields.filter((field) => field._id !== _id);
    setFields(updatedFields);
  };

  const handleChangeInput = (_id, event) => {
    const { name, value, checked } = event.target;
    const isCheckBox = name === "required";

    const newFields = fields.map((field) => {
      if (_id === field._id) {
        return {
          ...field,
          [name]: isCheckBox ? checked : value,
        };
      }
      return field;
    });

    setFields(newFields);
  };

  const onSuccess = (data) => {
    toast.success(
      isUpdating ? "Model updated successfully" : "Model created successfully"
    );
    navigate(PROTECTED_PATHS.ADD_MEMBER);
  };

  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const handleSubmit = () => {
    const url = convertParamsToString(orgRequest.CONFIG_MODEL, {
      organisationId: org.id,
    });

    const fieldsWithoutId = fields.map((field) => _.omit(field, ["_id"]));
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
          {isUpdating ? "Update Model" : "Create Model"}
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
            <FormControl id={`field-${index}`} isRequired key={field._id}>
              <Flex justifyContent="right">
                {index > 0 && (
                  <Button
                    variant="link"
                    colorScheme="red"
                    onClick={() => handleRemove(field._id)}
                    size="sm"
                    aria-label="Remove field"
                    leftIcon={<FaTimesCircle />}
                    _hover={{ color: "red.500" }}
                  >
                    Remove
                  </Button>
                )}
              </Flex>
              <Box borderBottom="1px dashed gray" pb="3">
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box flex="1">
                    <FormLabel mb="0">Title</FormLabel>
                    <Input
                      placeholder="name"
                      _placeholder={{ color: "gray.500" }}
                      type="text"
                      w="100%"
                      value={field.name}
                      name="name"
                      disabled={index === 0}
                      onChange={(event) => handleChangeInput(field._id, event)}
                    />
                  </Box>
                </Box>
                <Box>
                  <FormLabel mb="0" mt="3">
                    Form Type
                  </FormLabel>
                  <Select
                    placeholder="Select option"
                    value={field.type}
                    name="type"
                    disabled={index === 0}
                    onChange={(event) => handleChangeInput(field._id, event)}
                  >
                    {inputTypes.map((input) => (
                      <option key={input} value={input}>
                        {input}
                      </option>
                    ))}
                  </Select>
                </Box>
                <Checkbox
                  mt="2"
                  disabled={index === 0}
                  defaultChecked={field.required}
                  name="required"
                  onChange={(event) => handleChangeInput(field._id, event)}
                >
                  Required
                </Checkbox>
              </Box>
            </FormControl>
          ))}
          <Button
            leftIcon={<FaPlusCircle />}
            variant="logout"
            w="max-content"
            onClick={handleAddMore}
          >
            Add More
          </Button>
          <Stack spacing={3}>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {isUpdating ? "Update" : "Submit"}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      </Flex>
    </Box>
  );
};

export default UserModel;
