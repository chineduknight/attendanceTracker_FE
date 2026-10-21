import { ReactNode } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { FiChevronRight } from "react-icons/fi";

/**
 * A full-width tappable row: label, optional caption and value, and a
 * chevron. A real button, at least 52px tall.
 */
const NavRow = ({
  label,
  caption,
  value,
  onClick,
  ariaExpanded,
}: {
  label: ReactNode;
  caption?: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  ariaExpanded?: boolean;
}) => (
  <chakra.button
    type="button"
    onClick={onClick}
    aria-expanded={ariaExpanded}
    w="100%"
    minH="52px"
    px={4}
    py={2}
    textAlign="left"
    bg="bg.panel"
    color="fg"
    cursor="pointer"
    _hover={{ bg: "bg.muted" }}
    _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing", outlineOffset: "-2px" }}
  >
    <Flex align="center" gap={3}>
      <Box flex="1" minW={0}>
        <Text fontWeight="medium">{label}</Text>
        {caption && (
          <Text fontSize="sm" color="fg.muted">
            {caption}
          </Text>
        )}
      </Box>
      {value !== undefined && (
        <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </Text>
      )}
      <Box as={FiChevronRight} aria-hidden color="fg.muted" flexShrink={0} />
    </Flex>
  </chakra.button>
);

/** A stack of NavRows inside one bordered panel. */
export const NavGroup = ({ children, label }: { children: ReactNode; label?: string }) => (
  <Box
    role={label ? "group" : undefined}
    aria-label={label}
    borderWidth="1px"
    borderColor="border"
    borderRadius="lg"
    overflow="hidden"
    css={{ "& > * + *": { borderTopWidth: "1px", borderColor: "var(--chakra-colors-border-muted)" } }}
  >
    {children}
  </Box>
);

export default NavRow;
