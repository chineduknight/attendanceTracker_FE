import { Box, Flex, Button, Input, Stack, Field } from "@chakra-ui/react";
import { useColorModeValue } from "../components/ui/color-mode";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useNavigate } from "react-router-dom";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { useForm, SubmitHandler } from "react-hook-form";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { orgRequest } from "services";

type Inputs = {
  name: string;
  // image: string,
};

const AddOrganisation = () => {
  const navigate = useNavigate();

  const { register, handleSubmit } = useForm<Inputs>();

  const onSuccess = (data) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations });
  };

  const { mutate } = useMutationWrapper(postRequest, onSuccess);

  const handleAddOrg = (details) => {
    const data = {
      name: details.name,
      // image: "https://picsum.photos/200/300"
    };

    mutate({
      url: orgRequest.ORGANISATIONS,
      data,
    });

    navigate(PROTECTED_PATHS.ALL_ORG);
  };

  const onSubmit: SubmitHandler<Inputs> = (details) => {
    handleAddOrg(details);
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <form onSubmit={handleSubmit(onSubmit)} style={{ width: "80%" }}>
          <Stack
            gap={4}
            w={"full"}
            maxW={"md"}
            bg={useColorModeValue("white", "gray.700")}
            rounded={"xl"}
            boxShadow={"lg"}
            p={6}
            my={12}
          >
            <Field.Root id="email" required>
              <Field.Label>Organisation Name</Field.Label>
              <Input
                placeholder="Seat of wisdom presidium"
                _placeholder={{ color: "gray.500" }}
                type="name"
                {...register("name", { required: true })}
              />
            </Field.Root>
            <Stack gap={6}>
              <Button variant="primary" type="submit">
                Submit
              </Button>
            </Stack>
          </Stack>
        </form>
      </Flex>
    </Box>
  );
};

export default AddOrganisation;
