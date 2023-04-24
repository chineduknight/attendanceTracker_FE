import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Input,
  Heading,
  InputGroup,
  InputLeftElement,
  Container,
} from "@chakra-ui/react";


import { nanoid } from "nanoid";
import { useQueryWrapper } from "services/api/apiHelper";
import { SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  tel: 'string'
}

const MarkAttendance = () => {

  const { data } = useQueryWrapper(["all-members"], "/members");






  const { register, handleSubmit } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = formData => {
    //add mouse event so that user can be found easily

  }

  const result = data?.data




  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Mark Attendance
        </Text>
      </Flex>
      <Container>
        <Heading mt="4" fontSize="22px">
          Members
        </Heading>
        <form onSubmit={handleSubmit(onSubmit)}>

          <InputGroup mt="4">
            <InputLeftElement
              pointerEvents="none"

            />
            <Input
              type="tel"
              placeholder="Phone number"
              {...register('tel', { required: true })}
            />
          </InputGroup>
          <Box mt="4" overflow="scroll" maxHeight="300px">
            {
              (result) && result.map((item) => (
                <Button
                  display="block"
                  w="full"
                  mt="3"
                  variant="outline"
                  key={nanoid()}
                  bg={item.attend ? "green" : ""}
                  color={item.attend ? "#fff" : ""}
                >
                  {item.name}
                </Button>
              ))}

          </Box>
          <Box>
            <Button
              type="submit"
              w="full"
              mt="4"
            >
              Submit
            </Button>
          </Box>
        </form>
      </Container>
    </Box>
  );
};

export default MarkAttendance;



