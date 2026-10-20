import {
  ledgerRecheckUsable,
  ACCOUNT_CHANGE_UNAVAILABLE_NOTE,
  ACCOUNT_SUBTYPES_BY_CLASS,
  MEMBER_INCOME_ACCOUNTS,
  MEMBER_INCOME_IN_USE_NOTE,
  MEMBER_INCOME_SETTING_UNKNOWN_NOTE,
  MEMBER_RECEIPTS_REQUIRED_NOTE,
  OPENING_PENDING_ACCOUNTS_NOTE,
  SINGLETON_ACCOUNTS_NOTE,
  STARTER_ACCOUNTS,
  SUSPENDED_ACCOUNTS_NOTE,
  accountActions,
  accountNameKey,
  activeSingletonSubtypes,
  allocationReadiness,
  allocationSetting,
  buildAccountPayload,
  buildCreateAccountsPayload,
  buildMemberIncomeAccountPayload,
  isSingletonRole,
  canCreateAccounts,
  canEnableMemberReceipts,
  canStartLedgerSetup,
  draftFromStarter,
  emptyAccountDraft,
  ledgerApiFailure,
  ledgerSetupRefusalMessage,
  ledgerSetupSteps,
  ledgerWriteOutcomeUnknown,
  memberIncomeAccountStates,
  moneyAccountsFrozen,
  singletonTakenNote,
  starterAccountsFor,
  toAccountRole,
  validateAccountBatch,
  validateAccountDraft,
  validateMemberIncomeAccount,
  AccountDraft,
} from "helpers/ledgerSetup";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import { LEDGER_WRITE_UNCERTAIN_NOTE } from "helpers/ledgerWriteUncertainty";

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "a1",
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

const statusOf = (
  state: LedgerKnownState,
  overrides: Partial<LedgerStatus> = {},
): LedgerStatus => ({
  state: { kind: "known", state },
  currency: "NGN",
  openingBalancesVerified: state === "active",
  postingEnabled: state === "active",
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: null,
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 2,
  memberReceiptsEnabled: true,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  allocationsEnabled: false,
  ...overrides,
});

const draft = (overrides: Partial<AccountDraft> = {}): AccountDraft => ({
  ...emptyAccountDraft(),
  name: "Petty cash",
  ...overrides,
});

describe("ledger setup account roles", () => {
  it("accepts only the closed class/subtype vocabulary", () => {
    expect(toAccountRole({ class: "asset", subtype: "cash" })).toEqual({
      class: "asset",
      subtype: "cash",
    });
    expect(toAccountRole({ class: "income", subtype: null })).toEqual({
      class: "income",
      subtype: null,
    });
    expect(toAccountRole({ class: "equity", subtype: "opening_balance_equity" })).not.toBeNull();
    expect(toAccountRole({ class: "liability", subtype: "member_receipts_unallocated" })).not.toBeNull();
  });

  it("rejects a class/subtype pair this build must not widen", () => {
    expect(toAccountRole({ class: "income", subtype: "cash" })).toBeNull();
    expect(toAccountRole({ class: "asset", subtype: "opening_balance_equity" })).toBeNull();
    expect(toAccountRole({ class: "asset", subtype: null })).toBeNull();
    expect(toAccountRole({ class: "other", subtype: null })).toBeNull();
    expect(toAccountRole({ class: null, subtype: null })).toBeNull();
  });
});

describe("starter chart (D6)", () => {
  it("omits the member-money account unless member receipts are on", () => {
    expect(starterAccountsFor(false).map((account) => account.key)).not.toContain(
      "member-money",
    );
    expect(starterAccountsFor(true).map((account) => account.key)).toContain(
      "member-money",
    );
  });

  it("offers only suggestions the backend would accept", () => {
    for (const suggestion of STARTER_ACCOUNTS) {
      expect(toAccountRole(suggestion)).not.toBeNull();
    }
  });

  it("includes the required opening balance equity account", () => {
    expect(STARTER_ACCOUNTS).toContainEqual(
      expect.objectContaining({
        name: "Opening balance equity",
        class: "equity",
        subtype: "opening_balance_equity",
      }),
    );
  });
});

