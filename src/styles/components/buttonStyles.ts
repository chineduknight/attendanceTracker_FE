import { defineRecipe } from "@chakra-ui/react";
import { buttonSizes } from "./v2Parity";

// Extends Chakra's built-in button recipe (merged by createSystem): the
// app's own variants, with "primary" still the default as it was in v2.
const filled = {
  borderRadius: "4px",
  fontSize: "14px",
  fontWeight: "500",
} as const;

// White text belongs to the filled custom variants only: in `base` it also
// whitened `secondary`, a light grey button.
export const buttonRecipe = defineRecipe({
  variants: {
    size: buttonSizes,
    variant: {
      primary: {
        ...filled,
        color: "#fff",
        bg: "#3f51b5", // indigo shade
        _hover: {
          bg: "#283593", // darker shade of indigo for hover
          boxShadow: "md",
          _disabled: { bg: "#283593" },
        },
      },
      secondary: {
        ...filled,
        bg: "bg.muted",
        color: "fg",
        _hover: { bg: "bg.emphasized", boxShadow: "md" },
      },
      danger: {
        ...filled,
        color: "#fff",
        bg: "#b71c1c", // deep red color
        _hover: { bg: "#d32f2f", boxShadow: "md" }, // brighter red on hover
      },
      logout: {
        ...filled,
        color: "#fff",
        // a lighter neutral gray color for better contrast with the blue navbar
        bg: "#9e9e9e",
        _hover: { bg: "#757575", boxShadow: "md" }, // slightly darker on hover
      },
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});
