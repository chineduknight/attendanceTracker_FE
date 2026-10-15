import { useEffect } from "react";
import { Box } from "@chakra-ui/react";
import { Outlet, useLocation, matchRoutes } from "react-router-dom";
import AppHeader from "components/AppHeader";
import { PAGE_ROUTES, PageRouteConfig } from "routes/protectedRouteConfig";
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";
import { usePermissions } from "rbac/usePermissions";
import { usePrefetchMemberModel } from "hooks/useMemberModel";
import useGlobalStore from "zStore";
import { useTerms } from "hooks/useOrgPresentation";
import { resolveText } from "config/presentationLabels";
import { APP_NAME } from "config/app";
import { preloadPages } from "routes/lazyPage";

// Long enough for the page the officer opened to fetch its own code and data
// first; the other pages then download in the background.
const PRELOAD_DELAY_MS = 2000;

const ProtectedLayout = () => {
  const location = useLocation();
  useSyncSelectedOrg();
  const terms = useTerms();
  const organisationId = useGlobalStore((state) => state.organisation.id);
  const { has } = usePermissions();
  // Most pages read the member model; reading it needs members.view, so an
  // officer without it never sends a request the backend would refuse.
  usePrefetchMemberModel(organisationId, has("members.view"));

  // Fetch every page's code once signed in, so moving between pages does not
  // wait on a download and show "Loading page..." before the page's own loader.
  useEffect(() => {
    const timer = window.setTimeout(preloadPages, PRELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

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
        title={current ? resolveText(current.title, terms) : APP_NAME}
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
