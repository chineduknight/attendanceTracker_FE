import { useEffect, useState } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, Button,
} from "@chakra-ui/react";
import { useQueryWrapper, patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import PermissionGrid from "components/officers/PermissionGrid";
import { buildOverridePayload } from "rbac/rbacPayloads";
import { PermissionKey } from "rbac/permissions";
import { Officer, Role, PermissionsCatalog } from "rbac/types";

interface Props { organisationId: string; officer: Officer | null; onClose: () => void; }

const EditOfficerPermissionsModal = ({ organisationId, officer, onClose }: Props) => {
  const isOpen = !!officer;
  const [selected, setSelected] = useState<PermissionKey[]>([]);

  useEffect(() => { setSelected(officer?.permissions ?? []); }, [officer]);

  const { data: catalogData } = useQueryWrapper(["permissions-catalog"], rbacRequest.PERMISSIONS, { enabled: isOpen });
  const catalog: PermissionsCatalog | undefined = catalogData?.data;

  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(["roles", organisationId], rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { mutate, isLoading } = useMutationWrapper(patchRequest, () => {
    queryClient.invalidateQueries(["officers", organisationId]);
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
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Permissions — {officer?.username}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {catalog && (
            <PermissionGrid areas={catalog.areas} value={selected} onChange={setSelected} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={isLoading} onClick={onSave}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditOfficerPermissionsModal;
