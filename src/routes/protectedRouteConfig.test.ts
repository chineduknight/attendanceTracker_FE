import { matchRoutes } from "react-router-dom";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";
import { PROTECTED_PATHS } from "routes/pagePath";

describe("PAGE_ROUTES", () => {
  it("gives every route a non-empty title", () => {
    PAGE_ROUTES.forEach((route) => {
      expect(route.title.trim().length).toBeGreaterThan(0);
    });
  });

  it("only hides the back button on Dashboard and Organisations", () => {
    const noBack = PAGE_ROUTES.filter((r) => r.showBack === false).map((r) => r.path);
    expect(noBack.sort()).toEqual(
      [PROTECTED_PATHS.DASHBOARD, PROTECTED_PATHS.ALL_ORG].sort()
    );
  });

  it("resolves every route's own path to itself via matchRoutes", () => {
    PAGE_ROUTES.forEach((route) => {
      const concretePath = route.path.replace(/:[^/]+/g, "test-id");
      const matches = matchRoutes(PAGE_ROUTES, concretePath);
      const winner = matches?.[matches.length - 1]?.route;
      expect(winner?.path).toBe(route.path);
    });
  });
});
