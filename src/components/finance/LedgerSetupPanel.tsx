import { useId, useRef, useState } from "react";
import { Badge, Box, Button, Checkbox, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import MemberAllocationSetup from "components/finance/allocations/MemberAllocationSetup";
import { AddMoneyAccountSheet } from "components/finance/categories/CategorySheets";
import { AlertBox, LedgerWriteNotices } from "components/finance/LedgerWriteNotices";
import { useConfirm } from "components/ui/confirm-dialog";
import { Switch } from "components/ui/switch";
import { LEDGER_F3_SETUP_UI_ENABLED } from "config/ledgerF3Setup";
import { LEDGER_OPENING_BALANCES_UI_ENABLED } from "config/ledgerOpeningBalances";
import { LEDGER_SETUP_UI_ENABLED } from "config/ledgerSetup";
import {
  buildCategoryPayload,
  missingBookkeepingAccounts,
  suggestedCategoryStates,
} from "helpers/booksCategories";
import {
  LEDGER_SETUP_ERROR_CODES,
  OPENING_PENDING_CREATE_NOTE,
  SetupStepStatus,
  canCreateAccounts,
  canEnableMemberReceipts,
  canStartLedgerSetup,
  ledgerApiFailure,
  ledgerSetupSteps,
  ledgerWriteOutcomeUnknown,
  moneyAccountsFrozen,
} from "helpers/ledgerSetup";
import { ledgerStateKey } from "helpers/ledger";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { useAccountWrites } from "hooks/useAccountWrites";
import { LedgerWriteNotSentError, useLedgerSetup } from "hooks/useLedgerSetup";
import { useLedgerWriteUncertainty } from "hooks/useLedgerWriteUncertainty";
import { usePermissions } from "rbac/usePermissions";

/**
 * Bookkeeping setup (F2A-2, simplified 22 Oct 2026).
 *
 * It starts the ledger, records the member receipts decision and — with the
 * F3 gate on — hosts the allocations checklist. Categories and money
 * accounts now live in Categories & Accounts; Setup only offers the few
 * starting suggestions and keeps the ledger's required accounts in place.
 *
 * After setup starts, and after member receipts are turned on, it RELOADS the
 * account list before deciding what is missing. A backend that creates those
 * accounts inside `POST /ledger/setup` / `PATCH /ledger/settings` is therefore
 * recognised, and nothing is ever posted twice. If a reload fails, nothing is
 * created; the recovery step stays until it can be done safely.
 */

const STEP_SCHEMES: Record<SetupStepStatus, "green" | "blue" | "gray"> = {
  done: "green",
  current: "blue",
  todo: "gray",
  later: "gray",
  optional: "gray",
};

const STEP_LABELS: Record<SetupStepStatus, string> = {
  done: "Done",
  current: "Next",
  todo: "To do",
  later: "Later",
  optional: "Optional",
};

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Text as="h2" id={id} fontSize="lg" fontWeight="semibold" mb={2}>
    {children}
  </Text>
);

interface LedgerSetupPanelProps {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  onRetryAccounts: () => void;
  /**
   * Refetches status and accounts after an unresolved write; resolves `true`
   * when both reloaded into usable shapes. `requireAllocations` is false for
   * F2A-2 writes, so an older F2 backend need not report the F3 setting.
   * `allowInitialSetup` is true only for an unresolved initial setup, whose
   * no-ledger shape has no revision.
   */
  onRecheckLedger?: (options: {
    requireAllocations: boolean;
    allowInitialSetup: boolean;
  }) => Promise<boolean> | void;
  isRetryingAccounts: boolean;
  /** Status or accounts are refetching (F3A waits for the fresh revision). */
  isRefreshingLedger?: boolean;
  /**
   * Refetches this organisation's account list and returns it. Setup calls
   * this before creating anything, so accounts a newer backend already made
   * are seen and never duplicated. `null` means the read was not usable.
   */
  reloadAccounts: () => Promise<LedgerAccount[] | null>;
  /** Tests can force the gate on; production reads config/ledgerSetup. */
  enabled?: boolean;
  /** Whether the opening-balance screens are offered; production reads config/ledgerOpeningBalances. */
  openingBalancesEnabled?: boolean;
  /** F3A allocation setup; production reads config/ledgerF3Setup. */
  f3SetupEnabled?: boolean;
}

