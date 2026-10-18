import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  LedgerIntentRead,
  ledgerWriteIntentGuidance,
} from "helpers/ledgerWriteIntent";
import { LEDGER_WRITE_UNCERTAIN_NOTE } from "helpers/ledgerWriteUncertainty";

/**
 * The block shown while an opening-balance write intent is outstanding.
 *
 * It appears on mount from persisted state, so a reload cannot re-enable a
 * write whose request may already have been sent. Only an explicit
 * reconciliation clears it; a later 409 is never treated as proof either way.
 */
const OpeningWriteIntentNotice = ({
  read,
  canManage,
  isRechecking,
  onRecheck,
  onAcknowledge,
  onRetryStorage,
}: {
  read: LedgerIntentRead;
  canManage: boolean;
  isRechecking: boolean;
  onRecheck: () => void;
  onAcknowledge: () => void;
  onRetryStorage: () => void;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  if (read.kind === "none") return null;

  const acknowledge = async () => {
    const confirmed = await confirm({
      title: "Continue after checking?",
      body:
        "Only continue if you have checked the proposal and ledger and are sure the earlier change does not need to be repeated. We cannot confirm whether it was saved.",
      confirmLabel: "I've checked",
    });
    if (confirmed) onAcknowledge();
  };

  const storageUnavailable = read.kind === "storage-unavailable";
  const body = storageUnavailable
    ? "This browser can't store the safety record required before an opening change, so opening changes are blocked. Allow site storage and try again."
    : read.kind === "pending"
      ? LEDGER_WRITE_UNCERTAIN_NOTE
      : "This browser has a safety record for an opening change that this app version can't read. Check the proposal and ledger before making another change.";

  return (
    <Box
      role="alert"
      borderWidth="1px"
      borderColor="border.warning"
      borderRadius="md"
      p={3}
      bg="bg.panel"
    >
      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="semibold">
          {storageUnavailable
            ? "Opening changes are blocked"
            : "We couldn't confirm the last opening change"}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {body}
        </Text>
        {read.kind === "pending" && (
          <Text fontSize="sm" color="fg.muted">
            {ledgerWriteIntentGuidance(read.intent.action, read.intent.kind)}
          </Text>
        )}
        <Flex gap={2} wrap="wrap">
          {storageUnavailable ? (
            <Button size="sm" variant="outline" onClick={onRetryStorage}>
              Try again
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                loading={isRechecking}
                onClick={onRecheck}
              >
                Recheck the ledger
              </Button>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => void acknowledge()}>
                  I've checked the ledger
                </Button>
              )}
            </>
          )}
        </Flex>
      </Stack>
      {confirmDialog}
    </Box>
  );
};

export default OpeningWriteIntentNotice;
