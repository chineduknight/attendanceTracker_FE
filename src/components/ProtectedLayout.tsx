import { Box } from "@chakra-ui/react";
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

  // The shell owns the screen height: header + page area fill at least the
  // visible screen (100dvh), and the page area takes whatever the header
  // leaves (its height varies with the iOS safe area, so never subtract it).
  // PageContainer grows into the page area with flex="1".
  return (
    <Box minH="100dvh" display="flex" flexDirection="column" data-testid="app-shell">
      <AppHeader
        title={current ? resolveText(current.title, terms) : "Attendance Tracker"}
        showBack={current?.showBack ?? true}
      />
      <Box
        flex="1"
        minH={0}
        display="flex"
        flexDirection="column"
        data-testid="app-page-area"
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default ProtectedLayout;
