import { useEffect, useState } from "react";
import { Button, Dialog, Portal } from "@chakra-ui/react";
import { useQueryWrapper, patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import PermissionGrid from "components/officers/PermissionGrid";
import { buildOverridePayload } from "rbac/rbacPayloads";
import { PermissionKey } from "rbac/permissions";
import { Officer, Role, PermissionsCatalog } from "rbac/types";

interface Props { organisationId: string; officer: Officer | null; onClose: () => void; }

const EditOfficerPermissionsModal = ({ organisationId, officer, onClose }: Props) => {
  const isOpen = !!officer;
  const [selected, setSelected] = useState<PermissionKey[]>([]);

  useEffect(() => { setSelected(officer?.permissions ?? []); }, [officer]);

  const { data: catalogData } = useQueryWrapper(queryKeys.permissionsCatalog, rbacRequest.PERMISSIONS, { enabled: isOpen });
  const catalog: PermissionsCatalog | undefined = catalogData?.data;

  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(queryKeys.rbac.roles(organisationId), rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { mutate, isLoading } = useMutationWrapper(patchRequest, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.officers(organisationId) });
    onClose();
  });

  const onSave = () => {
    if (!officer) return;
    const role = roles.find((r) => r.id === officer.roleId);
    const data = buildOverridePayload(role?.permissions ?? [], selected);
    mutate({
      url: convertParamsToString(rbacRequest.OFFICER_PERMISSIONS, { organisationId, userId: officer.userId }),
      data,
    });
  };

  return (
    <Dialog.Root open={isOpen} size='lg' placement='center' scrollBehavior="inside" onOpenChange={e => {
      if (!e.open) {
        onClose();
      }
    }}>
      <Portal>

        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>Permissions — {officer?.username}</Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              {catalog && (
                <PermissionGrid areas={catalog.areas} value={selected} onChange={setSelected} />
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
              <Button variant="primary" loading={isLoading} onClick={onSave}>Save</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default EditOfficerPermissionsModal;
