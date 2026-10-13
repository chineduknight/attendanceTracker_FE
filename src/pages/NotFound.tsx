import { Button, Stack, Text } from "@chakra-ui/react";
import { FiCompass } from "react-icons/fi";
import { Link as RouterLink } from "react-router-dom";
import AuthLayout from "components/auth/AuthLayout";
import PageContainer from "components/layout/PageContainer";
import { EmptyState } from "components/ui/states";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "routes/pagePath";

const MISSING = "The link may be old or mistyped.";

/** An unknown address while signed out: back to sign in. */
export const PublicNotFound = () => (
  <AuthLayout title="Page not found">
    <Stack gap={4}>
      <Text color="fg.muted">{MISSING}</Text>
      <Button asChild size="lg" w="full">
        <RouterLink to={PUBLIC_PATHS.LOGIN}>Go to sign in</RouterLink>
      </Button>
    </Stack>
  </AuthLayout>
);

/** An unknown address while signed in, inside the app shell. */
export const ProtectedNotFound = () => (
  <PageContainer width="form">
    <EmptyState
      icon={<FiCompass />}
      title="Page not found"
      description={MISSING}
      action={
        <Button asChild minH="44px">
          <RouterLink to={PROTECTED_PATHS.ALL_ORG}>Go to organisations</RouterLink>
        </Button>
      }
    />
  </PageContainer>
);
