import {
    Box,
    Flex,
    useColorModeValue,
    Text,
    Button,
    FormControl,
    FormLabel,
    Input,
    Stack,
} from "@chakra-ui/react";



import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore, { currentAttendanceType } from "zStore";
import { orgRequest } from "services";
import { useMutationWrapper } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { toast } from "react-toastify";


const Category = () => {
    const [category] = useGlobalStore((state) => [state.organisation]);
    const onSuccess = (data) => {
        toast.success("category added successfully");
    }

    const { mutate } = useMutationWrapper(onSuccess)

    const handleAddCategory = (detail) => {
        const categoryUrl = convertParamsToString(orgRequest.CATEGORY, {
            organisationId: category.id,

        });
        console.log("user's category id", categoryUrl)
        const data = {
            name: detail.name
        }

        mutate({
            url: categoryUrl,
            data
        })
    }
    const { register, handleSubmit } = useForm<currentAttendanceType>();

    const onSubmit: SubmitHandler<currentAttendanceType> = (detail) => {
        handleAddCategory(detail)

    };

    return (
        <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
            <Flex
                bg="blue.500"
                justifyContent="space-between"
                alignItems="center"
                p="4"
            >
                <Text fontWeight="bold" color="#fff">
                    Create Category
                </Text>
            </Flex>
            <Flex
                align={"center"}
                justify={"center"}
                bg={useColorModeValue("gray.50", "gray.800")}
            >

                <Stack
                    spacing={4}
                    w={"full"}
                    mt="5rem"
                    maxW={"md"}
                    bg={useColorModeValue("white", "gray.700")}
                    rounded={"xl"}
                    boxShadow={"lg"}
                    p={6}
                >
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <FormControl id="category">
                            <FormLabel>Category name</FormLabel>
                            <Input
                                type="category"
                                {...register("category", { required: true })}
                            />
                        </FormControl>
                        <Box>
                            <Button
                                w="full"
                                mt="40px"
                                bg={"blue.400"}
                                color={"white"}
                                _hover={{
                                    bg: "blue.500",
                                }}
                                fontWeight="bold"
                                fontSize="15px"
                                type="submit"
                            >
                                Submit
                            </Button>
                        </Box>
                    </form>
                </Stack>
            </Flex>
        </Box>
    );
};

export default Category;