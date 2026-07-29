import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";
import { PAGE_ROUTES } from "./protectedRouteConfig";
import ProtectedLayout from "components/ProtectedLayout";

const PROTECTED_ROUTES = [
  {
    element: <ProtectedLayout />,
    children: PAGE_ROUTES,
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
