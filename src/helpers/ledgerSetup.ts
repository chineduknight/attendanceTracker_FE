import {
  LedgerAccount,
  LedgerKnownState,
  LedgerStatus,
} from "components/finance/ledgerTypes";
import { ledgerStateKey } from "helpers/ledger";
import { LEDGER_WRITE_UNCERTAIN_NOTE } from "helpers/ledgerWriteUncertainty";

/**
 * Pure rules for F2A-2 ledger setup and chart-of-accounts management
 * (RFC v0.3 §4.1–§4.3, §8.1, D1/D4/D5/D6/D10).
 *
 * Everything here mirrors the approved contract for UX only. The backend stays
 * authoritative: no rule below may replace a server refusal, and nothing here
 * derives a cash balance, an opening balance or a posting capability.
 */

export type AccountClass = "asset" | "equity" | "liability" | "income" | "expense";
export type AccountSubtype =
  | "cash"
  | "bank"
  | "opening_balance_equity"
  | "member_receipts_unallocated";

export interface AccountRole {
  class: AccountClass;
  subtype: AccountSubtype | null;
}

export const ACCOUNT_CLASSES: readonly AccountClass[] = [
  "asset",
  "equity",
  "liability",
  "income",
  "expense",
];

export const ACCOUNT_CLASS_LABELS: Record<AccountClass, string> = {
  asset: "Asset",
  equity: "Equity",
  liability: "Liability",
  income: "Income",
  expense: "Expense",
};

/** Closed subtype vocabulary (D4). Income/expense categories carry none. */
export const ACCOUNT_SUBTYPES_BY_CLASS: Record<
  AccountClass,
  readonly AccountSubtype[]
> = {
  asset: ["cash", "bank"],
  equity: ["opening_balance_equity"],
  liability: ["member_receipts_unallocated"],
  income: [],
  expense: [],
};

export const ACCOUNT_SUBTYPE_LABELS: Record<AccountSubtype, string> = {
  cash: "Cash",
  bank: "Bank",
  opening_balance_equity: "Opening balance equity",
  member_receipts_unallocated: "Member money – unallocated",
};

export const MAX_ACCOUNTS_PER_REQUEST = 20;
export const MAX_ACCOUNT_NAME_LENGTH = 80;
export const MAX_BANK_NAME_LENGTH = 80;

const isAccountClass = (value: string): value is AccountClass =>
  (ACCOUNT_CLASSES as readonly string[]).includes(value);

const isAccountSubtype = (value: string): value is AccountSubtype =>
  Object.prototype.hasOwnProperty.call(ACCOUNT_SUBTYPE_LABELS, value);

/**
 * The account's role, or null when this build does not recognise the
 * class/subtype pair. An unrecognised role offers no write action: the closed
 * vocabulary is backend-owned and never widened here.
 */
export const toAccountRole = (account: {
  class: string | null;
  subtype: string | null;
}): AccountRole | null => {
  if (!account.class || !isAccountClass(account.class)) return null;
  const subtype = account.subtype ?? null;
  if (subtype !== null) {
    if (!isAccountSubtype(subtype)) return null;
    if (!ACCOUNT_SUBTYPES_BY_CLASS[account.class].includes(subtype)) return null;
  } else if (ACCOUNT_SUBTYPES_BY_CLASS[account.class].length > 0) {
    // Asset/equity/liability accounts always carry one of the closed subtypes.
    return null;
  }
  return { class: account.class, subtype };
};

/** Cash and bank: the only accounts money moves into or out of. */
export const isMoneyRole = (role: AccountRole) =>
  role.class === "asset" && (role.subtype === "cash" || role.subtype === "bank");

export const isOpeningEquityRole = (role: AccountRole) =>
  role.class === "equity" && role.subtype === "opening_balance_equity";

export const isMemberHoldingRole = (role: AccountRole) =>
  role.class === "liability" && role.subtype === "member_receipts_unallocated";

/** At most one active account per organisation may carry these subtypes. */
export const isSingletonRole = (role: AccountRole) =>
  isOpeningEquityRole(role) || isMemberHoldingRole(role);

/**
 * Names are labels, never identifiers, but two active accounts may not share
 * one. Matching is case- and space-insensitive, like the backend.
 */
export const accountNameKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

/* ------------------------------------------------------------------ */
/* Starter chart (D6): suggestions only, never created automatically.  */
/* ------------------------------------------------------------------ */

