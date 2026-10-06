import WithSuspense from "components/HOC/WithSuspense";
import { lazy } from "react";
import { PermissionKey } from "rbac/permissions";
import { PROTECTED_PATHS } from "./pagePath";
import { OptionalFeature } from "helpers/organisationPresentation";
import { LABELS, PresentationText } from "config/presentationLabels";

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
  /** Static, or derived from the selected organisation's terminology. */
  title: PresentationText;
  showBack?: boolean;
  /**
   * Permission required to view this route. Routes without a `perm` (the org
   * picker, dashboard, etc.) are always allowed.
   */
  perm?: PermissionKey;
  /** Optional module; a direct visit redirects when the org hides it. */
  feature?: OptionalFeature;
};

export const PAGE_ROUTES: PageRouteConfig[] = [
  { path: ALL_ORG, element: <OrgList />, title: "Organisations", showBack: false },
  { path: DASHBOARD, element: <Dashboard />, title: "Dashboard", showBack: false },
  { path: ADD_ORG, element: <AddOrganisation />, title: "New Organisation" },
  {
    path: USER_MODEL,
    element: <UserModel />,
    title: "User Model",
    perm: "members.manage",
  },
  {
    path: CATEGORY,
    element: <Category />,
    title: LABELS.createCategory,
    perm: "categories.manage",
  },
  {
    path: SUB_CATEGORY,
    element: <SubCategory />,
    title: LABELS.createSubCategory,
    perm: "categories.manage",
  },
  {
    path: ADD_MEMBER,
    element: <AddMember />,
    title: LABELS.addMember,
    perm: "members.manage",
  },
  {
    path: UPDATE_MEMBER,
    element: <AddMember />,
    title: LABELS.updateMember,
    perm: "members.manage",
  },
  {
    path: MARK_ATTENANCE,
    element: <MarkAttendance />,
    title: LABELS.markAttendance,
    perm: "attendance.manage",
  },
  {
    path: UPDATE_ATTENANCE,
    element: <MarkAttendance />,
    title: LABELS.markAttendance,
    perm: "attendance.manage",
  },
  {
    path: CREATE_ATTENDANCE,
    element: <CreateAttendance />,
    title: LABELS.createAttendance,
    perm: "attendance.manage",
  },
  {
    path: ATTENDANCE,
    element: <Attendance />,
    title: LABELS.viewAttendance,
    perm: "attendance.view",
  },
  {
    path: ALL_ATTENDANCE,
    element: <AllAttendance />,
    title: LABELS.allAttendance,
    perm: "attendance.view",
  },
  {
    path: VIEW_MEMBER,
    element: <ViewMembers />,
    title: LABELS.viewMembers,
    perm: "members.view",
  },
  {
    path: ANALYTICS,
    element: <Analytics />,
    title: LABELS.attendanceAnalytics,
    perm: "attendance.view",
    feature: "analytics",
  },
  {
    path: MEMBER_ANALYTICS,
    element: <MemberAnalytics />,
    title: LABELS.memberAnalytics,
    perm: "attendance.view",
    feature: "analytics",
  },
  {
    path: BIRTHDAY,
    element: <Birthday />,
    title: "Birthdays",
    perm: "members.view",
    feature: "birthdays",
  },
  {
    path: FINANCE,
    element: <Finance />,
    title: "Finance",
    perm: "finance.view",
    feature: "finance",
  },
  {
    path: OFFICERS_ROLES,
    element: <OfficersRoles />,
    title: LABELS.officersAndRoles,
    perm: "officers.view",
  },
  {
    path: SETTINGS,
    element: <OrganisationSettings />,
    title: "Organisation Settings",
    perm: "settings.view",
  },
];
