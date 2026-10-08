import { defineRecipe, defineSlotRecipe } from "@chakra-ui/react";

/*
 * Chakra v3 shrank several defaults. These restore the v2 values the app was
 * designed against, so the upgrade does not change how pages look. Medium
 * fields keep 16px text in particular: below that, iOS zooms the page on
 * focus.
 */

export const headingRecipe = defineRecipe({
  base: { fontWeight: "bold" },
  variants: {
    size: {
      xs: { fontSize: "sm", lineHeight: 1.2 },
      sm: { fontSize: "md", lineHeight: 1.2 },
      md: { fontSize: "xl", lineHeight: 1.2 },
      lg: {
        fontSize: { base: "2xl", md: "3xl" },
        lineHeight: { base: 1.33, md: 1.2 },
      },
      xl: {
        fontSize: { base: "3xl", md: "4xl" },
        lineHeight: { base: 1.33, md: 1.2 },
      },
      "2xl": {
        fontSize: { base: "4xl", md: "5xl" },
        lineHeight: { base: 1.2, md: 1 },
      },
      "3xl": { fontSize: { base: "5xl", md: "6xl" }, lineHeight: 1 },
      "4xl": { fontSize: { base: "6xl", md: "7xl" }, lineHeight: 1 },
    },
  },
});

/** v2 button sizes; merged into the app's button recipe. */
export const buttonSizes = {
  xs: { h: "6", minW: "6", fontSize: "xs", px: "2" },
  sm: { h: "8", minW: "8", fontSize: "sm", px: "3" },
  md: { h: "10", minW: "10", fontSize: "md", px: "4" },
  lg: { h: "12", minW: "12", fontSize: "lg", px: "6" },
} as const;

export const inputRecipe = defineRecipe({
  variants: {
    size: {
      xs: { fontSize: "xs", "--input-height": "sizes.6" },
      sm: { fontSize: "sm", "--input-height": "sizes.8" },
      md: { fontSize: "md", px: "4", "--input-height": "sizes.10" },
      lg: { fontSize: "lg", "--input-height": "sizes.12" },
    },
  },
});

export const textareaRecipe = defineRecipe({
  variants: {
    size: {
      sm: { fontSize: "sm" },
      md: { fontSize: "md", px: "4" },
      lg: { fontSize: "lg" },
    },
  },
});

export const nativeSelectSlotRecipe = defineSlotRecipe({
  slots: ["root", "field", "indicator"],
  variants: {
    size: {
      sm: { root: { "--select-field-height": "sizes.8" }, field: { fontSize: "sm" } },
      md: { root: { "--select-field-height": "sizes.10" }, field: { fontSize: "md" } },
      lg: { root: { "--select-field-height": "sizes.12" }, field: { fontSize: "lg" } },
    },
  },
});

export const containerRecipe = defineRecipe({
  base: { maxWidth: "60ch", px: "4" },
});
