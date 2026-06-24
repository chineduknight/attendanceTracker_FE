import { useState } from "react";
import {
  Box, Button, Flex, HStack, Table, Thead, Tbody, Tr, Th, Td, Badge, Wrap, WrapItem,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { Role } from "rbac/types";
import RoleFormModal from "components/officers/RoleFormModal";

interface Props { organisationId: string; }

const RolesTab = ({ organisationId }: Props) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const url = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data, isLoading } = useQueryWrapper(["roles", organisationId], url);
  const roles: Role[] = data?.data ?? [];

  const { mutate: remove } = useMutationWrapper(deleteRequest, () => {
    queryClient.invalidateQueries(["roles", organisationId]);
    queryClient.invalidateQueries(["officers", organisationId]);
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: Role) => { setEditing(r); setFormOpen(true); };

  const handleDelete = (r: Role) =>
    confirmAlert({
      title: "Delete role",
      message: `Delete the "${r.name}" role?`,
      buttons: [
        { label: "Yes", className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => remove({ url: convertParamsToString(rbacRequest.ROLE_ONE, { organisationId, roleId: r.id }) }) },
        { label: "No", className: "confirm-alert-button confirm-alert-button-no" },
      ],
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Flex justify="flex-end" mb={3}>
        <Can perm="officers.manage">
          <Button variant="primary" onClick={openCreate}>Create role</Button>
        </Can>
      </Flex>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Role</Th><Th>Permissions</Th><Th></Th></Tr></Thead>
          <Tbody>
            {roles.map((r) => (
              <Tr key={r.id}>
                <Td>{r.name}{r.isSystem && <Badge ml={2} colorScheme="purple">system</Badge>}</Td>
                <Td>
                  <Wrap>
                    {r.permissions.map((p) => (
                      <WrapItem key={p}><Badge colorScheme="green" variant="subtle">{p}</Badge></WrapItem>
                    ))}
                  </Wrap>
                </Td>
                <Td>
                  <Can perm="officers.manage">
                    <HStack spacing={2}>
                      <Button size="xs" onClick={() => openEdit(r)} isDisabled={r.isSystem}>Edit</Button>
                      <Button size="xs" colorScheme="red" onClick={() => handleDelete(r)} isDisabled={r.isSystem}>Delete</Button>
                    </HStack>
                  </Can>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
      <RoleFormModal organisationId={organisationId} role={editing} isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </Box>
  );
};

export default RolesTab;
