import { createSystem, defaultConfig } from "@chakra-ui/react";
import { ButtonStyles as Button } from "./components/buttonStyles";

// custom themes in chakra UI
// https://chakra-ui.com/docs/theming/customize-theme
// https://www.easyreact.com/articles/chakra-ui-customisations

const myTheme = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: {
          value: "Palanquin",
        },
        body: {
          value: "Palanquin",
        },
      },

      colors: {
        primary: {
          value: "#3182CE",
        }, // blue.500 — the color every header already uses
        primaryHover: {
          value: "#2B6CB0",
        }, // blue.600 — hover state for primary-colored surfaces
        secondary: {
          value: "#2FA07224",
        },
      },
    },
  },

  components: {
    Button, // Has to match to the name of the component
  },
});

export default myTheme;
