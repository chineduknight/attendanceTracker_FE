import { screen } from "@testing-library/react";
import { MemoryRouter, useRoutes } from "react-router-dom";
import { render } from "test-utils/render";
import PUBLIC_ROUTES from "routes/publicRoutes";
import PROTECTED_ROUTES from "routes/protectedRoutes";
import ProtectedLayout from "components/ProtectedLayout";
import { ProtectedNotFound } from "pages/NotFound";

const PublicApp = () => useRoutes(PUBLIC_ROUTES);

describe("Page not found", () => {
  it("offers a way back to sign in when signed out", () => {
    render(
      <MemoryRouter initialEntries={["/no-such-page"]}>
        <PublicApp />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
  });

  it("offers a way back to the organisations when signed in", () => {
    render(
      <MemoryRouter>
        <ProtectedNotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to organisations" })).toHaveAttribute("href", "/organisations");
  });

  it("keeps the signed-in not-found page inside the app shell (header and menu)", () => {
    const shell = PROTECTED_ROUTES.find((route) => route.element?.type === ProtectedLayout);
    // `children` here is the route config's, not a DOM node's.
    // eslint-disable-next-line testing-library/no-node-access
    const catchAll = shell?.children?.find((route) => route.path === "*");
    expect(catchAll?.element.type).toBe(ProtectedNotFound);
    // Nothing outside the shell swallows unknown addresses first.
    expect(PROTECTED_ROUTES.some((route) => route.path === "*")).toBe(false);
  });
});
