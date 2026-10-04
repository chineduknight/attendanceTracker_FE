import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";
import { PageRouteConfig, PAGE_ROUTES } from "./protectedRouteConfig";
import ProtectedLayout from "components/ProtectedLayout";
import { RequirePermission } from "rbac/RequirePermission";

/**
 * Wrap each route element that declares a permission in RequirePermission.
 * Hiding dashboard buttons alone can be bypassed by typing a URL, so every
 * guarded route is re-checked here at navigation time.
 */
export const applyRoutePermissions = (routes: PageRouteConfig[]) =>
  routes.map(({ perm, element, ...route }) => ({
    ...route,
    element: perm ? (
      <RequirePermission perm={perm}>{element}</RequirePermission>
    ) : (
      element
    ),
  }));

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
