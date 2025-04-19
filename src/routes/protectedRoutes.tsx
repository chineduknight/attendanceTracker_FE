import WithSuspense from "components/HOC/WithSuspense";
import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";

const Dashboard = WithSuspense(lazy(() => import("pages/Dashboard")));
const UserModel = WithSuspense(lazy(() => import("pages/UserModel")));
const Category = WithSuspense(lazy(() => import("pages/Category")));
const SubCategory = WithSuspense(lazy(() => import("pages/SubCategory")));
const MarkAttendance = WithSuspense(lazy(() => import("pages/MarkAttendance")));
const CreateAttendance = WithSuspense(
  lazy(() => import("pages/CreateAttendance"))
);
const AddMember = WithSuspense(lazy(() => import("pages/AddMember")));
const Attendance = WithSuspense(lazy(() => import("pages/ViewAttendance")));
const OrgList = WithSuspense(lazy(() => import("pages/Organisations")));
const AllAttendance = WithSuspense(lazy(() => import("pages/AllAttendance")));
const ViewMembers = WithSuspense(lazy(() => import("pages/ViewMembers")));
const Analytics = WithSuspense(lazy(() => import("pages/Analytics")));
const AddOrganisation = WithSuspense(
  lazy(() => import("pages/AddOrganisation"))
);

const {
  DASHBOARD,
  ADD_ORG,
  ALL_ORG,
  USER_MODEL,
  CATEGORY,
  SUB_CATEGORY,
  ADD_MEMBER,
  UPDATE_MEMBER,
  CREATE_ATTENDANCE,
  MARK_ATTENANCE,
  ATTENDANCE,
  ALL_ATTENDANCE,
  VIEW_MEMBER,
  UPDATE_ATTENANCE,
  ANALYTICS,
} = PROTECTED_PATHS;

const PROTECTED_ROUTES = [
  { path: ALL_ORG, element: <OrgList /> },
  { path: DASHBOARD, element: <Dashboard /> },
  { path: ADD_ORG, element: <AddOrganisation /> },
  { path: USER_MODEL, element: <UserModel /> },
  { path: CATEGORY, element: <Category /> },
  { path: SUB_CATEGORY, element: <SubCategory /> },
  { path: ADD_MEMBER, element: <AddMember /> },
  { path: UPDATE_MEMBER, element: <AddMember /> },
  { path: MARK_ATTENANCE, element: <MarkAttendance /> },
  { path: UPDATE_ATTENANCE, element: <MarkAttendance /> },
  { path: CREATE_ATTENDANCE, element: <CreateAttendance /> },
  { path: ATTENDANCE, element: <Attendance /> },
  { path: ALL_ATTENDANCE, element: <AllAttendance /> },
  { path: VIEW_MEMBER, element: <ViewMembers /> },
  { path: ANALYTICS, element: <Analytics /> },

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
