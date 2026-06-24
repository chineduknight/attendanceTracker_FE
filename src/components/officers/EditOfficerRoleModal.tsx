import { useEffect, useState } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Select, Button,
} from "@chakra-ui/react";
import { useQueryWrapper, patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { Officer, Role } from "rbac/types";

interface Props { organisationId: string; officer: Officer | null; onClose: () => void; }

const EditOfficerRoleModal = ({ organisationId, officer, onClose }: Props) => {
  const isOpen = !!officer;
  const [roleId, setRoleId] = useState("");

  useEffect(() => { setRoleId(officer?.roleId ?? ""); }, [officer]);

  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(["roles", organisationId], rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { mutate, isLoading } = useMutationWrapper(patchRequest, () => {
    queryClient.invalidateQueries(["officers", organisationId]);
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
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Change role — {officer?.username}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl>
            <FormLabel>Role</FormLabel>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </FormControl>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={isLoading} isDisabled={!roleId} onClick={onSave}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditOfficerRoleModal;
