import { screen } from "@testing-library/react";
import { render } from "test-utils/render";
import PageContainer from "components/layout/PageContainer";

// jsdom can't compute dvh/env(); read the generated rules for this element.
const rulesFor = (element: HTMLElement) =>
  Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules) as CSSStyleRule[])
    .filter((rule) => Array.from(element.classList).some((cls) => rule.selectorText === `.${cls}`))
    .map((rule) => rule.cssText)
    .join(" ");

describe("<PageContainer>", () => {
  it("is the page's main landmark, fills the visible screen and clears the home bar", () => {
    render(
      <PageContainer width="form" data-testid="page-content">
        <p>page body</p>
      </PageContainer>,
    );
    const page = screen.getByRole("main");
    const content = screen.getByTestId("page-content");

    expect(rulesFor(page)).toContain("min-height: 100dvh");
    expect(rulesFor(page)).toContain("var(--chakra-colors-bg-subtle)");
    expect(rulesFor(content)).toContain("max-width: var(--chakra-sizes-md)");
    expect(rulesFor(content)).toContain("env(safe-area-inset-bottom)");
  });
});
