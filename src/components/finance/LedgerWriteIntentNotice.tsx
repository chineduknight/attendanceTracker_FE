import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  LedgerIntentRead,
  ledgerWriteIntentGuidance,
} from "helpers/ledgerWriteIntent";
import { LEDGER_WRITE_UNCERTAIN_NOTE } from "helpers/ledgerWriteUncertainty";

/**
 * The block shown while a ledger write intent is outstanding.
 *
 * It covers both opening-balance actions and lifecycle actions (suspend,
 * resume, period lock, gap-window attestation) because they share one
 * organisation-scoped intent slot. It appears on mount from persisted state,
 * so a reload cannot re-enable a write whose request may already have been
 * sent. Only an explicit reconciliation clears it; a later 409 is never
 * treated as proof either way. While the request is still running in this
 * page there is nothing to reconcile yet, so no acknowledgement is offered.
 */
const LedgerWriteIntentNotice = ({
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
        "Only continue if you have checked the ledger and its recent audit records and are sure the earlier change does not need to be repeated. We cannot confirm whether it was saved.",
      confirmLabel: "I've checked",
    });
    if (confirmed) onAcknowledge();
  };

  if (read.kind === "pending" && read.inFlight) {
    return (
      <Box
        role="status"
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
        p={3}
        bg="bg.panel"
      >
        <Stack gap={1}>
          <Text fontSize="sm" fontWeight="semibold">
            Sending a ledger change
          </Text>
          <Text fontSize="sm" color="fg.muted">
            Its result isn't known yet. Other ledger changes are blocked until it finishes.
          </Text>
        </Stack>
      </Box>
    );
  }

  const storageUnavailable = read.kind === "storage-unavailable";
  const body = storageUnavailable
    ? "This browser can't store the safety record required before a ledger change, so ledger changes are blocked. Allow site storage and try again."
    : read.kind === "pending"
      ? LEDGER_WRITE_UNCERTAIN_NOTE
      : "This browser has a safety record for a ledger change that this app version can't read. Check the ledger and its audit records before making another change.";

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
            ? "Ledger changes are blocked"
            : "We couldn't confirm the last ledger change"}
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

export default LedgerWriteIntentNotice;
