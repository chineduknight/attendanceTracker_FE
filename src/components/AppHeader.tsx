import { Flex, Text, IconButton, useDisclosure } from "@chakra-ui/react";
import { FaBars, FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import NavDrawer from "components/NavDrawer";

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
}

const AppHeader = ({ title, showBack = true }: AppHeaderProps) => {
  const navigate = useNavigate();
  const drawer = useDisclosure();

  return (
    <Flex bg="primary" alignItems="center" p="4" gap={2}>
      {showBack && (
        <IconButton
          aria-label="Back"
          icon={<FaArrowCircleLeft />}
          onClick={() => navigate(-1)}
          variant="ghost"
          color="#fff"
          _hover={{ bg: "blue.600" }}
          size="sm"
        />
      )}
      <IconButton
        aria-label="Open menu"
        icon={<FaBars />}
        onClick={drawer.onOpen}
        variant="ghost"
        color="#fff"
        _hover={{ bg: "blue.600" }}
        size="sm"
      />
      <Text fontWeight="bold" color="#fff">
        {title}
      </Text>
      <NavDrawer isOpen={drawer.isOpen} onClose={drawer.onClose} />
    </Flex>
  );
};

export default AppHeader;
