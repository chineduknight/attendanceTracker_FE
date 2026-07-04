import {
  Flex,
  Text,
  Box,
  Avatar,
  Badge,
  Icon,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  useDisclosure,
} from "@chakra-ui/react";
import { FaChevronDown, FaArrowLeft, FaKey, FaSignOutAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { EMPTY_USER, EMPTY_ORG } from "zStore";
import ChangePasswordModal from "components/auth/ChangePasswordModal";

interface AppHeaderProps {
  /** When inside an organisation (e.g. the Dashboard), surfaces the role badge
   *  and a quick link back to the organisations list. */
  inOrg?: boolean;
}

const AppHeader = ({ inOrg = false }: AppHeaderProps) => {
  const navigate = useNavigate();
  const changePassword = useDisclosure();
  const [user, organisation, setUser, updateOrganisation] = useGlobalStore((s) => [
    s.user,
    s.organisation,
    s.setUser,
    s.updateOrganisation,
  ]);

  const handleLogout = () => {
    setUser(EMPTY_USER);
    updateOrganisation(EMPTY_ORG);
  };

  const displayName = user.username || "Account";

  return (
    <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
      <Text fontWeight="bold" color="#fff">
        Attendance Tracker
      </Text>

      <Menu placement="bottom-end" autoSelect={false}>
        <MenuButton
          px={2}
          py={1}
          borderRadius="md"
          transition="background 0.2s"
          _hover={{ bg: "blue.600" }}
          _active={{ bg: "blue.600" }}
          aria-label="Account menu"
        >
          <Flex alignItems="center" gap={2}>
            <Avatar size="sm" name={user.username} />
            <Text
              color="#fff"
              fontWeight="medium"
              maxW="160px"
              noOfLines={1}
              display={{ base: "none", md: "block" }}
            >
              {displayName}
            </Text>
            <Icon
              as={FaChevronDown}
              color="#fff"
              boxSize={3}
              display={{ base: "none", md: "block" }}
            />
          </Flex>
        </MenuButton>

        <MenuList>
          <Box px={3} py={2}>
            <Text fontWeight="bold" noOfLines={1}>
              {displayName}
            </Text>
            {user.email && (
              <Text fontSize="sm" color="gray.500" noOfLines={1}>
                {user.email}
              </Text>
            )}
            {inOrg && organisation.roleName && (
              <Badge mt={2} colorScheme="blue">
                {organisation.roleName}
              </Badge>
            )}
          </Box>

          <MenuDivider />

          {inOrg && (
            <MenuItem
              icon={<FaArrowLeft />}
              onClick={() => navigate(PROTECTED_PATHS.ALL_ORG)}
            >
              Organisations
            </MenuItem>
          )}
          <MenuItem icon={<FaKey />} onClick={changePassword.onOpen}>
            Change password
          </MenuItem>

          <MenuDivider />

          <MenuItem icon={<FaSignOutAlt />} color="red.500" onClick={handleLogout}>
            Logout
          </MenuItem>
        </MenuList>
      </Menu>

      <ChangePasswordModal
        isOpen={changePassword.isOpen}
        onClose={changePassword.onClose}
      />
    </Flex>
  );
};

export default AppHeader;