describe("account drafts and payloads", () => {
  it("builds a trimmed payload and normalises category subtypes to null", () => {
    expect(
      buildAccountPayload(
        draft({ name: "  Donations  ", class: "income", subtype: "cash" }),
      ),
    ).toEqual({ name: "Donations", class: "income", subtype: null });
  });

  it("sends bank metadata only for cash and bank accounts", () => {
    expect(
      buildAccountPayload(
        draft({
          name: "Main bank",
          class: "asset",
          subtype: "bank",
          bankName: " GTBank ",
          accountNumberLast4: "4321",
        }),
      ),
    ).toEqual({
      name: "Main bank",
      class: "asset",
      subtype: "bank",
      bankName: "GTBank",
      accountNumberLast4: "4321",
    });

    expect(
      buildAccountPayload(
        draft({ name: "Expenses", class: "expense", subtype: null, bankName: "GTB" }),
      ),
    ).toEqual({ name: "Expenses", class: "expense", subtype: null });
  });

  it("turns starter suggestions into drafts without creating anything", () => {
    const starter = STARTER_ACCOUNTS[0];
    expect(draftFromStarter(starter)).toEqual({
      name: starter.name,
      class: starter.class,
      subtype: starter.subtype,
      bankName: "",
      accountNumberLast4: "",
    });
  });

  it("validates one draft like the backend's strict validator", () => {
    expect(validateAccountDraft(draft({ name: "   " }))).toBe("Enter an account name.");
    expect(validateAccountDraft(draft({ name: "x".repeat(81) }))).toMatch(/80 characters/);
    expect(validateAccountDraft(draft({ class: "asset", subtype: null }))).toMatch(
      /Choose a subtype for this asset account/,
    );
    expect(
      validateAccountDraft(draft({ class: "income", subtype: null, bankName: "GTB" })),
    ).toMatch(/only be set on cash or bank accounts/);
    expect(
      validateAccountDraft(
        draft({ class: "asset", subtype: "bank", accountNumberLast4: "12" }),
      ),
    ).toMatch(/exactly the last 4 digits/);
    expect(
      validateAccountDraft(
        draft({ class: "asset", subtype: "bank", accountNumberLast4: "4321" }),
      ),
    ).toBeNull();
  });

  it("rejects duplicates within a batch and against active accounts", () => {
    expect(
      validateAccountBatch(
        [draft({ name: "Cash in hand" }), draft({ name: " cash  IN hand " })],
        [],
      ),
    ).toMatch(/listed more than once/);

    expect(
      validateAccountBatch([draft({ name: "Cash In Hand" })], [
        account({ name: "cash in hand", active: true }),
      ]),
    ).toMatch(/already exists/);

    // An inactive account keeps its name available.
    expect(
      validateAccountBatch([draft({ name: "Cash In Hand" })], [
        account({ name: "cash in hand", active: false }),
      ]),
    ).toBeNull();

    expect(accountNameKey("  Main   Bank ")).toBe("main bank");
  });

  it("rejects a second active singleton subtype", () => {
    const existingEquity = account({
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
    });
    const secondEquity = draft({
      name: "Another equity",
      class: "equity",
      subtype: "opening_balance_equity",
    });

    expect(validateAccountBatch([secondEquity], [existingEquity])).toMatch(
      /already has an active Opening balance equity account/,
    );
    expect(
      validateAccountBatch(
        [secondEquity, { ...secondEquity, name: "Third equity" }],
        [],
      ),
    ).toMatch(/Only one Opening balance equity account/);
  });

  it("caps a batch at the backend's per-request limit", () => {
    const many = Array.from({ length: 21 }, (_, index) =>
      draft({ name: `Account ${index}` }),
    );
    expect(validateAccountBatch(many, [])).toMatch(/at most 20 accounts/);
  });

  it("accepts a valid batch", () => {
    expect(
      validateAccountBatch(
        [
          draft({ name: "Cash in hand", class: "asset", subtype: "cash" }),
          draft({ name: "Donations", class: "income", subtype: null }),
        ],
        [account({ name: "Something else" })],
      ),
    ).toBeNull();
  });
});

