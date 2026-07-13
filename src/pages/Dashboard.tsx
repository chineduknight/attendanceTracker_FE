import {
  Box,
  useColorModeValue,
  Button,
  Heading,
  Grid,
} from "@chakra-ui/react";
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
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { IconType } from "react-icons";
import useGlobalStore from "zStore";
import AppHeader from "components/AppHeader";
import { Can } from "rbac/Can";
import { PermissionKey } from "rbac/permissions";
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";

type DashboardAction = {
  label: string;
  icon: IconType;
  colorScheme: string;
  path: string;
  perm: PermissionKey;
};

const DASHBOARD_ACTIONS: DashboardAction[] = [
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

const Dashboard = () => {
  const navigate = useNavigate();
  const organisation = useGlobalStore((state) => state.organisation);
  useSyncSelectedOrg();

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <AppHeader inOrg />

      <Heading mt="4" fontSize="22px" textAlign="center">
        {organisation?.name || "Dashboard"}
      </Heading>

      <Grid
        templateColumns={["repeat(1, 1fr)", "repeat(2, 1fr)"]}
        gap={6}
        p={4}
      >
        {DASHBOARD_ACTIONS.map(({ label, icon: Icon, colorScheme, path, perm }) => (
          <Can key={label} perm={perm}>
            <Button
              leftIcon={<Icon />}
              colorScheme={colorScheme}
              variant="outline"
              onClick={() => navigate(path)}
            >
              {label}
            </Button>
          </Can>
        ))}
      </Grid>
    </Box>
  );
};

export default Dashboard;
