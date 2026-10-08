import { Input, Button, Text, Field, Dialog, Portal } from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { authRequest } from "services";
import { patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { MeResponse } from "rbac/types";
import { queryKeys } from "services/api/queryKeys";

interface EmailInput { email: string; }

const SetEmailModal = () => {
  const [user, setUser] = useGlobalStore((s) => [s.user, s.setUser]);
  const { register, handleSubmit, formState: { errors } } = useForm<EmailInput>();

  const onSuccess = (res: { data: MeResponse }) => {
    setUser({ ...user, email: res.data.email, needsEmail: false });
    queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations });
  };
  const { mutate, isLoading } = useMutationWrapper(patchRequest, onSuccess);

  const onSubmit: SubmitHandler<EmailInput> = (data) =>
    mutate({ url: authRequest.SET_EMAIL, data });

  return (
    <Dialog.Root open={!!user.token && user.needsEmail} closeOnInteractOutside={false} placement='center' onOpenChange={e => {
      if (!e.open)
        {}
    }}>
      <Portal>

        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header><Dialog.Title>Add your email</Dialog.Title></Dialog.Header>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Dialog.Body>
                <Text mb={3} fontSize="sm" color="gray.600">
                  Set an email to unlock officer features and to redeem any pending invites.
                </Text>
                <Field.Root invalid={!!errors.email}>
                  <Field.Label>Email</Field.Label>
                  <Input
                    type="email"
                    {...register("email", {
                      required: "Email is required",
                      pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                    })}
                  />
                  <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
                </Field.Root>
              </Dialog.Body>
              <Dialog.Footer>
                <Button type="submit" variant="primary" loading={isLoading}>Save email</Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default SetEmailModal;
