import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { buttonRecipe } from "./components/buttonStyles";
import {
  containerRecipe,
  headingRecipe,
  inputRecipe,
  nativeSelectSlotRecipe,
  textareaRecipe,
} from "./components/v2Parity";

/**
 * The brand bar (header, drawer banner) sits behind white text, so dark mode
 * deepens it rather than lightening it. Also drives the browser theme-color.
 */
export const BRAND_BAR = {
  light: { base: "#3182CE", hover: "#2B6CB0" }, // blue.500 / blue.600
  dark: { base: "#2C5282", hover: "#2A4365" }, // blue.700 / blue.800
} as const;

// https://chakra-ui.com/docs/theming/overview
const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        heading: { value: "Palanquin" },
        body: { value: "Palanquin" },
      },
      colors: {
        secondary: { value: "#2FA07224" },
      },
    },
    semanticTokens: {
      colors: {
        primary: {
          value: { base: BRAND_BAR.light.base, _dark: BRAND_BAR.dark.base },
        },
        primaryHover: {
          value: { base: BRAND_BAR.light.hover, _dark: BRAND_BAR.dark.hover },
        },
      },
    },
    recipes: {
      button: buttonRecipe,
      heading: headingRecipe,
      input: inputRecipe,
      textarea: textareaRecipe,
      container: containerRecipe,
    },
    slotRecipes: {
      nativeSelect: nativeSelectSlotRecipe,
    },
  },
});

export const system = createSystem(defaultConfig, config);
