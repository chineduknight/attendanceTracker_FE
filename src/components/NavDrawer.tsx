import { CloseButton,
  Drawer,
  Box,
  Text,
  Badge,
  VStack,
  Button,
  Icon,
  useDisclosure,
  Separator,
  Portal,
} from "@chakra-ui/react";
import { NameAvatar } from "components/ui/avatar";
import { FaArrowLeft, FaKey, FaSignOutAlt, FaTachometerAlt } from "react-icons/fa";
import { IconType } from "react-icons";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { EMPTY_USER, EMPTY_ORG } from "zStore";
import { useNavActions } from "hooks/useNavActions";
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
  const navActions = useNavActions();
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
      <Drawer.Root open={isOpen} placement='start' onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}>
        <Portal>

          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.CloseTrigger asChild><CloseButton size="sm" /></Drawer.CloseTrigger>
              <Drawer.Body p={0}>
                <Box bg="primary" color="#fff" p={4} pt={10}>
                  <NameAvatar size="md" mb={2} name={user.username} />
                  <Text fontWeight="bold" lineClamp={1}>
                    {user.username || "Account"}
                  </Text>
                  {user.email && (
                    <Text fontSize="sm" lineClamp={1}>
                      {user.email}
                    </Text>
                  )}
                  {organisation.roleName && (
                    <Badge mt={2} colorPalette="blue">
                      {organisation.roleName}
                    </Badge>
                  )}
                </Box>

                <VStack align="stretch" gap={0} py={2}>
                  {navActions.map(({ label, icon, path, colorScheme }) => (
                    <Button
                      key={path}
                      variant="ghost"
                      justifyContent="flex-start"
                      color={`${colorScheme}.600`}
                      borderRadius={0}
                      onClick={() => goTo(path)}><Icon as={icon} color={`${colorScheme}.600`} />{label}</Button>
                  ))}
                </VStack>

                <Separator />

                <VStack align="stretch" gap={0} py={2}>
                  {ACCOUNT_ACTIONS.map(({ label, icon, colorScheme, onClick }) => (
                    <Button
                      key={label}
                      variant="ghost"
                      justifyContent="flex-start"
                      color={`${colorScheme}.600`}
                      borderRadius={0}
                      onClick={onClick}><Icon as={icon} color={`${colorScheme}.600`} />{label}</Button>
                  ))}
                </VStack>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>

        </Portal>
      </Drawer.Root>

      <ChangePasswordModal
        isOpen={changePassword.open}
        onClose={changePassword.onClose}
      />
    </>
  );
};

export default NavDrawer;
