import { CloseButton, Button, Stack, Field, Dialog, Portal } from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "react-toastify";
import PasswordInput from "components/PasswordInput";
import { authRequest } from "services";
import { patchRequest, useMutationWrapper } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_USER } from "zStore";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChangePasswordInputs {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const PASSWORD_MIN_LENGTH = 6;

const ChangePasswordModal = ({ isOpen, onClose }: ChangePasswordModalProps) => {
  const setUser = useGlobalStore((s) => s.setUser);
  const {
    register, handleSubmit, watch, reset, setError, formState: { errors },
  } = useForm<ChangePasswordInputs>();

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSuccess = () => {
    toast.success("Password updated");
    handleClose();
  };

  const onError = (error: { response?: { status?: number; data?: { error?: string } } }) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.error;

    if (status === 401) {
      // Two kinds of 401 share this status: a wrong current password (a form
      // error the user can fix) vs. a dead/expired session. Key off the message
      // to tell them apart — only the session case should drop the user to login.
      if (/current password/i.test(message ?? "")) {
        setError("currentPassword", {
          type: "server",
          message: "Current password is incorrect",
        });
        return;
      }
      toast.error(message ?? "Your session has expired. Please sign in again.");
      setUser(EMPTY_USER);
      return;
    }

    if (status === 429) {
      toast.error("Too many attempts, please try again later.");
      return;
    }

    // 422 (validation) and anything else — surface the server's message.
    toast.error(message ?? "Something went wrong. Please try again.");
  };

  const { mutate, isLoading } = useMutationWrapper(patchRequest, onSuccess, onError);

  const onSubmit: SubmitHandler<ChangePasswordInputs> = ({ currentPassword, newPassword }) =>
    mutate({
      url: authRequest.UPDATE_PASSWORD,
      data: { currentPassword, newPassword },
    });

  return (
    <Dialog.Root open={isOpen} placement='center' onOpenChange={e => {
      if (!e.open) {
        handleClose();
      }
    }}>
      <Portal>

        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header><Dialog.Title>Change password</Dialog.Title></Dialog.Header>
            <Dialog.CloseTrigger asChild><CloseButton size="sm" /></Dialog.CloseTrigger>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Dialog.Body>
                <Stack gap={4}>
                  <Field.Root invalid={!!errors.currentPassword}>
                    <Field.Label>Current password</Field.Label>
                    <PasswordInput
                      autoComplete="current-password"
                      {...register("currentPassword", {
                        required: "Current password is required",
                      })}
                    />
                    <Field.ErrorText>{errors.currentPassword?.message}</Field.ErrorText>
                  </Field.Root>

                  <Field.Root invalid={!!errors.newPassword}>
                    <Field.Label>New password</Field.Label>
                    <PasswordInput
                      autoComplete="new-password"
                      {...register("newPassword", {
                        required: "New password is required",
                        minLength: {
                          value: PASSWORD_MIN_LENGTH,
                          message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
                        },
                        validate: (value) =>
                          value !== watch("currentPassword") ||
                          "New password must be different from your current password",
                      })}
                    />
                    <Field.ErrorText>{errors.newPassword?.message}</Field.ErrorText>
                  </Field.Root>

                  <Field.Root invalid={!!errors.confirmPassword}>
                    <Field.Label>Confirm new password</Field.Label>
                    <PasswordInput
                      autoComplete="new-password"
                      {...register("confirmPassword", {
                        required: "Please confirm your new password",
                        validate: (value) =>
                          value === watch("newPassword") || "Passwords do not match",
                      })}
                    />
                    <Field.ErrorText>{errors.confirmPassword?.message}</Field.ErrorText>
                  </Field.Root>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="ghost" mr={3} onClick={handleClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isLoading}>
                  Update password
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>

      </Portal>
    </Dialog.Root>
  );
};

export default ChangePasswordModal;
