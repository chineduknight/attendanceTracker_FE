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

const MarkAttendance = () => {
  const members = [
    {
      name: "Alice Rose",
      attend: true,
    },
    {
      name: "Jude Nwaohiri",
      attend: false,
    },
    {
      name: "Alice Peter",
      attend: true,
    },

  ];
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
          {state.name}
        </Heading>
        <Heading mt="4" fontSize="22px">
          Members
        </Heading>
        <InputGroup mt="4">
          <InputLeftElement
            pointerEvents="none"
          // children={<PhoneIcon color="gray.300" />}
          />
          <Input type="tel" placeholder="Phone number" />
        </InputGroup>
        <Box mt="4" overflow="scroll" maxHeight="300px">
          {members.map((item) => (
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
          <Button w="full" mt="4">
            Submit
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default MarkAttendance;
