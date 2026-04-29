import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Heading,
  Grid,
  HStack,
} from "@chakra-ui/react";
import {
  FaUserPlus,
  FaCalendarPlus,
  FaClipboardList,
  FaEye,
  FaChartBar,
  FaBirthdayCake,
  FaArrowLeft,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { IconType } from "react-icons";
import useGlobalStore from "zStore";

type DashboardAction = {
  label: string;
  icon: IconType;
  colorScheme: string;
  path: string;
};

const DASHBOARD_ACTIONS: DashboardAction[] = [
  { label: "Add Member", icon: FaUserPlus, colorScheme: "teal", path: PROTECTED_PATHS.ADD_MEMBER },
  { label: "View Members", icon: FaEye, colorScheme: "blue", path: PROTECTED_PATHS.VIEW_MEMBER },
  { label: "Create Attendance", icon: FaCalendarPlus, colorScheme: "yellow", path: PROTECTED_PATHS.CREATE_ATTENDANCE },
  { label: "All Attendance", icon: FaClipboardList, colorScheme: "purple", path: PROTECTED_PATHS.ALL_ATTENDANCE },
  { label: "Analytics", icon: FaChartBar, colorScheme: "orange", path: PROTECTED_PATHS.ANALYTICS },
  { label: "Birthday", icon: FaBirthdayCake, colorScheme: "pink", path: PROTECTED_PATHS.BIRTHDAY },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [organisation, setUser, updateOrganisation] = useGlobalStore((state) => [
    state.organisation,
    state.setUser,
    state.updateOrganisation,
  ]);

  function handleLogout() {
    setUser({
      token: "",
      id: "",
      username: "",
    });
    updateOrganisation({
      name: "",
      image: "",
      owner: "",
      id: "",
    });
  }

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Attendance Tracker
        </Text>
        <HStack spacing={3}>
          <Button
            variant="logout"
            leftIcon={<FaArrowLeft />}
            onClick={() => navigate(PROTECTED_PATHS.ALL_ORG)}
          >
            Organisations
          </Button>
          <Button variant="logout" onClick={handleLogout}>
            Logout
          </Button>
        </HStack>
      </Flex>

      <Heading mt="4" fontSize="22px" textAlign="center">
        {organisation?.name || "Dashboard"}
      </Heading>

      <Grid
        templateColumns={["repeat(1, 1fr)", "repeat(2, 1fr)"]}
        gap={6}
        p={4}
      >
        {DASHBOARD_ACTIONS.map(({ label, icon: Icon, colorScheme, path }) => (
          <Button
            key={label}
            leftIcon={<Icon />}
            colorScheme={colorScheme}
            variant="outline"
            onClick={() => navigate(path)}
          >
            {label}
          </Button>
        ))}
      </Grid>
    </Box>
  );
};

export default Dashboard;
