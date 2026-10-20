import {
  LedgerAccount,
  LedgerKnownState,
  LedgerStatus,
} from "components/finance/ledgerTypes";
import { LEDGER_STATE_LABELS, ledgerStateKey } from "helpers/ledger";
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

/**
 * F3 member income (F3 RFC v0.3 §5.2, O1): credited only by allocations,
 * never an ordinary receipt category. Created only through the dedicated F3A
 * controls, never through the generic account form or the starter chart.
 */
export type MemberIncomeSubtype = "member_dues_income" | "member_levy_income";

export type AccountSubtype =
  | "cash"
  | "bank"
  | "opening_balance_equity"
  | "member_receipts_unallocated"
  | MemberIncomeSubtype;

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

/**
 * The subtypes a class must carry (D4). A class with an empty list is a
 * category: the generic account form always sends `subtype: null` for it.
 * Specialised income subtypes are deliberately not here, so the ordinary
 * income flow can never become a specialised-account flow.
 */
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

export const MEMBER_INCOME_SUBTYPES: readonly MemberIncomeSubtype[] = [
  "member_dues_income",
  "member_levy_income",
];

/**
 * Optional specialised subtypes a category class may carry instead of
 * `null` (F3-2). Only recognised on read and sent by the F3A controls.
 */
const SPECIALISED_SUBTYPES_BY_CLASS: Record<
  AccountClass,
  readonly AccountSubtype[]
> = {
  asset: [],
  equity: [],
  liability: [],
  income: MEMBER_INCOME_SUBTYPES,
  expense: [],
};

