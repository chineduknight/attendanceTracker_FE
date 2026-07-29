import {
  Box,
  useColorModeValue,
  Button,
  Heading,
  Grid,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import useGlobalStore from "zStore";
import AppHeader from "components/AppHeader";
import { Can } from "rbac/Can";
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";
import { NAV_ACTIONS } from "config/navActions";

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
        {NAV_ACTIONS.map(({ label, icon: Icon, colorScheme, path, perm }) => (
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
