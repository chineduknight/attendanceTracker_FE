import { applyRoutePermissions } from "routes/protectedRoutes";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";
import { PROTECTED_PATHS } from "routes/pagePath";
import { RequirePermission } from "rbac/RequirePermission";
import { RequireFeature } from "routes/RequireFeature";

describe("applyRoutePermissions", () => {
  it("wraps routes that declare a permission in RequirePermission", () => {
    const [route] = applyRoutePermissions([
      {
        path: PROTECTED_PATHS.FINANCE,
        element: <div>finance page</div>,
        title: "Finance",
        perm: "finance.view",
      },
    ]);

    expect(route.element.type).toBe(RequirePermission);
    expect(route.element.props.perm).toBe("finance.view");
    expect(route.path).toBe(PROTECTED_PATHS.FINANCE);
  });

  it("leaves routes without a permission unwrapped", () => {
    const element = <div>dashboard page</div>;
    const [route] = applyRoutePermissions([
      { path: PROTECTED_PATHS.DASHBOARD, element, title: "Dashboard" },
    ]);

    expect(route.element).toBe(element);
  });

  it("applies the wrapper to exactly the routes that declare a permission", () => {
    const routes = applyRoutePermissions(PAGE_ROUTES);

    PAGE_ROUTES.forEach((original, index) => {
      const element = routes[index].element;
      if (original.feature) {
        // RBAC first, then visibility inside it.
        expect(element.type).toBe(RequirePermission);
        expect(element.props.children.type).toBe(RequireFeature);
        expect(element.props.children.props.feature).toBe(original.feature);
      } else if (original.perm) {
        expect(element.type).toBe(RequirePermission);
      } else {
        expect(routes[index].element).toBe(original.element);
      }
    });
  });
});
