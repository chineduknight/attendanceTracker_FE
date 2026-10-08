import { Flex, Box, Stack, Button, Heading, Text, Link, Field } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import PasswordInput from "components/PasswordInput";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";

interface ResetPasswordInputs {
  password: string;
  confirmPassword: string;
}

const PASSWORD_MIN_LENGTH = 6;

const InvalidLink = () => (
  <Stack gap={4}>
    <Heading fontSize="xl">This reset link is invalid or expired</Heading>
    <Text color="gray.600">
      Reset links expire after 1 hour and can only be used once. Request a fresh
      link to choose a new password.
    </Text>
    <Link color="blue.400" textAlign="center" asChild><RouterLink to={PUBLIC_PATHS.FORGOT_PASSWORD}>Request a new reset link
          </RouterLink></Link>
  </Stack>
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

  const showForm = token && !linkInvalid;

  return (
    <Flex minH="100vh" align="center" justify="center" bg={useColorModeValue("gray.50", "gray.800")}>
      <Stack gap={8} mx="auto" maxW="lg" pb={12} px={6}>
        <Heading fontSize="4xl" textAlign="center">Reset your password</Heading>
        <Box rounded="lg" bg={useColorModeValue("white", "gray.700")} boxShadow="lg" p={8}>
          {showForm ? (
            <form onSubmit={handleSubmit(onSubmit)}>
              <Stack gap={4}>
                <Field.Root invalid={!!errors.password}>
                  <Field.Label>New password</Field.Label>
                  <PasswordInput
                    autoComplete="new-password"
                    {...register("password", {
                      required: "Password is required",
                      minLength: {
                        value: PASSWORD_MIN_LENGTH,
                        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
                      },
                    })}
                  />
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
                <Button type="submit" bg="blue.400" color="white" loading={isLoading} _hover={{ bg: "blue.500" }}>
                  Reset password
                </Button>
                <Link color="blue.400" textAlign="center" asChild><RouterLink to={PUBLIC_PATHS.LOGIN}>Back to sign in
                                  </RouterLink></Link>
              </Stack>
            </form>
          ) : (
            <InvalidLink />
          )}
        </Box>
      </Stack>
    </Flex>
  );
};

export default ResetPassword;
