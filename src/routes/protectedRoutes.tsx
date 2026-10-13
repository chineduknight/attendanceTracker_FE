import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";
import { PageRouteConfig, PAGE_ROUTES } from "./protectedRouteConfig";
import ProtectedLayout from "components/ProtectedLayout";
import { RequirePermission } from "rbac/RequirePermission";
import { RequireFeature } from "./RequireFeature";
import { RequireOrganisation } from "./RequireOrganisation";
import { ProtectedNotFound } from "pages/NotFound";

/**
 * Wrap each route element in its guards. Hiding dashboard buttons alone can be
 * bypassed by typing a URL, so every route is re-checked at navigation time:
 * a selected organisation first (permissions mean nothing without one), then
 * RBAC (the authorization boundary), then whether the org shows the module.
 */
export const applyRoutePermissions = (routes: PageRouteConfig[]) =>
  routes.map(({ perm, feature, needsOrganisation = true, element, ...route }) => {
    const shown = feature ? (
      <RequireFeature feature={feature}>{element}</RequireFeature>
    ) : (
      element
    );
    const permitted = perm ? <RequirePermission perm={perm}>{shown}</RequirePermission> : shown;
    return {
      ...route,
      element: needsOrganisation ? <RequireOrganisation>{permitted}</RequireOrganisation> : permitted,
    };
  });

const PROTECTED_ROUTES = [
  {
    element: <ProtectedLayout />,
    // The unknown-address page sits inside the shell so the header and
    // menu stay available.
    children: [...applyRoutePermissions(PAGE_ROUTES), { path: "*", element: <ProtectedNotFound /> }],
  },
  { path: "/", element: <Navigate to={PROTECTED_PATHS.ALL_ORG} /> },
  // this enables you not to access the public routes when logged in
  ...Object.values(PUBLIC_PATHS).map((route) => {
    return {
      path: route,
      element: <Navigate to="/" />,
    };
  }),
];

export default PROTECTED_ROUTES;
