import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useColorModeValue } from "./ui/color-mode";
import { IconType } from "react-icons";

export interface StatTileProps {
  label: string;
  /** Null while loading or after a failure — rendered as "–", never 0. */
  value: number | null;
  icon?: IconType;
  /**
   * Chakra colour token. Outline tiles use it for the icon and the pressed
   * border; solid tiles fill the whole tile with it.
   */
  accent?: string;
  /** Solid fills the tile with `accent` and white text. */
  tone?: "outline" | "solid";
  /** Makes the tile a button (e.g. select a range, jump to a section). */
  onClick?: () => void;
  /**
   * Toggle-style tiles expose aria-pressed; leave undefined for plain
   * action tiles so assistive tech does not announce a pressed state.
   */
  isPressed?: boolean;
}

/**
 * The one compact count tile shared by Birthday and Welfare. Count over
 * label visually, but the label stays first in DOM order
 * (`column-reverse`) so the accessible name starts with it. Meaning is
 * always carried by the label text, never by colour alone.
 */
const StatTile = ({
  label,
  value,
  icon: Icon,
  accent = "gray.500",
  tone = "outline",
  onClick,
  isPressed,
}: StatTileProps) => {
  const outlineBg = useColorModeValue("white", "gray.700");
  const outlineLabel = useColorModeValue("gray.600", "gray.300");
  const isSolid = tone === "solid";
  const bg = isSolid ? accent : outlineBg;
  const labelColor = isSolid ? "whiteAlpha.900" : outlineLabel;

  const content = (
    <>
      <Flex align="center" gap={1.5} minW={0}>
        {Icon && (
          // A wrapping span, not asChild: react-icons components cannot take
          // the ref asChild passes down.
          <Box
            as="span"
            display="inline-flex"
            aria-hidden="true"
            color={isSolid ? "white" : accent}
            flexShrink={0}
          >
            <Icon />
          </Box>
        )}
        <Text
          fontSize={{ base: "xs", md: "md" }}
          fontWeight={isSolid ? "semibold" : "medium"}
          color={labelColor}
          textAlign="left"
        >
          {label}
        </Text>
      </Flex>
      <Text
        fontSize={{ base: "xl", md: "3xl" }}
        fontWeight="bold"
        lineHeight="short"
      >
        {value ?? "–"}
      </Text>
    </>
  );

  const layout = {
    w: "full",
    h: "full",
    bg,
    color: isSolid ? "white" : undefined,
    display: "flex",
    flexDirection: "column-reverse" as const,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    borderRadius: "md",
    py: { base: 2, md: 4 },
    px: { base: 3, md: 5 },
  };

  if (!onClick) {
    return (
      <Box
        {...layout}
        borderWidth={isSolid ? 0 : "1px"}
        role="group"
        aria-label={label}
      >
        {content}
      </Box>
    );
  }

  // Both tones share the outline variant. Solid only overrides its colours
  // (hover/active would otherwise repaint the fill grey). Not "unstyled":
  // its `padding: 0` is emitted after px/py and wipes the side padding.
  const interaction = isSolid
    ? {
        borderWidth: isPressed ? "2px" : 0,
        borderColor: "white",
        _hover: { bg: accent, filter: "brightness(1.08)" },
        _active: { bg: accent, filter: "brightness(0.92)" },
      }
    : {
        borderColor: isPressed ? accent : undefined,
        borderWidth: isPressed ? "2px" : "1px",
      };

  return (
    <Button
      {...layout}
      {...interaction}
      variant="outline"
      height="auto"
      whiteSpace="normal"
      aria-pressed={isPressed}
      onClick={onClick}
    >
      {content}
    </Button>
  );
};

export default StatTile;