export const ACCOUNT_SUBTYPE_LABELS: Record<AccountSubtype, string> = {
  cash: "Cash",
  bank: "Bank",
  opening_balance_equity: "Opening balance equity",
  member_receipts_unallocated: "Member money – unallocated",
  member_dues_income: "Member dues income",
  member_levy_income: "Member levy income",
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
    if (
      !ACCOUNT_SUBTYPES_BY_CLASS[account.class].includes(subtype) &&
      !SPECIALISED_SUBTYPES_BY_CLASS[account.class].includes(subtype)
    )
      return null;
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

export const isMemberIncomeSubtype = (
  subtype: string | null,
): subtype is MemberIncomeSubtype =>
  (MEMBER_INCOME_SUBTYPES as readonly (string | null)[]).includes(subtype);

/** Dues or levy income: credited only by allocations (F3-2). */
export const isMemberIncomeRole = (role: AccountRole) =>
  role.class === "income" && isMemberIncomeSubtype(role.subtype);

/** At most one active account per organisation may carry these subtypes. */
export const isSingletonRole = (role: AccountRole) =>
  isOpeningEquityRole(role) || isMemberHoldingRole(role) || isMemberIncomeRole(role);

/** Subtypes already held by an active singleton account. */
export const activeSingletonSubtypes = (
  accounts: readonly LedgerAccount[],
): ReadonlySet<AccountSubtype> => {
  const subtypes = new Set<AccountSubtype>();
  for (const account of accounts) {
    if (account.active !== true) continue;
    const role = toAccountRole(account);
    if (role?.subtype && isSingletonRole(role)) subtypes.add(role.subtype);
  }
  return subtypes;
};

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

const accountNameIssue = (rawName: string): string | null => {
  const name = rawName.trim();
  if (!name) return "Enter an account name.";
  if (name.length > MAX_ACCOUNT_NAME_LENGTH)
    return `Account names can be at most ${MAX_ACCOUNT_NAME_LENGTH} characters.`;
  return null;
};

/**
 * The first thing to fix in one draft, or null. Mirrors the backend's
 * validator for convenience; the server still decides.
 */
export const validateAccountDraft = (draft: AccountDraft): string | null => {
  const nameIssue = accountNameIssue(draft.name);
  if (nameIssue) return nameIssue;

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

export const MEMBER_INCOME_IN_USE_NOTE =
  "Allocations are on, so this account can't be deactivated. Turn allocations off first.";

export const MEMBER_INCOME_SETTING_UNKNOWN_NOTE =
  "This server didn't report whether allocations are on, so this account can't be deactivated from here.";

export const singletonTakenNote = (subtype: AccountSubtype) =>
  `This ledger already has an active ${ACCOUNT_SUBTYPE_LABELS[subtype].toLowerCase()} account, so this one can't be reactivated.`;

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
   * The status's `allocationsEnabled`. Member income accounts can only be
   * deactivated while it is explicitly `false`; unreported fails closed.
   */
  allocationsEnabled?: boolean | null;
  /**
   * Subtypes held by an active singleton (`activeSingletonSubtypes`). An
   * inactive singleton whose role is taken cannot be reactivated. Without it
   * the backend's refusal is the only check, as before F3A.
   */
  activeSingletonSubtypes?: ReadonlySet<AccountSubtype>;
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

  if (active && isMemberIncomeRole(role)) {
    // F3-2: the ledger needs these accounts only while allocations are on.
    // Only an explicit `false` proves they are off.
    const canDeactivate = context.allocationsEnabled === false;
    return {
      canRename: true,
      canDeactivate,
      canReactivate: false,
      note: canDeactivate
        ? null
        : context.allocationsEnabled === true
          ? MEMBER_INCOME_IN_USE_NOTE
          : MEMBER_INCOME_SETTING_UNKNOWN_NOTE,
    };
  }

  if (active) {
    const canDeactivate = !isSingletonRole(role);
    return {
      canRename: true,
      canDeactivate,
      canReactivate: false,
      note: canDeactivate ? null : SINGLETON_ACCOUNTS_NOTE,
    };
  }

  if (
    role.subtype &&
    isSingletonRole(role) &&
    context.activeSingletonSubtypes?.has(role.subtype)
  )
    return {
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: singletonTakenNote(role.subtype),
    };

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
 * The activation step. Where this build has no opening-balance screens it is
 * a later phase; otherwise it follows the reported lifecycle state, which is
 * the server's evidence that verification happened.
 */
const activationStep = (
  state: LedgerKnownState | "unknown",
  openingBalancesAvailable: boolean,
): SetupStep => {
  const step = { key: "activation", title: "Opening balances and activation" };
  if (!openingBalancesAvailable) {
    return {
      ...step,
      detail: "Arrives in a later release. Nothing is activated from this screen.",
      status: "later",
    };
  }
  switch (state) {
    case "active":
      return {
        ...step,
        detail: "Opening balances were verified and the ledger is active.",
        status: "done",
      };
    case "suspended":
      return {
        ...step,
        detail: "Opening balances were verified. The ledger is suspended until an owner resumes it.",
        status: "done",
      };
    case "pending_verification":
      return {
        ...step,
        detail: "An opening proposal is waiting for the owner to verify it. Verification activates the ledger.",
        status: "todo",
      };
    default:
      return {
        ...step,
        detail: "A finance officer proposes the opening balances in Opening balances; the owner verifies them to activate the ledger.",
        status: "todo",
      };
  }
};

/**
 * Progress from the data on screen only. A step is "done" only when the
 * backend sent the evidence for it; nothing is inferred from an absent field.
 * Activation is shown as a later phase unless this build offers the
 * opening-balance screens (`openingBalancesAvailable`).
 */
export const ledgerSetupSteps = (
  status: LedgerStatus,
  accounts: readonly LedgerAccount[] | null,
  { openingBalancesAvailable = false }: { openingBalancesAvailable?: boolean } = {},
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
    activationStep(state, openingBalancesAvailable),
  ];

  let currentTaken = false;
  return steps.map((step) => {
    if (step.status !== "todo" || currentTaken) return step;
    currentTaken = true;
    return { ...step, status: "current" };
  });
};

/* ------------------------------------------------------------------ */
/* F3A: member income accounts (F3 RFC v0.3 §5.2, O1)                 */
/* ------------------------------------------------------------------ */

export interface MemberIncomeAccountSpec {
  subtype: MemberIncomeSubtype;
  /** "Dues income account": what the role is called in setup copy. */
  title: string;
  /** Prefilled name; the officer may change it before confirming. */
  suggestedName: string;
  purpose: string;
}

export const MEMBER_INCOME_ACCOUNTS: Record<MemberIncomeSubtype, MemberIncomeAccountSpec> = {
  member_dues_income: {
    subtype: "member_dues_income",
    title: "Dues income account",
    suggestedName: "Dues income (from allocations)",
    purpose: "Receives member money allocated to dues. Only allocations credit it.",
  },
  member_levy_income: {
    subtype: "member_levy_income",
    title: "Levy income account",
    suggestedName: "Levy income (from allocations)",
    purpose: "Receives member money allocated to levies. Only allocations credit it.",
  },
};

export interface MemberIncomeAccountState {
  /** The active account in this role, if any (at most one: singleton). */
  active: LedgerAccount | null;
  /** Earlier accounts in this role that were deactivated. */
  inactive: LedgerAccount[];
}

/** Where each member income role stands in the current account list. */
export const memberIncomeAccountStates = (
  accounts: readonly LedgerAccount[],
): Record<MemberIncomeSubtype, MemberIncomeAccountState> => {
  const states: Record<MemberIncomeSubtype, MemberIncomeAccountState> = {
    member_dues_income: { active: null, inactive: [] },
    member_levy_income: { active: null, inactive: [] },
  };
  for (const account of accounts) {
    const role = toAccountRole(account);
    if (!role || !isMemberIncomeRole(role)) continue;
    const state = states[role.subtype as MemberIncomeSubtype];
    if (account.active === true) state.active = state.active ?? account;
    else if (account.active === false) state.inactive.push(account);
  }
  return states;
};

/**
 * Body entry for `POST /ledger/accounts`. The class is always `income` and the
 * subtype is the specialised role: never built from a generic draft, so the
 * ordinary income flow keeps `subtype: null`.
 */
export const buildMemberIncomeAccountPayload = (
  subtype: MemberIncomeSubtype,
  name: string,
): CreateAccountPayload => ({ name: name.trim(), class: "income", subtype });

/**
 * The first problem with creating a member income account, or null: the name
 * rules, an active account already using the name, or an active account
 * already holding the role (singleton). Convenience only; the server decides.
 */
export const validateMemberIncomeAccount = (
  subtype: MemberIncomeSubtype,
  name: string,
  accounts: readonly LedgerAccount[],
): string | null => {
  const nameIssue = accountNameIssue(name);
  if (nameIssue) return nameIssue;
  if (activeSingletonSubtypes(accounts).has(subtype))
    return `This ledger already has an active ${ACCOUNT_SUBTYPE_LABELS[subtype].toLowerCase()} account.`;
  const key = accountNameKey(name);
  if (
    accounts.some(
      (account) => account.active === true && accountNameKey(account.name) === key,
    )
  )
    return `An active account named "${name.trim()}" already exists.`;
  return null;
};

/* ------------------------------------------------------------------ */
/* F3A: allocation setting and readiness (F3 RFC v0.3 §9, O9)         */
/* ------------------------------------------------------------------ */

/** `unknown`: the server did not report the setting (pre-F3-2 or malformed). */
export type AllocationSetting = "on" | "off" | "unknown";

export const allocationSetting = (status: LedgerStatus): AllocationSetting =>
  status.allocationsEnabled === true
    ? "on"
    : status.allocationsEnabled === false
      ? "off"
      : "unknown";

export type PrerequisiteState = "met" | "missing" | "unknown";

export type AllocationPrerequisiteKey =
  | "member-receipts"
  | MemberIncomeSubtype
  | "ledger-state"
  | "server-writes"
  | "permission"
  | "write-uncertainty";

export interface AllocationPrerequisite {
  key: AllocationPrerequisiteKey;
  title: string;
  state: PrerequisiteState;
  detail: string;
}

export interface AllocationReadiness {
  setting: AllocationSetting;
  /** Everything turning allocations on needs, in display order. */
  prerequisites: AllocationPrerequisite[];
  canEnable: boolean;
  canDisable: boolean;
  /** Why the setting can't be changed from here at all, or null. */
  note: string | null;
}

export interface AllocationReadinessContext {
  canManage: boolean;
  /** An earlier ledger write in this organisation is still unresolved. */
  writeBlocked: boolean;
}

/** States in which the backend accepts a settings change (not `suspended`). */
const SETTINGS_STATES: readonly LedgerKnownState[] = [
  "setup",
  "pending_verification",
  "active",
];

const memberReceiptsPrerequisite = (status: LedgerStatus): AllocationPrerequisite => {
  const title = "Member receipts are on";
  if (status.memberReceiptsEnabled === true)
    return { key: "member-receipts", title, state: "met", detail: "Member money is held as a liability." };
  if (status.memberReceiptsEnabled === false)
    return {
      key: "member-receipts",
      title,
      state: "missing",
      detail: "Turn on member receipts first. Allocations move held member money into income.",
    };
  return {
    key: "member-receipts",
    title,
    state: "unknown",
    detail: "This server did not report the member-receipts setting.",
  };
};

const incomeAccountPrerequisite = (
  subtype: MemberIncomeSubtype,
  accounts: readonly LedgerAccount[] | null,
): AllocationPrerequisite => {
  const spec = MEMBER_INCOME_ACCOUNTS[subtype];
  const title = `An active ${spec.title.toLowerCase()}`;
  if (accounts === null)
    return { key: subtype, title, state: "unknown", detail: "Waiting for the current account list." };
  const { active, inactive } = memberIncomeAccountStates(accounts)[subtype];
  if (active) return { key: subtype, title, state: "met", detail: `"${active.name}" is active.` };
  return {
    key: subtype,
    title,
    state: "missing",
    detail: inactive.length
      ? `"${inactive[0].name}" is inactive. Reactivate it or add a new one.`
      : "Not added yet. Nothing is created automatically.",
  };
};

const ledgerStatePrerequisite = (status: LedgerStatus): AllocationPrerequisite => {
  const title = "The ledger accepts setting changes";
  const state = ledgerStateKey(status);
  if (state === "unknown")
    return {
      key: "ledger-state",
      title,
      state: "unknown",
      detail: "This app version doesn't recognise the bookkeeping state.",
    };
  if (state === "suspended")
    return {
      key: "ledger-state",
      title,
      state: "missing",
      detail: "The ledger is suspended. This setting can't change until an owner resumes it.",
    };
  if (!SETTINGS_STATES.includes(state))
    return { key: "ledger-state", title, state: "missing", detail: "Start bookkeeping setup first." };
  if (status.revision === null)
    return {
      key: "ledger-state",
      title,
      state: "unknown",
      detail: "This server doesn't send the ledger revision, so the setting can't be changed from here.",
    };
  return {
    key: "ledger-state",
    title,
    state: "met",
    detail: `Bookkeeping state: ${LEDGER_STATE_LABELS[state]}.`,
  };
};

const serverWritesPrerequisite = (status: LedgerStatus): AllocationPrerequisite => {
  const title = "The server accepts ledger changes";
  if (status.blockers === null)
    return {
      key: "server-writes",
      title,
      state: "unknown",
      detail: "This server did not report whether ledger changes are available.",
    };
  if (status.blockers.length > 0)
    return {
      key: "server-writes",
      title,
      state: "missing",
      detail: "Ledger changes aren't available on this server right now.",
    };
  return { key: "server-writes", title, state: "met", detail: "Ledger changes are available." };
};

/**
 * What the allocation setting needs, from the data on screen only. A step is
 * `met` only on the server's evidence; nothing is inferred from an absent
 * field, nothing is created, and the backend still decides every refusal.
 * Turning allocations off needs only the change conditions (state, server,
 * permission, no unresolved write), never the accounts.
 */
export const allocationReadiness = (
  status: LedgerStatus,
  accounts: readonly LedgerAccount[] | null,
  { canManage, writeBlocked }: AllocationReadinessContext,
): AllocationReadiness => {
  const setting = allocationSetting(status);
  const change: AllocationPrerequisite[] = [
    ledgerStatePrerequisite(status),
    serverWritesPrerequisite(status),
    {
      key: "permission",
      title: "You can manage finance",
      state: canManage ? "met" : "missing",
      detail: canManage
        ? "You have the finance manage permission."
        : "Changing this setting needs the finance manage permission.",
    },
    {
      key: "write-uncertainty",
      title: "No unconfirmed ledger change",
      state: writeBlocked ? "missing" : "met",
      detail: writeBlocked
        ? "An earlier ledger change couldn't be confirmed. Recheck the ledger first."
        : "Every earlier change here was confirmed.",
    },
  ];
  const prerequisites: AllocationPrerequisite[] = [
    memberReceiptsPrerequisite(status),
    incomeAccountPrerequisite("member_dues_income", accounts),
    incomeAccountPrerequisite("member_levy_income", accounts),
    ...change,
  ];
  const allMet = (list: readonly AllocationPrerequisite[]) =>
    list.every((item) => item.state === "met");

  return {
    setting,
    prerequisites,
    canEnable: setting === "off" && allMet(prerequisites),
    canDisable: setting === "on" && allMet(change),
    note:
      setting === "unknown"
        ? "This server doesn't report the allocations setting, so it can't be changed from here."
        : null,
  };
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
  notStarted: "LEDGER_NOT_ACTIVE",
  suspended: "LEDGER_SUSPENDED",
  roleMismatch: "LEDGER_ACCOUNT_ROLE_MISMATCH",
  memberReceiptsDisabled: "LEDGER_MEMBER_RECEIPTS_DISABLED",
  requiredAccountMissing: "LEDGER_REQUIRED_ACCOUNT_MISSING",
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

/**
 * Codes whose wording here is clearer than the server's generic text: a stale
 * revision has already triggered a reload, and the role-mismatch text lists
 * every account type, which reads as an officer mistake.
 */
const REFUSAL_COPY: Readonly<Record<string, string>> = {
  [LEDGER_SETUP_ERROR_CODES.revisionConflict]:
    "The ledger changed since it was loaded, so nothing was saved. It has been reloaded: check what it shows now before trying again.",
  [LEDGER_SETUP_ERROR_CODES.roleMismatch]:
    "This server doesn't accept that account type yet, so nothing was created.",
};

/** Used only when the server sent a code without any `error` text. */
const REFUSAL_FALLBACKS: Readonly<Record<string, string>> = {
  [LEDGER_SETUP_ERROR_CODES.memberReceiptsDisabled]:
    "Turn on member receipts before turning on allocations.",
  [LEDGER_SETUP_ERROR_CODES.requiredAccountMissing]:
    "Add an active dues income account and an active levy income account before turning on allocations.",
  [LEDGER_SETUP_ERROR_CODES.alreadyStarted]:
    "This ledger already has an active account in that role.",
  [LEDGER_SETUP_ERROR_CODES.nameTaken]: "Another active account already has that name.",
  [LEDGER_SETUP_ERROR_CODES.suspended]: "The ledger is suspended, so nothing was changed.",
  [LEDGER_SETUP_ERROR_CODES.notStarted]: "Bookkeeping setup hasn't started for this organisation.",
  [LEDGER_SETUP_ERROR_CODES.writesDisabled]:
    "Ledger changes aren't available on this server right now. Nothing was saved.",
  [LEDGER_SETUP_ERROR_CODES.transactionsUnavailable]:
    "Ledger changes aren't available on this server right now. Nothing was saved.",
  [LEDGER_SETUP_ERROR_CODES.indexesNotInstalled]:
    "Ledger changes aren't available on this server right now. Nothing was saved.",
};

/**
 * Officer-facing text for a definite refusal (never for an unknown outcome;
 * check `ledgerWriteOutcomeUnknown` first). Used by the F3A controls.
 */
export const ledgerSetupRefusalMessage = (
  failure: LedgerApiFailure,
  fallback: string,
): string => {
  const code = failure.code ?? "";
  return REFUSAL_COPY[code] ?? failure.message ?? REFUSAL_FALLBACKS[code] ?? fallback;
};
