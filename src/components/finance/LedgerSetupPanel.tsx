import { useId, useState } from "react";
import { Badge, Box, Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import LedgerChartOfAccounts from "components/finance/LedgerChartOfAccounts";
import { useConfirm } from "components/ui/confirm-dialog";
import { Switch } from "components/ui/switch";
import { LEDGER_SETUP_UI_ENABLED } from "config/ledgerSetup";
import {
  LEDGER_SETUP_ERROR_CODES,
  SetupStepStatus,
  canEnableMemberReceipts,
  canStartLedgerSetup,
  ledgerApiFailure,
  ledgerSetupSteps,
  ledgerWriteOutcomeUnknown,
} from "helpers/ledgerSetup";
import {
  LEDGER_WRITE_UNCERTAIN_NOTE,
  LedgerWriteAction,
  ledgerWriteUncertaintyGuidance,
} from "helpers/ledgerWriteUncertainty";
import { ledgerStateKey } from "helpers/ledger";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { useLedgerSetup } from "hooks/useLedgerSetup";
import { useLedgerWriteUncertainty } from "hooks/useLedgerWriteUncertainty";
import { usePermissions } from "rbac/usePermissions";

/**
 * F2A-2 ledger setup shell (RFC v0.3 §4.1–§4.3, §8.1, D1).
 *
 * Gated by `config/ledgerSetup`: while that is false this renders nothing, so
 * the Books tab behaves exactly as #131 shipped. The flows below are wired to
 * the proposed (not yet merged) routes and are tested with mocked responses.
 *
 * It only starts setup, records the member-receipts decision and manages the
 * chart of accounts. Opening balances, verification, activation, suspension,
 * receipts, expenses, transfers, reversals and refunds are later phases and
 * have no control here.
 */

const STEP_SCHEMES: Record<
  SetupStepStatus,
  "green" | "blue" | "gray"
> = {
  done: "green",
  current: "blue",
  todo: "gray",
  later: "gray",
};

const STEP_LABELS: Record<SetupStepStatus, string> = {
  done: "Done",
  current: "Next",
  todo: "To do",
  later: "Later",
};

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Text as="h2" id={id} fontSize="lg" fontWeight="semibold" mb={2}>
    {children}
  </Text>
);

const AlertBox = ({
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
const WriteUncertaintyNotice = ({
  action,
  canManage,
  onRecheck,
  onAcknowledge,
  isRechecking,
}: {
  action: Parameters<typeof ledgerWriteUncertaintyGuidance>[0];
  canManage: boolean;
  onRecheck: () => void;
  onAcknowledge: () => void;
  isRechecking: boolean;
}) => {
  const { confirm, confirmDialog } = useConfirm();

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
          <Button size="sm" variant="outline" loading={isRechecking} onClick={onRecheck}>
            Recheck the ledger
          </Button>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => void acknowledge()}>
              I've checked the ledger
            </Button>
          )}
        </Flex>
      </Stack>
      {confirmDialog}
    </Box>
  );
};

interface LedgerSetupPanelProps {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  accountsError: unknown;
  onRetryAccounts: () => void;
  /** Refetches status and accounts after an unresolved write. */
  onRecheckLedger?: () => void;
  isRetryingAccounts: boolean;
  /** Tests can force the gate on; production reads config/ledgerSetup. */
  enabled?: boolean;
}

