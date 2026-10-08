import { screen } from "@testing-library/react";
import { generatedCss, render } from "test-utils/render";
import PageContainer from "components/layout/PageContainer";

describe("<PageContainer>", () => {
  it("is the page's main landmark and grows into the shell's page area", () => {
    render(
      <PageContainer width="form" data-testid="page-content">
        <p>page body</p>
      </PageContainer>,
    );
    const page = generatedCss(screen.getByRole("main"));

    // The shell owns the screen height (see ProtectedLayout); the page only
    // fills what is left, so it never claims a viewport of its own.
    expect(page).toContain("flex: 1");
    expect(page).not.toContain("100dvh");
    expect(page).not.toContain("100vh");
    expect(page).toContain("var(--chakra-colors-bg-subtle)");
  });

  it("keeps a readable width, standard padding and the home-bar inset", () => {
    render(
      <PageContainer width="form" data-testid="page-content">
        <p>page body</p>
      </PageContainer>,
    );
    const content = generatedCss(screen.getByTestId("page-content"));

    expect(content).toContain("max-width: var(--chakra-sizes-md)");
    expect(content).toContain("padding-inline: var(--chakra-spacing-4)");
    expect(content).toContain("env(safe-area-inset-bottom)");
  });
});