const LedgerSetupPanel = ({
  organisationId,
  status: statusProp,
  accounts,
  onRetryAccounts,
  onRecheckLedger,
  isRetryingAccounts,
  isRefreshingLedger = false,
  reloadAccounts,
  enabled = LEDGER_SETUP_UI_ENABLED,
  openingBalancesEnabled = LEDGER_OPENING_BALANCES_UI_ENABLED,
  f3SetupEnabled = LEDGER_F3_SETUP_UI_ENABLED,
}: LedgerSetupPanelProps) => {
  const headingId = useId();
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const { confirm, confirmDialog } = useConfirm();
  const { startSetup, enableMemberReceipts, isStarting, isEnablingReceipts } =
    useLedgerSetup(organisationId);
  const writes = useAccountWrites(organisationId);
  const { uncertainty } = useLedgerWriteUncertainty(organisationId);

  const [memberReceiptsChoice, setMemberReceiptsChoice] = useState(false);
  const [localStatus, setLocalStatus] = useState<LedgerStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  // One screen must never send the same auto-create twice while it awaits.
  const autoCreating = useRef(false);

  // Any pending or unresolved write blocks every setup/account write in this
  // organisation until it is confirmed or an officer reconciles it.
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
  const frozen = moneyAccountsFrozen(status);
  const steps = ledgerSetupSteps(status, accounts, {
    openingBalancesAvailable: openingBalancesEnabled,
  });
  const memberReceiptsKnown = status.memberReceiptsEnabled !== null;
  const missing = accounts ? missingBookkeepingAccounts(status, accounts) : [];
  const createAllowed = canManage && canCreateAccounts(status, canManage) && !writeBlocked;
  const suggestions = accounts ? suggestedCategoryStates(accounts) : [];
  const creatableSuggestions = suggestions.filter(
    (suggestion) => suggestion.kind === "create",
  );
  const selectedCreatable = creatableSuggestions.filter((suggestion) =>
    selectedSuggestions.includes(suggestion.suggestion.key),
  );

  const handleFailure = (error: unknown) => {
    if (error instanceof LedgerWriteNotSentError) {
      setActionError(
        error.reason === "blocked"
          ? "An earlier ledger change is still waiting to be confirmed, so nothing was sent."
          : "This browser couldn't keep a safety record of the change, so nothing was sent. Check that site storage is allowed and try again.",
      );
      return;
    }
    const failure = ledgerApiFailure(error);
    if (ledgerWriteOutcomeUnknown(failure)) {
      // The durable write has already latched uncertainty, independent of
      // this screen. Do not write a second marker from a callback.
      setActionError(null);
      return;
    }
    setActionError(failure.message ?? "The change wasn't saved. Try again.");
  };

  /**
   * Reload first, create only what is still missing. This one function backs
   * the automatic step after setup/receipts and the recovery button, so an
   * older setup and a backend that auto-creates are handled the same way.
   */
  const ensureBookkeepingAccounts = async (
    target: LedgerStatus,
    { provideCash = false }: { provideCash?: boolean } = {},
  ) => {
    if (autoCreating.current || !canManage) return;
    autoCreating.current = true;
    try {
      const fresh = await reloadAccounts();
      // An unreadable list is not an empty one: creating from it could
      // duplicate every account the backend already made.
      if (fresh === null) return;
      const stillMissing = missingBookkeepingAccounts(target, fresh, { provideCash });
      if (stillMissing.length === 0) return;
      writes.create(stillMissing);
    } finally {
      autoCreating.current = false;
    }
  };

  const start = async () => {
    if (writeBlocked) return;
    const confirmed = await confirm({
      title: "Start bookkeeping setup",
      body: `Create this organisation's ledger and the accounts it needs? Existing dues/levy records are not copied into it, and no money is posted. Member receipts will be ${
        memberReceiptsChoice ? "on" : "off"
      }.`,
      confirmLabel: "Start setup",
    });
    if (!confirmed) return;
    startSetup(memberReceiptsChoice, {
      onSuccess: (next) => {
        setLocalStatus(next);
        setActionError(null);
        // The backend may have made these accounts itself; reload before
        // deciding, so nothing is duplicated. Only the first-time setup
        // provides Cash in hand: later it is optional and may be retired.
        if (next) void ensureBookkeepingAccounts(next, { provideCash: true });
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
        handleFailure(error);
      },
    });
  };

  const turnOnMemberReceipts = async () => {
    if (writeBlocked || status.revision === null) return;
    const confirmed = await confirm({
      title: "Turn on member receipts",
      body: `Turn on member receipts for this ledger? Money received for a member will be held as a liability until it is allocated.${
        state === "active"
          ? " Because the books are already active, the server also takes a read-only snapshot of the current dues and levy payment records at the same moment; those records are not changed."
          : ""
      } There is no turn-off operation once it is on.`,
      confirmLabel: "Turn on",
    });
    if (!confirmed) return;
    enableMemberReceipts(status.revision, {
      onSuccess: (next) => {
        setLocalStatus(next);
        setActionError(null);
        // The holding account may have been created inside the settings
        // change; reload first so it is never posted twice. A retired Cash in
        // hand stays retired: a bank-only ledger is complete.
        if (next) void ensureBookkeepingAccounts(next);
      },
      onError: (error) => handleFailure(error),
    });
  };

  const addSelectedCategories = () => {
    if (selectedCreatable.length === 0) return;
    writes.create(
      selectedCreatable.map((suggestion) =>
        buildCategoryPayload(suggestion.suggestion.name, suggestion.suggestion.kind),
      ),
      () => setSelectedSuggestions([]),
    );
  };

  const toggleSuggestion = (key: string) =>
    setSelectedSuggestions((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  return (
    <Box as="section" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Bookkeeping setup</SectionHeading>
      <Stack gap={4}>
        <LedgerWriteNotices
          organisationId={organisationId}
          canManage={canManage}
          onRecheckLedger={onRecheckLedger}
          onRetryAccounts={onRetryAccounts}
          isRechecking={isRetryingAccounts}
        />
        {actionError && <AlertBox title="That change wasn't saved">{actionError}</AlertBox>}
        {writes.error && <AlertBox title="Accounts weren't changed">{writes.error}</AlertBox>}

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

        {!notStarted && canManage && missing.length > 0 && (
          <Box borderWidth="1px" borderColor="border.warning" borderRadius="lg" bg="bg.panel" p={4}>
            <Stack gap={3}>
              <Text fontWeight="semibold" fontSize="sm">
                Finish setup: some bookkeeping accounts are missing
              </Text>
              <Text fontSize="sm" color="fg.muted">
                The books need opening balance equity and, with member receipts on, the
                member money account. They are created together in one request.
              </Text>
              <Button
                alignSelf="flex-start"
                colorPalette="teal"
                loading={writes.isSaving}
                disabled={writeBlocked}
                onClick={() => void ensureBookkeepingAccounts(status)}
              >
                Create them
              </Button>
            </Stack>
          </Box>
        )}

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
                    ? "Member money is not tracked as a liability. It can be turned on at any time while the books aren't suspended; there is no turn-off operation once it is on."
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
                (state === "setup" || state === "pending_verification" || state === "active") && (
                  <Text fontSize="xs" color="fg.muted">
                    This server doesn't send the ledger revision yet, so this setting can't
                    be changed from here.
                  </Text>
                )}

              {canManage &&
                status.memberReceiptsEnabled === false &&
                state === "suspended" && (
                  <Text fontSize="xs" color="fg.muted">
                    Member receipts can't be turned on while the books are suspended.
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

        {!notStarted && accounts && canManage && (
          <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
            <Stack gap={5}>
              <Stack gap={2}>
                <Text fontWeight="semibold" fontSize="sm">
                  Bank accounts
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  Optional. Add one now, or later in Categories &amp; Accounts.
                </Text>
                <Button
                  alignSelf="flex-start"
                  variant="outline"
                  minH="44px"
                  disabled={!createAllowed || frozen || writes.isSaving}
                  onClick={() => setBankSheetOpen(true)}
                >
                  Add bank account
                </Button>
                {frozen && (
                  <Text fontSize="sm" color="fg.muted">
                    {OPENING_PENDING_CREATE_NOTE}
                  </Text>
                )}
              </Stack>

              <Stack gap={2}>
                <Text fontWeight="semibold" fontSize="sm">
                  Income and expense categories
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  Optional. Pick a few to start with; you can add or retire them later in
                  Categories &amp; Accounts.
                </Text>
                {suggestions.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    These are already set up.
                  </Text>
                ) : (
                  <Stack gap={2}>
                    {suggestions.map((suggestion) =>
                      suggestion.kind === "restore" ? (
                        <Flex key={suggestion.suggestion.key} justify="space-between" align="center" gap={3} wrap="wrap">
                          <Stack gap={0.5} minW={0}>
                            <Text fontSize="sm" fontWeight="medium">
                              {suggestion.suggestion.name}
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              A retired category has this name.
                            </Text>
                          </Stack>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!createAllowed || writes.isSaving}
                            onClick={() => writes.setActive(suggestion.account, true)}
                          >
                            Restore
                          </Button>
                        </Flex>
                      ) : (
                        <Flex key={suggestion.suggestion.key} align="flex-start" gap={3}>
                          <Box pt={1}>
                            <Checkbox.Root
                              checked={selectedSuggestions.includes(suggestion.suggestion.key)}
                              disabled={!createAllowed || writes.isSaving}
                              onCheckedChange={() => toggleSuggestion(suggestion.suggestion.key)}
                            >
                              <Checkbox.HiddenInput
                                aria-label={`Select ${suggestion.suggestion.name}`}
                              />
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                            </Checkbox.Root>
                          </Box>
                          <Stack gap={0.5} minW={0}>
                            <Text fontSize="sm" fontWeight="medium">
                              {suggestion.suggestion.name}
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              {suggestion.suggestion.kind === "income" ? "Income" : "Expense"}
                            </Text>
                          </Stack>
                        </Flex>
                      ),
                    )}
                  </Stack>
                )}
                {creatableSuggestions.length > 0 && (
                  <Button
                    alignSelf="flex-start"
                    colorPalette="teal"
                    loading={writes.isSaving}
                    disabled={!createAllowed || selectedCreatable.length === 0}
                    onClick={addSelectedCategories}
                  >
                    {selectedCreatable.length
                      ? `Add selected categories (${selectedCreatable.length})`
                      : "Add selected categories"}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        )}

        {f3SetupEnabled && !notStarted && (
          <MemberAllocationSetup
            organisationId={organisationId}
            status={status}
            accounts={accounts}
            canManage={canManage}
            writesBlocked={writeBlocked}
            isRefreshing={isRefreshingLedger}
          />
        )}
      </Stack>

      {bankSheetOpen && (
        <AddMoneyAccountSheet
          mode="bank"
          accounts={accounts ?? []}
          isSaving={writes.isSaving}
          error={writes.error}
          onCreate={(payload) =>
            writes.create([payload], () => setBankSheetOpen(false))
          }
          onClose={() => setBankSheetOpen(false)}
        />
      )}
      {confirmDialog}
    </Box>
  );
};

export default LedgerSetupPanel;
