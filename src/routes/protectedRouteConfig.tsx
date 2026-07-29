import WithSuspense from "components/HOC/WithSuspense";
import { lazy } from "react";
import { PROTECTED_PATHS } from "./pagePath";

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
const MemberAnalytics = WithSuspense(lazy(() => import("pages/MemberAnalytics")));
const Birthday = WithSuspense(lazy(() => import("pages/Birthday")));
const Finance = WithSuspense(lazy(() => import("pages/Finance")));
const OfficersRoles = WithSuspense(lazy(() => import("pages/OfficersRoles")));
const AddOrganisation = WithSuspense(
  lazy(() => import("pages/AddOrganisation"))
);
const OrganisationSettings = WithSuspense(
  lazy(() => import("pages/OrganisationSettings"))
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
  MEMBER_ANALYTICS,
  BIRTHDAY,
  FINANCE,
  OFFICERS_ROLES,
  SETTINGS,
} = PROTECTED_PATHS;

export type PageRouteConfig = {
  path: string;
  element: JSX.Element;
  title: string;
  showBack?: boolean;
};

export const PAGE_ROUTES: PageRouteConfig[] = [
  { path: ALL_ORG, element: <OrgList />, title: "Organisations", showBack: false },
  { path: DASHBOARD, element: <Dashboard />, title: "Dashboard", showBack: false },
  { path: ADD_ORG, element: <AddOrganisation />, title: "New Organisation" },
  { path: USER_MODEL, element: <UserModel />, title: "User Model" },
  { path: CATEGORY, element: <Category />, title: "Create Category" },
  { path: SUB_CATEGORY, element: <SubCategory />, title: "Create Sub-Category" },
  { path: ADD_MEMBER, element: <AddMember />, title: "Add Member" },
  { path: UPDATE_MEMBER, element: <AddMember />, title: "Update Member" },
  { path: MARK_ATTENANCE, element: <MarkAttendance />, title: "Mark Attendance" },
  { path: UPDATE_ATTENANCE, element: <MarkAttendance />, title: "Mark Attendance" },
  { path: CREATE_ATTENDANCE, element: <CreateAttendance />, title: "Create Attendance" },
  { path: ATTENDANCE, element: <Attendance />, title: "View Attendance" },
  { path: ALL_ATTENDANCE, element: <AllAttendance />, title: "All Attendance" },
  { path: VIEW_MEMBER, element: <ViewMembers />, title: "View Members" },
  { path: ANALYTICS, element: <Analytics />, title: "Attendance Analytics" },
  { path: MEMBER_ANALYTICS, element: <MemberAnalytics />, title: "Member Analytics" },
  { path: BIRTHDAY, element: <Birthday />, title: "Birthdays" },
  { path: FINANCE, element: <Finance />, title: "Finance" },
  { path: OFFICERS_ROLES, element: <OfficersRoles />, title: "Officers & Roles" },
  { path: SETTINGS, element: <OrganisationSettings />, title: "Organisation Settings" },
];
