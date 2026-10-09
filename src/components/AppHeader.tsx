import { Box, Flex, Text, IconButton, useDisclosure } from "@chakra-ui/react";
import { NameAvatar } from "components/ui/avatar";
import { FaBars, FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import NavDrawer from "components/NavDrawer";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";
import { withSafeInset } from "styles/safeArea";

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
}

const AppHeader = ({ title, showBack = true }: AppHeaderProps) => {
  const navigate = useNavigate();
  const drawer = useDisclosure();
  const username = useGlobalStore((s) => s.user.username);

  const handleBack = () => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (historyIndex > 0) {
      navigate(-1);
    } else {
      navigate(PROTECTED_PATHS.DASHBOARD);
    }
  };

  return (
    <Flex
      as="header"
      bg="primary"
      alignItems="center"
      justifyContent="space-between"
      // The blue runs edge to edge; the controls stay clear of the notch and
      // status bar (installed app, landscape). 44px controls with 8px above
      // and below keep the bar as compact as the old 32px controls + 16px.
      pt={withSafeInset("top", "0.5rem")}
      pb="2"
      pl={withSafeInset("left", "1rem")}
      pr={withSafeInset("right", "1rem")}
    >
      <Flex alignItems="center" gap={1} minW={0}>
        {showBack && (
          <IconButton
            aria-label="Back"
            onClick={handleBack}
            variant="ghost"
            color="#fff"
            _hover={{ bg: "primaryHover" }}
            size="sm"
            minW="44px"
            h="44px"><FaArrowCircleLeft /></IconButton>
        )}
        <IconButton
          aria-label="Open menu"
          onClick={drawer.onOpen}
          variant="ghost"
          color="#fff"
          _hover={{ bg: "primaryHover" }}
          size="sm"
          minW="44px"
          h="44px"><FaBars /></IconButton>
        <Text fontWeight="bold" color="#fff" lineClamp={1}>
          {title}
        </Text>
      </Flex>

      {/* A real button (keyboard, screen readers) around the avatar. */}
      <Box
        as="button"
        aria-label="Account menu"
        onClick={drawer.onOpen}
        flexShrink={0}
        minW="44px"
        h="44px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        cursor="pointer"
        _focusVisible={{ outline: "2px solid white", outlineOffset: "2px" }}
      >
        <NameAvatar size="sm" name={username} />
      </Box>

      <NavDrawer isOpen={drawer.open} onClose={drawer.onClose} />
    </Flex>
  );
};

export default AppHeader;
