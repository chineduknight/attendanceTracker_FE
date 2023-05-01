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
<<<<<<< HEAD
import { useForm, SubmitHandler } from "react-hook-form";
import useGlobalStore, { currentAttendanceType } from "zStore";
import _ from 'lodash';

const CreateAttendance = () => {
  const { register, handleSubmit } = useForm<currentAttendanceType>();
  const [updateCurrentAttendance] = useGlobalStore((state) => [
    state.updateCurrentAttendance,
  ]);
  const onSubmit: SubmitHandler<currentAttendanceType> = (formData) => {
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
  
=======
import { useForm, SubmitHandler } from "react-hook-form"
import useGlobalStore, { currentAttendanceType } from 'zStore';

const CreateAttendance = () => {
  const { register, handleSubmit } = useForm<currentAttendanceType>();
  const [updateCurrentAttendance] = useGlobalStore(state =>[state.updateCurrentAttendance])
  const onSubmit: SubmitHandler<currentAttendanceType> = data => {
    updateCurrentAttendance(data)
   navigate(PROTECTED_PATHS.MARK_ATTENANCE)
  
  }
>>>>>>> added the zustand to the create attendance

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
          mt="5rem"
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
<<<<<<< HEAD
            <FormControl id="name" isRequired>
              <FormLabel>Name</FormLabel>
              <Input type="name" {...register("name", { required: true })} />
=======
            <FormControl id="name">
              <FormLabel>Name</FormLabel>
              <Input
                type="name"
                {...register("name", { required: true })}
              />
>>>>>>> added the zustand to the create attendance
            </FormControl>

            <FormControl id="category">
              <FormLabel>Category</FormLabel>
              <Input
                type="category"
                {...register("category", { required: false })}
              />
            </FormControl>

            <FormControl id="sub_category">
              <FormLabel>Sub Category</FormLabel>
              <Input
                type="sub_category"
                {...register("subCategory", { required: false })}
              />
            </FormControl>

            <FormControl id="date" isRequired>
              <FormLabel>Date</FormLabel>
              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
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