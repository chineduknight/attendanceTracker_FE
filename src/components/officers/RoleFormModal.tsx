import { useEffect, useState } from "react";
import { Input, Button, Field, Dialog, Portal } from "@chakra-ui/react";
import {
  useQueryWrapper, postRequest, putRequest, useMutationWrapper, queryClient,
} from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import PermissionGrid from "components/officers/PermissionGrid";
import { buildRolePayload } from "rbac/rbacPayloads";
import { PermissionKey } from "rbac/permissions";
import { Role, PermissionsCatalog } from "rbac/types";

interface Props { organisationId: string; role: Role | null; isOpen: boolean; onClose: () => void; }

const RoleFormModal = ({ organisationId, role, isOpen, onClose }: Props) => {
  const isEdit = !!role;
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<PermissionKey[]>([]);
  const [touchedName, setTouchedName] = useState(false);

  useEffect(() => {
    setName(role?.name ?? "");
    setPerms(role?.permissions ?? []);
    setTouchedName(false);
  }, [role, isOpen]);

  const { data: catalogData } = useQueryWrapper(queryKeys.permissionsCatalog, rbacRequest.PERMISSIONS, { enabled: isOpen });
  const catalog: PermissionsCatalog | undefined = catalogData?.data;

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.roles(organisationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.officers(organisationId) });
    onClose();
  };
  const { mutate: create, isLoading: creating } = useMutationWrapper(postRequest, onSuccess);
  const { mutate: update, isLoading: updating } = useMutationWrapper(putRequest, onSuccess);

  const onSave = () => {
    const data = buildRolePayload({ name, permissions: perms });
    if (isEdit && role) {
      update({ url: convertParamsToString(rbacRequest.ROLE_ONE, { organisationId, roleId: role.id }), data });
    } else {
      create({ url: convertParamsToString(rbacRequest.ROLES, { organisationId }), data });
    }
  };

  const nameInvalid = touchedName && name.trim().length === 0;

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
            <Dialog.Header>{isEdit ? "Edit role" : "Create role"}</Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              <Field.Root invalid={nameInvalid} mb={4}>
                <Field.Label>Role name</Field.Label>
                <Input value={name} onValueChange={(e) => { setName(e.target.value); setTouchedName(true); }} />
                <Field.ErrorText>Name is required</Field.ErrorText>
              </Field.Root>
              {catalog && <PermissionGrid areas={catalog.areas} value={perms} onChange={setPerms} />}
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
              <Button variant="primary" loading={creating || updating}
                disabled={name.trim().length === 0} onClick={onSave}>
                {isEdit ? "Save" : "Create"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default RoleFormModal;
