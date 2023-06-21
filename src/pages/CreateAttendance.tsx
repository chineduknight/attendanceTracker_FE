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
} from "@chakra-ui/react";

import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore, { currentAttendanceType } from "zStore";
import _ from "lodash";
import { queryClient, useQueryWrapper } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services";
import { useState } from "react";
import { Q_KEY } from 'utils/constant';

type CommonTypeCategory = {
  name: string;
  status: string;
  id: string;
};
interface SubCategoryType extends CommonTypeCategory {
  parentCategoryId: string;
}
export interface CategoryType extends CommonTypeCategory {
  subCategories: SubCategoryType[];
}

const CreateAttendance = () => {
  const { register, handleSubmit, watch } = useForm<currentAttendanceType>();
  const categorySelected = watch(["categoryId"]);
  const [updateCurrentAttendance, org] = useGlobalStore((state) => [
    state.updateCurrentAttendance,
    state.organisation,
  ]);
  const onSubmit: SubmitHandler<currentAttendanceType> = (formData) => {
    const trimmedFormData = _.mapValues(formData, (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      return value;
    });

    const nonEmptyFormData = _.omitBy(trimmedFormData, _.isEmpty);
    updateCurrentAttendance(nonEmptyFormData as currentAttendanceType);
    queryClient.invalidateQueries({ queryKey: [Q_KEY.GET_MEMBERS] });
   
    navigate(PROTECTED_PATHS.MARK_ATTENANCE);
    // Q_KEY.GET_MEMBERS
  };
  const catUrl = convertParamsToString(orgRequest.CATEGORY, {
    organisationId: org.id,
  });
  const [allCategory, setAllCategory] = useState<CategoryType[]>([]);
  const onSuccess = (res) => {
    setAllCategory(res.data);
  };
   useQueryWrapper(["get-all-category"], catUrl, {
    onSuccess,
  });

  const navigate = useNavigate();

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
      <Button mt="4" ml="6" onClick={() => navigate(PROTECTED_PATHS.CATEGORY)}>
        Add Category
      </Button>
      <Button
        mt="4"
        ml="6"
        onClick={() => navigate(PROTECTED_PATHS.SUB_CATEGORY)}
      >
        Add Sub-Category
      </Button>
      <Flex
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <Stack
          spacing={4}
          w={"full"}
          mt="5rem"
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormControl id="name" isRequired>
              <FormLabel mb="0">Name</FormLabel>
              <Input
                type="text"
                {...register("name", { required: true })}
                placeholder="Attendance Name"
              />
            </FormControl>
            <FormControl id="category" mt="4">
              <FormLabel mb="0">Category</FormLabel>
              <Select
                placeholder="Select option"
                {...register("categoryId", { required: false })}
              >
                {allCategory.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl id="subCategory" mt="4">
              <FormLabel mb="0">Sub Category</FormLabel>
              <Select
                placeholder="Select option"
                {...register("subCategoryId", { required: false })}
              >
                {allCategory
                  .find((category) => category.id === categorySelected[0])
                  ?.subCategories.map((subCategory) => (
                    <option key={subCategory.id} value={subCategory.id}>
                      {subCategory.name}
                    </option>
                  ))}
              </Select>
            </FormControl>
            <FormControl id="date" isRequired mt="4">
              <FormLabel mb="0">Date</FormLabel>
              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                {...register("date", { required: true })}
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
                type="submit"
              >
                Continue
              </Button>
            </Box>
          </form>
        </Stack>
      </Flex>
    </Box>
  );
};

export default CreateAttendance;