const LedgerSetupPanel = ({
  organisationId,
  status: statusProp,
  accounts,
  accountsError,
  onRetryAccounts,
  onRecheckLedger,
  isRetryingAccounts,
  enabled = LEDGER_SETUP_UI_ENABLED,
}: LedgerSetupPanelProps) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const { confirm, confirmDialog } = useConfirm();
  const { startSetup, enableMemberReceipts, isStarting, isEnablingReceipts } =
    useLedgerSetup(organisationId);
  const { uncertainty, mark, clear } = useLedgerWriteUncertainty(organisationId);

  const [memberReceiptsChoice, setMemberReceiptsChoice] = useState(false);
  const [localStatus, setLocalStatus] = useState<LedgerStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Any unresolved write blocks every setup/account write in this
  // organisation until an officer reconciles it.
  const writeBlocked = uncertainty !== null;

  // The setup write response is the only place `setup` is visible until
  // GET /status adopts the F2 read shape (F2A-4). It is used only while the
  // server still reports `not_active`; a real F2 status always wins.
  const status =
    ledgerStateKey(statusProp) === "not_active" && localStatus
      ? localStatus
      : statusProp;
  const state = ledgerStateKey(status);

  if (!enabled) return null;
  // An unrecognised lifecycle state gets no setup controls, exactly like the
  // Books shell: this build cannot say what the state means.
  if (state === "unknown") return null;

  const notStarted = state === "not_active";
  const steps = ledgerSetupSteps(status, accounts);
  const memberReceiptsKnown = status.memberReceiptsEnabled !== null;

  const handleFailure = (error: unknown, action: LedgerWriteAction) => {
    const failure = ledgerApiFailure(error);
    if (ledgerWriteOutcomeUnknown(failure)) {
      // Persisted: a reload must not re-open the same write.
      mark(action);
      setActionError(null);
      return;
    }
    setActionError(failure.message ?? "The change wasn't saved. Try again.");
  };

  const start = async () => {
    if (writeBlocked) return;
    const confirmed = await confirm({
      title: "Start bookkeeping setup",
      body: `Create an empty ledger for this organisation? Existing dues/levy records are not copied into it, and no money is posted. Member receipts will be ${
        memberReceiptsChoice ? "on" : "off"
      }.`,
      confirmLabel: "Start setup",
    });
    if (!confirmed) return;
    startSetup(memberReceiptsChoice, {
      onSuccess: (next) => {
        setLocalStatus(next);
        setActionError(null);
      },
      onError: (error) => {
        const failure = ledgerApiFailure(error);
        // F2A-4 gap: a reloaded F1 status still reads `not_active`. A 409 says
        // setup exists, not that *this* attempt succeeded — never treat it as
        // confirmation and never clear an unresolved marker from it.
        if (failure.code === LEDGER_SETUP_ERROR_CODES.alreadyStarted) {
          setActionError(
            "Setup already exists for this organisation. That doesn't confirm whether your earlier attempt was saved, so recheck the ledger before continuing.",
          );
          return;
        }
        handleFailure(error, "setup");
      },
    });
  };

  const turnOnMemberReceipts = async () => {
    if (writeBlocked || status.revision === null) return;
    const confirmed = await confirm({
      title: "Turn on member receipts",
      body: "Turn on member receipts for this ledger? Money received for a member will be held as a liability until it is allocated. There is no turn-off operation once it is on.",
      confirmLabel: "Turn on",
    });
    if (!confirmed) return;
    enableMemberReceipts(status.revision, {
      onSuccess: (next) => {
        setLocalStatus(next);
        setActionError(null);
      },
      onError: (error) => handleFailure(error, "member-receipts"),
    });
  };

  return (
    <Box as="section" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Bookkeeping setup</SectionHeading>
      <Stack gap={4}>
        {uncertainty && (
          <WriteUncertaintyNotice
            action={uncertainty.action}
            canManage={canManage}
            onRecheck={() => (onRecheckLedger ?? onRetryAccounts)()}
            onAcknowledge={clear}
            isRechecking={isRetryingAccounts}
          />
        )}
        {actionError && <AlertBox title="That change wasn't saved">{actionError}</AlertBox>}

        {!canManage && (
          <Text fontSize="sm" color="fg.muted">
            You can view bookkeeping setup with your current permissions. Starting it or
            changing accounts needs the finance manage permission.
          </Text>
        )}

        <GroupedList aria-label="Bookkeeping setup progress">
          {steps.map((step) => (
            <GroupedListItem key={step.key}>
              <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
                <Stack gap={0.5} minW={0}>
                  <Text fontWeight="semibold" fontSize="sm">
                    {step.title}
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    {step.detail}
                  </Text>
                </Stack>
                <Badge colorPalette={STEP_SCHEMES[step.status]} variant="subtle">
                  {STEP_LABELS[step.status]}
                </Badge>
              </Flex>
            </GroupedListItem>
          ))}
        </GroupedList>

        {notStarted ? (
          <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
            <Stack gap={3}>
              <Text fontSize="sm" color="fg.muted">
                Books start empty. Dues/levy figures stay in the existing finance reports;
                nothing here creates a balance or posts money.
              </Text>
              <Field.Root>
                <Field.Label>Support member receipts</Field.Label>
                <Switch
                  checked={memberReceiptsChoice}
                  onCheckedChange={setMemberReceiptsChoice}
                  disabled={writeBlocked || !canManage || isStarting}
                />
                <Field.HelperText>
                  Turn this on if the organisation holds money for members before it is
                  allocated to dues or a levy. It can be turned on later, but there is no
                  turn-off operation once it is on.
                </Field.HelperText>
              </Field.Root>
              <Button
                alignSelf="flex-start"
                colorPalette="teal"
                loading={isStarting}
                disabled={
                  writeBlocked || !canManage || !canStartLedgerSetup(status, canManage)
                }
                onClick={() => void start()}
              >
                Start bookkeeping setup
              </Button>
            </Stack>
          </Box>
        ) : (
          <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
            <Stack gap={2}>
              <Flex justify="space-between" align="center" gap={3} wrap="wrap">
                <Text fontWeight="semibold" fontSize="sm">
                  Member receipts
                </Text>
                <Badge
                  colorPalette={
                    status.memberReceiptsEnabled === true
                      ? "green"
                      : status.memberReceiptsEnabled === false
                        ? "gray"
                        : "yellow"
                  }
                  variant="subtle"
                >
                  {status.memberReceiptsEnabled === true
                    ? "On"
                    : status.memberReceiptsEnabled === false
                      ? "Off"
                      : "Unknown"}
                </Badge>
              </Flex>
              <Text fontSize="sm" color="fg.muted">
                {status.memberReceiptsEnabled === true
                  ? "Money received for a member is held as a liability until it is allocated."
                  : status.memberReceiptsEnabled === false
                    ? "Member money is not tracked as a liability. It can be turned on before the ledger is activated; there is no turn-off operation once it is on."
                    : "This server did not report the member-receipts setting."}
              </Text>

              {canManage && canEnableMemberReceipts(status, canManage) && (
                <Button
                  alignSelf="flex-start"
                  variant="outline"
                  loading={isEnablingReceipts}
                  disabled={writeBlocked}
                  onClick={() => void turnOnMemberReceipts()}
                >
                  Turn on member receipts
                </Button>
              )}

              {canManage &&
                status.memberReceiptsEnabled === false &&
                status.revision === null &&
                (state === "setup" || state === "pending_verification") && (
                  <Text fontSize="xs" color="fg.muted">
                    This server doesn't send the ledger revision yet, so this setting can't
                    be changed from here.
                  </Text>
                )}

              {canManage &&
                status.memberReceiptsEnabled === false &&
                state === "active" && (
                  <Text fontSize="xs" color="fg.muted">
                    Member receipts can't be turned on from this release after activation.
                  </Text>
                )}

              {!memberReceiptsKnown && canManage && (
                <Text fontSize="xs" color="fg.muted">
                  Nothing is assumed about this setting while the server doesn't report it.
                </Text>
              )}
            </Stack>
          </Box>
        )}

        {!notStarted && (
          <LedgerChartOfAccounts
            organisationId={organisationId}
            status={status}
            accounts={accounts}
            accountsError={accountsError}
            onRetryAccounts={onRetryAccounts}
            isRetryingAccounts={isRetryingAccounts}
            canManage={canManage}
            writesBlocked={writeBlocked}
            onWriteUncertain={mark}
          />
        )}
      </Stack>
      {confirmDialog}
    </Box>
  );
};

export default LedgerSetupPanel;
