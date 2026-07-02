import { ReactNode } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
} from "@chakra-ui/react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** colorScheme of the confirm button — e.g. "purple" for set, "red" for destructive */
  confirmColorScheme?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * A confirmation dialog with visually DISTINCT actions:
 * - Cancel: neutral gray outline (left)
 * - Confirm: solid colored, colorScheme conveys intent (right)
 */
const ConfirmModal = ({
  isOpen,
  title,
  body,
  confirmLabel = "Yes",
  cancelLabel = "No",
  confirmColorScheme = "purple",
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) => (
  <Modal isOpen={isOpen} onClose={onClose} isCentered>
    <ModalOverlay />
    <ModalContent>
      <ModalHeader>{title}</ModalHeader>
      <ModalCloseButton />
      <ModalBody>{typeof body === "string" ? <Text>{body}</Text> : body}</ModalBody>
      <ModalFooter gap={3}>
        <Button
          variant="outline"
          colorScheme="gray"
          onClick={onClose}
          isDisabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="solid"
          colorScheme={confirmColorScheme}
          onClick={onConfirm}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

export default ConfirmModal;
