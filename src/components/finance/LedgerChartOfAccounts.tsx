import { useId, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { useConfirm } from "components/ui/confirm-dialog";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { OptionSelect } from "components/ui/themed-select";
import {
  ACCOUNT_CLASSES,
  ACCOUNT_CLASS_LABELS,
  ACCOUNT_SUBTYPES_BY_CLASS,
  ACCOUNT_SUBTYPE_LABELS,
  AccountClass,
  AccountDraft,
  AccountSubtype,
  MAX_ACCOUNT_NAME_LENGTH,
  OPENING_PENDING_CREATE_NOTE,
  StarterAccount,
  SUGGESTION_FROZEN_NOTE,
  SUSPENDED_CREATE_NOTE,
  accountActions,
  accountNameKey,
  activeSingletonSubtypes,
  buildAccountPayload,
  canCreateAccounts,
  draftFromStarter,
  draftRole,
  emptyAccountDraft,
  isMoneyRole,
  ledgerApiFailure,
  ledgerWriteOutcomeUnknown,
  moneyAccountsFrozen,
  starterAccountsFor,
  toAccountRole,
  validateAccountBatch,
} from "helpers/ledgerSetup";
import { ledgerStateKey } from "helpers/ledger";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { LedgerWriteNotSentError, useLedgerSetup } from "hooks/useLedgerSetup";

/**
 * F2A-2 chart-of-accounts manager (RFC v0.3 §4.3, §8.1).
 *
 * Read-only until the officer acts: suggested starter accounts are never
 * created automatically, and the backend stays the authority on name
 * uniqueness, singleton subtypes, frozen money accounts and balance-guarded
 * deactivation. Only a singleton deactivation is pre-disabled here, because
 * that rule is static. No balance is ever calculated or displayed.
 */

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Text as="h3" id={id} fontSize="md" fontWeight="semibold" mb={2}>
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

const roleText = (account: LedgerAccount) => {
  const role = toAccountRole(account);
  if (!role) return "Account type unavailable";
  return [
    ACCOUNT_CLASS_LABELS[role.class],
    role.subtype ? ACCOUNT_SUBTYPE_LABELS[role.subtype] : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const bankText = (account: LedgerAccount) =>
  [account.bankName, account.accountNumberLast4 ? `ending ${account.accountNumberLast4}` : null]
    .filter(Boolean)
    .join(" · ");

interface AccountRowProps {
  account: LedgerAccount;
  status: LedgerStatus;
  canManage: boolean;
  isUpdating: boolean;
  writeBlocked: boolean;
  /** Roles held by an active singleton: their inactive twins can't be reactivated. */
  singletonSubtypes: ReadonlySet<AccountSubtype>;
  onUpdate: (
    account: LedgerAccount,
    change: { name?: string; active?: boolean },
    onDone?: () => void,
  ) => void;
}

const AccountRow = ({
  account,
  status,
  canManage,
  isUpdating,
  writeBlocked,
  singletonSubtypes,
  onUpdate,
}: AccountRowProps) => {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(account.name);
  const [localError, setLocalError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const allowance = accountActions(account, {
    ledgerState: ledgerStateKey(status),
    memberReceiptsEnabled: status.memberReceiptsEnabled,
    allocationsEnabled: status.allocationsEnabled,
    activeSingletonSubtypes: singletonSubtypes,
    writeBlocked,
  });
  const canAct =
    allowance.canRename || allowance.canDeactivate || allowance.canReactivate;

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Enter an account name.");
      return;
    }
    if (trimmed.length > MAX_ACCOUNT_NAME_LENGTH) {
      setLocalError(`Account names can be at most ${MAX_ACCOUNT_NAME_LENGTH} characters.`);
      return;
    }
    if (trimmed === account.name) {
      setRenaming(false);
      setLocalError(null);
      return;
    }
    setLocalError(null);
    onUpdate(account, { name: trimmed }, () => setRenaming(false));
  };

  const askDeactivate = async () => {
    const confirmed = await confirm({
      title: "Deactivate account",
      body: `Deactivate "${account.name}"? It stays on the ledger with its history and can be reactivated later. Accounts are never deleted.`,
      confirmLabel: "Deactivate",
      destructive: true,
    });
    if (confirmed) onUpdate(account, { active: false });
  };

  return (
    <GroupedListItem>
      <Stack gap={2}>
        <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
          <Stack gap={0.5} minW={0}>
            <Text fontWeight="semibold">{account.name}</Text>
            <Text fontSize="sm" color="fg.muted">
              {roleText(account)}
            </Text>
            {bankText(account) && (
              <Text fontSize="xs" color="fg.muted">
                {bankText(account)}
              </Text>
            )}
          </Stack>
          <Stack align="flex-end" gap={1}>
            {account.active !== null && (
              <Badge colorPalette={account.active ? "green" : "gray"} variant="subtle">
                {account.active ? "Active" : "Inactive"}
              </Badge>
            )}
            {account.currency && (
              <Text fontSize="xs" color="fg.muted">
                {account.currency}
              </Text>
            )}
          </Stack>
        </Flex>

        {renaming ? (
          <Stack gap={2}>
            <Field.Root invalid={Boolean(localError)}>
              <Field.Label>Account name</Field.Label>
              <Input
                value={name}
                maxLength={MAX_ACCOUNT_NAME_LENGTH}
                onChange={(event) => setName(event.target.value)}
              />
              {localError && <Field.ErrorText>{localError}</Field.ErrorText>}
            </Field.Root>
            <Flex gap={2} wrap="wrap">
              <Button size="sm" colorPalette="teal" loading={isUpdating} onClick={saveName}>
                Save name
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isUpdating}
                onClick={() => {
                  setRenaming(false);
                  setName(account.name);
                  setLocalError(null);
                }}
              >
                Cancel
              </Button>
            </Flex>
          </Stack>
        ) : (
          canManage &&
          canAct && (
            <Flex gap={2} wrap="wrap">
              {allowance.canRename && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() => {
                    // Re-seed from the row so a completed rename never leaves
                    // the previous name behind for the next edit.
                    setName(account.name);
                    setLocalError(null);
                    setRenaming(true);
                  }}
                >
                  Rename
                </Button>
              )}
              {allowance.canDeactivate && (
                <Button
                  size="sm"
                  variant="outline"
                  colorPalette="red"
                  disabled={isUpdating}
                  onClick={() => void askDeactivate()}
                >
                  Deactivate
                </Button>
              )}
              {allowance.canReactivate && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() => onUpdate(account, { active: true })}
                >
                  Reactivate
                </Button>
              )}
            </Flex>
          )
        )}

        {canManage && allowance.note && (
          <Text fontSize="xs" color="fg.muted">
            {allowance.note}
          </Text>
        )}
      </Stack>
      {confirmDialog}
    </GroupedListItem>
  );
};

