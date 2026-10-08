import { ReactNode, useCallback, useRef, useState } from "react";
import { Button, CloseButton, Dialog, Portal, Text } from "@chakra-ui/react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  /** Name the action ("Delete", "Save attendance"), not "Yes". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Palette of the confirm button, e.g. "red" for destructive actions. */
  confirmPalette?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The app's one confirmation dialog. Cancel is neutral (left); Confirm is
 * solid and coloured by intent (right). Escape, the backdrop and the close
 * button all cancel.
 */
export const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmPalette = "blue",
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) => (
  <Dialog.Root
    open={open}
    placement="center"
    role="alertdialog"
    onOpenChange={(e) => {
      if (!e.open) onClose();
    }}
  >
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content mx={4}>
          <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" />
          </Dialog.CloseTrigger>
          <Dialog.Body>
            {typeof body === "string" ? <Text whiteSpace="pre-line">{body}</Text> : body}
          </Dialog.Body>
          <Dialog.Footer gap={3}>
            <Button
              variant="outline"
              colorPalette="gray"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              variant="solid"
              colorPalette={confirmPalette}
              onClick={onConfirm}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for deletes and removals. */
  destructive?: boolean;
}

/**
 * Ask a one-off question and await the answer:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (await confirm({ title, body, confirmLabel: "Delete", destructive: true })) remove();
 *   ...
 *   return <>{...}{confirmDialog}</>;
 *
 * Resolves true on Confirm, false on Cancel/Escape/close. A new question
 * cancels one still open. For a dialog with a loading state while the action
 * runs, render ConfirmDialog directly.
 */
export const useConfirm = () => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const settle = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Options outlive `open` so the text stays put while the dialog closes.
  const confirmDialog = options ? (
    <ConfirmDialog
      open={open}
      title={options.title}
      body={options.body}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      confirmPalette={options.destructive ? "red" : "blue"}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
};
