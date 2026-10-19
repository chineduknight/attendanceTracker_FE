import {
  ACCOUNT_CHANGE_UNAVAILABLE_NOTE,
  MEMBER_RECEIPTS_REQUIRED_NOTE,
  OPENING_PENDING_ACCOUNTS_NOTE,
  SINGLETON_ACCOUNTS_NOTE,
  STARTER_ACCOUNTS,
  SUSPENDED_ACCOUNTS_NOTE,
  accountActions,
  accountNameKey,
  buildAccountPayload,
  canCreateAccounts,
  canEnableMemberReceipts,
  canStartLedgerSetup,
  draftFromStarter,
  emptyAccountDraft,
  ledgerApiFailure,
  ledgerSetupSteps,
  ledgerWriteOutcomeUnknown,
  moneyAccountsFrozen,
  starterAccountsFor,
  toAccountRole,
  validateAccountBatch,
  validateAccountDraft,
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
