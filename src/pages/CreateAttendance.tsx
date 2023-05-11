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
import { useForm, SubmitHandler } from "react-hook-form"
import useGlobalStore, { currentAttendanceType } from 'zStore';

const CreateAttendance = () => {
  const { register, handleSubmit } = useForm<currentAttendanceType>();
  const [updateCurrentAttendance] = useGlobalStore(state =>[state.updateCurrentAttendance])
  const onSubmit: SubmitHandler<currentAttendanceType> = data => {
    updateCurrentAttendance(data)
   navigate(PROTECTED_PATHS.MARK_ATTENANCE)
  
  }

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
          Create Attendance
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
          mt='5rem'
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormControl id="name">
              <FormLabel>Name</FormLabel>
              <Input
                type="name"
                {...register("name", { required: true })}
              />
            </FormControl>

            <FormControl id="category">
              <FormLabel>Category</FormLabel>
              <Input
                type="category"

                {...register("category", { required: true })}
              />
            </FormControl>

            <FormControl id="sub_category">
              <FormLabel>Sub Category</FormLabel>
              <Input
                type="sub_category"

                {...register("subCategory", { required: true })}
              />

            </FormControl>

            <FormControl id="date">
              <FormLabel>Date</FormLabel>
              <Input
                type="date"

                {...register("date", { required: true })}
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
                Continue
              </Button>
            </Box>
          </form>
        </Stack>
      </Flex>
    </Box>
  );
};

export default CreateAttendance;
