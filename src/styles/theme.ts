import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { buttonRecipe } from "./components/buttonStyles";
import {
  containerRecipe,
  headingRecipe,
  inputRecipe,
  nativeSelectSlotRecipe,
  textareaRecipe,
} from "./components/v2Parity";

// https://chakra-ui.com/docs/theming/overview
const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        heading: { value: "Palanquin" },
        body: { value: "Palanquin" },
      },
      colors: {
        primary: { value: "#3182CE" }, // blue.500 — the color every header already uses
        primaryHover: { value: "#2B6CB0" }, // blue.600 — hover state for primary-colored surfaces
        secondary: { value: "#2FA07224" },
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
