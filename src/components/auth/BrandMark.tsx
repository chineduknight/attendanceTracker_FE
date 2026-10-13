import { Flex, HStack, Text } from "@chakra-ui/react";
import { FiCheck } from "react-icons/fi";
import { APP_NAME } from "config/app";

/** The app's name with its mark: a gradient tile and gradient wordmark. */
const BrandMark = () => (
  <HStack gap={3} justify="center">
    <Flex
      aria-hidden
      boxSize="44px"
      rounded="xl"
      align="center"
      justify="center"
      color="white"
      fontSize="22px"
      shadow="md"
      bgGradient="to-br"
      gradientFrom="blue.500"
      gradientTo="cyan.400"
      transform="rotate(-6deg)"
    >
      <FiCheck strokeWidth={3} />
    </Flex>
    <Text
      as="span"
      fontSize="2xl"
      fontWeight="700"
      letterSpacing="-0.02em"
      lineHeight="1"
      color="transparent"
      bgClip="text"
      bgGradient="to-r"
      gradientFrom="blue.600"
      gradientTo="cyan.500"
      _dark={{ gradientFrom: "blue.300", gradientTo: "cyan.300" }}
      data-testid="brand-wordmark"
    >
      {APP_NAME}
    </Text>
  </HStack>
);

export default BrandMark;
