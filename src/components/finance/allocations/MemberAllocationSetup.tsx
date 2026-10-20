import { useId, useState } from "react";
import { Badge, Box, Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { useConfirm } from "components/ui/confirm-dialog";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  ACCOUNT_SUBTYPE_LABELS,
  AllocationSetting,
  MAX_ACCOUNT_NAME_LENGTH,
  MEMBER_INCOME_ACCOUNTS,
  MEMBER_INCOME_SUBTYPES,
  MemberIncomeSubtype,
  PrerequisiteState,
  accountActions,
  activeSingletonSubtypes,
  allocationReadiness,
  buildMemberIncomeAccountPayload,
  canCreateAccounts,
  ledgerApiFailure,
  ledgerSetupRefusalMessage,
  ledgerWriteOutcomeUnknown,
  memberIncomeAccountStates,
  validateMemberIncomeAccount,
} from "helpers/ledgerSetup";
import { ledgerStateKey } from "helpers/ledger";
import { LedgerWriteNotSentError, useLedgerSetup } from "hooks/useLedgerSetup";

/**
 * F3A member-money allocation setup (F3 RFC v0.3 §5.2, §9, O1, O9).
 *
 * Shows whether allocations are on, what turning them on needs, and lets a
 * finance manager add or reactivate the two member income accounts and switch
 * the setting. Nothing is created, enabled or allocated without an explicit
 * confirmation, and no control here posts money: allocation posting is F3-3.
 * The backend decides every prerequisite and refusal; this only mirrors them.
 */

const SETTING_BADGES: Record<AllocationSetting, { label: string; palette: "green" | "gray" | "yellow" }> = {
  on: { label: "On", palette: "green" },
  off: { label: "Off", palette: "gray" },
  unknown: { label: "Unknown", palette: "yellow" },
};

// Text on every badge: the state is never carried by colour alone.
const PREREQUISITE_BADGES: Record<
  PrerequisiteState,
  { label: string; palette: "green" | "orange" | "yellow" }
> = {
  met: { label: "Ready", palette: "green" },
  missing: { label: "Missing", palette: "orange" },
  unknown: { label: "Unknown", palette: "yellow" },
};

export const ALLOCATIONS_EXPLAINER =
  "Allocations move member money the organisation holds into dues or levy income, one obligation at a time. Turning them on permits allocation posting once the server and this app offer it; it doesn't allocate any money already held.";

const ENABLE_BODY =
  "Officers will be able to allocate held member money to dues and levies once allocation posting is available. Turning this on doesn't allocate any money that is already held, and nothing is posted now. It can be turned off later.";

const DISABLE_BODY =
  "No new allocations can be made while this is off. Allocations already made are not reversed or deleted: money already allocated stays recorded in the ledger.";

const AlertBox = ({ title, children }: { title: string; children: string }) => (
  <Box role="alert" borderWidth="1px" borderColor="border.error" borderRadius="md" p={3} bg="bg.panel">
    <Text fontSize="sm" fontWeight="semibold" color="fg.error">
      {title}
    </Text>
    <Text fontSize="sm" color="fg.muted">
      {children}
    </Text>
  </Box>
);

interface IncomeAccountControlsProps {
  subtype: MemberIncomeSubtype;
  inactive: readonly LedgerAccount[];
  status: LedgerStatus;
  accounts: readonly LedgerAccount[];
  writesBlocked: boolean;
  isSaving: boolean;
  onCreate: (subtype: MemberIncomeSubtype, name: string, onDone: () => void) => void;
  onReactivate: (account: LedgerAccount) => void;
}

