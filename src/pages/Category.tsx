import { Button, Input, Stack, Field } from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore from "zStore";
import { orgRequest } from "services";
import { postRequest, queryClient, useMutationWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toast } from "react-toastify";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import PageContainer from "components/layout/PageContainer";
import ExistingCategories from "components/categories/ExistingCategories";

type Inputs = { name: string };

const Category = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const { register, handleSubmit, reset, setFocus, formState: { errors } } = useForm<Inputs>({
    defaultValues: { name: "" },
  });

  const { mutate, isLoading } = useMutationWrapper(postRequest, () => {
    toast.success(`${terms.categorySingular} added successfully`);
    // Only the current organisation's categories are stale.
    queryClient.invalidateQueries({ queryKey: queryKeys.categories(org.id) });
    // Clear for the next one, so a second tap can't add it again.
    reset({ name: "" });
    setFocus("name");
  });

  const onSubmit: SubmitHandler<Inputs> = ({ name }) => {
    if (isLoading) return;
    mutate({
      url: convertParamsToString(orgRequest.CATEGORY, { organisationId: org.id }),
      data: { name: name.trim() },
    });
  };

  return (
    <PageContainer width="form">
      <Stack
        as="form"
        onSubmit={handleSubmit(onSubmit)}
        gap={4}
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border"
        rounded="xl"
        p={{ base: 4, md: 6 }}
      >
        <Field.Root invalid={Boolean(errors.name)} required>
          <Field.Label>{`${terms.categorySingular} name`}</Field.Label>
          <Input
            autoComplete="off"
            {...register("name", { validate: (v) => v.trim().length > 0 || "Enter a name" })}
          />
          <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
        </Field.Root>
        <Button type="submit" minH="44px" loading={isLoading}>
          {`Add ${lowerTerm(terms.categorySingular)}`}
        </Button>
      </Stack>
      <ExistingCategories organisationId={org.id} />
    </PageContainer>
  );
};

export default Category;
