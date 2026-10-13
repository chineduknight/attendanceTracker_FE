import { Box, Flex, Heading, Link, LinkProps, Stack, Text } from "@chakra-ui/react";
import { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { withSafeInset } from "styles/safeArea";
import BrandMark from "./BrandMark";

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  /** Under the card, e.g. "New here? Create an account". */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The signed-out pages' frame: the brand, then one card holding the form.
 * Owns the screen height itself (public routes have no shell) and keeps
 * clear of the notch and home bar. On phones the card starts near the top
 * so the form sits above the keyboard; from sm it is centred.
 */
const AuthLayout = ({ title, subtitle, footer, children }: AuthLayoutProps) => (
  <Flex
    as="main"
    minH="100dvh"
    direction="column"
    align="center"
    justify={{ base: "flex-start", sm: "center" }}
    bg="bg.subtle"
    position="relative"
    overflow="hidden"
    px={4}
    pt={withSafeInset("top", "2.5rem")}
    pb={withSafeInset("bottom", "2rem")}
  >
    <Box
      aria-hidden
      position="absolute"
      top="-160px"
      left="50%"
      transform="translateX(-50%)"
      w="560px"
      h="360px"
      rounded="full"
      bgGradient="to-br"
      gradientFrom="blue.400"
      gradientTo="cyan.300"
      opacity={{ base: 0.22, _dark: 0.12 }}
      filter="blur(72px)"
      pointerEvents="none"
    />
    <Stack w="full" maxW="md" gap={6} position="relative">
      <BrandMark />
      <Box
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border"
        rounded="2xl"
        shadow="lg"
        p={{ base: 5, sm: 8 }}
      >
        <Stack gap={1} mb={6}>
          <Heading as="h1" fontSize={{ base: "2xl", sm: "3xl" }} lineHeight="1.2">
            {title}
          </Heading>
          {subtitle && <Text color="fg.muted">{subtitle}</Text>}
        </Stack>
        {children}
      </Box>
      {footer && (
        <Text textAlign="center" color="fg.muted">
          {footer}
        </Text>
      )}
    </Stack>
  </Flex>
);

/** A standalone link on the auth pages, with a 44px tap target. */
export const AuthLink = ({ to, children, ...props }: { to: string } & LinkProps) => (
  <Link
    asChild
    color="blue.fg"
    fontWeight="500"
    minH="44px"
    display="inline-flex"
    alignItems="center"
    {...props}
  >
    <RouterLink to={to}>{children}</RouterLink>
  </Link>
);

export default AuthLayout;
