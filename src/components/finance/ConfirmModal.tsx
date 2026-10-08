import { ReactNode } from "react";
import { CloseButton, Button, Text, Dialog, Portal } from "@chakra-ui/react";

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
  <Dialog.Root open={isOpen} placement='center' onOpenChange={e => {
    if (!e.open) {
      onClose();
    }
  }}>
    <Portal>

      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header><Dialog.Title>{title}</Dialog.Title></Dialog.Header>
          <Dialog.CloseTrigger asChild><CloseButton size="sm" /></Dialog.CloseTrigger>
          <Dialog.Body>{typeof body === "string" ? <Text>{body}</Text> : body}</Dialog.Body>
          <Dialog.Footer gap={3}>
            <Button
              variant="outline"
              colorPalette="gray"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
            <Button
              variant="solid"
              colorPalette={confirmColorScheme}
              onClick={onConfirm}
              loading={isLoading}
            >
              {confirmLabel}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>

    </Portal>
  </Dialog.Root>
);

export default ConfirmModal;