export interface StarterAccount {
  /** Stable local key for checkboxes; never sent to the API. */
  key: string;
  name: string;
  class: AccountClass;
  subtype: AccountSubtype | null;
  purpose: string;
  /** Only offered when the organisation enabled member receipts (D1). */
  requiresMemberReceipts?: boolean;
}

export const STARTER_ACCOUNTS: readonly StarterAccount[] = [
  {
    key: "cash-in-hand",
    name: "Cash in hand",
    class: "asset",
    subtype: "cash",
    purpose: "Notes and coins the organisation holds.",
  },
  {
    key: "main-bank",
    name: "Main bank account",
    class: "asset",
    subtype: "bank",
    purpose: "The organisation's main bank account.",
  },
  {
    key: "opening-equity",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
    purpose: "Required. The counter-side of the opening balances verified at activation.",
  },
  {
    key: "member-money",
    name: "Member money – unallocated",
    class: "liability",
    subtype: "member_receipts_unallocated",
    purpose: "Money held for a member that is not yet allocated to dues or a levy.",
    requiresMemberReceipts: true,
  },
  {
    key: "donations",
    name: "Donations",
    class: "income",
    subtype: null,
    purpose: "Income category for donations.",
  },
  {
    key: "other-income",
    name: "Other income",
    class: "income",
    subtype: null,
    purpose: "Any income that is not a donation.",
  },
  {
    key: "operating-expenses",
    name: "Operating expenses",
    class: "expense",
    subtype: null,
    purpose: "Day-to-day running costs.",
  },
  {
    key: "event-expenses",
    name: "Event expenses",
    class: "expense",
    subtype: null,
    purpose: "Costs of events and programmes.",
  },
];

export const starterAccountsFor = (memberReceiptsEnabled: boolean) =>
  STARTER_ACCOUNTS.filter(
    (account) => !account.requiresMemberReceipts || memberReceiptsEnabled,
  );

/* ------------------------------------------------------------------ */
/* Drafts, payloads and convenience validation                        */
/* ------------------------------------------------------------------ */

export interface AccountDraft {
  name: string;
  class: AccountClass;
  subtype: AccountSubtype | null;
  bankName: string;
  accountNumberLast4: string;
}

export interface CreateAccountPayload {
  name: string;
  class: AccountClass;
  subtype: AccountSubtype | null;
  bankName?: string | null;
  accountNumberLast4?: string | null;
}

export const emptyAccountDraft = (): AccountDraft => ({
  name: "",
  class: "asset",
  subtype: "cash",
  bankName: "",
  accountNumberLast4: "",
});

export const draftFromStarter = (starter: StarterAccount): AccountDraft => ({
  name: starter.name,
  class: starter.class,
  subtype: starter.subtype,
  bankName: "",
  accountNumberLast4: "",
});

export const draftRole = (draft: AccountDraft): AccountRole => ({
  class: draft.class,
  // Income/expense are categories; their subtype is always null.
  subtype:
    ACCOUNT_SUBTYPES_BY_CLASS[draft.class].length > 0 ? draft.subtype : null,
});

/** Body for `POST /ledger/accounts`'s `accounts[]`. Trims, never guesses. */
export const buildAccountPayload = (draft: AccountDraft): CreateAccountPayload => {
  const role = draftRole(draft);
  const payload: CreateAccountPayload = {
    name: draft.name.trim(),
    class: role.class,
    subtype: role.subtype,
  };
  if (isMoneyRole(role)) {
    const bankName = draft.bankName.trim();
    const last4 = draft.accountNumberLast4.trim();
    if (bankName) payload.bankName = bankName;
    if (last4) payload.accountNumberLast4 = last4;
  }
  return payload;
};

/**
 * The first thing to fix in one draft, or null. Mirrors the backend's
 * validator for convenience; the server still decides.
 */