/** Add or reactivate one missing member income account. */
const IncomeAccountControls = ({
  subtype,
  inactive,
  status,
  accounts,
  writesBlocked,
  isSaving,
  onCreate,
  onReactivate,
}: IncomeAccountControlsProps) => {
  const spec = MEMBER_INCOME_ACCOUNTS[subtype];
  const [name, setName] = useState(spec.suggestedName);
  const [localError, setLocalError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const singletons = activeSingletonSubtypes(accounts);

  const add = async () => {
    // Convenience only: the backend checks the name and the singleton again.
    const problem = validateMemberIncomeAccount(subtype, name, accounts);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    const confirmed = await confirm({
      title: `Add the ${spec.title.toLowerCase()}`,
      body: `Create the income account "${name.trim()}"? Only allocations will credit it, and it is never offered as a receipt category. Creating it doesn't post money, change recorded payments or allocate anything.`,
      confirmLabel: "Add account",
    });
    if (confirmed) onCreate(subtype, name, () => setName(spec.suggestedName));
  };

  const reactivate = async (account: LedgerAccount) => {
    const confirmed = await confirm({
      title: "Reactivate account",
      body: `Reactivate "${account.name}" as this ledger's ${ACCOUNT_SUBTYPE_LABELS[subtype].toLowerCase()} account? Its history is unchanged and nothing is posted.`,
      confirmLabel: "Reactivate",
    });
    if (confirmed) onReactivate(account);
  };

  return (
    <Stack gap={3}>
      {inactive.map((account) => {
        const { canReactivate, note } = accountActions(account, {
          ledgerState: ledgerStateKey(status),
          memberReceiptsEnabled: status.memberReceiptsEnabled,
          allocationsEnabled: status.allocationsEnabled,
          activeSingletonSubtypes: singletons,
          writeBlocked: writesBlocked,
        });
        return (
          <Flex key={account.id} justify="space-between" align="center" gap={3} wrap="wrap">
            <Stack gap={0.5} minW={0}>
              <Text fontSize="sm">
                {`"${account.name}" is inactive.`}
              </Text>
              {!canReactivate && note && (
                <Text fontSize="xs" color="fg.muted">
                  {note}
                </Text>
              )}
            </Stack>
            {canReactivate && (
              <Button
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={() => void reactivate(account)}
                aria-label={`Reactivate ${account.name}`}
              >
                Reactivate
              </Button>
            )}
          </Flex>
        );
      })}
      <Field.Root invalid={Boolean(localError)}>
        <Field.Label>
          {inactive.length ? "Or add a new account named" : `${spec.title} name`}
        </Field.Label>
        <Input
          value={name}
          maxLength={MAX_ACCOUNT_NAME_LENGTH}
          disabled={isSaving}
          onChange={(event) => setName(event.target.value)}
        />
        {localError && <Field.ErrorText>{localError}</Field.ErrorText>}
      </Field.Root>
      <Button
        alignSelf="flex-start"
        variant="outline"
        loading={isSaving}
        onClick={() => void add()}
      >
        {`Add the ${spec.title.toLowerCase()}`}
      </Button>
      {confirmDialog}
    </Stack>
  );
};

interface MemberAllocationSetupProps {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  canManage: boolean;
  /** An earlier ledger write is still pending or has an unresolved outcome. */
  writesBlocked: boolean;
  /** Status or accounts are reloading: the toggle waits for the fresh revision. */
  isRefreshing: boolean;
}

const MemberAllocationSetup = ({
  organisationId,
  status,
  accounts,
  canManage,
  writesBlocked,
  isRefreshing,
}: MemberAllocationSetupProps) => {
  const headingId = useId();
  const { confirm, confirmDialog } = useConfirm();
  const {
    createMemberIncomeAccount,
    reactivateMemberIncomeAccount,
    setMemberAllocations,
    isSavingMemberIncomeAccount,
    isChangingAllocations,
  } = useLedgerSetup(organisationId);
  const [actionError, setActionError] = useState<string | null>(null);

  const readiness = allocationReadiness(status, accounts, {
    canManage,
    writeBlocked: writesBlocked,
  });
  const incomeStates = accounts ? memberIncomeAccountStates(accounts) : null;
  // Member income accounts are only offered by a server that reports the
  // allocations setting (F3-2); an older server refuses the subtypes.
  const accountWritesOpen =
    canManage &&
    canCreateAccounts(status, canManage) &&
    !writesBlocked &&
    readiness.setting !== "unknown";
  const isSaving = isSavingMemberIncomeAccount || isChangingAllocations;

  // Screen copy only. The pending/unresolved marker and the reload are owned
  // by the durable write itself and happen even if this screen is gone.
  const handleFailure = (error: unknown, fallback: string) => {
    if (error instanceof LedgerWriteNotSentError) {
      setActionError(
        error.reason === "blocked"
          ? "An earlier ledger change is still waiting to be confirmed, so nothing was sent."
          : "This browser couldn't keep a safety record of the change, so nothing was sent. Check that site storage is allowed and try again.",
      );
      return;
    }
    const failure = ledgerApiFailure(error);
    // A lost response may have been applied: it is already latched; never
    // call it refused.
    if (ledgerWriteOutcomeUnknown(failure)) {
      setActionError(null);
      return;
    }
    setActionError(ledgerSetupRefusalMessage(failure, fallback));
  };

  const create = (subtype: MemberIncomeSubtype, name: string, onDone: () => void) => {
    if (writesBlocked || !accounts) return;
    if (validateMemberIncomeAccount(subtype, name, accounts)) return;
    createMemberIncomeAccount(buildMemberIncomeAccountPayload(subtype, name), {
      onSuccess: () => {
        setActionError(null);
        onDone();
      },
      onError: (error) => handleFailure(error, "The account wasn't added. Try again."),
    });
  };

  const reactivate = (account: LedgerAccount) => {
    if (writesBlocked || account.revision === null) return;
    reactivateMemberIncomeAccount(
      { id: account.id, revision: account.revision },
      {
        onSuccess: () => setActionError(null),
        onError: (error) => handleFailure(error, "The account wasn't reactivated. Try again."),
      },
    );
  };

  const changeSetting = async (enable: boolean) => {
    const allowed = enable ? readiness.canEnable : readiness.canDisable;
    if (!allowed || writesBlocked || status.revision === null) return;
    const confirmed = await confirm({
      title: enable
        ? "Turn on member money allocations"
        : "Turn off member money allocations",
      body: enable ? ENABLE_BODY : DISABLE_BODY,
      confirmLabel: enable ? "Turn on allocations" : "Turn off allocations",
      destructive: !enable,
    });
    if (!confirmed) return;
    // The revision shown when the officer confirmed: never a guessed one. A
    // stale value is refused (409) and the settle reload shows the truth.
    setMemberAllocations(enable, status.revision, {
      onSuccess: () => setActionError(null),
      onError: (error) => handleFailure(error, "The setting wasn't changed. Try again."),
    });
  };

  const badge = SETTING_BADGES[readiness.setting];

  return (
    <Box as="section" aria-labelledby={headingId} borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
      <Stack gap={3}>
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <Text as="h3" id={headingId} fontWeight="semibold" fontSize="md">
            Member money allocations
          </Text>
          <Badge colorPalette={badge.palette} variant="subtle">
            {badge.label}
          </Badge>
        </Flex>
        <Text fontSize="sm" color="fg.muted">
          {ALLOCATIONS_EXPLAINER}
        </Text>
        {readiness.setting === "on" && (
          <Text fontSize="sm" color="fg.muted">
            Turning allocations off stops new allocations only. Allocations already made are
            not reversed or deleted, and money already allocated stays recorded in the ledger.
          </Text>
        )}
        {readiness.note && (
          <Text fontSize="sm" color="fg.muted">
            {readiness.note}
          </Text>
        )}

        {actionError && <AlertBox title="That change wasn't saved">{actionError}</AlertBox>}

        {readiness.setting !== "unknown" && (
          <>
            <Text fontSize="sm" fontWeight="semibold">
              {readiness.setting === "on" ? "What allocations rely on" : "Before turning allocations on"}
            </Text>
            <GroupedList aria-label="Allocation readiness">
              {readiness.prerequisites.map((item) => {
                const itemBadge = PREREQUISITE_BADGES[item.state];
                return (
                  <GroupedListItem key={item.key}>
                    <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
                      <Stack gap={0.5} minW={0} flex="1">
                        <Text fontWeight="semibold" fontSize="sm">
                          {item.title}
                        </Text>
                        <Text fontSize="sm" color="fg.muted">
                          {item.detail}
                        </Text>
                      </Stack>
                      <Badge colorPalette={itemBadge.palette} variant="subtle">
                        {itemBadge.label}
                      </Badge>
                    </Flex>
                    {accountWritesOpen &&
                      incomeStates &&
                      MEMBER_INCOME_SUBTYPES.includes(item.key as MemberIncomeSubtype) &&
                      !incomeStates[item.key as MemberIncomeSubtype].active && (
                        <Box mt={3}>
                          <IncomeAccountControls
                            subtype={item.key as MemberIncomeSubtype}
                            inactive={incomeStates[item.key as MemberIncomeSubtype].inactive}
                            status={status}
                            accounts={accounts ?? []}
                            writesBlocked={writesBlocked}
                            isSaving={isSaving}
                            onCreate={create}
                            onReactivate={reactivate}
                          />
                        </Box>
                      )}
                  </GroupedListItem>
                );
              })}
            </GroupedList>
          </>
        )}

        {canManage && readiness.setting === "off" && (
          <Button
            alignSelf="flex-start"
            colorPalette="teal"
            loading={isChangingAllocations}
            disabled={!readiness.canEnable || isRefreshing || isSaving}
            onClick={() => void changeSetting(true)}
          >
            Turn on allocations
          </Button>
        )}
        {canManage && readiness.setting === "on" && (
          <Button
            alignSelf="flex-start"
            variant="outline"
            colorPalette="red"
            loading={isChangingAllocations}
            disabled={!readiness.canDisable || isRefreshing || isSaving}
            onClick={() => void changeSetting(false)}
          >
            Turn off allocations
          </Button>
        )}
        {canManage && readiness.setting === "off" && !readiness.canEnable && (
          <Text fontSize="xs" color="fg.muted">
            Everything above must be ready before allocations can be turned on. Nothing is
            added or switched on automatically.
          </Text>
        )}
      </Stack>
      {confirmDialog}
    </Box>
  );
};

export default MemberAllocationSetup;
