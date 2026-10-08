import { Box, Flex, Button, Input, Stack, Field } from "@chakra-ui/react";

import { useColorModeValue } from "components/ui/color-mode";

import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore, { currentAttendanceType } from "zStore";
import { orgRequest } from "services";
import { postRequest, queryClient, useMutationWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toast } from "react-toastify";
import { useTerms } from "hooks/useOrgPresentation";

const Category = () => {
  const [category] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const onSuccess = () => {
    toast.success(`${terms.categorySingular} added successfully`);
    // Only the current organisation's categories are stale.
    queryClient.invalidateQueries({ queryKey: queryKeys.categories(category.id) });
  };

  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const handleAddCategory = (detail) => {
    const categoryUrl = convertParamsToString(orgRequest.CATEGORY, {
      organisationId: category.id,
    });
    const data = {
      name: detail.categoryId,
    };

    mutate({
      url: categoryUrl,
      data,
    });
  };
  const { register, handleSubmit } = useForm<currentAttendanceType>();

  const onSubmit: SubmitHandler<currentAttendanceType> = (detail) => {
    handleAddCategory(detail);
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <Stack
          gap={4}
          w={"full"}
          mt="5rem"
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <Field.Root id="category" required>
              <Field.Label>{`${terms.categorySingular} name`}</Field.Label>
              <Input
                type="category"
                {...register("categoryId", { required: true })}
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

export default Category;
