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
import { postRequest, useMutationWrapper, useQueryWrapper } from "services/api/apiHelper";
import { SubmitHandler, useForm } from "react-hook-form";
// import { queryClient } from 'services/api/apiHelper';
import useGlobalStore from 'zStore';
import { nanoid } from 'nanoid';
import { useNavigate } from 'react-router-dom';
import { PROTECTED_PATHS } from 'routes/pagePath';

type Inputs = {
  name: 'string'
}

const MarkAttendance = () => {
  const [allMembers, setAllMembers] = useState<any>([]);
  const [currentAttendance] = useGlobalStore(state =>[state.currentAttendance])

  const onSuccess = (data) => {
    const members = data.data;
    const membersWithAttendStatus = members.map(member => {
      return {
        ...member,
        attend: false
      }
    }

    )
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
          attend: !member.attend
        };
        setAllMembers([...tempMembers]);
        break;
      }

    }
  }
  const navigate = useNavigate();

  const onSubmitSuccess = () => {
    navigate(PROTECTED_PATHS.DASHBOARD)
  
  }

  const { mutate } = useMutationWrapper(postRequest, onSubmitSuccess)

const sendAttandanceToAPI = ()=>{
  const data = {
    id:nanoid(),
    ...currentAttendance,
    members:allMembers
  }
  mutate({
    url:"/attendance-register",
    data
  })
}

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
              {...register('name', { required: true })}
            />
          </InputGroup>
        </form>
        <Box mt="4" overflow="scroll" maxHeight="300px">
          {
            allMembers && allMembers.map((item) => (
              <Button
                variant="unstyled"
                onClick={() => updateAttendance(item.id)}
                display="block"
                w="full"
                mt="3"
                border="1px solid green"
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
            onClick={sendAttandanceToAPI}
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


