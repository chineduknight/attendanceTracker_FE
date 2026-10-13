import { Button, Field, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import PasswordInput from "components/PasswordInput";
import AuthLayout, { AuthLink } from "components/auth/AuthLayout";
import { newPasswordRules } from "helpers/authFields";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";

interface ResetPasswordInputs {
  password: string;
  confirmPassword: string;
}

const backToSignIn = <AuthLink to={PUBLIC_PATHS.LOGIN}>Back to sign in</AuthLink>;

const InvalidLink = () => (
  <AuthLayout title="This reset link is invalid or expired" footer={backToSignIn}>
    <Stack gap={4}>
      <Text color="fg.muted">
        Reset links expire after 1 hour and can only be used once. Request a fresh
        link to choose a new password.
      </Text>
      <Button asChild size="lg" w="full">
        <RouterLink to={PUBLIC_PATHS.FORGOT_PASSWORD}>Request a new reset link</RouterLink>
      </Button>
    </Stack>
  </AuthLayout>
);

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [linkInvalid, setLinkInvalid] = useState(false);

  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm<ResetPasswordInputs>();

  const onSuccess = () => {
    toast.success("Password has been reset. Please sign in.");
    navigate(PUBLIC_PATHS.LOGIN);
  };

  const onError = (error: { response?: { status?: number; data?: { error?: string } } }) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.error;
    if (status === 429) {
      toast.error("Too many attempts, please try again later.");
      return;
    }
    // 422 covers both a bad/expired token and server-side validation. A token
    // failure means the form can't recover, so swap to the invalid-link state.
    if (status === 422 && /invalid|expired/i.test(message ?? "")) {
      setLinkInvalid(true);
      return;
    }
    toast.error(message ?? "Something went wrong. Please try again.");
  };

  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess, onError);

  const onSubmit: SubmitHandler<ResetPasswordInputs> = ({ password }) =>
    mutate({ url: authRequest.RESET_PASSWORD, data: { token, password } });

  if (!token || linkInvalid) return <InvalidLink />;

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="You'll use it to sign in from now on."
      footer={backToSignIn}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={4}>
          <Field.Root invalid={!!errors.password}>
            <Field.Label>New password</Field.Label>
            <PasswordInput autoComplete="new-password" {...register("password", newPasswordRules())} />
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.confirmPassword}>
            <Field.Label>Confirm new password</Field.Label>
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
            Reset password
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
