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
  // blue.600 / blue.700 (v2): white title text is 5.4:1 (blue.500 was 4.0:1).
  light: { base: "#2B6CB0", hover: "#2C5282" },
  dark: { base: "#2C5282", hover: "#2A4365" }, // blue.700 / blue.800
} as const;

/**
 * White text on Chakra's orange/green/teal/cyan `.solid` (their 600 shade)
 * is only 3.3-3.7:1. A "650" step between 600 and 700 keeps the colour
 * recognisable at 5:1+, so every solid button, badge, avatar, attendance row
 * and summary tile in these palettes stays readable in both modes. Blue,
 * pink, red and purple already pass at 600. Values: Tailwind's 700 shades.
 */
const SOLID_650 = {
  orange: "#c2410c",
  green: "#15803d",
  teal: "#0f766e",
  cyan: "#0e7490",
} as const;

const solid650Tokens = Object.fromEntries(
  Object.entries(SOLID_650).map(([palette, hex]) => [palette, { 650: { value: hex } }]),
);
// The fill is the same deep shade in both modes, so the text on it is white
// in both too (Chakra's orange switches to black in dark: 4.06:1 on 650).
const solid650Semantic = Object.fromEntries(
  Object.keys(SOLID_650).map((palette) => [
    palette,
    {
      solid: { value: `{colors.${palette}.650}` },
      contrast: { value: "{colors.white}" },
    },
  ]),
);

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
        ...solid650Tokens,
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
        ...solid650Semantic,
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
