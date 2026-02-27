import { Box, Center, Spinner, Text, VStack, useColorModeValue } from "@chakra-ui/react";

type LoadingSpinnerProps = {
  h?: string;
  text?: string;
};

const LoadingSpinner = ({ h = "100vh", text = "Loading..." }: LoadingSpinnerProps) => {
  const textColor = useColorModeValue("gray.600", "gray.300");

  return (
    <Center h={h} w="100%">
      <VStack spacing={4}>
        <Box position="relative" w="56px" h="56px">
          <Spinner
            position="absolute"
            top={0}
            left={0}
            w="56px"
            h="56px"
            thickness="4px"
            speed="0.85s"
            emptyColor="blue.100"
            color="blue.500"
          />
          <Spinner
            position="absolute"
            top="10px"
            left="10px"
            w="36px"
            h="36px"
            thickness="3px"
            speed="0.65s"
            emptyColor="teal.100"
            color="teal.400"
          />
        </Box>
        <Text fontSize="sm" fontWeight="medium" color={textColor}>
          {text}
        </Text>
      </VStack>
    </Center>
  );
};

export default LoadingSpinner;
