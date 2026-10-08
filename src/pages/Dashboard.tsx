import { Box, Button, Heading, Grid } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import { useNavigate } from "react-router-dom";
import useGlobalStore from "zStore";
import { useNavActions } from "hooks/useNavActions";

const Dashboard = () => {
  const navigate = useNavigate();
  const organisation = useGlobalStore((state) => state.organisation);
  const actions = useNavActions();

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Heading mt="4" fontSize="22px" textAlign="center">
        {organisation?.name || "Dashboard"}
      </Heading>

      <Grid
        templateColumns={["repeat(1, 1fr)", "repeat(2, 1fr)"]}
        gap={6}
        p={4}
      >
        {actions.map(({ label, icon: Icon, palette, path }) => (
          <Button
            key={path}
            colorPalette={palette}
            variant="outline"
            onClick={() => navigate(path)}><Icon />{label}</Button>
        ))}
      </Grid>
    </Box>
  );
};

export default Dashboard;
