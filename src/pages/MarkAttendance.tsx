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

import { useState } from 'react'
import { useQueryWrapper } from "services/api/apiHelper";
import { SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  name: 'string'
}

const MarkAttendance = () => {
  const [allMembers, setAllMembers] = useState<any>([]);
  console.log("allMembers:", allMembers)

  const onSuccess = (data) => {
    console.log("data:", data.data)
    const members = data.data;
    const membersWithAttendStatus = members.map(member => {
      return {
        ...member,
        attend: false
      }
    }

    )
    console.log("membersWithAttendStatus:", membersWithAttendStatus)
    setAllMembers(membersWithAttendStatus)
  }

  useQueryWrapper(["all-members"], "/members", {
    onSuccess
  });

  const { register, handleSubmit } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = formData => {
    //add mouse event so that user can be found easily

  }

  const updateAttendance = (userId) => {
    for (let index = 0; index < allMembers.length; index++) {
      let member = allMembers[index];
      const tempMembers = allMembers;
      const isUserToUpdate = member.id === userId;
      if (isUserToUpdate) {
      
        tempMembers[index] = {
            ...member,
          attend:!member.attend
        };
        setAllMembers([...tempMembers]);
        break;
      }

    }
  }
  // const allMembers = data?.data
  // console.log("allMembers:", allMembers)

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
              type="name"
              placeholder="Search member"
              // onChange={(e)=>console.log(e)}
              {...register('name', { required: true })}
            />
          </InputGroup>
        </form>
        <Box mt="4" overflow="scroll" maxHeight="300px">
          {
          allMembers &&   allMembers.map((item) => (
              <Button
                variant="unstyled"
                onClick={() => updateAttendance(item.id)}
                display="block"
                w="full"
                mt="3"
                key={item.id}
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

      </Container>
    </Box>
  );
};

export default MarkAttendance;


