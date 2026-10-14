import { useEffect, useState } from "react";
import { CloseButton, Button, Field, Dialog, Portal } from "@chakra-ui/react";
import { OptionSelect } from "components/ui/themed-select";
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
            <Dialog.Header><Dialog.Title>Change role — {officer?.username}</Dialog.Title></Dialog.Header>
            <Dialog.CloseTrigger asChild><CloseButton size="sm" minW="44px" minH="44px" /></Dialog.CloseTrigger>
            <Dialog.Body>
              <Field.Root>
                <Field.Label>Role</Field.Label>
                <OptionSelect
                  options={roles.map((r) => ({ value: r.id, label: r.name }))}
                  value={roleId}
                  onChange={setRoleId}
                />
              </Field.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="secondary" mr={3} minH="44px" onClick={onClose}>Cancel</Button>
              <Button variant="primary" minH="44px" loading={isLoading} disabled={!roleId} onClick={onSave}>Save</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default EditOfficerRoleModal;
