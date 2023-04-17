import {
    Flex,
    Box,
    FormControl,
    FormLabel,
    Input,

    Stack,
    Link,
    Button,
    Heading,
    Text,
    useColorModeValue,
} from "@chakra-ui/react";

import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
    email: string,
    password: string,
};

const Login = () => {
    const { register, handleSubmit } = useForm<Inputs>();
    const onSubmit: SubmitHandler<Inputs> = data => console.log(`user logged in with ${data.email} and ${data.password}`);

    return (
        <Flex
            minH={"100vh"}
            align={"center"}
            justify={"center"}
            bg={useColorModeValue("gray.50", "gray.800")}
        >
            <form onSubmit={handleSubmit(onSubmit)}>

                <Stack spacing={8} mx={"auto"} maxW={"lg"} pb={12} px={6}>
                    <Stack align={"center"}>
                        <Heading fontSize={"4xl"}>Login Details</Heading>


                        <Text fontSize={"lg"} color={"gray.600"}>
                            Please fill in the following  <Link cursor="" _hover={{
                                textDecoration: "none"
                            }} color={"green.400"}>details</Link>
                        </Text>


                    </Stack>
                    <Box
                        rounded={"lg"}
                        bg={useColorModeValue("white", "gray.700")}
                        boxShadow={"lg"}
                        p={8}
                    >
                        <Stack spacing={4}>
                            <FormControl id="email">
                                <FormLabel>Email address</FormLabel>
                                <Input
                                    type="email"
                                    {...register("email", { required: true })}
                                />
                            </FormControl>
                            <FormControl id="password">
                                <FormLabel>Password</FormLabel>
                                <Input
                                    type="password"
                                    {...register("password", { required: true })}
                                />
                            </FormControl>
                            <Stack spacing={10}>

                                <Button
                                    mt={5}
                                    bg={"blue.400"}
                                    color={"white"}
                                    _hover={{
                                        bg: "blue.500",
                                    }}

                                    type="submit"
                                >
                                    Submit
                                </Button>
                            </Stack>
                        </Stack>
                    </Box>
                </Stack>
            </form>
        </Flex >
    );
};

export default Login;
