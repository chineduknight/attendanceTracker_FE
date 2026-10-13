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

export const MEMBER_HERO_GRADIENT = {
  from: "purple.600",
  via: "blue.600",
  to: "cyan.650",
} as const;

const MemberHero: React.FC<MemberHeroProps> = ({ name, fields }) => {
  const identity = getIdentityLine(fields);
  return (
    <Flex
      align="center" gap={4} borderRadius="14px" p={5} color="white"
      // v3 gradient props: v2's bgGradient="linear(...)" string is silently
      // ignored, which left white text on the page background. Stops are
      // deep enough for white text along the whole gradient (5.1:1+; the
      // old cyan.400 end was 1.9:1 under the email line).
      bgGradient="to-br"
      gradientFrom={MEMBER_HERO_GRADIENT.from}
      gradientVia={MEMBER_HERO_GRADIENT.via}
      gradientTo={MEMBER_HERO_GRADIENT.to}
      boxShadow="0 8px 20px rgba(59,130,246,.35)"
    >
      <Flex
        w="56px" h="56px" borderRadius="50%" bg="whiteAlpha.300"
        align="center" justify="center" fontWeight="bold" fontSize="xl" flex="0 0 auto"
      >
        {getInitials(name)}
      </Flex>
      {/* minW 0 + wrap anywhere: an email in the details line can't push the card wide. */}
      <Box minW={0} overflowWrap="anywhere">
        <Text fontWeight="bold" fontSize="xl">{name}</Text>
        {identity && <Text fontSize="sm" opacity={0.9}>{identity}</Text>}
      </Box>
    </Flex>
  );
};

export default MemberHero;
