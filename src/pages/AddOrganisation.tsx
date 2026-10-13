import { Button, Input, Stack, Field, Heading } from "@chakra-ui/react";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useNavigate } from "react-router-dom";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { useForm, SubmitHandler } from "react-hook-form";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { orgRequest } from "services";
import PageContainer from "components/layout/PageContainer";

type Inputs = {
  name: string;
};

const AddOrganisation = () => {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>();

  // Leave only once the organisation exists: a failure keeps the officer
  // here with their text and the backend's error (toasted by the wrapper).
  const { mutate, isLoading } = useMutationWrapper(postRequest, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations });
    navigate(PROTECTED_PATHS.ALL_ORG);
  });

  const onSubmit: SubmitHandler<Inputs> = ({ name }) => {
    if (isLoading) return;
    mutate({ url: orgRequest.ORGANISATIONS, data: { name: name.trim() } });
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
        <Heading as="h1" size="md">New organisation</Heading>
        <Field.Root invalid={Boolean(errors.name)} required>
          <Field.Label>Organisation name</Field.Label>
          <Input
            placeholder="Seat of wisdom presidium"
            autoComplete="organization"
            {...register("name", {
              validate: (v) => v.trim().length > 0 || "Enter a name",
            })}
          />
          <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
        </Field.Root>
        <Button type="submit" minH="44px" loading={isLoading} loadingText="Creating…">
          Create organisation
        </Button>
      </Stack>
    </PageContainer>
  );
};

export default AddOrganisation;
