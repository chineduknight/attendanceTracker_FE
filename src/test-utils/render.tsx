import { ReactElement, ReactNode } from "react";
import {
  act,
  fireEvent,
  render as rtlRender,
  RenderOptions,
  screen,
  waitFor,
  within,
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
 * changes once the parent has applied the new value). Pending effects are
 * flushed first, as a real tap never lands in the same tick as the mount: a
 * react-hook-form controller subscribes in an effect and would miss a change
 * made before it.
 */
export const toggle = async (input: HTMLElement) => {
  const root = input.closest<HTMLElement>('[data-part="root"][data-state]');
  if (!root) throw new Error("toggle(): not inside a checkbox/switch root");
  const before = root.getAttribute("data-state");
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  fireEvent.click(input);
  await waitFor(() => expect(root.getAttribute("data-state")).not.toBe(before));
};

/**
 * Choose a v3 menu item the way a tap or mouse press does: pointerdown
 * highlights it and, once that has been applied (a real press always comes
 * before the lift), the click selects the highlighted item. A bare click,
 * or one in the same tick as the press, selects nothing.
 */
export const chooseMenuItem = async (item: HTMLElement) => {
  fireEvent.pointerDown(item);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  fireEvent.click(item);
};

/** Select a v3 tab and wait for the switch to apply (it is asynchronous). */
export const selectTab = async (tab: HTMLElement) => {
  fireEvent.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
};

/**
 * Answer the open ConfirmDialog (useConfirm) by clicking one of its buttons,
 * e.g. "Delete" or "Cancel". Returns the dialog so callers can check its
 * title and body; it opens asynchronously, so this waits for it.
 */
export const confirmInDialog = async (button: string | RegExp) => {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: button }));
  return dialog;
};