describe("account row actions", () => {
  const context = (
    ledgerState: LedgerKnownState | "unknown",
    memberReceiptsEnabled: boolean | null = true,
  ) => ({ ledgerState, memberReceiptsEnabled });

  it("offers nothing without a known revision", () => {
    const allowance = accountActions(account({ revision: null }), context("setup"));
    expect(allowance).toEqual({
      canRename: false,
      canDeactivate: false,
      canReactivate: false,
      note: ACCOUNT_CHANGE_UNAVAILABLE_NOTE,
    });
  });

  it("offers identity changes for an active account", () => {
    expect(accountActions(account(), context("setup"))).toEqual({
      canRename: true,
      canDeactivate: true,
      canReactivate: false,
      note: null,
    });
  });

  it("never offers deactivation for an active singleton", () => {
    const equity = account({
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
    });
    expect(accountActions(equity, context("setup"))).toEqual({
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: SINGLETON_ACCOUNTS_NOTE,
    });
  });

  it("allows rename only while the ledger is suspended", () => {
    expect(accountActions(account(), context("suspended"))).toEqual({
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: SUSPENDED_ACCOUNTS_NOTE,
    });
    expect(
      accountActions(account({ active: false }), context("suspended")).canReactivate,
    ).toBe(false);
  });

  it("freezes money accounts while an opening proposal is pending", () => {
    expect(accountActions(account(), context("pending_verification"))).toEqual({
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: OPENING_PENDING_ACCOUNTS_NOTE,
    });

    // Non-money accounts are not part of the frozen money-account set.
    const income = account({
      name: "Donations",
      class: "income",
      subtype: null,
    });
    expect(accountActions(income, context("pending_verification"))).toEqual({
      canRename: true,
      canDeactivate: true,
      canReactivate: false,
      note: null,
    });
  });

  it("requires member receipts before reactivating the holding account", () => {
    const holding = account({
      name: "Member money – unallocated",
      class: "liability",
      subtype: "member_receipts_unallocated",
      active: false,
    });
    expect(accountActions(holding, context("setup", false))).toEqual({
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: MEMBER_RECEIPTS_REQUIRED_NOTE,
    });
    expect(accountActions(holding, context("setup", true)).canReactivate).toBe(true);
  });

  it("offers nothing for an unrecognised role or state", () => {
    const odd = account({ class: "other" });
    expect(accountActions(odd, context("setup")).canRename).toBe(false);
    expect(accountActions(account(), context("unknown")).canRename).toBe(false);
  });

  it("offers nothing while an earlier write is unresolved", () => {
    expect(
      accountActions(account(), {
        ledgerState: "setup",
        memberReceiptsEnabled: true,
        writeBlocked: true,
      }),
    ).toEqual({
      canRename: false,
      canDeactivate: false,
      canReactivate: false,
      note: LEDGER_WRITE_UNCERTAIN_NOTE,
    });
  });
});

describe("setup capabilities", () => {
  it("starts setup only on a ledger with no record, with manage permission", () => {
    expect(canStartLedgerSetup(statusOf("not_active"), true)).toBe(true);
    expect(canStartLedgerSetup(statusOf("not_active"), false)).toBe(false);
    expect(canStartLedgerSetup(statusOf("setup"), true)).toBe(false);
  });

  it("turns member receipts on only before activation and only upwards", () => {
    expect(
      canEnableMemberReceipts(
        statusOf("setup", { memberReceiptsEnabled: false, revision: 3 }),
        true,
      ),
    ).toBe(true);
    expect(
      canEnableMemberReceipts(
        statusOf("pending_verification", { memberReceiptsEnabled: false, revision: 3 }),
        true,
      ),
    ).toBe(true);

    expect(
      canEnableMemberReceipts(
        statusOf("setup", { memberReceiptsEnabled: true, revision: 3 }),
        true,
      ),
    ).toBe(false);
    expect(
      canEnableMemberReceipts(
        statusOf("active", { memberReceiptsEnabled: false, revision: 3 }),
        true,
      ),
    ).toBe(false);
    expect(
      canEnableMemberReceipts(
        statusOf("suspended", { memberReceiptsEnabled: false, revision: 3 }),
        true,
      ),
    ).toBe(false);
    // The PATCH needs expectedLedgerRevision; an F1 status has none.
    expect(
      canEnableMemberReceipts(
        statusOf("setup", { memberReceiptsEnabled: false, revision: null }),
        true,
      ),
    ).toBe(false);
    expect(
      canEnableMemberReceipts(
        statusOf("setup", { memberReceiptsEnabled: false, revision: 3 }),
        false,
      ),
    ).toBe(false);
  });

  it("creates accounts only in setup-capable states with manage permission", () => {
    expect(canCreateAccounts(statusOf("setup"), true)).toBe(true);
    expect(canCreateAccounts(statusOf("pending_verification"), true)).toBe(true);
    expect(canCreateAccounts(statusOf("active"), true)).toBe(true);
    expect(canCreateAccounts(statusOf("suspended"), true)).toBe(false);
    expect(canCreateAccounts(statusOf("not_active"), true)).toBe(false);
    expect(canCreateAccounts(statusOf("setup"), false)).toBe(false);
  });

  it("freezes money accounts only while opening balances are pending", () => {
    expect(moneyAccountsFrozen(statusOf("pending_verification"))).toBe(true);
    expect(moneyAccountsFrozen(statusOf("setup"))).toBe(false);
  });
});

