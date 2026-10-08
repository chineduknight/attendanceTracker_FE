import { Box, Flex, Button, Input, Stack, NativeSelect, Field } from "@chakra-ui/react";

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
import PageLoader from "components/PageLoader";
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
    return <PageLoader />;
  }
  return (
    <Box minH={"100vh"} bg={"gray.50"}>
      <Flex align={"center"} justify={"center"} bg="gray.50">
        <Stack
          gap={4}
          w={"full"}
          mt="5rem"
          maxW={"md"}
          bg="white"
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <Field.Root id="category" mt="4" required>
              <Field.Label mb="0">{terms.categorySingular}</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  placeholder="Select option"
                  {...register("categoryId", { required: true })}>
                  {allCategory.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Field.Root mt="4" id="subCategory" required>
              <Field.Label mb="0">{`${terms.subCategorySingular} name`}</Field.Label>
              <Input
                type="sub_category"
                {...register("subCategoryId", { required: true })}
              />
            </Field.Root>
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
                loading={isLoading}
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
