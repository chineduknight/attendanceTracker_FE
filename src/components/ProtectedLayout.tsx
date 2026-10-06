import { Outlet, useLocation, matchRoutes } from "react-router-dom";
import AppHeader from "components/AppHeader";
import { PAGE_ROUTES, PageRouteConfig } from "routes/protectedRouteConfig";
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";
import { useTerms } from "hooks/useOrgPresentation";
import { resolveText } from "config/presentationLabels";

const ProtectedLayout = () => {
  const location = useLocation();
  useSyncSelectedOrg();
  const terms = useTerms();

  const matches = matchRoutes(PAGE_ROUTES, location.pathname);
  // react-router-dom 6.3's matchRoutes() is not generic, so RouteMatch.route
  // is typed as the base RouteObject and loses PAGE_ROUTES' custom fields
  // (title, showBack). The cast is safe because every element in PAGE_ROUTES
  // is a PageRouteConfig, so any matched route is one too.
  const current = matches?.[matches.length - 1]?.route as
    | PageRouteConfig
    | undefined;

  return (
    <>
      <AppHeader
        title={current ? resolveText(current.title, terms) : "Attendance Tracker"}
        showBack={current?.showBack ?? true}
      />
      <Outlet />
    </>
  );
};

export default ProtectedLayout;
