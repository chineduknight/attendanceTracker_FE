import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  FormControl, FormLabel, FormErrorMessage, Input, Button, Text,
} from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { authRequest } from "services";
import { patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { MeResponse } from "rbac/types";

interface EmailInput { email: string; }

const SetEmailModal = () => {
  const [user, setUser] = useGlobalStore((s) => [s.user, s.setUser]);
  const { register, handleSubmit, formState: { errors } } = useForm<EmailInput>();

  const onSuccess = (res: { data: MeResponse }) => {
    setUser({ ...user, email: res.data.email, needsEmail: false });
    queryClient.invalidateQueries({ queryKey: ["all-organisations"] });
  };
  const { mutate, isLoading } = useMutationWrapper(patchRequest, onSuccess);

  const onSubmit: SubmitHandler<EmailInput> = (data) =>
    mutate({ url: authRequest.SET_EMAIL, data });

  return (
    <Modal isOpen={!!user.token && user.needsEmail} onClose={() => {}} closeOnOverlayClick={false} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add your email</ModalHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <Text mb={3} fontSize="sm" color="gray.600">
              Set an email to unlock officer features and to redeem any pending invites.
            </Text>
            <FormControl isInvalid={!!errors.email}>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                {...register("email", {
                  required: "Email is required",
                  pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                })}
              />
              <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button type="submit" variant="primary" isLoading={isLoading}>Save email</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default SetEmailModal;
