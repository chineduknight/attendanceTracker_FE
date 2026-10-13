import { ReactElement } from "react";
import { applyRoutePermissions } from "routes/protectedRoutes";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";
import { PROTECTED_PATHS } from "routes/pagePath";
import { RequirePermission } from "rbac/RequirePermission";
import { RequireFeature } from "routes/RequireFeature";
import { RequireOrganisation } from "routes/RequireOrganisation";

/** The element inside the selected-organisation guard. */
const insideOrganisationGuard = (element: ReactElement) => {
  expect(element.type).toBe(RequireOrganisation);
  return element.props.children as ReactElement;
};

describe("applyRoutePermissions", () => {
  it("wraps routes that declare a permission in RequirePermission, inside the organisation guard", () => {
    const [route] = applyRoutePermissions([
      {
        path: PROTECTED_PATHS.FINANCE,
        element: <div>finance page</div>,
        title: "Finance",
        perm: "finance.view",
      },
    ]);

    const guarded = insideOrganisationGuard(route.element);
    expect(guarded.type).toBe(RequirePermission);
    expect(guarded.props.perm).toBe("finance.view");
    expect(route.path).toBe(PROTECTED_PATHS.FINANCE);
  });

  it("guards a route without a permission by the organisation only", () => {
    const element = <div>dashboard page</div>;
    const [route] = applyRoutePermissions([
      { path: PROTECTED_PATHS.DASHBOARD, element, title: "Dashboard" },
    ]);

    expect(insideOrganisationGuard(route.element)).toBe(element);
  });

  it("leaves a route that needs no organisation unwrapped", () => {
    const element = <div>organisations</div>;
    const [route] = applyRoutePermissions([
      { path: PROTECTED_PATHS.ALL_ORG, element, title: "Organisations", needsOrganisation: false },
    ]);

    expect(route.element).toBe(element);
  });

  it("only the organisation picker and Add Org work without a selected organisation", () => {
    const routes = applyRoutePermissions(PAGE_ROUTES);
    const unguarded = PAGE_ROUTES.filter(
      (_, index) => routes[index].element.type !== RequireOrganisation,
    ).map((route) => route.path);
    expect(unguarded.sort()).toEqual([PROTECTED_PATHS.ADD_ORG, PROTECTED_PATHS.ALL_ORG].sort());
  });

  it("applies the permission and feature guards to exactly the routes that declare them", () => {
    // Each route's guard chain, outermost first, e.g. "organisation > finance.view > feature:finance".
    const chain = (element: ReactElement): string[] => {
      if (element.type === RequireOrganisation) return ["organisation", ...chain(element.props.children)];
      if (element.type === RequirePermission) return [element.props.perm, ...chain(element.props.children)];
      if (element.type === RequireFeature) return [`feature:${element.props.feature}`, ...chain(element.props.children)];
      return [];
    };
    const routes = applyRoutePermissions(PAGE_ROUTES);

    // RBAC first, then visibility inside it, all inside the organisation guard.
    const expected = PAGE_ROUTES.map((route) => [
      ...(route.needsOrganisation === false ? [] : ["organisation"]),
      ...(route.perm ? [route.perm] : []),
      ...(route.feature ? [`feature:${route.feature}`] : []),
    ].join(" > "));
    expect(routes.map((route) => chain(route.element).join(" > "))).toEqual(expected);
    // Underneath the guards is the page itself.
    const innermost = (element: ReactElement): ReactElement =>
      [RequireOrganisation, RequirePermission, RequireFeature].includes(element.type as never)
        ? innermost(element.props.children)
        : element;
    expect(routes.map((route) => innermost(route.element))).toEqual(PAGE_ROUTES.map((route) => route.element));
  });
});