describe("setup progress", () => {
  it("marks the first step as next before setup starts", () => {
    const steps = ledgerSetupSteps(statusOf("not_active", { memberReceiptsEnabled: null }), []);
    expect(steps[0]).toMatchObject({ key: "started", status: "current" });
    expect(steps[1].status).toBe("todo");
    expect(steps[steps.length - 1]).toMatchObject({ key: "activation", status: "later" });
  });

  it("shows evidence-based progress once setup and accounts exist", () => {
    const steps = ledgerSetupSteps(statusOf("setup", { memberReceiptsEnabled: false }), [
      account({ name: "Cash in hand" }),
      account({
        id: "a2",
        name: "Opening balance equity",
        class: "equity",
        subtype: "opening_balance_equity",
      }),
    ]);
    const byKey = Object.fromEntries(steps.map((step) => [step.key, step]));
    expect(byKey.started.status).toBe("done");
    expect(byKey["member-receipts"].status).toBe("done");
    expect(byKey["opening-equity"].status).toBe("done");
    expect(byKey["money-account"].status).toBe("done");
    expect(byKey.activation.status).toBe("later");
  });

  describe("activation step", () => {
    const CHART = [
      account({ name: "Cash in hand" }),
      account({ id: "a2", name: "Opening balance equity", class: "equity", subtype: "opening_balance_equity" }),
    ];
    const activation = (state: LedgerKnownState, openingBalancesAvailable?: boolean) =>
      ledgerSetupSteps(
        statusOf(state, { memberReceiptsEnabled: false }),
        CHART,
        openingBalancesAvailable === undefined ? undefined : { openingBalancesAvailable },
      ).find((step) => step.key === "activation");

    it.each(["not_active", "setup", "pending_verification", "active", "suspended"] as const)(
      "stays a later phase in %s when the opening-balance screens are off",
      (state) => {
        for (const available of [undefined, false]) {
          expect(activation(state, available)).toMatchObject({
            status: "later",
            detail: "Arrives in a later release. Nothing is activated from this screen.",
          });
        }
      },
    );

    it("is the next step once the chart is ready and setup has started", () => {
      const step = activation("setup", true);
      expect(step?.status).toBe("current");
      expect(step?.detail).toMatch(/proposes the opening balances.*owner verifies them/);
      expect(step?.detail).not.toMatch(/later release/);
    });

    it("waits on the owner while a proposal is pending", () => {
      const step = activation("pending_verification", true);
      expect(step?.status).toBe("current");
      expect(step?.detail).toMatch(/waiting for the owner to verify/);
    });

    it.each(["active", "suspended"] as const)("is done once the ledger is %s", (state) => {
      const step = activation(state, true);
      expect(step?.status).toBe("done");
      expect(step?.detail).toMatch(/Opening balances were verified/);
    });

    it("is not claimed before setup starts", () => {
      const steps = ledgerSetupSteps(statusOf("not_active", { memberReceiptsEnabled: null }), [], {
        openingBalancesAvailable: true,
      });
      expect(steps[0].status).toBe("current");
      expect(steps.find((step) => step.key === "activation")?.status).toBe("todo");
    });
  });

  it("does not claim an account step without a known account list", () => {
    const steps = ledgerSetupSteps(statusOf("setup"), null);
    const money = steps.find((step) => step.key === "money-account");
    expect(money?.status).not.toBe("done");
    expect(money?.detail).toMatch(/Waiting for the current account list/);
  });

  it("does not treat an inactive account as added", () => {
    const steps = ledgerSetupSteps(statusOf("setup"), [
      account({ name: "Cash in hand", active: false }),
    ]);
    expect(steps.find((step) => step.key === "money-account")?.status).not.toBe("done");
  });
});

