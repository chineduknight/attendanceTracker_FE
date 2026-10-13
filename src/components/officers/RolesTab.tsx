import { useState } from "react";
import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaPen, FaTrashAlt, FaUserShield } from "react-icons/fa";
import { useConfirm } from "components/ui/confirm-dialog";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import PageLoader from "components/PageLoader";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { Can } from "rbac/Can";
import { Role } from "rbac/types";
import RoleFormModal from "components/officers/RoleFormModal";
import PermissionSummary from "components/officers/PermissionSummary";
import RowActions from "components/officers/RowActions";

interface Props { organisationId: string; }

const RolesTab = ({ organisationId }: Props) => {
  const { confirm, confirmDialog } = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const url = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useQueryWrapper(queryKeys.rbac.roles(organisationId), url);
  const roles: Role[] | undefined = data?.data;

  const { mutate: remove } = useMutationWrapper(deleteRequest, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.roles(organisationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.officers(organisationId) });
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: Role) => { setEditing(r); setFormOpen(true); };

  const handleDelete = async (r: Role) => {
    const confirmed = await confirm({
      title: "Delete role",
      body: `Delete the "${r.name}" role?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) {
      remove({ url: convertParamsToString(rbacRequest.ROLE_ONE, { organisationId, roleId: r.id }) });
    }
  };

  const body = () => {
    if (isLoading) return <PageLoader h="20vh" />;
    if (isError && !roles) {
      return (
        <ErrorState
          title="Couldn't load roles"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      );
    }
    if (!roles?.length) {
      return <EmptyState icon={<FaUserShield />} title="No roles yet" />;
    }
    return (
      <GroupedList>
        {roles.map((r) => (
          <GroupedListItem key={r.id}>
            <Flex align="flex-start" gap={2}>
              <Box flex="1" minW={0}>
                <Flex align="center" gap={2} wrap="wrap">
                  <Text fontWeight="semibold" lineClamp={1} minW={0}>{r.name}</Text>
                  {/* Built-in roles can't be edited or deleted, so they have no menu. */}
                  {r.isSystem && <Badge colorPalette="purple">Built-in</Badge>}
                </Flex>
                <PermissionSummary permissions={r.permissions} />
              </Box>
              {!r.isSystem && (
                <Can perm="officers.manage">
                  <RowActions
                    label={`Actions for the ${r.name} role`}
                    actions={[
                      { value: "edit", label: "Edit", icon: <FaPen />, onSelect: () => openEdit(r) },
                      { value: "delete", label: "Delete", icon: <FaTrashAlt />, onSelect: () => handleDelete(r), destructive: true },
                    ]}
                  />
                </Can>
              )}
            </Flex>
          </GroupedListItem>
        ))}
      </GroupedList>
    );
  };

  return (
    <Box>
      <Can perm="officers.manage">
        <Flex justify="flex-end" mb={3}>
          <Button variant="primary" minH="44px" onClick={openCreate}>Create role</Button>
        </Flex>
      </Can>
      {body()}
      {roles?.some((r) => r.isSystem) && (
        <Text mt={2} fontSize="sm" color="fg.muted">Built-in roles can't be edited or deleted.</Text>
      )}
      <RoleFormModal organisationId={organisationId} role={editing} isOpen={formOpen} onClose={() => setFormOpen(false)} />
      {confirmDialog}
    </Box>
  );
};

export default RolesTab;
