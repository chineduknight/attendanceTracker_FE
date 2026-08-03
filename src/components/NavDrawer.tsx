import {
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  Box,
  Text,
  Avatar,
  Badge,
  VStack,
  Button,
  Divider,
  Icon,
  useDisclosure,
} from "@chakra-ui/react";
import { FaArrowLeft, FaKey, FaSignOutAlt, FaTachometerAlt } from "react-icons/fa";
import { IconType } from "react-icons";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { EMPTY_USER, EMPTY_ORG } from "zStore";
import { Can } from "rbac/Can";
import { NAV_ACTIONS } from "config/navActions";
import ChangePasswordModal from "components/auth/ChangePasswordModal";

interface NavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type AccountAction = {
  label: string;
  icon: IconType;
  colorScheme: string;
  onClick: () => void;
};

const NavDrawer = ({ isOpen, onClose }: NavDrawerProps) => {
  const navigate = useNavigate();
  const changePassword = useDisclosure();
  const [user, organisation, setUser, updateOrganisation] = useGlobalStore((s) => [
    s.user,
    s.organisation,
    s.setUser,
    s.updateOrganisation,
  ]);

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  const handleLogout = () => {
    onClose();
    setUser(EMPTY_USER);
    updateOrganisation(EMPTY_ORG);
  };

  const ACCOUNT_ACTIONS: AccountAction[] = [
    { label: "Dashboard", icon: FaTachometerAlt, colorScheme: "cyan", onClick: () => goTo(PROTECTED_PATHS.DASHBOARD) },
    { label: "Organisations", icon: FaArrowLeft, colorScheme: "blue", onClick: () => goTo(PROTECTED_PATHS.ALL_ORG) },
    { label: "Change password", icon: FaKey, colorScheme: "gray", onClick: changePassword.onOpen },
    { label: "Logout", icon: FaSignOutAlt, colorScheme: "red", onClick: handleLogout },
  ];

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} placement="left">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerBody p={0}>
            <Box bg="primary" color="#fff" p={4} pt={10}>
              <Avatar size="md" name={user.username} mb={2} />
              <Text fontWeight="bold" noOfLines={1}>
                {user.username || "Account"}
              </Text>
              {user.email && (
                <Text fontSize="sm" noOfLines={1}>
                  {user.email}
                </Text>
              )}
              {organisation.roleName && (
                <Badge mt={2} colorScheme="blue">
                  {organisation.roleName}
                </Badge>
              )}
            </Box>

            <VStack align="stretch" spacing={0} py={2}>
              {NAV_ACTIONS.map(({ label, icon, path, perm, colorScheme }) => (
                <Can key={label} perm={perm}>
                  <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    color={`${colorScheme}.600`}
                    leftIcon={<Icon as={icon} color={`${colorScheme}.600`} />}
                    borderRadius={0}
                    onClick={() => goTo(path)}
                  >
                    {label}
                  </Button>
                </Can>
              ))}
            </VStack>

            <Divider />

            <VStack align="stretch" spacing={0} py={2}>
              {ACCOUNT_ACTIONS.map(({ label, icon, colorScheme, onClick }) => (
                <Button
                  key={label}
                  variant="ghost"
                  justifyContent="flex-start"
                  color={`${colorScheme}.600`}
                  leftIcon={<Icon as={icon} color={`${colorScheme}.600`} />}
                  borderRadius={0}
                  onClick={onClick}
                >
                  {label}
                </Button>
              ))}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <ChangePasswordModal
        isOpen={changePassword.isOpen}
        onClose={changePassword.onClose}
      />
    </>
  );
};

export default NavDrawer;
