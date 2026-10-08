import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";
import { PageRouteConfig, PAGE_ROUTES } from "./protectedRouteConfig";
import ProtectedLayout from "components/ProtectedLayout";
import { RequirePermission } from "rbac/RequirePermission";
import { RequireFeature } from "./RequireFeature";

/**
 * Wrap each route element in its guards. Hiding dashboard buttons alone can be
 * bypassed by typing a URL, so every route is re-checked at navigation time:
 * RBAC first (the authorization boundary), then whether the org shows the
 * module at all.
 */
export const applyRoutePermissions = (routes: PageRouteConfig[]) =>
  routes.map(({ perm, feature, element, ...route }) => {
    const shown = feature ? (
      <RequireFeature feature={feature}>{element}</RequireFeature>
    ) : (
      element
    );
    return {
      ...route,
      element: perm ? <RequirePermission perm={perm}>{shown}</RequirePermission> : shown,
    };
  });

const PROTECTED_ROUTES = [
  {
    element: <ProtectedLayout />,
    children: applyRoutePermissions(PAGE_ROUTES),
  },
  { path: "/", element: <Navigate to={PROTECTED_PATHS.ALL_ORG} /> },
  // this enables you not to access the public routes when logged in
  ...Object.values(PUBLIC_PATHS).map((route) => {
    return {
      path: route,
      element: <Navigate to="/" />,
    };
  }),
  { path: "*", element: <div>Page not found</div> },
];

export default PROTECTED_ROUTES;
