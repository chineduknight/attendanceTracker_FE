import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import TruncatedText from "components/TruncatedText";

const EMAIL = "ibrahim.musa@demochoir.test";

// jsdom does no layout, so widths are stubbed to fake an overflow.
const stubWidths = (scrollWidth: number, clientWidth: number) => {
  jest
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(scrollWidth);
  jest
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(clientWidth);
};

const renderText = () =>
  render(
    <ChakraProvider>
      <TruncatedText>{EMAIL}</TruncatedText>
    </ChakraProvider>
  );

describe("<TruncatedText>", () => {
  afterEach(() => jest.restoreAllMocks());

  it("stays plain text when the value fits", () => {
    stubWidths(100, 100);
    renderText();
    expect(screen.getByText(EMAIL).tagName).toBe("P");
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
});
