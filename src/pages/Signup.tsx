import { Button, Field, Input, Stack } from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import PasswordInput from "components/PasswordInput";
import AuthLayout, { AuthLink } from "components/auth/AuthLayout";
import { emailRules, newPasswordRules, usernameInputProps } from "helpers/authFields";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";

interface SignupInputs {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [setUser] = useGlobalStore((s) => [s.setUser]);
  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm<SignupInputs>({
    defaultValues: { email: searchParams.get("email") ?? "" },
  });

  const onSuccess = (res: { data: { token: string } }) => {
    // signup returns { message, token } only; hydrate minimally then /users/me refreshes the rest
    setUser({
      token: res.data.token,
      id: "",
      username: "",
      email: "",
      needsEmail: false,
    });
    navigate("/");
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const onSubmit: SubmitHandler<SignupInputs> = ({ confirmPassword, ...data }) =>
    mutate({ url: authRequest.SIGN_UP, data });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your organisation and start taking attendance."
      footer={
        <>
          Already have an account? <AuthLink to={PUBLIC_PATHS.LOGIN}>Sign in</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={4}>
          <Field.Root invalid={!!errors.username}>
            <Field.Label>Username</Field.Label>
            <Input
              autoComplete="username"
              {...usernameInputProps}
              {...register("username", { required: "Username is required" })}
            />
            <Field.ErrorText>{errors.username?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.email}>
            <Field.Label>Email</Field.Label>
            <Input type="email" autoComplete="email" {...register("email", emailRules)} />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.password}>
            <Field.Label>Password</Field.Label>
            <PasswordInput autoComplete="new-password" {...register("password", newPasswordRules())} />
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.confirmPassword}>
            <Field.Label>Confirm password</Field.Label>
            <PasswordInput
              autoComplete="new-password"
              {...register("confirmPassword", {
                required: "Please confirm your password",
                validate: (value) =>
                  value === watch("password") || "Passwords do not match",
              })}
            />
            <Field.ErrorText>{errors.confirmPassword?.message}</Field.ErrorText>
          </Field.Root>
          <Button type="submit" size="lg" w="full" loading={isLoading}>
            Create account
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
};

export default Signup;
