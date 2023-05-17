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


const MarkAttendance = () => {
  const [allMembers, setAllMembers] = useState<any>([]);
  const [filterName, setFilterName] = useState<any>([])

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
    setFilterName(membersWithAttendStatus)
  }

  useQueryWrapper(["all-members"], "/members", {
    onSuccess
  });

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
        setFilterName([...tempMembers])
        break;
      }

    }
  }

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allMembers.filter(member =>
      member.name.toLowerCase().includes(query)
    );
    setFilterName(filtered);
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

        <InputGroup mt="4">
          <InputLeftElement
            pointerEvents="none"

          />
          <Input type="name" placeholder="Search member" onChange={handleSearch} />
        </InputGroup>
        {filterName.length === 0 && (
          <Box mt="4">
            <Text ml="4" fontWeight="bold">
              No member found
            </Text>
          </Box>
        )}

        <Box mt="4" overflow="scroll" maxHeight="300px">
          {
            filterName.map((item) => (
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