export const validateAccountDraft = (draft: AccountDraft): string | null => {
  const name = draft.name.trim();
  if (!name) return "Enter an account name.";
  if (name.length > MAX_ACCOUNT_NAME_LENGTH)
    return `Account names can be at most ${MAX_ACCOUNT_NAME_LENGTH} characters.`;

  const role = draftRole(draft);
  const allowedSubtypes = ACCOUNT_SUBTYPES_BY_CLASS[draft.class];
  if (
    allowedSubtypes.length > 0 &&
    (!role.subtype || !allowedSubtypes.includes(role.subtype))
  )
    return `Choose a subtype for this ${ACCOUNT_CLASS_LABELS[
      draft.class
    ].toLowerCase()} account.`;

  if (!isMoneyRole(role)) {
    if (draft.bankName.trim() || draft.accountNumberLast4.trim())
      return "Bank name and account number digits can only be set on cash or bank accounts.";
    return null;
  }

  if (draft.bankName.trim().length > MAX_BANK_NAME_LENGTH)
    return `Bank names can be at most ${MAX_BANK_NAME_LENGTH} characters.`;
  const last4 = draft.accountNumberLast4.trim();
  if (last4 && !/^[0-9]{4}$/.test(last4))
    return "Use exactly the last 4 digits of the account number.";
  return null;
};

const singletonLabel = (role: AccountRole) =>
  role.subtype ? ACCOUNT_SUBTYPE_LABELS[role.subtype] : ACCOUNT_CLASS_LABELS[role.class];

/**
 * The first blocking problem in a batch, or null. Includes duplicates within
 * the request and against active accounts, and an already-active singleton.
 */
export const validateAccountBatch = (
  drafts: readonly AccountDraft[],
  activeAccounts: readonly LedgerAccount[],
): string | null => {
  if (drafts.length > MAX_ACCOUNTS_PER_REQUEST)
    return `Add at most ${MAX_ACCOUNTS_PER_REQUEST} accounts at a time.`;

  const activeNames = new Set(
    activeAccounts
      .filter((account) => account.active === true)
      .map((account) => accountNameKey(account.name)),
  );
  const activeRoles = activeAccounts
    .filter((account) => account.active === true)
    .map((account) => toAccountRole(account))
    .filter((role): role is AccountRole => role !== null);

  const seenNames = new Set<string>();
  const seenSingletons = new Set<string>();

  for (const draft of drafts) {
    const problem = validateAccountDraft(draft);
    if (problem) return problem;

    const name = draft.name.trim();
    const key = accountNameKey(name);
    if (seenNames.has(key)) return `"${name}" is listed more than once.`;
    if (activeNames.has(key)) return `An active account named "${name}" already exists.`;
    seenNames.add(key);

    const role = draftRole(draft);
    if (isSingletonRole(role) && role.subtype) {
      if (activeRoles.some((other) => other.subtype === role.subtype))
        return `This ledger already has an active ${singletonLabel(role)} account.`;
      if (seenSingletons.has(role.subtype))
        return `Only one ${singletonLabel(role)} account can be added.`;
      seenSingletons.add(role.subtype);
    }
  }
  return null;
};

/** `POST /ledger/accounts` body for one or more drafts. */
export const buildCreateAccountsPayload = (drafts: readonly AccountDraft[]) => ({
  accounts: drafts.map(buildAccountPayload),
});

/* ------------------------------------------------------------------ */
/* What the current ledger state allows                               */
/* ------------------------------------------------------------------ */

export const ACCOUNT_CHANGE_UNAVAILABLE_NOTE =
  "Changing accounts isn't available in this release.";

export const SUSPENDED_ACCOUNTS_NOTE =
  "The ledger is suspended, so accounts can only be renamed.";

export const OPENING_PENDING_ACCOUNTS_NOTE =
  "Opening balances are awaiting verification, so cash and bank accounts are frozen.";

export const SINGLETON_ACCOUNTS_NOTE =
  "The ledger needs this account. Rename it instead.";

export const MEMBER_RECEIPTS_REQUIRED_NOTE =
  "Turn on member receipts before reactivating this account.";

/** Chart-level notes, distinct from the per-row notes above. */
export const SUSPENDED_CREATE_NOTE =
  "No accounts can be added while the ledger is suspended.";

export const OPENING_PENDING_CREATE_NOTE =
  "Cash and bank accounts can't be added while opening balances await verification.";

export const SUGGESTION_FROZEN_NOTE =
  "Frozen while opening balances await verification.";

export interface AccountActionContext {
  ledgerState: LedgerKnownState | "unknown";
  memberReceiptsEnabled: boolean | null;
  /**
   * True while a previous ledger write in this organisation still has an
   * unresolved outcome: no further write may be offered until an officer has
   * checked the ledger.
   */
  writeBlocked?: boolean;
}

export interface AccountActionAllowance {
  canRename: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  /** Why some actions are unavailable; null when all allowed actions are open. */
  note: string | null;
}

