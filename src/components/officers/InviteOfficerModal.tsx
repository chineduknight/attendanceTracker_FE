import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, FormErrorMessage, Input, Select, Button,
} from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "react-toastify";
import { useQueryWrapper, postRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { Role, InviteResponse } from "rbac/types";

interface Props { organisationId: string; isOpen: boolean; onClose: () => void; }
interface InviteInputs { email: string; roleId: string; }

const InviteOfficerModal = ({ organisationId, isOpen, onClose }: Props) => {
  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(["roles", organisationId], rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteInputs>();

  const onSuccess = (res: { data: InviteResponse }) => {
    if ("attached" in res.data) toast.success("Officer added");
    else toast.success("Invite pending — they'll join when they sign up with that email");
    queryClient.invalidateQueries(["officers", organisationId]);
    queryClient.invalidateQueries(["officer-invites", organisationId]);
    reset();
    onClose();
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const onSubmit: SubmitHandler<InviteInputs> = (data) =>
    mutate({ url: convertParamsToString(rbacRequest.INVITE, { organisationId }), data });

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Invite officer</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <FormControl isInvalid={!!errors.email} mb={3}>
              <FormLabel>Email</FormLabel>
              <Input type="email" {...register("email", {
                required: "Email is required",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
              })} />
              <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={!!errors.roleId}>
              <FormLabel>Role</FormLabel>
              <Select placeholder="Select role" {...register("roleId", { required: "Role is required" })}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <FormErrorMessage>{errors.roleId?.message}</FormErrorMessage>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>Send invite</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default InviteOfficerModal;
