import {
    Flex,
    Box,
    FormControl,
    FormLabel,
    Input,
    // Checkbox,
    Stack,
    Link,
    Button,
    Heading,
    Text,
    useColorModeValue,
} from "@chakra-ui/react";
import { useState } from "react";

const Login = () => {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")

    /**
     * 
     * @param e
     */
    // function emailHandler(e) {
    //     let emailInput = e.target;

    //     setEmail(emailInput.value)
    // }
    function generalHandler(e) {
        let input = e.target;

        if (input.name === "email") {
            setEmail(input.value)
        } else if (input.name === 'password') {
            setPassword(input.value)
        }


        // setEmail(emailInput.value)
    }
    return (
        <Flex
            minH={"100vh"}
            align={"center"}
            justify={"center"}
            bg={useColorModeValue("gray.50", "gray.800")}
        >
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
                                name='email'
                                type="email"
                                value={email}
                                onChange={generalHandler}
                            />
                        </FormControl>
                        <FormControl id="password">
                            <FormLabel>Password</FormLabel>
                            <Input
                                name="password"
                                type="password"
                                value={password}
                                onChange={generalHandler} />
                        </FormControl>
                        <Stack spacing={10}>

                            <Button
                                mt={5}
                                bg={"blue.400"}
                                color={"white"}
                                _hover={{
                                    bg: "blue.500",
                                }}
                                onClick={
                                    () => {
                                        console.log(`Login with ${email} and ${password}`)
                                    }
                                }
                            >
                                Submit
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Stack>
        </Flex >
    );
};

export default Login;
