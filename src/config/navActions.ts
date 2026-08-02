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

export type NavAction = {
  label: string;
  icon: IconType;
  colorScheme: string;
  path: string;
  perm: PermissionKey;
};

export const NAV_ACTIONS: NavAction[] = [
  { label: "Add Member", icon: FaUserPlus, colorScheme: "teal", path: PROTECTED_PATHS.ADD_MEMBER, perm: "members.view" },
  { label: "View Members", icon: FaEye, colorScheme: "blue", path: PROTECTED_PATHS.VIEW_MEMBER, perm: "members.view" },
  { label: "Create Attendance", icon: FaCalendarPlus, colorScheme: "yellow", path: PROTECTED_PATHS.CREATE_ATTENDANCE, perm: "attendance.view" },
  { label: "All Attendance", icon: FaClipboardList, colorScheme: "purple", path: PROTECTED_PATHS.ALL_ATTENDANCE, perm: "attendance.view" },
  { label: "Analytics", icon: FaChartBar, colorScheme: "orange", path: PROTECTED_PATHS.ANALYTICS, perm: "attendance.view" },
  { label: "Birthday", icon: FaBirthdayCake, colorScheme: "pink", path: PROTECTED_PATHS.BIRTHDAY, perm: "members.view" },
  { label: "Finance", icon: FaMoneyBillWave, colorScheme: "green", path: PROTECTED_PATHS.FINANCE, perm: "finance.view" },
  { label: "Officers & Roles", icon: FaUserShield, colorScheme: "blue", path: PROTECTED_PATHS.OFFICERS_ROLES, perm: "officers.view" },
  { label: "Settings", icon: FaCog, colorScheme: "gray", path: PROTECTED_PATHS.SETTINGS, perm: "settings.view" },
];
