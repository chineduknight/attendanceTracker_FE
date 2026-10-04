import { applyRoutePermissions } from "routes/protectedRoutes";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";
import { PROTECTED_PATHS } from "routes/pagePath";
import { RequirePermission } from "rbac/RequirePermission";

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
      if (original.perm) {
        expect(routes[index].element.type).toBe(RequirePermission);
      } else {
        expect(routes[index].element).toBe(original.element);
      }
    });
  });
});
