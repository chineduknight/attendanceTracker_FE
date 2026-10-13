import { Button, Input, Stack, NativeSelect, Field } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useForm, SubmitHandler } from "react-hook-form";
import { FaLayerGroup } from "react-icons/fa";
import useGlobalStore from "zStore";
import { postRequest, queryClient, useMutationWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { useCategories } from "hooks/useCategories";
import { toast } from "react-toastify";
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import ExistingCategories from "components/categories/ExistingCategories";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { queryKeys } from "services/api/queryKeys";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import { PROTECTED_PATHS } from "routes/pagePath";

type Inputs = { categoryId: string; name: string };

const SubCategory = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const navigate = useNavigate();
  const { categories, isLoading: isGettingCat, isError, error, refetch, isRefetching } =
    useCategories(org.id);
  const { register, handleSubmit, resetField, setFocus, watch, formState: { errors } } =
    useForm<Inputs>({ defaultValues: { categoryId: "", name: "" } });

  const { mutate, isLoading } = useMutationWrapper(postRequest, () => {
    toast.success(`${terms.subCategorySingular} added successfully`);
    // Only the current organisation's categories are stale.
    queryClient.invalidateQueries({ queryKey: queryKeys.categories(org.id) });
    // Keep the chosen category: officers usually add several under one.
    resetField("name");
    setFocus("name");
  });

  const onSubmit: SubmitHandler<Inputs> = ({ categoryId, name }) => {
    if (isLoading) return;
    mutate({
      url: convertParamsToString(orgRequest.SUB_CATEGORY, { organisationId: org.id }),
      data: { name: name.trim(), parentCategoryId: categoryId },
    });
  };

  const form = () => {
    if (isGettingCat) return <PageLoader h="30vh" />;
    if (isError && !categories.length) {
      return (
        <ErrorState
          title={`Couldn't load ${lowerTerm(terms.categoryPlural)}`}
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      );
    }
    if (!categories.length) {
      return (
        <EmptyState
          icon={<FaLayerGroup />}
          title={`Add ${lowerTerm(terms.categorySingular)} first`}
          description={`${terms.subCategoryPlural} go under ${lowerTerm(terms.categoryPlural)}.`}
          action={
            <Button minH="44px" onClick={() => navigate(PROTECTED_PATHS.CATEGORY)}>
              {`Add ${lowerTerm(terms.categorySingular)}`}
            </Button>
          }
        />
      );
    }
    return (
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
        <Field.Root invalid={Boolean(errors.categoryId)} required>
          <Field.Label>{terms.categorySingular}</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              placeholder={`Choose ${lowerTerm(terms.categorySingular)}`}
              {...register("categoryId", { required: `Choose ${lowerTerm(terms.categorySingular)}` })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Field.ErrorText>{errors.categoryId?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={Boolean(errors.name)} required>
          <Field.Label>{`${terms.subCategorySingular} name`}</Field.Label>
          <Input
            autoComplete="off"
            {...register("name", { validate: (v) => v.trim().length > 0 || "Enter a name" })}
          />
          <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
        </Field.Root>
        <Button type="submit" minH="44px" loading={isLoading}>
          {`Add ${lowerTerm(terms.subCategorySingular)}`}
        </Button>
      </Stack>
    );
  };

  return (
    <PageContainer width="form">
      {form()}
      {categories.length > 0 && (
        <ExistingCategories organisationId={org.id} selectedCategoryId={watch("categoryId")} />
      )}
    </PageContainer>
  );
};

export default SubCategory;