const denyAll = (note: string): AccountActionAllowance => ({
  canRename: false,
  canDeactivate: false,
  canReactivate: false,
  note,
});

/**
 * Which row actions this build may offer. It never predicts a balance
 * refusal (the frontend has no balance data and must not invent one); the
 * backend refuses those and its message is shown as-is.
 */
export const accountActions = (
  account: Pick<LedgerAccount, "class" | "subtype" | "active" | "revision">,
  context: AccountActionContext,
): AccountActionAllowance => {
  if (context.ledgerState === "unknown")
    return denyAll("The bookkeeping state isn't recognised by this app version.");

  // An unresolved earlier write outranks every other rule: the same request
  // must not be submitted again until someone has checked the ledger.
  if (context.writeBlocked) return denyAll(LEDGER_WRITE_UNCERTAIN_NOTE);

  const role = toAccountRole(account);
  if (!role) return denyAll("This account type isn't recognised by this app version.");

  // PATCH needs `expectedRevision`. The F1 account list does not send one, so
  // no write is offered until the F2 read shape (F2A-4) supplies it.
  if (account.revision === null) return denyAll(ACCOUNT_CHANGE_UNAVAILABLE_NOTE);

  const active = account.active === true;

  if (context.ledgerState === "suspended")
    return {
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: SUSPENDED_ACCOUNTS_NOTE,
    };

  const moneyFrozen =
    context.ledgerState === "pending_verification" && isMoneyRole(role);
  if (moneyFrozen)
    return {
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: OPENING_PENDING_ACCOUNTS_NOTE,
    };

  if (active) {
    const canDeactivate = !isSingletonRole(role);
    return {
      canRename: true,
      canDeactivate,
      canReactivate: false,
      note: canDeactivate ? null : SINGLETON_ACCOUNTS_NOTE,
    };
  }

  const receiptsRequired =
    isMemberHoldingRole(role) && context.memberReceiptsEnabled !== true;
  return {
    canRename: true,
    canDeactivate: false,
    canReactivate: !receiptsRequired,
    note: receiptsRequired ? MEMBER_RECEIPTS_REQUIRED_NOTE : null,
  };
};

/** Starting setup is only offered for a ledger with no record yet. */
export const canStartLedgerSetup = (status: LedgerStatus, canManage: boolean) =>
  canManage && ledgerStateKey(status) === "not_active";

/**
 * Member receipts can only be switched on, and only before activation.
 * `expectedLedgerRevision` is required, so an F1 status without a revision
 * cannot offer the action.
 */
export const canEnableMemberReceipts = (
  status: LedgerStatus,
  canManage: boolean,
) => {
  if (!canManage) return false;
  const state = ledgerStateKey(status);
  return (
    (state === "setup" || state === "pending_verification") &&
    status.memberReceiptsEnabled === false &&
    status.revision !== null
  );
};

/** Account creation is refused while suspended, and needs a started ledger. */
export const canCreateAccounts = (status: LedgerStatus, canManage: boolean) => {
  if (!canManage) return false;
  const state = ledgerStateKey(status);
  return (
    state === "setup" ||
    state === "pending_verification" ||
    state === "active"
  );
};

/** Money accounts are frozen while an opening proposal awaits verification. */
export const moneyAccountsFrozen = (status: LedgerStatus) =>
  ledgerStateKey(status) === "pending_verification";

/* ------------------------------------------------------------------ */
/* Setup progress                                                     */
/* ------------------------------------------------------------------ */

export type SetupStepStatus = "done" | "current" | "todo" | "later";

export interface SetupStep {
  key: string;
  title: string;
  detail: string;
  status: SetupStepStatus;
}

/**
 * Progress from the data on screen only. A step is "done" only when the
 * backend sent the evidence for it; nothing is inferred from an absent field.
 * Activation is a later phase and is always shown as such.
 */
