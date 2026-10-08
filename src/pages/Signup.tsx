import { Flex, Box, Input, Stack, Button, Heading, Link, Field } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import PasswordInput from "components/PasswordInput";
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

const PASSWORD_MIN_LENGTH = 6;

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
    <Flex minH="100vh" align="center" justify="center" bg={useColorModeValue("gray.50", "gray.800")}>
      <Stack gap={8} mx="auto" maxW="lg" pb={12} px={6}>
        <Heading fontSize="4xl" textAlign="center">Create your account</Heading>
        <Box rounded="lg" bg={useColorModeValue("white", "gray.700")} boxShadow="lg" p={8}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack gap={4}>
              <Field.Root invalid={!!errors.username}>
                <Field.Label>Username</Field.Label>
                <Input {...register("username", { required: "Username is required" })} />
                <Field.ErrorText>{errors.username?.message}</Field.ErrorText>
              </Field.Root>
              <Field.Root invalid={!!errors.email}>
                <Field.Label>Email</Field.Label>
                <Input
                  type="email"
                  {...register("email", {
                    required: "Email is required",
                    pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                  })}
                />
                <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
              </Field.Root>
              <Field.Root invalid={!!errors.password}>
                <Field.Label>Password</Field.Label>
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
              <Button type="submit" bg="blue.400" color="white" loading={isLoading} _hover={{ bg: "blue.500" }}>
                Sign up
              </Button>
              <Link color="blue.400" textAlign="center" asChild><RouterLink to={PUBLIC_PATHS.LOGIN}>Already have an account? Sign in
                              </RouterLink></Link>
            </Stack>
          </form>
        </Box>
      </Stack>
    </Flex>
  );
};

export default Signup;
