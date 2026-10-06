import { IconType } from "react-icons";
import {
  FaUserPlus,
  FaCalendarPlus,
  FaClipboardList,
  FaEye,
  FaChartBar,
  FaBirthdayCake,
  FaMoneyBillWave,
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
  colorScheme: string;
  path: string;
  perm: PermissionKey;
  /** Optional module this action belongs to; hidden when the org hides it. */
  feature?: OptionalFeature;
};

/** Paths and permission keys are static; only the labels follow terminology. */
export const NAV_ACTIONS: NavAction[] = [
  { label: LABELS.addMember, icon: FaUserPlus, colorScheme: "teal", path: PROTECTED_PATHS.ADD_MEMBER, perm: "members.manage" },
  { label: LABELS.viewMembers, icon: FaEye, colorScheme: "blue", path: PROTECTED_PATHS.VIEW_MEMBER, perm: "members.view" },
  { label: LABELS.createAttendance, icon: FaCalendarPlus, colorScheme: "yellow", path: PROTECTED_PATHS.CREATE_ATTENDANCE, perm: "attendance.manage" },
  { label: LABELS.allAttendance, icon: FaClipboardList, colorScheme: "purple", path: PROTECTED_PATHS.ALL_ATTENDANCE, perm: "attendance.view" },
  { label: "Analytics", icon: FaChartBar, colorScheme: "orange", path: PROTECTED_PATHS.ANALYTICS, perm: "attendance.view", feature: "analytics" },
  { label: "Birthday", icon: FaBirthdayCake, colorScheme: "pink", path: PROTECTED_PATHS.BIRTHDAY, perm: "members.view", feature: "birthdays" },
  { label: "Finance", icon: FaMoneyBillWave, colorScheme: "green", path: PROTECTED_PATHS.FINANCE, perm: "finance.view", feature: "finance" },
  { label: LABELS.officersAndRoles, icon: FaUserShield, colorScheme: "blue", path: PROTECTED_PATHS.OFFICERS_ROLES, perm: "officers.view" },
  { label: "Settings", icon: FaCog, colorScheme: "gray", path: PROTECTED_PATHS.SETTINGS, perm: "settings.view" },
];
