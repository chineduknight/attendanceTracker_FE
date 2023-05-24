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

import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore, { currentAttendanceType } from "zStore";
import _ from 'lodash';
import { orgRequest } from "services";
import { queryClient, useMutationWrapper } from "services/api/apiHelper";


const Category = () => {
    const onSuccess = (data) => {
        queryClient.invalidateQueries({ queryKey: ["all-organisations"] })
    }

    const { mutate } = useMutationWrapper(onSuccess)

    const handleAddCategory = (detail) => {

        const data = {
            name: detail.name
        }


        mutate({
            url: orgRequest.CATEGORY,
            data
        })

        navigate(PROTECTED_PATHS.ALL_ORG)

    }
    const { register, handleSubmit } = useForm<currentAttendanceType>();
    const [updateCurrentAttendance] = useGlobalStore((state) => [
        state.updateCurrentAttendance,
    ]);
    const onSubmit: SubmitHandler<currentAttendanceType> = (formData, detail) => {
        handleAddCategory(detail)
        const trimmedFormData = _.mapValues(formData, (value) => {
            if (typeof value === 'string') {
                return value.trim();
            }
            return value;
        });

        const nonEmptyFormData = _.omitBy(trimmedFormData, _.isEmpty);
        updateCurrentAttendance(nonEmptyFormData as currentAttendanceType);
        navigate(PROTECTED_PATHS.MARK_ATTENANCE);
    };


    const navigate = useNavigate();

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
                                {...register("category", { required: false })}
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