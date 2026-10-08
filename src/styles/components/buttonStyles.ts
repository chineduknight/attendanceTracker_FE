import { defineRecipe } from "@chakra-ui/react";
import { buttonSizes } from "./v2Parity";

// Extends Chakra's built-in button recipe (merged by createSystem): the
// app's own variants, with "primary" still the default as it was in v2.
const filled = {
  borderRadius: "4px",
  fontSize: "14px",
  fontWeight: "500",
} as const;

export const buttonRecipe = defineRecipe({
  base: {
    color: "#fff", // ensure text color is white
    outline: "none",
  },
  variants: {
    size: buttonSizes,
    variant: {
      primary: {
        ...filled,
        bg: "#3f51b5", // indigo shade
        _hover: {
          bg: "#283593", // darker shade of indigo for hover
          boxShadow: "md",
          _disabled: { bg: "#283593" },
        },
      },
      secondary: {
        ...filled,
        bg: "#EEEEEE",
        _hover: { bg: "#E5EBF5", boxShadow: "md", outline: "none" },
      },
      danger: {
        ...filled,
        bg: "#b71c1c", // deep red color
        _hover: { bg: "#d32f2f", boxShadow: "md" }, // brighter red on hover
      },
      logout: {
        ...filled,
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
