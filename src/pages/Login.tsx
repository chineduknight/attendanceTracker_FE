import { Button, Field, Flex, Input, Stack } from "@chakra-ui/react";
import { SubmitHandler, useForm } from "react-hook-form";
import PasswordInput from "components/PasswordInput";
import AuthLayout, { AuthLink } from "components/auth/AuthLayout";
import { usernameInputProps } from "helpers/authFields";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";

interface LoginInputs {
  username: string;
  password: string;
}

const Login = () => {
  const [setUser] = useGlobalStore((state) => [state.setUser]);
  const {
    register, handleSubmit, formState: { errors },
  } = useForm<LoginInputs>();

  const onSuccess = (data) => {
    setUser(data.data);
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const onSubmit: SubmitHandler<LoginInputs> = (data) =>
    mutate({ url: authRequest.LOGIN, data });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to take attendance and manage your organisation."
      footer={
        <>
          New here? <AuthLink to={PUBLIC_PATHS.SIGN_UP}>Create an account</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={4}>
          <Field.Root invalid={!!errors.username}>
            <Field.Label>Username or email</Field.Label>
            <Input
              autoComplete="username"
              {...usernameInputProps}
              {...register("username", { required: "Enter your username or email" })}
            />
            <Field.ErrorText>{errors.username?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.password}>
            <Field.Label>Password</Field.Label>
            <PasswordInput
              autoComplete="current-password"
              {...register("password", { required: "Enter your password" })}
            />
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>
          <Flex justify="flex-end" mt={-2}>
            <AuthLink to={PUBLIC_PATHS.FORGOT_PASSWORD}>Forgot password?</AuthLink>
          </Flex>
          <Button type="submit" size="lg" w="full" loading={isLoading}>
            Sign in
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
};

export default Login;
