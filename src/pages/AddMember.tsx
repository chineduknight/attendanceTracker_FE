import { Box, Flex } from "@chakra-ui/layout";

import {
  useColorModeValue,
  Text,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
} from "@chakra-ui/react";

import { nanoid } from "nanoid";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { postRequest, queryClient, useMutationWrapper } from "services/api/apiHelper";

type Inputs = {
  name: 'string',
  email: 'string'
}
const AddMember = () => {
  const onSuccess = (data) => {
    queryClient.invalidateQueries({ queryKey: ["all-members"] })
  }


  const { mutate } = useMutationWrapper(postRequest, onSuccess)


  const handleAddMember = (formData) => {

    const data = {
      id: nanoid(),
      name: formData.name,
      email: formData.email
    }


    mutate({
      url: "/members",
      data,

    })
    navigate(PROTECTED_PATHS.MARK_ATTENANCE)
    console.log('this is  details', data);
  }


  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  function newMember(e) {
    let input = e.target;
    if (input.name === "email") {
      setEmail(input.value)
    } else if (input.name === 'name') {
      setName(input.value)
    }

  }

  const [fields] = useState([
    {
      id: nanoid(),
      title: "name",
      type: "email",
      value: name,
      required: true,
      name: 'name',
      onChange: newMember
    },
    {
      id: nanoid(),
      title: "email address",
      type: "text",
      value: email,
      required: true,
      name: 'email',
      onChange: newMember
    },
  ]);



  const navigate = useNavigate();


  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff" fontWeight="bold">
          Add Member
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
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          {fields.map((field) => (
            <FormControl key={field.id} isRequired={field.required}>
              <FormLabel textTransform="capitalize" mb="0">
                {field.title}
              </FormLabel>
              <Input type={field.type}

                name={field.name}
                onChange={field.onChange}
              />
            </FormControl>
          ))}

          <Box>
            <Button
              w="full"
              mt="40px"
              onClick={() => {
                navigate(PROTECTED_PATHS.DASHBOARD)
              }

              }
              bg={"blue.400"}
              color={"white"}
              _hover={{
                bg: "blue.500",
              }}
              fontWeight="bold"
              fontSize="15px"
            >
              Submit
            </Button>
          </Box>
        </Stack>
      </Flex>
    </Box >
  );
};

export default AddMember;
