import { lazyPage } from "./lazyPage";
import { PermissionKey } from "rbac/permissions";
import { PROTECTED_PATHS } from "./pagePath";
import { OptionalFeature } from "helpers/organisationPresentation";
import { LABELS, PresentationText } from "config/presentationLabels";

const Dashboard = lazyPage(() => import("pages/Dashboard"));
const UserModel = lazyPage(() => import("pages/UserModel"));
const Category = lazyPage(() => import("pages/Category"));
const SubCategory = lazyPage(() => import("pages/SubCategory"));
const MarkAttendance = lazyPage(() => import("pages/MarkAttendance"));
const CreateAttendance = lazyPage(() => import("pages/CreateAttendance"));
const AddMember = lazyPage(() => import("pages/AddMember"));
const Attendance = lazyPage(() => import("pages/ViewAttendance"));
const OrgList = lazyPage(() => import("pages/Organisations"));
const AllAttendance = lazyPage(() => import("pages/AllAttendance"));
const ViewMembers = lazyPage(() => import("pages/ViewMembers"));
const Analytics = lazyPage(() => import("pages/Analytics"));
const MemberAnalytics = lazyPage(() => import("pages/MemberAnalytics"));
const Birthday = lazyPage(() => import("pages/Birthday"));
const Finance = lazyPage(() => import("pages/Finance"));
const Welfare = lazyPage(() => import("pages/Welfare"));
const OfficersRoles = lazyPage(() => import("pages/OfficersRoles"));
const AddOrganisation = lazyPage(() => import("pages/AddOrganisation"));
const OrganisationSettings = lazyPage(() => import("pages/OrganisationSettings"));
const MemberAttendanceAvailability = lazyPage(() => import("pages/MemberAttendanceAvailability"));

const {
  DASHBOARD,
  ADD_ORG,
  ALL_ORG,
  USER_MODEL,
  CATEGORY,
  SUB_CATEGORY,
  ADD_MEMBER,
  UPDATE_MEMBER,
  MEMBER_ATTENDANCE_AVAILABILITY,
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
  WELFARE,
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
  /**
   * Whether the page belongs to a selected organisation (default true). Only
   * the organisation picker and Add Org work without one.
   */
  needsOrganisation?: boolean;
};

export const PAGE_ROUTES: PageRouteConfig[] = [
  {
    path: ALL_ORG,
    element: <OrgList />,
    title: "Organisations",
    showBack: false,
    needsOrganisation: false,
  },
  {
    path: DASHBOARD,
    element: <Dashboard />,
    title: "Dashboard",
    showBack: false,
  },
  { path: ADD_ORG, element: <AddOrganisation />, title: "New Organisation", needsOrganisation: false },
  {
    path: USER_MODEL,
    element: <UserModel />,
    title: LABELS.memberModel,
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
    path: MEMBER_ATTENDANCE_AVAILABILITY,
    element: <MemberAttendanceAvailability />,
    title: LABELS.memberAvailability,
    perm: "attendance.view",
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
    path: WELFARE,
    element: <Welfare />,
    title: "Welfare & Engagement",
    perm: "attendance.view",
    feature: "welfare",
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
