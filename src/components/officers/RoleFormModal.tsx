import { useEffect, useState } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, FormErrorMessage, Input, Button,
} from "@chakra-ui/react";
import {
  useQueryWrapper, postRequest, putRequest, useMutationWrapper, queryClient,
} from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
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

  const { data: catalogData } = useQueryWrapper(["permissions-catalog"], rbacRequest.PERMISSIONS, { enabled: isOpen });
  const catalog: PermissionsCatalog | undefined = catalogData?.data;

  const onSuccess = () => {
    queryClient.invalidateQueries(["roles", organisationId]);
    queryClient.invalidateQueries(["officers", organisationId]);
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
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? "Edit role" : "Create role"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl isInvalid={nameInvalid} mb={4}>
            <FormLabel>Role name</FormLabel>
            <Input value={name} onChange={(e) => { setName(e.target.value); setTouchedName(true); }} />
            <FormErrorMessage>Name is required</FormErrorMessage>
          </FormControl>
          {catalog && <PermissionGrid areas={catalog.areas} value={perms} onChange={setPerms} />}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={creating || updating}
            isDisabled={name.trim().length === 0} onClick={onSave}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RoleFormModal;
