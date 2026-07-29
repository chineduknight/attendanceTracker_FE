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
    secondary: "#2FA07224",
  },
  components: {
    Button, // Has to match to the name of the component
  },
});

export default myTheme;
