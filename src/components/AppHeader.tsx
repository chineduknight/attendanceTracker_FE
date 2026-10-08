import { Flex, Text, IconButton, useDisclosure } from "@chakra-ui/react";
import { NameAvatar } from "components/ui/avatar";
import { FaBars, FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import NavDrawer from "components/NavDrawer";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";

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
    <Flex bg="primary" alignItems="center" justifyContent="space-between" p="4">
      <Flex alignItems="center" gap={2}>
        {showBack && (
          <IconButton
            aria-label="Back"
            onClick={handleBack}
            variant="ghost"
            color="#fff"
            _hover={{ bg: "primaryHover" }}
            size="sm"><FaArrowCircleLeft /></IconButton>
        )}
        <IconButton
          aria-label="Open menu"
          onClick={drawer.onOpen}
          variant="ghost"
          color="#fff"
          _hover={{ bg: "primaryHover" }}
          size="sm"><FaBars /></IconButton>
        <Text fontWeight="bold" color="#fff">
          {title}
        </Text>
      </Flex>

      <NameAvatar
        size="sm"
        aria-label="Account menu"
        cursor="pointer"
        onClick={drawer.onOpen} name={username} />

      <NavDrawer isOpen={drawer.open} onClose={drawer.onClose} />
    </Flex>
  );
};

export default AppHeader;
