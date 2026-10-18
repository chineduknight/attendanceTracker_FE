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
import { ledgerStateKey } from "helpers/ledger";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { useLedgerSetup } from "hooks/useLedgerSetup";
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

interface LedgerSetupPanelProps {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  accountsError: unknown;
  onRetryAccounts: () => void;
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
  isRetryingAccounts,
  enabled = LEDGER_SETUP_UI_ENABLED,
}: LedgerSetupPanelProps) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const { confirm, confirmDialog } = useConfirm();
  const { startSetup, enableMemberReceipts, isStarting, isEnablingReceipts } =
    useLedgerSetup(organisationId);

  const [memberReceiptsChoice, setMemberReceiptsChoice] = useState(false);
  const [localStatus, setLocalStatus] = useState<LedgerStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

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

  const handleFailure = (error: unknown) => {
    const failure = ledgerApiFailure(error);
    if (ledgerWriteOutcomeUnknown(failure)) {
      setOutcomeUnknown(true);
      setActionError(null);
      return;
    }
    setOutcomeUnknown(false);
    setActionError(failure.message ?? "The change wasn't saved. Try again.");
  };

  const start = async () => {
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
        setOutcomeUnknown(false);
      },
      onError: (error) => {
        const failure = ledgerApiFailure(error);
        // F2A-4 gap: a reloaded F1 status still reads `not_active`, so the
        // only honest answer is "already started, state not readable yet".
        if (failure.code === LEDGER_SETUP_ERROR_CODES.alreadyStarted) {
          setOutcomeUnknown(false);
          setActionError(
            "Setup has already been started for this organisation. This release can't read the current setup state back yet.",
          );
          return;
        }
        handleFailure(error);
      },
    });
  };

  const turnOnMemberReceipts = async () => {
    if (status.revision === null) return;
    const confirmed = await confirm({
      title: "Turn on member receipts",
      body: "Turn on member receipts for this ledger? Money received for a member will be held as a liability until it is allocated. This can't be turned off while member money is held.",
      confirmLabel: "Turn on",
    });
    if (!confirmed) return;
    enableMemberReceipts(status.revision, {
      onSuccess: (next) => {
        setLocalStatus(next);
        setActionError(null);
        setOutcomeUnknown(false);
      },
      onError: handleFailure,
    });
  };

  return (
    <Box as="section" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Bookkeeping setup</SectionHeading>
      <Stack gap={4}>
        {outcomeUnknown && (
          <AlertBox tone="warning" title="We couldn't confirm that change">
            We could not confirm whether this change was saved. Reload the ledger before
            trying again. Nothing is retried automatically.
          </AlertBox>
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
                  disabled={!canManage || isStarting}
                />
                <Field.HelperText>
                  Turn this on if the organisation holds money for members before it is
                  allocated to dues or a levy. It can be turned on later, but not turned
                  off while member money is held.
                </Field.HelperText>
              </Field.Root>
              <Button
                alignSelf="flex-start"
                colorPalette="teal"
                loading={isStarting}
                disabled={!canManage || !canStartLedgerSetup(status, canManage)}
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
                    ? "Member money is not tracked as a liability. This can be turned on before the ledger is activated."
                    : "This server did not report the member-receipts setting."}
              </Text>

              {canManage && canEnableMemberReceipts(status, canManage) && (
                <Button
                  alignSelf="flex-start"
                  variant="outline"
                  loading={isEnablingReceipts}
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
          />
        )}
      </Stack>
      {confirmDialog}
    </Box>
  );
};

export default LedgerSetupPanel;
