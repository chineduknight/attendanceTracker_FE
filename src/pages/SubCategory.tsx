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
import { currentAttendanceType } from "zStore";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";

const SubCategory = () => {
    const onSuccess = (data) => { }

    const { mutate } = useMutationWrapper(postRequest, onSuccess)

    const handleAddSubCategory = (details) => {

        const data = {
            name: details.name,
            parentCategoryId: "6463b826c38b4ee83e9532bd"
        }


        mutate({
            url: orgRequest.SUBCATEGORY,
            data
        })



    }
    const { register, handleSubmit } = useForm<currentAttendanceType>();

    const onSubmit: SubmitHandler<currentAttendanceType> = (details) => {
        handleAddSubCategory(details)
    };


    // const navigate = useNavigate();

    return (
        <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
            <Flex
                bg="blue.500"
                justifyContent="space-between"
                alignItems="center"
                p="4"
            >
                <Text fontWeight="bold" color="#fff">
                    Create Sub-Category
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
                        <FormControl id="sub_category">
                            <FormLabel>Sub-Category name</FormLabel>
                            <Input
                                type="sub_category"
                                {...register("subCategory", { required: true })}
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

export default SubCategory;