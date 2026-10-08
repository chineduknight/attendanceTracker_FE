import { useState } from "react";
import {
  Box, Button, Flex, HStack, Table,      Badge, Wrap, WrapItem,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { Role } from "rbac/types";
import RoleFormModal from "components/officers/RoleFormModal";

interface Props { organisationId: string; }

const RolesTab = ({ organisationId }: Props) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const url = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data, isLoading } = useQueryWrapper(queryKeys.rbac.roles(organisationId), url);
  const roles: Role[] = data?.data ?? [];

  const { mutate: remove } = useMutationWrapper(deleteRequest, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.roles(organisationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.officers(organisationId) });
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
        <Table.Root size="sm">
          <Table.Header><Table.Row><Table.ColumnHeader>Role</Table.ColumnHeader><Table.ColumnHeader>Permissions</Table.ColumnHeader><Table.ColumnHeader></Table.ColumnHeader></Table.Row></Table.Header>
          <Table.Body>
            {roles.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{r.name}{r.isSystem && <Badge ml={2} colorPalette="purple">system</Badge>}</Table.Cell>
                <Table.Cell>
                  <Wrap>
                    {r.permissions.map((p) => (
                      <WrapItem key={p}><Badge colorPalette="green" variant="subtle">{p}</Badge></WrapItem>
                    ))}
                  </Wrap>
                </Table.Cell>
                <Table.Cell>
                  <Can perm="officers.manage">
                    <HStack gap={2}>
                      <Button size="xs" onClick={() => openEdit(r)} disabled={r.isSystem}>Edit</Button>
                      <Button size="xs" colorPalette="red" onClick={() => handleDelete(r)} disabled={r.isSystem}>Delete</Button>
                    </HStack>
                  </Can>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
      <RoleFormModal organisationId={organisationId} role={editing} isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </Box>
  );
};

export default RolesTab;