interface SuggestionPickerProps {
  suggestions: readonly StarterAccount[];
  selected: readonly string[];
  onToggle: (key: string) => void;
  onAdd: () => void;
  isSaving: boolean;
  moneyFrozen: boolean;
}

const SuggestionPicker = ({
  suggestions,
  selected,
  onToggle,
  onAdd,
  isSaving,
  moneyFrozen,
}: SuggestionPickerProps) => (
  <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
    <Stack gap={3}>
      <Box>
        <Text fontWeight="semibold" fontSize="sm">
          Suggested starter accounts
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Nothing is created until you choose accounts and add them.
        </Text>
      </Box>
      <Stack gap={2}>
        {suggestions.map((suggestion) => {
          const role = draftRole(draftFromStarter(suggestion));
          const frozen = moneyFrozen && isMoneyRole(role);
          return (
            <Flex key={suggestion.key} align="flex-start" gap={3}>
              <Box pt={1}>
                <Checkbox.Root
                  checked={selected.includes(suggestion.key)}
                  disabled={frozen || isSaving}
                  onCheckedChange={({ checked }) => onToggle(suggestion.key)}
                >
                  <Checkbox.HiddenInput aria-label={`Select ${suggestion.name}`} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Root>
              </Box>
              <Stack gap={0.5} minW={0}>
                <Text fontSize="sm" fontWeight="medium">
                  {suggestion.name}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {[
                    ACCOUNT_CLASS_LABELS[suggestion.class],
                    suggestion.subtype
                      ? ACCOUNT_SUBTYPE_LABELS[suggestion.subtype]
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {` — ${suggestion.purpose}`}
                </Text>
                {frozen && (
                  <Text fontSize="xs" color="fg.muted">
                    {SUGGESTION_FROZEN_NOTE}
                  </Text>
                )}
              </Stack>
            </Flex>
          );
        })}
      </Stack>
      <Button
        alignSelf="flex-start"
        colorPalette="teal"
        loading={isSaving}
        disabled={selected.length === 0}
        onClick={onAdd}
      >
        {selected.length
          ? `Add selected accounts (${selected.length})`
          : "Add selected accounts"}
      </Button>
    </Stack>
  </Box>
);

interface CreateAccountFormProps {
  onSubmit: (draft: AccountDraft) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
  /** Money accounts cannot be added while an opening proposal is pending. */
  moneyFrozen: boolean;
}

const CreateAccountForm = ({
  onSubmit,
  onCancel,
  isSaving,
  error,
  moneyFrozen,
}: CreateAccountFormProps) => {
  const [draft, setDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [localError, setLocalError] = useState<string | null>(null);
  const role = draftRole(draft);
  const blocked = moneyFrozen && isMoneyRole(role);
  const classOptions = ACCOUNT_CLASSES.map((value) => ({
    value,
    label: ACCOUNT_CLASS_LABELS[value],
  }));
  const subtypeOptions = ACCOUNT_SUBTYPES_BY_CLASS[draft.class].map((value) => ({
    value,
    label: ACCOUNT_SUBTYPE_LABELS[value],
  }));

  const submit = () => {
    // Convenience only: the parent and the backend validate again.
    const problem = validateAccountBatch([draft], []);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    onSubmit(draft);
  };

  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
      <Stack gap={3}>
        <Text fontWeight="semibold" fontSize="sm">
          New account
        </Text>

        <Field.Root invalid={Boolean(localError)}>
          <Field.Label>Account name</Field.Label>
          <Input
            value={draft.name}
            maxLength={MAX_ACCOUNT_NAME_LENGTH}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
          {localError && <Field.ErrorText>{localError}</Field.ErrorText>}
        </Field.Root>

        <Field.Root>
          <Field.Label>Type</Field.Label>
          <OptionSelect<AccountClass>
            value={draft.class}
            options={classOptions}
            onChange={(value) =>
              // Class and subtype can never change after creation, so the
              // subtype resets to the new class's first allowed value.
              setDraft((current) => ({
                ...current,
                class: value,
                subtype: ACCOUNT_SUBTYPES_BY_CLASS[value][0] ?? null,
              }))
            }
          />
        </Field.Root>

        {subtypeOptions.length > 0 && (
          <Field.Root>
            <Field.Label>Subtype</Field.Label>
            <OptionSelect<AccountSubtype>
              value={(draft.subtype ?? subtypeOptions[0].value) as AccountSubtype}
              options={subtypeOptions}
              onChange={(value) =>
                setDraft((current) => ({ ...current, subtype: value }))
              }
            />
          </Field.Root>
        )}

        {isMoneyRole(role) && (
          <>
            <Field.Root>
              <Field.Label>Bank name (optional)</Field.Label>
              <Input
                value={draft.bankName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, bankName: event.target.value }))
                }
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>Account number (last 4 digits, optional)</Field.Label>
              <Input
                value={draft.accountNumberLast4}
                inputMode="numeric"
                maxLength={4}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    accountNumberLast4: event.target.value,
                  }))
                }
              />
              <Field.HelperText>
                Only the last four digits are stored. Never enter a full account number.
              </Field.HelperText>
            </Field.Root>
          </>
        )}

        {blocked && (
          <Text fontSize="sm" color="fg.muted">
            {SUGGESTION_FROZEN_NOTE}
          </Text>
        )}

        {error && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {error}
          </Text>
        )}

        <Flex gap={2} wrap="wrap">
          <Button
            colorPalette="teal"
            loading={isSaving}
            disabled={blocked}
            onClick={submit}
          >
            Add account
          </Button>
          <Button variant="outline" disabled={isSaving} onClick={onCancel}>
            Cancel
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
};

