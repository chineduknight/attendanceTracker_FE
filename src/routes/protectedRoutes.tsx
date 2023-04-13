import WithSuspense from "components/HOC/WithSuspense";
import LoginUser from "pages/loginUser";
import Login from 'pages/Login';
import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";

const Dashboard = WithSuspense(lazy(() => import("pages/Dashboard")));
const UserModel = WithSuspense(lazy(() => import("pages/UserModel")));
const MarkAttendance = WithSuspense(lazy(() => import("pages/MarkAttendance")));
const CreateAttendance = WithSuspense(
  lazy(() => import("pages/CreateAttendance"))
);
const AddMember = WithSuspense(lazy(() => import("pages/AddMember")));
const OrgList = WithSuspense(lazy(() => import("pages/Orglist")));
const AddOrganisation = WithSuspense(
  lazy(() => import("pages/AddOrganisation"))
);

const {
  DASHBOARD,
  ADD_ORG,
  ALL_ORG,
  USER_MODEL,
  ADD_MEMBER,
  CREATE_ATTENDANCE,
  MARK_ATTENANCE,
  LOGIN_USER,
  LOGIN,
} = PROTECTED_PATHS;

const PROTECTED_ROUTES = [
  { path: ALL_ORG, element: <OrgList /> },
  { path: DASHBOARD, element: <Dashboard /> },
  { path: ADD_ORG, element: <AddOrganisation /> },
  { path: USER_MODEL, element: <UserModel /> },
  { path: ADD_MEMBER, element: <AddMember /> },
  { path: MARK_ATTENANCE, element: <MarkAttendance /> },
  { path: CREATE_ATTENDANCE, element: <CreateAttendance /> },
  { path: LOGIN_USER, element: <LoginUser /> },
  { path: LOGIN, element: <Login /> },
  { path: "/", element: <Navigate to={ALL_ORG} /> },
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
