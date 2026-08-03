import { extendTheme } from "@chakra-ui/react";
import { ButtonStyles as Button } from "./components/buttonStyles";

// custom themes in chakra UI
// https://chakra-ui.com/docs/theming/customize-theme
// https://www.easyreact.com/articles/chakra-ui-customisations

const myTheme = extendTheme({
  fonts: {
    heading: "Palanquin",
    body: "Palanquin",
  },
  colors: {
    primary: "#3182CE", // blue.500 — the color every header already uses
    primaryHover: "#2B6CB0", // blue.600 — hover state for primary-colored surfaces
    secondary: "#2FA07224",
  },
  components: {
    Button, // Has to match to the name of the component
  },
});

export default myTheme;
