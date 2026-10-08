import {
  Box,
  Flex,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Select,
} from "@chakra-ui/react";

import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore, { currentAttendanceType } from "zStore";
import {
  postRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { orgRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { useState } from "react";
import { CategoryType } from "hooks/useCategories";
import { toast } from "react-toastify";
import Loader from "components/Loader";
import { queryKeys } from "services/api/queryKeys";
import { useTerms } from "hooks/useOrgPresentation";
const SubCategory = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const onSuccess = () => {
    toast.success(`${terms.subCategorySingular} added successfully`);
    // Only the current organisation's categories are stale.
    queryClient.invalidateQueries({ queryKey: queryKeys.categories(org.id) });
  };

  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);
  const handleAddSubCategory = (details) => {
    const data = {
      name: details.subCategoryId,
      parentCategoryId: details.categoryId,
    };
    const subCategoryUrl = convertParamsToString(orgRequest.SUB_CATEGORY, {
      organisationId: org.id,
    });
    mutate({
      url: subCategoryUrl,
      data,
    });
  };
  const { register, handleSubmit } = useForm<currentAttendanceType>();

  const catUrl = convertParamsToString(orgRequest.CATEGORY, {
    organisationId: org.id,
  });
  const [allCategory, setAllCategory] = useState<CategoryType[]>([]);
  const onCatSuccess = (res) => {
    setAllCategory(res.data);
  };
  const { isLoading: isGettingCat } = useQueryWrapper(
    queryKeys.categories(org.id),
    catUrl,
    {
      onSuccess: onCatSuccess,
    }
  );
  const onSubmit: SubmitHandler<currentAttendanceType> = (details) => {
    handleAddSubCategory(details);
  };

  if (isGettingCat) {
    return <Loader />;
  }
  return (
    <Box minH={"100vh"} bg={"gray.50"}>
      <Flex align={"center"} justify={"center"} bg="gray.50">
        <Stack
          spacing={4}
          w={"full"}
          mt="5rem"
          maxW={"md"}
          bg="white"
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormControl id="category" mt="4" isRequired>
              <FormLabel mb="0">{terms.categorySingular}</FormLabel>
              <Select
                placeholder="Select option"
                {...register("categoryId", { required: true })}
              >
                {allCategory.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl mt="4" id="subCategory" isRequired>
              <FormLabel mb="0">{`${terms.subCategorySingular} name`}</FormLabel>
              <Input
                type="sub_category"
                {...register("subCategoryId", { required: true })}
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
                isLoading={isLoading}
              >
                Submit
              </Button>
            </Box>
          </form>
        </Stack>
      </Flex>
    </Box>
  );
};

export default SubCategory;
