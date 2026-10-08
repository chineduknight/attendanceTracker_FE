import { Input, NativeSelect, Button, Field, Dialog, Portal } from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "react-toastify";
import { useQueryWrapper, postRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import { Role, InviteResponse } from "rbac/types";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface Props { organisationId: string; isOpen: boolean; onClose: () => void; }
interface InviteInputs { email: string; roleId: string; }

const InviteOfficerModal = ({ organisationId, isOpen, onClose }: Props) => {
  const terms = useTerms();
  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(queryKeys.rbac.roles(organisationId), rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteInputs>();

  const onSuccess = (res: { data: InviteResponse }) => {
    if ("attached" in res.data) toast.success(`${terms.officerSingular} added`);
    else toast.success("Invite pending — they'll join when they sign up with that email");
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.officers(organisationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.invites(organisationId) });
    reset();
    onClose();
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const onSubmit: SubmitHandler<InviteInputs> = (data) =>
    mutate({ url: convertParamsToString(rbacRequest.INVITE, { organisationId }), data });

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
            <Dialog.Header>{`Invite ${lowerTerm(terms.officerSingular)}`}</Dialog.Header>
            <Dialog.CloseTrigger />
            <form onSubmit={handleSubmit(onSubmit)}>
              <Dialog.Body>
                <Field.Root invalid={!!errors.email} mb={3}>
                  <Field.Label>Email</Field.Label>
                  <Input type="email" {...register("email", {
                    required: "Email is required",
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
                  })} />
                  <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
                </Field.Root>
                <Field.Root invalid={!!errors.roleId}>
                  <Field.Label>Role</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      placeholder="Select role"
                      {...register("roleId", { required: "Role is required" })}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Field.ErrorText>{errors.roleId?.message}</Field.ErrorText>
                </Field.Root>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="primary" loading={isLoading}>Send invite</Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default InviteOfficerModal;
