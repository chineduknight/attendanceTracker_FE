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
 * Pick an option from one of the app's dropdowns (ThemedSelect /
 * OptionSelect): open it from its input the way the keyboard does, then
 * click the option in the portalled menu. `input` is the element found by
 * its label, e.g. `screen.getByLabelText("Role")`.
 */
export const chooseOption = async (input: HTMLElement, option: string | RegExp) => {
  fireEvent.click(await openOption(input, option));
};

/**
 * Open a dropdown and wait for one of its options. Options that load after
 * the menu opened can re-render it closed, so it is reopened until the
 * option shows.
 */
export const openOption = async (
  input: HTMLElement,
  option: string | RegExp,
): Promise<HTMLElement> => {
  // Not inside waitFor: opening the menu mutates the DOM, which would re-run
  // the callback and reopen it in a loop that starves the timeout.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!screen.queryByRole("option", { name: option })) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    const found = await screen
      .findByRole("option", { name: option }, { timeout: 200 })
      .catch(() => null);
    if (found) return found;
  }
  throw new Error(`openOption(): no option ${String(option)}`);
};

/** The labels a dropdown offers: opens its menu, reads it, closes it. */
export const optionLabels = async (input: HTMLElement): Promise<string[]> => {
  fireEvent.keyDown(input, { key: "ArrowDown" });
  const labels = (await screen.findAllByRole("option")).map(
    (option) => option.textContent ?? "",
  );
  fireEvent.keyDown(input, { key: "Escape" });
  return labels;
};

/** The value a single-value dropdown shows (its placeholder when empty). */
export const shownValue = (input: HTMLElement): string =>
  input.closest<HTMLElement>('[class*="-container"]')?.textContent ?? "";

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

/**
 * The CSS Chakra generated for an element's own classes. jsdom does no layout
 * and cannot compute dvh/env(), so layout contracts are checked on the rules.
 */
export const generatedCss = (element: HTMLElement) =>
  Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules) as CSSStyleRule[])
    .filter((rule) =>
      Array.from(element.classList).some((cls) => rule.selectorText === `.${cls}`),
    )
    .map((rule) => rule.cssText)
    .join(" ");
