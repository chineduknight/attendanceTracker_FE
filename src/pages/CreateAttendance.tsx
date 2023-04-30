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

type Inputs = {
  name: string,
  category: string,
  sub_category: string,
  date: number
}

const CreateAttendance = () => {
  const { register, handleSubmit } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = data => console.log(data);

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

            {/* {fields.map((field) => (
              <FormControl key={field.id} isRequired={field.required}>
                <FormLabel textTransform="capitalize" mb="0">
                  {field.title}
                </FormLabel>
                <Input type={field.type} />
              </FormControl>
            ))} */}
            {/* <input
              type="name"
              {...register("name", { required: true })} />
            <input
              type="category"
              {...register("category", { required: true })} />
            <input
              type="sub_category"
              {...register("sub_category", { required: true })} />
            <input
              type="date"
              {...register("date", { required: true })} /> */}
            <FormControl id="name">
              <FormLabel>name</FormLabel>
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

                {...register("sub_category", { required: true })}
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
                onClick={() => navigate(PROTECTED_PATHS.MARK_ATTENANCE)}
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
