import { Outlet, useLocation, matchPath } from "react-router-dom";
import AppHeader from "components/AppHeader";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";

const ProtectedLayout = () => {
  const location = useLocation();
  const current = PAGE_ROUTES.find((route) =>
    matchPath({ path: route.path, end: true }, location.pathname)
  );

  return (
    <>
      <AppHeader
        title={current?.title ?? "Attendance Tracker"}
        showBack={current?.showBack ?? true}
      />
      <Outlet />
    </>
  );
};

export default ProtectedLayout;