export const ledgerSetupSteps = (
  status: LedgerStatus,
  accounts: readonly LedgerAccount[] | null,
): SetupStep[] => {
  const state = ledgerStateKey(status);
  const started = state !== "not_active" && state !== "unknown";

  const activeRoles = (accounts ?? [])
    .filter((account) => account.active === true)
    .map((account) => toAccountRole(account))
    .filter((role): role is AccountRole => role !== null);

  const hasOpeningEquity = activeRoles.some(isOpeningEquityRole);
  const hasMoneyAccount = activeRoles.some(isMoneyRole);
  const accountsKnown = accounts !== null;

  const steps: SetupStep[] = [
    {
      key: "started",
      title: "Start bookkeeping setup",
      detail: started
        ? "Setup has started for this organisation."
        : "Creates this organisation's ledger. Existing dues/levy records are not copied into it.",
      status: started ? "done" : "todo",
    },
    {
      key: "member-receipts",
      title: "Choose member receipts",
      detail:
        started && status.memberReceiptsEnabled !== null
          ? status.memberReceiptsEnabled
            ? "Member receipts are on."
            : "Member receipts are off."
          : "Decide whether the organisation will hold money for members.",
      status:
        started && status.memberReceiptsEnabled !== null ? "done" : "todo",
    },
    {
      key: "opening-equity",
      title: "Add the opening balance equity account",
      detail: hasOpeningEquity
        ? "Opening balance equity account added."
        : "Required before opening balances can be verified.",
      status: hasOpeningEquity ? "done" : "todo",
    },
    {
      key: "money-account",
      title: "Add a cash or bank account",
      detail: hasMoneyAccount
        ? "At least one money account added."
        : accountsKnown
          ? "Money moves into and out of these accounts."
          : "Waiting for the current account list.",
      status: hasMoneyAccount ? "done" : "todo",
    },
    {
      key: "activation",
      title: "Opening balances and activation",
      detail: "Arrives in a later release. Nothing is activated from this screen.",
      status: "later",
    },
  ];

  let currentTaken = false;
  return steps.map((step) => {
    if (step.status !== "todo" || currentTaken) return step;
    currentTaken = true;
    return { ...step, status: "current" };
  });
};

/* ------------------------------------------------------------------ */
/* Error reading                                                      */
/* ------------------------------------------------------------------ */

export const LEDGER_SETUP_ERROR_CODES = {
  alreadyStarted: "LEDGER_ALREADY_EXISTS",
  revisionConflict: "LEDGER_REVISION_CONFLICT",
  nameTaken: "LEDGER_ACCOUNT_NAME_TAKEN",
  writesDisabled: "LEDGER_WRITES_DISABLED",
  transactionsUnavailable: "LEDGER_TRANSACTIONS_UNAVAILABLE",
  indexesNotInstalled: "LEDGER_INDEXES_NOT_INSTALLED",
} as const;

/**
 * The only ledger codes that prove a write did nothing. Any other 5xx code —
 * or none at all — may have been applied before the error.
 */
const NOTHING_WRITTEN_CODES: ReadonlySet<string> = new Set([
  LEDGER_SETUP_ERROR_CODES.writesDisabled,
  LEDGER_SETUP_ERROR_CODES.transactionsUnavailable,
  LEDGER_SETUP_ERROR_CODES.indexesNotInstalled,
]);

export interface LedgerApiFailure {
  /** The backend's `{ error }` text, when it sent one. */
  message: string | undefined;
  /** The stable `{ code }`, when this route sent one. */
  code: string | undefined;
  status: number | undefined;
  /**
   * True when no HTTP response was received at all: a timeout, a network
   * error or an aborted request. The write may still have reached the
   * server, so this never proves a refusal.
   */
  transportFailure: boolean;
}

export const ledgerApiFailure = (error: unknown): LedgerApiFailure => {
  const response = (
    error as {
      response?: { status?: number; data?: { error?: unknown; code?: unknown } };
    } | null
  )?.response;
  const data = response?.data;
  return {
    message: typeof data?.error === "string" ? data.error : undefined,
    code: typeof data?.code === "string" ? data.code : undefined,
    status: typeof response?.status === "number" ? response.status : undefined,
    transportFailure: !response,
  };
};

/**
 * Whether a failed ledger write may still have been applied.
 *
 * A client-error response (4xx) is the server telling us it refused the
 * request before writing, so it is safe to report as "not saved". Everything
 * else is ambiguous: a 408, any 5xx without one of the three
 * "nothing was written" codes, and every transport failure (timeout, network
 * error, aborted request, no response). Callers must never show an ambiguous
 * outcome as a clean rejection, and must never retry it automatically.
 */
export const ledgerWriteOutcomeUnknown = (failure: LedgerApiFailure): boolean => {
  if (
    failure.status !== undefined &&
    failure.status >= 400 &&
    failure.status < 500 &&
    failure.status !== 408
  )
    return false;
  if (failure.code && NOTHING_WRITTEN_CODES.has(failure.code)) return false;
  return true;
};
