import { Flex, Box, Input, Checkbox, Stack, Link, Button, Heading, Text, Field } from "@chakra-ui/react";
import { useColorModeValue } from "../components/ui/color-mode";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import PasswordInput from "components/PasswordInput";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";

const Login = () => {
  const [username, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [setUser] = useGlobalStore((state) => [state.setUser]);
  const onSuccess = (data) => {
    setUser(data.data);
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);
  const handleSubmit = (e) => {
    e.preventDefault();

    mutate({
      url: authRequest.LOGIN,
      data: {
        username,
        password,
      },
    });
  };
  return (
    <Flex
      minH={"100vh"}
      align={"center"}
      justify={"center"}
      bg={useColorModeValue("gray.50", "gray.800")}
    >
      <Stack gap={8} mx={"auto"} maxW={"lg"} pb={12} px={6}>
        <Stack align={"center"}>
          <Heading fontSize={"4xl"}>Sign in to your account</Heading>
          <Text fontSize={"lg"} color={"gray.600"}>
            to enjoy all of our cool <Link color={"blue.400"}>features</Link> ✌️
          </Text>
        </Stack>
        <Box
          rounded={"lg"}
          bg={useColorModeValue("white", "gray.700")}
          boxShadow={"lg"}
          p={8}
        >
          <form onSubmit={handleSubmit}>
            <Stack gap={4}>
              <Field.Root id="text">
                <Field.Label>Username or email</Field.Label>
                <Input
                  type="text"
                  autoComplete="username"
                  onValueChange={(e) => setUserName(e.target.value)}
                />
              </Field.Root>
              <Field.Root id="password">
                <Field.Label>Password</Field.Label>
                <PasswordInput
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field.Root>
              <Stack gap={10}>
                <Stack
                  direction={{ base: "column", sm: "row" }}
                  align={"start"}
                  justify={"space-between"}
                >
                  <Checkbox.Root><Checkbox.HiddenInput /><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Label>Remember me</Checkbox.Label></Checkbox.Root>
                  <Link color={"blue.400"} asChild><RouterLink to={PUBLIC_PATHS.FORGOT_PASSWORD}>Forgot password?
                                      </RouterLink></Link>
                </Stack>
                <Button
                  bg={"blue.400"}
                  color={"white"}
                  type="submit"
                  loading={isLoading}
                  _hover={{
                    bg: "blue.500",
                  }}
                >
                  Sign in
                </Button>
              </Stack>
            </Stack>
          </form>
          <Text mt={4} textAlign="center" fontSize="sm">
            New here?{" "}
            <Link color="blue.400" asChild><RouterLink to={PUBLIC_PATHS.SIGN_UP}>Create an account
                          </RouterLink></Link>
          </Text>
        </Box>
      </Stack>
    </Flex>
  );
};

export default Login;
