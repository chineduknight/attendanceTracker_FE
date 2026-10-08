import { ReactElement, ReactNode } from "react";
import {
  fireEvent,
  render as rtlRender,
  RenderOptions,
  waitFor,
} from "@testing-library/react";
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

/**
 * Click a v3 checkbox/switch and wait until the component itself has flipped.
 * Ark applies the change asynchronously, and the native input flips at once
 * regardless, so wait on the root's data-state (which, when controlled, only
 * changes once the parent has applied the new value).
 */
export const toggle = async (input: HTMLElement) => {
  const root = input.closest<HTMLElement>('[data-part="root"][data-state]');
  if (!root) throw new Error("toggle(): not inside a checkbox/switch root");
  const before = root.getAttribute("data-state");
  fireEvent.click(input);
  await waitFor(() => expect(root.getAttribute("data-state")).not.toBe(before));
};
