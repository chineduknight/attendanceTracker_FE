import { useRef } from "react";
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  Portal,
  Text,
} from "@chakra-ui/react";
import { FaShareAlt, FaWhatsapp } from "react-icons/fa";
import { errorMessage } from "components/ui/states";

interface ShareReportDialogProps {
  open: boolean;
  /** The prepared message, shown exactly as it will be shared. */
  message: string;
  /** The device share sheet failed: Share now becomes WhatsApp. */
  nativeFailed: boolean;
  onShare: () => void;
  onClose: () => void;
}

/** Preview of a prepared report; Share now hands it to the device. */
export const ShareReportDialog = ({
  open,
  message,
  nativeFailed,
  onShare,
  onClose,
}: ShareReportDialogProps) => {
  // Keep the last message on screen while the dialog animates closed.
  const shown = useRef(message);
  if (open) shown.current = message;
  return (
    <Dialog.Root
      open={open}
      placement="center"
      scrollBehavior="inside"
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx={4}>
            <Dialog.Header>
              <Dialog.Title>Share report</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" minW="44px" minH="44px" />
            </Dialog.CloseTrigger>
            <Dialog.Body>
              <Box
                as="pre"
                data-testid="share-preview"
                whiteSpace="pre-wrap"
                wordBreak="break-word"
                fontFamily="inherit"
                fontSize="sm"
                bg="bg.muted"
                borderRadius="md"
                p={3}
              >
                {shown.current}
              </Box>
              {nativeFailed && (
                <Text role="alert" mt={3} fontSize="sm" color="red.fg">
                  Your device couldn't open its share options. Nothing was
                  shared.
                </Text>
              )}
            </Dialog.Body>
            <Dialog.Footer gap={3}>
              <Button variant="outline" colorPalette="gray" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onShare}>
                {nativeFailed ? <FaWhatsapp /> : <FaShareAlt />}
                {nativeFailed ? "Share via WhatsApp" : "Share now"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

interface ShareReportErrorProps {
  error: unknown;
  onRetry: () => void;
  onCancel: () => void;
}

/**
 * A report that could not be prepared is never shared: sending it without
 * the AWAY list, or with an old one, would mislead.
 */
export const ShareReportError = ({
  error,
  onRetry,
  onCancel,
}: ShareReportErrorProps) => (
  <Box
    role="alert"
    mt={3}
    p={3}
    borderWidth="1px"
    borderColor="red.muted"
    bg="red.subtle"
    borderRadius="md"
  >
    <Text fontWeight="medium" color="red.fg">
      Couldn't prepare the report. Nothing was shared.
    </Text>
    {errorMessage(error) && (
      <Text fontSize="sm" color="fg.muted" mt={1}>
        {errorMessage(error)}
      </Text>
    )}
    <Flex gap={2} mt={3}>
      <Button
        size="sm"
        minH="44px"
        variant="outline"
        colorPalette="gray"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button size="sm" minH="44px" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </Flex>
  </Box>
);
