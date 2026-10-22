import { useState } from "react";
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  LEDGER_WRITE_UNCERTAIN_NOTE,
  ledgerWriteUncertaintyGuidance,
} from "helpers/ledgerWriteUncertainty";
import { useLedgerWriteUncertainty } from "hooks/useLedgerWriteUncertainty";

/** A refusal or warning box shared by the setup and Categories & Accounts screens. */
export const AlertBox = ({
  tone = "error",
  title,
  children,
}: {
  tone?: "error" | "warning";
  title: string;
  children: string;
}) => (
  <Box
    role="alert"
    borderWidth="1px"
    borderColor={tone === "error" ? "border.error" : "border.warning"}
    borderRadius="md"
    p={3}
    bg="bg.panel"
  >
    <Text fontSize="sm" fontWeight="semibold" color={tone === "error" ? "fg.error" : "fg"}>
      {title}
    </Text>
    <Text fontSize="sm" color="fg.muted">
      {children}
    </Text>
  </Box>
);

/**
 * The only escape from an unresolved write is a person checking the ledger.
 * Controls stay disabled until then, across reloads. "Recheck" refetches the
 * ledger so the officer can compare before acknowledging.
 */
export const WriteUncertaintyNotice = ({
  action,
  canManage,
  onRecheck,
  onAcknowledge,
  isRechecking,
}: {
  action: Parameters<typeof ledgerWriteUncertaintyGuidance>[0];
  canManage: boolean;
  /** Resolves `true` only when the status and accounts reloaded cleanly. */
  onRecheck: () => Promise<boolean> | void;
  onAcknowledge: () => void;
  isRechecking: boolean;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const [rechecked, setRechecked] = useState(false);
  // Every unresolved write, F2A-2 or F3A, needs a fresh usable recheck before
  // anyone can acknowledge it. Cached, failed or malformed reads never count.
  const acknowledgeLocked = !rechecked;

  const recheck = async () => {
    if ((await onRecheck()) === true) setRechecked(true);
  };

  const acknowledge = async () => {
    const confirmed = await confirm({
      title: "Continue after checking?",
      body:
        "Only continue if you have checked the current ledger and are sure the earlier change does not need to be repeated. We cannot confirm whether it was saved.",
      confirmLabel: "I've checked",
    });
    if (confirmed) onAcknowledge();
  };

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
          We couldn't confirm that change
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {LEDGER_WRITE_UNCERTAIN_NOTE}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {ledgerWriteUncertaintyGuidance(action)}
        </Text>
        <Flex gap={2} wrap="wrap">
          <Button size="sm" variant="outline" loading={isRechecking} onClick={() => void recheck()}>
            Recheck the ledger
          </Button>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              disabled={acknowledgeLocked}
              onClick={() => void acknowledge()}
            >
              I've checked the ledger
            </Button>
          )}
        </Flex>
        {canManage && acknowledgeLocked && (
          <Text fontSize="xs" color="fg.muted">
            Recheck the ledger first, then compare it with the change you made.
          </Text>
        )}
      </Stack>
      {confirmDialog}
    </Box>
  );
};

/**
 * A ledger write from this page is still waiting for its response. Its outcome
 * is not known yet, so there is nothing to recheck or acknowledge; every
 * other ledger change waits. If the page goes away first, the marker stays
 * and comes back as "We couldn't confirm that change".
 */
export const PendingWriteNotice = () => (
  <Box role="status" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
    <Text fontSize="sm" fontWeight="semibold">
      Waiting for the server to confirm that change
    </Text>
    <Text fontSize="sm" color="fg.muted">
      Other ledger changes are paused until it is confirmed. If this page is closed or reloaded
      first, the change will need to be checked before anything else is changed.
    </Text>
  </Box>
);

export interface LedgerWriteNoticesProps {
  organisationId: string;
  canManage: boolean;
  /**
   * Refetches status and accounts after an unresolved write; resolves `true`
   * when both reloaded into usable shapes. `requireAllocations` is false for
   * F2A-2 writes, so an older F2 backend need not report the F3 setting.
   * `allowInitialSetup` is true only for an unresolved initial setup.
   */
  onRecheckLedger?: (options: {
    requireAllocations: boolean;
    allowInitialSetup: boolean;
  }) => Promise<boolean> | void;
  onRetryAccounts: () => void;
  isRechecking: boolean;
}

/**
 * One place that renders this organisation's pending or unresolved ledger
 * write, with no behaviour of its own beyond asking for a recheck. Shared by
 * Bookkeeping setup and Categories & Accounts so the latch reads the same on
 * whichever screen is open.
 */
export const LedgerWriteNotices = ({
  organisationId,
  canManage,
  onRecheckLedger,
  onRetryAccounts,
  isRechecking,
}: LedgerWriteNoticesProps) => {
  const { uncertainty, clear } = useLedgerWriteUncertainty(organisationId);

  if (!uncertainty) return null;
  if (uncertainty.pending) return <PendingWriteNotice />;
  return (
    <WriteUncertaintyNotice
      // A new marker starts a new check: an earlier recheck never counts.
      key={`${uncertainty.action}:${uncertainty.at}`}
      action={uncertainty.action}
      canManage={canManage}
      onRecheck={() => {
        if (onRecheckLedger)
          return onRecheckLedger({
            // The allocations-setting action is F3-specific even if the F3A
            // gate is later turned off; F2A-2 actions are not.
            requireAllocations: uncertainty.action === "member-allocations",
            // Only an unknown initial setup may legitimately reconcile
            // against a not_active status with no revision.
            allowInitialSetup: uncertainty.action === "setup",
          });
        // No status+accounts recheck is available: refetch what we can, but
        // never unlock acknowledgement from a partial read.
        onRetryAccounts();
      }}
      onAcknowledge={clear}
      isRechecking={isRechecking}
    />
  );
};

export default LedgerWriteNotices;