describe("ledger write outcome detection", () => {
  it("reads the backend error text, code and status", () => {
    expect(
      ledgerApiFailure({
        response: { status: 409, data: { error: "Already started", code: "LEDGER_ALREADY_EXISTS" } },
      }),
    ).toEqual({
      message: "Already started",
      code: "LEDGER_ALREADY_EXISTS",
      status: 409,
      transportFailure: false,
    });

    expect(ledgerApiFailure(new Error("network"))).toEqual({
      message: undefined,
      code: undefined,
      status: undefined,
      transportFailure: true,
    });
  });

  it("treats a 4xx response as a provable refusal", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(
        ledgerWriteOutcomeUnknown({
          status,
          code: undefined,
          message: "refused",
          transportFailure: false,
        }),
      ).toBe(false);
    }
  });

  it("treats the three coded 'nothing written' 503s as clean failures", () => {
    for (const code of [
      "LEDGER_WRITES_DISABLED",
      "LEDGER_TRANSACTIONS_UNAVAILABLE",
      "LEDGER_INDEXES_NOT_INSTALLED",
    ]) {
      expect(
        ledgerWriteOutcomeUnknown({ status: 503, code, message: "off", transportFailure: false }),
      ).toBe(false);
    }
  });

  it("treats uncoded or unfamiliar server failures as ambiguous", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(
        ledgerWriteOutcomeUnknown({
          status,
          code: undefined,
          message: "server error",
          transportFailure: false,
        }),
      ).toBe(true);
    }
    // A different 5xx code still says nothing about whether it was written.
    expect(
      ledgerWriteOutcomeUnknown({
        status: 503,
        code: "SOMETHING_ELSE",
        message: "server error",
        transportFailure: false,
      }),
    ).toBe(true);
  });

  it("treats a 408 timeout response as ambiguous", () => {
    expect(
      ledgerWriteOutcomeUnknown({
        status: 408,
        code: undefined,
        message: undefined,
        transportFailure: false,
      }),
    ).toBe(true);
  });

  it("treats timeouts, network errors and aborted requests as ambiguous", () => {
    for (const error of [
      { code: "ECONNABORTED", message: "timeout of 10000ms exceeded", request: {} },
      { code: "ETIMEDOUT", message: "timeout" },
      { code: "ERR_NETWORK", message: "Network Error", request: {} },
      { message: "aborted" },
    ]) {
      const failure = ledgerApiFailure(error);
      expect(failure.transportFailure).toBe(true);
      expect(ledgerWriteOutcomeUnknown(failure)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* F3A: member income accounts and the allocation setting             */
/* ------------------------------------------------------------------ */

const duesIncome = (overrides: Partial<LedgerAccount> = {}) =>
  account({
    id: "dues",
    name: "Dues income (from allocations)",
    class: "income",
    subtype: "member_dues_income",
    ...overrides,
  });

const levyIncome = (overrides: Partial<LedgerAccount> = {}) =>
  account({
    id: "levy",
    name: "Levy income (from allocations)",
    class: "income",
    subtype: "member_levy_income",
    ...overrides,
  });

const donations = account({ id: "don", name: "Donations", class: "income", subtype: null });

describe("F3 member income roles", () => {
  it("recognises both specialised income subtypes as singletons", () => {
    for (const subtype of ["member_dues_income", "member_levy_income"]) {
      const role = toAccountRole({ class: "income", subtype });
      expect(role).toEqual({ class: "income", subtype });
      expect(isSingletonRole(role!)).toBe(true);
    }
  });

  it("keeps ordinary income valid with no subtype and never requires one", () => {
    expect(toAccountRole({ class: "income", subtype: null })).toEqual({
      class: "income",
      subtype: null,
    });
    expect(isSingletonRole({ class: "income", subtype: null })).toBe(false);
    expect(ACCOUNT_SUBTYPES_BY_CLASS.income).toEqual([]);
  });

  it("does not widen the specialised subtypes to other classes", () => {
    expect(toAccountRole({ class: "expense", subtype: "member_dues_income" })).toBeNull();
    expect(toAccountRole({ class: "liability", subtype: "member_levy_income" })).toBeNull();
    expect(toAccountRole({ class: "income", subtype: "member_welfare_income" })).toBeNull();
  });

  it("keeps the generic income flow on subtype null even if a draft carries one", () => {
    // The generic form must never become a specialised-account flow.
    const forced = draft({ name: "Dues", class: "income", subtype: "member_dues_income" });
    expect(buildAccountPayload(forced)).toEqual({ name: "Dues", class: "income", subtype: null });
    expect(buildCreateAccountsPayload([forced]).accounts[0].subtype).toBeNull();
    expect(STARTER_ACCOUNTS.some((starter) => starter.subtype === "member_dues_income")).toBe(false);
    expect(STARTER_ACCOUNTS.some((starter) => starter.subtype === "member_levy_income")).toBe(false);
  });

  it("builds the exact specialised account payload with a trimmed name", () => {
    expect(buildMemberIncomeAccountPayload("member_dues_income", "  Dues income (from allocations) ")).toEqual({
      name: "Dues income (from allocations)",
      class: "income",
      subtype: "member_dues_income",
    });
    expect(buildMemberIncomeAccountPayload("member_levy_income", MEMBER_INCOME_ACCOUNTS.member_levy_income.suggestedName)).toEqual({
      name: "Levy income (from allocations)",
      class: "income",
      subtype: "member_levy_income",
    });
  });

  it("refuses a second active account in the same role, but not an inactive twin", () => {
    expect(validateMemberIncomeAccount("member_dues_income", "Dues 2", [duesIncome()])).toBe(
      "This ledger already has an active member dues income account.",
    );
    expect(validateMemberIncomeAccount("member_levy_income", "Levy", [duesIncome()])).toBeNull();
    expect(
      validateMemberIncomeAccount("member_dues_income", "Dues 2", [duesIncome({ active: false })]),
    ).toBeNull();
  });

  it("refuses a name an active account already uses, ignoring case and spaces", () => {
    expect(
      validateMemberIncomeAccount("member_dues_income", "  donations ", [donations]),
    ).toBe('An active account named "donations" already exists.');
    expect(validateMemberIncomeAccount("member_dues_income", " ", [])).toBe("Enter an account name.");
    expect(validateMemberIncomeAccount("member_dues_income", "x".repeat(81), [])).toMatch(/at most 80/);
  });

  it("lists the roles held by active singletons only", () => {
    expect(activeSingletonSubtypes([duesIncome(), levyIncome({ active: false }), donations])).toEqual(
      new Set(["member_dues_income"]),
    );
  });

  it("reports the active and inactive accounts held in each role", () => {
    const states = memberIncomeAccountStates([
      duesIncome({ active: false, id: "old-dues" }),
      duesIncome(),
      levyIncome({ active: false }),
      donations,
    ]);
    expect(states.member_dues_income.active?.id).toBe("dues");
    expect(states.member_dues_income.inactive.map((entry) => entry.id)).toEqual(["old-dues"]);
    expect(states.member_levy_income.active).toBeNull();
    expect(states.member_levy_income.inactive.map((entry) => entry.id)).toEqual(["levy"]);
  });
});

describe("F3 member income row actions", () => {
  const context = (overrides: Partial<Parameters<typeof accountActions>[1]> = {}) => ({
    ledgerState: "active" as const,
    memberReceiptsEnabled: true,
    allocationsEnabled: false,
    ...overrides,
  });

  it("allows deactivation only while allocations are explicitly off", () => {
    expect(accountActions(duesIncome(), context())).toEqual({
      canRename: true,
      canDeactivate: true,
      canReactivate: false,
      note: null,
    });
    expect(accountActions(duesIncome(), context({ allocationsEnabled: true }))).toMatchObject({
      canRename: true,
      canDeactivate: false,
      note: MEMBER_INCOME_IN_USE_NOTE,
    });
    // An unreported setting fails closed.
    expect(accountActions(levyIncome(), context({ allocationsEnabled: null }))).toMatchObject({
      canDeactivate: false,
      note: MEMBER_INCOME_SETTING_UNKNOWN_NOTE,
    });
    expect(accountActions(levyIncome(), context({ allocationsEnabled: undefined }))).toMatchObject({
      canDeactivate: false,
    });
  });

  it("reactivates an inactive account without needing member receipts", () => {
    expect(
      accountActions(duesIncome({ active: false }), context({ memberReceiptsEnabled: false })),
    ).toMatchObject({ canReactivate: true, note: null });
  });

  it("refuses to reactivate while another active account holds the role", () => {
    expect(
      accountActions(
        duesIncome({ active: false, id: "old" }),
        context({ activeSingletonSubtypes: activeSingletonSubtypes([duesIncome()]) }),
      ),
    ).toEqual({
      canRename: true,
      canDeactivate: false,
      canReactivate: false,
      note: singletonTakenNote("member_dues_income"),
    });
  });

  it("keeps the earlier rules: suspended, unresolved write, no revision", () => {
    expect(accountActions(duesIncome(), context({ ledgerState: "suspended" }))).toMatchObject({
      canRename: true,
      canDeactivate: false,
      note: SUSPENDED_ACCOUNTS_NOTE,
    });
    expect(accountActions(duesIncome(), context({ writeBlocked: true }))).toMatchObject({
      canRename: false,
      note: LEDGER_WRITE_UNCERTAIN_NOTE,
    });
    expect(accountActions(duesIncome({ revision: null }), context())).toMatchObject({
      canRename: false,
      note: ACCOUNT_CHANGE_UNAVAILABLE_NOTE,
    });
  });

  it("leaves the F2 singletons' deactivation rule unchanged", () => {
    const equity = account({ class: "equity", subtype: "opening_balance_equity" });
    expect(accountActions(equity, context({ allocationsEnabled: false }))).toMatchObject({
      canDeactivate: false,
      note: SINGLETON_ACCOUNTS_NOTE,
    });
  });
});

describe("allocation readiness", () => {
  const READY = [duesIncome(), levyIncome()];
  const manager = { canManage: true, writeBlocked: false };
  const stateOf = (readiness: ReturnType<typeof allocationReadiness>) =>
    Object.fromEntries(readiness.prerequisites.map((item) => [item.key, item.state]));

  it("reads the setting three ways, never treating a missing one as on", () => {
    expect(allocationSetting(statusOf("active", { allocationsEnabled: true }))).toBe("on");
    expect(allocationSetting(statusOf("active", { allocationsEnabled: false }))).toBe("off");
    expect(allocationSetting(statusOf("active", { allocationsEnabled: null }))).toBe("unknown");
  });

  it("can be enabled when every prerequisite is met", () => {
    const readiness = allocationReadiness(statusOf("active", { memberReceiptsEnabled: true }), READY, manager);
    expect(stateOf(readiness)).toEqual({
      "member-receipts": "met",
      member_dues_income: "met",
      member_levy_income: "met",
      "ledger-state": "met",
      "server-writes": "met",
      permission: "met",
      "write-uncertainty": "met",
    });
    expect(readiness).toMatchObject({ setting: "off", canEnable: true, canDisable: false, note: null });
  });

  it.each(["setup", "pending_verification", "active"] as const)(
    "allows the change in %s",
    (state) => {
      expect(
        allocationReadiness(statusOf(state, { memberReceiptsEnabled: true }), READY, manager).canEnable,
      ).toBe(true);
    },
  );

  it("names each missing prerequisite instead of creating or enabling anything", () => {
    const readiness = allocationReadiness(
      statusOf("setup", { memberReceiptsEnabled: false }),
      [levyIncome({ active: false })],
      manager,
    );
    expect(stateOf(readiness)).toMatchObject({
      "member-receipts": "missing",
      member_dues_income: "missing",
      member_levy_income: "missing",
    });
    expect(readiness.prerequisites.find((item) => item.key === "member_levy_income")?.detail).toMatch(
      /is inactive\. Reactivate it/,
    );
    expect(readiness.canEnable).toBe(false);
  });

  it("refuses a suspended ledger for both directions", () => {
    const on = allocationReadiness(statusOf("suspended", { allocationsEnabled: true }), READY, manager);
    expect(stateOf(on)["ledger-state"]).toBe("missing");
    expect(on.canDisable).toBe(false);
    const off = allocationReadiness(statusOf("suspended"), READY, manager);
    expect(off.canEnable).toBe(false);
  });

  it("fails closed on unknown inputs", () => {
    const readiness = allocationReadiness(
      statusOf("active", { memberReceiptsEnabled: null, blockers: null, revision: null }),
      null,
      manager,
    );
    expect(stateOf(readiness)).toMatchObject({
      "member-receipts": "unknown",
      member_dues_income: "unknown",
      member_levy_income: "unknown",
      "ledger-state": "unknown",
      "server-writes": "unknown",
    });
    expect(readiness.canEnable).toBe(false);
  });

  it("blocks changes while the server reports a write blocker", () => {
    const readiness = allocationReadiness(
      statusOf("active", { blockers: ["LEDGER_WRITES_DISABLED"], allocationsEnabled: true }),
      READY,
      manager,
    );
    expect(stateOf(readiness)["server-writes"]).toBe("missing");
    expect(readiness.canDisable).toBe(false);
  });

  it("needs finance.manage and no unresolved write", () => {
    expect(
      allocationReadiness(statusOf("active"), READY, { canManage: false, writeBlocked: false }).canEnable,
    ).toBe(false);
    const blocked = allocationReadiness(statusOf("active", { allocationsEnabled: true }), READY, {
      canManage: true,
      writeBlocked: true,
    });
    expect(stateOf(blocked).permission).toBe("met");
    expect(stateOf(blocked)["write-uncertainty"]).toBe("missing");
    expect(blocked.canDisable).toBe(false);
  });

  it("lets allocations be turned off without the accounts or member receipts", () => {
    const readiness = allocationReadiness(
      statusOf("active", { allocationsEnabled: true, memberReceiptsEnabled: null }),
      [],
      manager,
    );
    expect(readiness).toMatchObject({ setting: "on", canEnable: false, canDisable: true });
  });

  it("offers no change when the server does not report the setting", () => {
    const readiness = allocationReadiness(statusOf("active", { allocationsEnabled: null }), READY, manager);
    expect(readiness).toMatchObject({ setting: "unknown", canEnable: false, canDisable: false });
    expect(readiness.note).toMatch(/doesn't report the allocations setting/);
  });
});

describe("F3A refusal copy", () => {
  const failureOf = (code?: string, message?: string) => ({
    code,
    message,
    status: 422,
    transportFailure: false,
  });

  it("explains a stale revision as reloaded rather than echoing the server", () => {
    expect(
      ledgerSetupRefusalMessage(failureOf("LEDGER_REVISION_CONFLICT", "Reload and try again."), "x"),
    ).toMatch(/It has been reloaded/);
  });

  it("prefers the server's text, then a code fallback, then the caller's", () => {
    expect(
      ledgerSetupRefusalMessage(failureOf("LEDGER_REQUIRED_ACCOUNT_MISSING", "Server text."), "x"),
    ).toBe("Server text.");
    expect(ledgerSetupRefusalMessage(failureOf("LEDGER_MEMBER_RECEIPTS_DISABLED"), "x")).toBe(
      "Turn on member receipts before turning on allocations.",
    );
    expect(ledgerSetupRefusalMessage(failureOf("LEDGER_REQUIRED_ACCOUNT_MISSING"), "x")).toMatch(
      /dues income account and an active levy income account/,
    );
    expect(ledgerSetupRefusalMessage(failureOf("LEDGER_WRITES_DISABLED"), "x")).toMatch(/Nothing was saved/);
    expect(ledgerSetupRefusalMessage(failureOf(undefined, undefined), "Fallback.")).toBe("Fallback.");
  });

  it("replaces the role-mismatch list with plain wording", () => {
    expect(
      ledgerSetupRefusalMessage(failureOf("LEDGER_ACCOUNT_ROLE_MISMATCH", "Account type not allowed. Use asset…"), "x"),
    ).toBe("This server doesn't accept that account type yet, so nothing was created.");
  });
});

describe("ledgerRecheckUsable (review of FE #140)", () => {
  const STATUS = {
    state: "active",
    currency: "NGN",
    openingBalancesVerified: true,
    postingEnabled: false,
    blockers: [],
    openingDate: "2026-09-01",
    lockedThrough: null,
    memberReceiptsEnabled: true,
    allocationsEnabled: false,
    revision: 4,
    pendingProposal: null,
    unconfirmedAttempts: 0,
    contractVersion: "f2-0.3",
  };
  const ACCOUNTS = [{ id: "a1", name: "Cash", class: "asset", subtype: "cash", currency: "NGN", active: true }];

  it("accepts a parsed status and account list", () => {
    expect(ledgerRecheckUsable(STATUS, ACCOUNTS)).toBe(true);
    expect(ledgerRecheckUsable({ ...STATUS, allocationsEnabled: true }, [])).toBe(true);
  });

  it("accepts an older F2 status for an F2A-2 recheck", () => {
    const withoutAllocations = { ...STATUS, allocationsEnabled: undefined };
    expect(ledgerRecheckUsable(withoutAllocations, ACCOUNTS)).toBe(false);
    expect(
      ledgerRecheckUsable(withoutAllocations, ACCOUNTS, { requireAllocations: false }),
    ).toBe(true);
    // Even without the F3 field, the status and account list must still parse.
    expect(
      ledgerRecheckUsable({ ...withoutAllocations, revision: undefined }, ACCOUNTS, {
        requireAllocations: false,
      }),
    ).toBe(false);
    expect(ledgerRecheckUsable(withoutAllocations, undefined, { requireAllocations: false })).toBe(false);
  });

  it("accepts a revision-less not_active status only for an initial setup recheck", () => {
    const noLedger = {
      state: "not_active",
      currency: "NGN",
      postingEnabled: false,
      blockers: [],
      revision: null,
      memberReceiptsEnabled: null,
      allocationsEnabled: null,
      contractVersion: "f2-0.3",
    };
    // An account or settings write may not use the no-ledger shape.
    expect(ledgerRecheckUsable(noLedger, [])).toBe(false);
    const setupRecheck = { allowInitialSetup: true, requireAllocations: false } as const;
    expect(ledgerRecheckUsable(noLedger, [], setupRecheck)).toBe(true);
    // F3A still needs a real allocations setting.
    expect(
      ledgerRecheckUsable(noLedger, [], { allowInitialSetup: true, requireAllocations: true }),
    ).toBe(false);
    // An existing ledger with a missing revision still fails.
    expect(ledgerRecheckUsable({ ...noLedger, state: "setup" }, [], setupRecheck)).toBe(false);
    expect(ledgerRecheckUsable({ ...noLedger, state: "active" }, [], setupRecheck)).toBe(false);
    // A no-ledger result with accounts is inconsistent, and accounts must parse.
    expect(ledgerRecheckUsable(noLedger, ACCOUNTS, setupRecheck)).toBe(false);
    expect(ledgerRecheckUsable(noLedger, undefined, setupRecheck)).toBe(false);
    expect(ledgerRecheckUsable({ ...noLedger, state: "frozen" }, [], setupRecheck)).toBe(false);
    expect(ledgerRecheckUsable({ ...noLedger, state: undefined }, [], setupRecheck)).toBe(false);
    // `revision` must be explicitly null, not absent or malformed.
    expect(ledgerRecheckUsable({ ...noLedger, revision: undefined }, [], setupRecheck)).toBe(false);
    expect(ledgerRecheckUsable({ ...noLedger, revision: "bad" }, [], setupRecheck)).toBe(false);
  });

  it.each([
    ["a missing status body", undefined, ACCOUNTS],
    ["a status that is not an object", "ok", ACCOUNTS],
    ["an unrecognised lifecycle state", { ...STATUS, state: "frozen" }, ACCOUNTS],
    ["a status without a revision", { ...STATUS, revision: undefined }, ACCOUNTS],
    ["a status without the allocations setting", { ...STATUS, allocationsEnabled: undefined }, ACCOUNTS],
    ["a malformed allocations setting", { ...STATUS, allocationsEnabled: "true" }, ACCOUNTS],
    ["a missing account list", STATUS, undefined],
    ["an account list that is not an array", STATUS, { accounts: ACCOUNTS }],
    ["an account without an id", STATUS, [{ name: "Cash" }]],
  ])("refuses %s, even after an HTTP success", (_label, status, accounts) => {
    expect(ledgerRecheckUsable(status, accounts)).toBe(false);
  });
});
