import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { capitalize } from "helpers/stringManipulations";

interface MemberHeroProps {
  name: string;
  fields: Record<string, unknown>;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const getIdentityLine = (fields: Record<string, unknown>) =>
  Object.values(fields)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => capitalize(String(value)))
    .join(" · ");

const MemberHero: React.FC<MemberHeroProps> = ({ name, fields }) => {
  const identity = getIdentityLine(fields);
  return (
    <Flex
      align="center" gap={4} borderRadius="14px" p={5} color="white"
      bgGradient="linear(135deg, purple.500, blue.500, cyan.400)"
      boxShadow="0 8px 20px rgba(59,130,246,.35)"
    >
      <Flex
        w="56px" h="56px" borderRadius="50%" bg="whiteAlpha.300"
        align="center" justify="center" fontWeight="bold" fontSize="xl" flex="0 0 auto"
      >
        {getInitials(name)}
      </Flex>
      <Box>
        <Text fontWeight="bold" fontSize="xl">{name}</Text>
        {identity && <Text fontSize="sm" opacity={0.9}>{identity}</Text>}
      </Box>
    </Flex>
  );
};

export default MemberHero;