interface LedgerChartOfAccountsProps {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  accountsError: unknown;
  onRetryAccounts: () => void;
  isRetryingAccounts: boolean;
  canManage: boolean;
  /** An earlier ledger write still has an unresolved outcome. */
  writesBlocked: boolean;
}

const LedgerChartOfAccounts = ({
  organisationId,
  status,
  accounts,
  accountsError,
  onRetryAccounts,
  isRetryingAccounts,
  canManage,
  writesBlocked,
}: LedgerChartOfAccountsProps) => {
  const headingId = useId();
  const { createAccounts, updateAccount, isCreatingAccounts, isUpdatingAccount } =
    useLedgerSetup(organisationId);
  const [selected, setSelected] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    // Timeouts, network errors, uncoded 5xx and an uncoded 503 may all have
    // been saved. The durable write has already latched uncertainty; never
    // present it as a refusal and never retry it here.
    if (ledgerWriteOutcomeUnknown(failure)) {
      setActionError(null);
      return;
    }
    setActionError(failure.message ?? "The change wasn't saved. Try again.");
  };

  const createAllowed =
    canManage && canCreateAccounts(status, canManage) && !writesBlocked;
  const frozen = moneyAccountsFrozen(status);
  const memberReceiptsEnabled = status.memberReceiptsEnabled === true;

  const activeNameKeys = new Set(
    (accounts ?? [])
      .filter((account) => account.active === true)
      .map((account) => accountNameKey(account.name)),
  );
  const suggestions = starterAccountsFor(memberReceiptsEnabled).filter(
    (suggestion) => !activeNameKeys.has(accountNameKey(suggestion.name)),
  );

  const toggleSuggestion = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  const addSelected = () => {
    if (writesBlocked) return;
    const drafts = suggestions
      .filter((suggestion) => selected.includes(suggestion.key))
      .map(draftFromStarter);
    if (!drafts.length) return;
    const problem = validateAccountBatch(drafts, accounts ?? []);
    if (problem) {
      setActionError(problem);
      return;
    }
    createAccounts(drafts.map(buildAccountPayload), {
      onSuccess: () => {
        setSelected([]);
        setActionError(null);
      },
      onError: (error) => handleFailure(error),
    });
  };

  const submitDraft = (draft: AccountDraft) => {
    if (writesBlocked) return;
    const problem = validateAccountBatch([draft], accounts ?? []);
    if (problem) {
      setFormError(problem);
      return;
    }
    createAccounts([buildAccountPayload(draft)], {
      onSuccess: () => {
        setShowForm(false);
        setFormError(null);
        setActionError(null);
      },
      onError: (error) => {
        const failure = ledgerApiFailure(error);
        // An ambiguous outcome or a write that was never sent is not a
        // validation problem: it belongs in the action notice, not the form.
        if (error instanceof LedgerWriteNotSentError || ledgerWriteOutcomeUnknown(failure)) {
          handleFailure(error);
          return;
        }
        setFormError(
          failure.message ?? "The account wasn't added. Check the details and try again.",
        );
      },
    });
  };

  const requestUpdate = (
    account: LedgerAccount,
    change: { name?: string; active?: boolean },
    onDone?: () => void,
  ) => {
    // The row only offers actions when a revision is known, and never while
    // an earlier write is unresolved.
    if (writesBlocked || account.revision === null) return;
    updateAccount(
      account.id,
      { expectedRevision: account.revision, ...change },
      {
        onSuccess: () => {
          setActionError(null);
          onDone?.();
        },
        onError: (error) => handleFailure(error),
      },
    );
  };

  const singletonSubtypes = activeSingletonSubtypes(accounts ?? []);

  const createNote =
    ledgerStateKey(status) === "suspended"
      ? SUSPENDED_CREATE_NOTE
      : frozen
        ? OPENING_PENDING_CREATE_NOTE
        : null;

  return (
    <Box as="section" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Chart of accounts</SectionHeading>
      <Stack gap={4}>
        {actionError && <AlertBox title="Accounts weren't changed">{actionError}</AlertBox>}

        {accounts === null ? (
          accountsError ? (
            <ErrorState
              title="Couldn't load the chart of accounts"
              description={errorMessage(accountsError)}
              onRetry={onRetryAccounts}
              retrying={isRetryingAccounts}
            />
          ) : (
            <PageLoader h="20vh" label="Loading accounts..." />
          )
        ) : (
          <>
            {createAllowed && (
              <Stack gap={4}>
                {suggestions.length > 0 && (
                  <SuggestionPicker
                    suggestions={suggestions}
                    selected={selected}
                    onToggle={toggleSuggestion}
                    onAdd={addSelected}
                    isSaving={isCreatingAccounts}
                    moneyFrozen={frozen}
                  />
                )}
                {showForm ? (
                  <CreateAccountForm
                    onSubmit={submitDraft}
                    onCancel={() => {
                      setShowForm(false);
                      setFormError(null);
                    }}
                    isSaving={isCreatingAccounts}
                    error={formError}
                    moneyFrozen={frozen}
                  />
                ) : (
                  <Button
                    alignSelf="flex-start"
                    variant="outline"
                    onClick={() => setShowForm(true)}
                  >
                    New account
                  </Button>
                )}
              </Stack>
            )}

            {/* Creation may still be open while money accounts are frozen, so
                this note does not depend on the create controls being hidden. */}
            {canManage && createNote && (
              <Text fontSize="sm" color="fg.muted">
                {createNote}
              </Text>
            )}

            {accounts.length === 0 ? (
              <EmptyState
                title="No accounts yet"
                description="Add accounts before opening balances can be proposed. Nothing is created automatically."
              />
            ) : (
              <GroupedList aria-label="Chart of accounts">
                {accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    status={status}
                    canManage={canManage}
                    isUpdating={isUpdatingAccount}
                    writeBlocked={writesBlocked}
                    singletonSubtypes={singletonSubtypes}
                    onUpdate={requestUpdate}
                  />
                ))}
              </GroupedList>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
};

export default LedgerChartOfAccounts;
