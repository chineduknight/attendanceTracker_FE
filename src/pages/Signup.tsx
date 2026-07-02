import {
  Flex, Box, FormControl, FormLabel, FormErrorMessage, Input, Stack,
  Button, Heading, Link, useColorModeValue,
} from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";

interface SignupInputs {
  username: string;
  email: string;
  password: string;
}

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [setUser] = useGlobalStore((s) => [s.setUser]);
  const {
    register, handleSubmit, formState: { errors },
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

  const onSubmit: SubmitHandler<SignupInputs> = (data) =>
    mutate({ url: authRequest.SIGN_UP, data });

  return (
    <Flex minH="100vh" align="center" justify="center" bg={useColorModeValue("gray.50", "gray.800")}>
      <Stack spacing={8} mx="auto" maxW="lg" pb={12} px={6}>
        <Heading fontSize="4xl" textAlign="center">Create your account</Heading>
        <Box rounded="lg" bg={useColorModeValue("white", "gray.700")} boxShadow="lg" p={8}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={4}>
              <FormControl isInvalid={!!errors.username}>
                <FormLabel>Username</FormLabel>
                <Input {...register("username", { required: "Username is required" })} />
                <FormErrorMessage>{errors.username?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!errors.email}>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  {...register("email", {
                    required: "Email is required",
                    pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                  })}
                />
                <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!errors.password}>
                <FormLabel>Password</FormLabel>
                <Input
                  type="password"
                  {...register("password", { required: "Password is required" })}
                />
                <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
              </FormControl>
              <Button type="submit" bg="blue.400" color="white" isLoading={isLoading} _hover={{ bg: "blue.500" }}>
                Sign up
              </Button>
              <Link as={RouterLink} to={PUBLIC_PATHS.LOGIN} color="blue.400" textAlign="center">
                Already have an account? Sign in
              </Link>
            </Stack>
          </form>
        </Box>
      </Stack>
    </Flex>
  );
};

export default Signup;
