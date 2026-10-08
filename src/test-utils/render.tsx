import { ReactElement, ReactNode } from "react";
import { render as rtlRender, RenderOptions } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { system } from "styles/theme";

const ChakraWrapper = ({ children }: { children: ReactNode }) => (
  <ChakraProvider value={system}>{children}</ChakraProvider>
);

/**
 * Testing Library's render inside the app's Chakra system. Chakra v3
 * components throw without a provider (v2 tolerated a bare render).
 */
export const render = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) => rtlRender(ui, { wrapper: ChakraWrapper, ...options });
