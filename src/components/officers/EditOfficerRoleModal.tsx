import { useEffect, useState } from "react";
import { NativeSelect, Button, Field, Dialog, Portal } from "@chakra-ui/react";
import { useQueryWrapper, patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import { Officer, Role } from "rbac/types";

interface Props { organisationId: string; officer: Officer | null; onClose: () => void; }

const EditOfficerRoleModal = ({ organisationId, officer, onClose }: Props) => {
  const isOpen = !!officer;
  const [roleId, setRoleId] = useState("");

  useEffect(() => { setRoleId(officer?.roleId ?? ""); }, [officer]);

  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(queryKeys.rbac.roles(organisationId), rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { mutate, isLoading } = useMutationWrapper(patchRequest, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.officers(organisationId) });
    onClose();
  });

  const onSave = () => {
    if (!officer) return;
    mutate({
      url: convertParamsToString(rbacRequest.OFFICER_ROLE, { organisationId, userId: officer.userId }),
      data: { roleId },
    });
  };

  return (
    <Dialog.Root open={isOpen} placement='center' onOpenChange={e => {
      if (!e.open) {
        onClose();
      }
    }}>
      <Portal>

        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>Change role — {officer?.username}</Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              <Field.Root>
                <Field.Label>Role</Field.Label>
                <NativeSelect.Root>
                  <NativeSelect.Field value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
              <Button variant="primary" loading={isLoading} disabled={!roleId} onClick={onSave}>Save</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default EditOfficerRoleModal;
