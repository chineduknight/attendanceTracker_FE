import { IconType } from "react-icons";
import {
  FaUserPlus,
  FaCalendarPlus,
  FaClipboardList,
  FaEye,
  FaChartBar,
  FaBirthdayCake,
  FaMoneyBillWave,
  FaHandsHelping,
  FaUserShield,
  FaCog,
} from "react-icons/fa";
import { PROTECTED_PATHS } from "routes/pagePath";
import { PermissionKey } from "rbac/permissions";
import { OptionalFeature } from "helpers/organisationPresentation";
import { LABELS, PresentationText } from "config/presentationLabels";

export type NavAction = {
  label: PresentationText;
  icon: IconType;
  palette: string;
  path: string;
  perm: PermissionKey;
  /** Optional module this action belongs to; hidden when the org hides it. */
  feature?: OptionalFeature;
};

/** Paths and permission keys are static; only the labels follow terminology. */
export const NAV_ACTIONS: NavAction[] = [
  { label: LABELS.addMember, icon: FaUserPlus, palette: "teal", path: PROTECTED_PATHS.ADD_MEMBER, perm: "members.manage" },
  { label: LABELS.viewMembers, icon: FaEye, palette: "blue", path: PROTECTED_PATHS.VIEW_MEMBER, perm: "members.view" },
  { label: LABELS.createAttendance, icon: FaCalendarPlus, palette: "yellow", path: PROTECTED_PATHS.CREATE_ATTENDANCE, perm: "attendance.manage" },
  { label: LABELS.allAttendance, icon: FaClipboardList, palette: "purple", path: PROTECTED_PATHS.ALL_ATTENDANCE, perm: "attendance.view" },
  { label: "Analytics", icon: FaChartBar, palette: "orange", path: PROTECTED_PATHS.ANALYTICS, perm: "attendance.view", feature: "analytics" },
  { label: "Welfare & Engagement", icon: FaHandsHelping, palette: "teal", path: PROTECTED_PATHS.WELFARE, perm: "attendance.view", feature: "welfare" },
  { label: "Birthday", icon: FaBirthdayCake, palette: "pink", path: PROTECTED_PATHS.BIRTHDAY, perm: "members.view", feature: "birthdays" },
  { label: "Finance", icon: FaMoneyBillWave, palette: "green", path: PROTECTED_PATHS.FINANCE, perm: "finance.view", feature: "finance" },
  { label: LABELS.officersAndRoles, icon: FaUserShield, palette: "blue", path: PROTECTED_PATHS.OFFICERS_ROLES, perm: "officers.view" },
  { label: "Settings", icon: FaCog, palette: "gray", path: PROTECTED_PATHS.SETTINGS, perm: "settings.view" },
];
