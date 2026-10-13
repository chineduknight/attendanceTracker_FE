import { Button, Field, Input, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "react-toastify";
import AuthLayout, { AuthLink } from "components/auth/AuthLayout";
import { emailRules } from "helpers/authFields";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";

interface ForgotPasswordInputs {
  email: string;
}

const ForgotPassword = () => {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const {
    register, handleSubmit, getValues, formState: { errors },
  } = useForm<ForgotPasswordInputs>();

  // The endpoint always responds 200 with the same body whether or not the
  // email exists (prevents account enumeration), so success simply switches
  // to the generic "check your inbox" state.
  const onSuccess = () => setSubmittedEmail(getValues("email"));

  const onError = (error: { response?: { status?: number } }) => {
    if (error?.response?.status === 429) {
      toast.error("Too many attempts, please try again later.");
      return;
    }
    toast.error("Something went wrong. Please try again.");
  };

  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess, onError);

  const onSubmit: SubmitHandler<ForgotPasswordInputs> = (data) =>
    mutate({ url: authRequest.FORGOT_PASSWORD, data });

  const backToSignIn = (
    <AuthLink to={PUBLIC_PATHS.LOGIN}>Back to sign in</AuthLink>
  );

  if (submittedEmail) {
    return (
      <AuthLayout title="Check your inbox" footer={backToSignIn}>
        <Stack gap={4}>
          <Text>
            If{" "}
            <Text as="b" overflowWrap="anywhere">
              {submittedEmail}
            </Text>{" "}
            is registered, we&apos;ve sent a reset link. Follow it to choose a
            new password. The link expires in 1 hour.
          </Text>
          <Text color="fg.muted">
            Didn&apos;t get an email? Check your spam folder, or use a different
            address.
          </Text>
          <Button variant="outline" size="lg" w="full" onClick={() => setSubmittedEmail(null)}>
            Try a different address
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email tied to your account and we'll send you a link to reset your password."
      footer={backToSignIn}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={4}>
          <Field.Root invalid={!!errors.email}>
            <Field.Label>Email</Field.Label>
            <Input type="email" autoComplete="email" {...register("email", emailRules)} />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>
          <Button type="submit" size="lg" w="full" loading={isLoading}>
            Send reset link
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
