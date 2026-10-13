import { Button, Heading, Grid } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import useGlobalStore from "zStore";
import { useNavActions } from "hooks/useNavActions";
import PageContainer from "components/layout/PageContainer";

const Dashboard = () => {
  const navigate = useNavigate();
  const organisation = useGlobalStore((state) => state.organisation);
  const actions = useNavActions();

  return (
    <PageContainer width="content">
      <Heading as="h1" mb={4} fontSize="22px" textAlign="center">
        {organisation?.name || "Dashboard"}
      </Heading>

      <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap={{ base: 3, md: 4 }}>
        {actions.map(({ label, icon: Icon, palette, path }) => (
          <Button
            key={path}
            colorPalette={palette}
            variant="outline"
            bg="bg.panel"
            minH="48px"
            onClick={() => navigate(path)}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </Grid>
    </PageContainer>
  );
};

export default Dashboard;
