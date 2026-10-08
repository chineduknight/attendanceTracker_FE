import { Flex, Box, Input, Stack, Button, Heading, Text, Link, Field } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link as RouterLink } from "react-router-dom";
import { toast } from "react-toastify";
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

  return (
    <Flex minH="100vh" align="center" justify="center" bg={useColorModeValue("gray.50", "gray.800")}>
      <Stack gap={8} mx="auto" maxW="lg" pb={12} px={6}>
        <Heading fontSize="4xl" textAlign="center">Forgot your password?</Heading>
        <Box rounded="lg" bg={useColorModeValue("white", "gray.700")} boxShadow="lg" p={8}>
          {submittedEmail ? (
            <Stack gap={4}>
              <Heading fontSize="xl">Check your inbox</Heading>
              <Text color="gray.600">
                If <b>{submittedEmail}</b> is registered, we&apos;ve sent a reset link.
                Follow it to choose a new password. The link expires in 1 hour.
              </Text>
              <Text fontSize="sm" color="gray.500">
                Didn&apos;t get an email? Check your spam folder, or{" "}
                <Link color="blue.400" onClick={() => setSubmittedEmail(null)}>
                  try a different address
                </Link>
                .
              </Text>
              <Link color="blue.400" textAlign="center" asChild><RouterLink to={PUBLIC_PATHS.LOGIN}>Back to sign in
                              </RouterLink></Link>
            </Stack>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)}>
              <Stack gap={4}>
                <Text color="gray.600">
                  Enter the email tied to your account and we&apos;ll send you a link to reset your password.
                </Text>
                <Field.Root invalid={!!errors.email}>
                  <Field.Label>Email</Field.Label>
                  <Input
                    type="email"
                    autoComplete="email"
                    {...register("email", {
                      required: "Email is required",
                      pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                    })}
                  />
                  <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
                </Field.Root>
                <Button type="submit" bg="blue.400" color="white" loading={isLoading} _hover={{ bg: "blue.500" }}>
                  Send reset link
                </Button>
                <Link color="blue.400" textAlign="center" asChild><RouterLink to={PUBLIC_PATHS.LOGIN}>Back to sign in
                                  </RouterLink></Link>
              </Stack>
            </form>
          )}
        </Box>
      </Stack>
    </Flex>
  );
};

export default ForgotPassword;
