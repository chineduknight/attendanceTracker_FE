import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import TruncatedText from "components/TruncatedText";

const EMAIL = "ibrahim.musa@demochoir.test";

// jsdom does no layout, so widths are stubbed to fake an overflow. Like a
// browser, a node no longer on the page measures 0 wide.
const stubWidths = (scrollWidth: number, clientWidth: number) => {
  jest
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      return this.isConnected ? scrollWidth : 0;
    });
  jest
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      return this.isConnected ? clientWidth : 0;
    });
};

// jsdom has no ResizeObserver; browsers do, and it fires on real resizes.
let resizeCallbacks: (() => void)[] = [];
class ResizeObserverStub {
  constructor(private callback: () => void) {}
  observe() {
    resizeCallbacks.push(this.callback);
  }
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((cb) => cb !== this.callback);
  }
  unobserve() {}
}

const renderText = () =>
  render(
    <ChakraProvider>
      <TruncatedText>{EMAIL}</TruncatedText>
    </ChakraProvider>
  );

describe("<TruncatedText>", () => {
  beforeEach(() => {
    resizeCallbacks = [];
    (window as any).ResizeObserver = ResizeObserverStub;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).ResizeObserver;
  });

  it("stays plain text when the value fits", () => {
    stubWidths(100, 100);
    renderText();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("expands a cut-off value on tap and collapses it on a second tap", () => {
    stubWidths(300, 100);
    renderText();
    const toggle = screen.getByRole("button", { name: EMAIL });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("stays tappable when the browser reports a resize after the overflow is found", () => {
    stubWidths(300, 100);
    renderText();
    const before = screen.getByRole("button", { name: EMAIL });
    act(() => resizeCallbacks.forEach((cb) => cb()));

    const after = screen.getByRole("button", { name: EMAIL });
    expect(after).toBe(before);
    fireEvent.click(after);
    expect(after).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles from the keyboard", () => {
    stubWidths(300, 100);
    renderText();
    const toggle = screen.getByRole("button", { name: EMAIL });
    fireEvent.keyDown(toggle, { key: "Enter" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(toggle, { key: " " });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
