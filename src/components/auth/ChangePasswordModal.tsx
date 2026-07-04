import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
  ModalBody, ModalFooter, FormControl, FormLabel, FormErrorMessage,
  Button, Stack,
} from "@chakra-ui/react";
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
    <Modal isOpen={isOpen} onClose={handleClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Change password</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isInvalid={!!errors.currentPassword}>
                <FormLabel>Current password</FormLabel>
                <PasswordInput
                  autoComplete="current-password"
                  {...register("currentPassword", {
                    required: "Current password is required",
                  })}
                />
                <FormErrorMessage>{errors.currentPassword?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.newPassword}>
                <FormLabel>New password</FormLabel>
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
                <FormErrorMessage>{errors.newPassword?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.confirmPassword}>
                <FormLabel>Confirm new password</FormLabel>
                <PasswordInput
                  autoComplete="new-password"
                  {...register("confirmPassword", {
                    required: "Please confirm your new password",
                    validate: (value) =>
                      value === watch("newPassword") || "Passwords do not match",
                  })}
                />
                <FormErrorMessage>{errors.confirmPassword?.message}</FormErrorMessage>
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleClose} isDisabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              Update password
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default ChangePasswordModal;
