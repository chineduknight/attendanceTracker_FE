import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  ExpenseDraft,
  PostingSummary,
  ReceiptDraft,
  TransferDraft,
} from "components/finance/ledgerPostingTypes";
import {
  assessPostingConfirmation,
  buildExpenseBody,
  buildReceiptBody,
  buildTransferBody,
  classifyPostingFailure,
  expenseDraftIssue,
  isPostingMoneyAccount,
  nairaToKobo,
  postingAmountIssue,
  postingDateIssue,
  postingExpenseCategories,
  postingIncomeCategories,
  postingMoneyAccounts,
  postingReadiness,
  postingSummaryText,
  receiptDraftIssue,
  toPostingResponse,
  transferDraftIssue,
} from "helpers/ledgerPostings";

const account = (overrides: Partial<LedgerAccount>): LedgerAccount => ({
  id: "cash",
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: true,
  ...overrides,
});

const ACCOUNTS: LedgerAccount[] = [
  account({ id: "cash", name: "Cash in hand" }),
  account({
    id: "bank",
    name: "Main bank",
    subtype: "bank",
    bankName: "GTBank",
    accountNumberLast4: "0123",
  }),
  account({ id: "inactive", name: "Old cash", active: false }),
  account({ id: "unverified", name: "New bank", subtype: "bank", openingVerified: false }),
  account({ id: "unknown-opening", name: "Unknown opening", subtype: "bank", openingVerified: null }),
  account({ id: "income", name: "Donations", class: "income", subtype: null, openingVerified: null }),
  account({ id: "expense", name: "Venue", class: "expense", subtype: null, openingVerified: null }),
  account({
    id: "holding",
    name: "Member money held",
    class: "liability",
    subtype: "member_receipts_unallocated",
    openingVerified: null,
  }),
];

const CONTEXT = {
  today: "2026-10-19",
  openingDate: "2026-10-01",
  lockedThrough: null,
  lockedThroughState: "none" as const,
  accounts: ACCOUNTS,
};

const receipt = (overrides: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  businessDate: "2026-10-18",
  amountKobo: 2500000,
  toAccountId: "cash",
  incomeAccountId: "income",
  method: "cash",
  counterpartyName: "",
  externalReference: "",
  evidenceReference: "",
  reference: "",
  note: "",
  ...overrides,
});

const expense = (overrides: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  businessDate: "2026-10-18",
  amountKobo: 750000,
  fromAccountId: "bank",
  expenseAccountId: "expense",
  method: "bank_transfer",
  counterpartyName: "Venue Ltd",
  externalReference: "",
  evidenceReference: "",
  reference: "",
  note: "",
  ...overrides,
});

const transfer = (overrides: Partial<TransferDraft> = {}): TransferDraft => ({
  businessDate: "2026-10-18",
  amountKobo: 2000000,
  fromAccountId: "cash",
  toAccountId: "bank",
  method: "bank_transfer",
  externalReference: "",
  reference: "",
  note: "",
  ...overrides,
});

const status = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
  state: { kind: "known", state: "active" },
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: "2026-10-01",
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 7,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: "2026-10-02T09:00:00.000Z",
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

describe("nairaToKobo", () => {
  it("converts naira text to integer kobo without floating-point drift", () => {
    expect(nairaToKobo("25000")).toBe(2500000);
    expect(nairaToKobo("25000.5")).toBe(2500050);
    expect(nairaToKobo("25000.05")).toBe(2500005);
    expect(nairaToKobo("0.29")).toBe(29);
    expect(nairaToKobo("0.01")).toBe(1);
  });

  it("rejects zero, negatives, more than two decimals and unsafe values", () => {
    expect(nairaToKobo("")).toBeNull();
    expect(nairaToKobo("0")).toBeNull();
    expect(nairaToKobo("0.00")).toBeNull();
    expect(nairaToKobo("-1")).toBeNull();
    expect(nairaToKobo("1.234")).toBeNull();
    expect(nairaToKobo("1,000")).toBeNull();
    expect(nairaToKobo("9999999999999999")).toBeNull();
  });

  it("explains the amount problem", () => {
    expect(postingAmountIssue("")).toBe("Enter an amount.");
    expect(postingAmountIssue("0")).toBe("Enter an amount greater than zero.");
    expect(postingAmountIssue("1.234")).toMatch(/at most two decimal places/);
    expect(postingAmountIssue("2.50")).toBeNull();
  });
});

describe("postingDateIssue", () => {
  it("accepts a date inside the open period", () => {
    expect(postingDateIssue("2026-10-18", CONTEXT)).toBeNull();
  });

  it("refuses missing, future and before-opening dates", () => {
    expect(postingDateIssue("", CONTEXT)).toBe("Choose the business date.");
    expect(postingDateIssue("2026-10-20", CONTEXT)).toMatch(/after today in Lagos/);
    expect(postingDateIssue("2026-09-30", CONTEXT)).toMatch(/before the ledger's opening date/);
  });

  it("refuses a date inside a locked period", () => {
    expect(
      postingDateIssue("2026-10-10", {
        ...CONTEXT,
        lockedThrough: "2026-10-10",
        lockedThroughState: "set",
      }),
    ).toMatch(/period is locked through/);
    expect(
      postingDateIssue("2026-10-11", {
        ...CONTEXT,
        lockedThrough: "2026-10-10",
        lockedThroughState: "set",
      }),
    ).toBeNull();
  });
});

describe("eligible accounts and categories", () => {
  it("offers only active cash/bank accounts with a verified opening", () => {
    expect(postingMoneyAccounts(ACCOUNTS).map((entry) => entry.id)).toEqual([
      "cash",
      "bank",
    ]);
    expect(isPostingMoneyAccount(ACCOUNTS[3])).toBe(false);
    expect(isPostingMoneyAccount(ACCOUNTS[4])).toBe(false);
    expect(isPostingMoneyAccount(ACCOUNTS[5])).toBe(false);
  });

  it("offers only active income and expense categories", () => {
    expect(postingIncomeCategories(ACCOUNTS).map((entry) => entry.id)).toEqual([
      "income",
    ]);
    expect(postingExpenseCategories(ACCOUNTS).map((entry) => entry.id)).toEqual([
      "expense",
    ]);
    expect(
      postingIncomeCategories([
        account({ id: "closed-income", class: "income", active: false }),
      ]),
    ).toEqual([]);
  });
});

describe("draft validation", () => {
  it("accepts a complete receipt, expense and transfer", () => {
    expect(receiptDraftIssue(receipt(), CONTEXT)).toBeNull();
    expect(expenseDraftIssue(expense(), CONTEXT)).toBeNull();
    expect(transferDraftIssue(transfer(), CONTEXT)).toBeNull();
  });

  it("refuses ineligible accounts and categories", () => {
    expect(receiptDraftIssue(receipt({ toAccountId: "unverified" }), CONTEXT)).toMatch(
      /cash or bank account/,
    );
    expect(
      receiptDraftIssue(receipt({ incomeAccountId: "expense" }), CONTEXT),
    ).toMatch(/income category/);
    expect(
      expenseDraftIssue(expense({ expenseAccountId: "income" }), CONTEXT),
    ).toMatch(/expense category/);
  });

  it("requires the payee on expenses but not receipts", () => {
    expect(receiptDraftIssue(receipt({ counterpartyName: "" }), CONTEXT)).toBeNull();
    expect(
      expenseDraftIssue(expense({ counterpartyName: "   " }), CONTEXT),
    ).toBe("Paid to is required.");
  });

  it("refuses a transfer to the same account", () => {
    expect(
      transferDraftIssue(transfer({ toAccountId: "cash" }), CONTEXT),
    ).toBe("Choose a different account to transfer into.");
  });

  it("enforces the server text limits", () => {
    expect(
      receiptDraftIssue(receipt({ note: "x".repeat(501) }), CONTEXT),
    ).toBe("Note must be 500 characters or fewer.");
    expect(
      receiptDraftIssue(receipt({ externalReference: "x".repeat(65) }), CONTEXT),
    ).toBe("External reference must be 64 characters or fewer.");
  });
});

describe("exact bodies", () => {
  it("builds a receipt body with trimmed optional text and no foreign fields", () => {
    expect(
      buildReceiptBody(
        receipt({
          counterpartyName: "  Ada Obi ",
          externalReference: "  BANK-1 ",
          evidenceReference: "  till roll ",
          reference: "  R1 ",
          note: "  donation ",
        }),
        "key-12345678",
      ),
    ).toEqual({
      idempotencyKey: "key-12345678",
      businessDate: "2026-10-18",
      amountKobo: 2500000,
      toAccountId: "cash",
      incomeAccountId: "income",
      method: "cash",
      counterpartyName: "Ada Obi",
      externalReference: "BANK-1",
      evidenceReference: "till roll",
      reference: "R1",
      note: "donation",
    });
  });

  it("omits blank optional fields", () => {
    expect(buildReceiptBody(receipt(), "key-12345678")).toEqual({
      idempotencyKey: "key-12345678",
      businessDate: "2026-10-18",
      amountKobo: 2500000,
      toAccountId: "cash",
      incomeAccountId: "income",
      method: "cash",
    });
  });

  it("keeps the required expense payee and transfer fields only", () => {
    expect(buildExpenseBody(expense(), "key-12345678")).toMatchObject({
      counterpartyName: "Venue Ltd",
      fromAccountId: "bank",
      expenseAccountId: "expense",
    });
    const body = buildTransferBody(
      transfer({ externalReference: "  T1 ", reference: "  ", note: "" }),
      "key-12345678",
    );
    expect(body).toEqual({
      idempotencyKey: "key-12345678",
      businessDate: "2026-10-18",
      amountKobo: 2000000,
      fromAccountId: "cash",
      toAccountId: "bank",
      method: "bank_transfer",
      externalReference: "T1",
    });
    expect("counterpartyName" in body).toBe(false);
    expect("evidenceReference" in body).toBe(false);
  });
});

describe("assessPostingConfirmation", () => {
  const journal = (overrides: Record<string, unknown> = {}) => ({
    id: "journal-1",
    businessDate: "2026-10-18",
    sourceType: "cash_receipt",
    totalKobo: 2500000,
    entry: { number: "R-000001", method: "cash" },
    lines: [],
    ...overrides,
  });
  const assess = (
    httpStatus: number | undefined,
    body: unknown,
    operation: "receipt" | "expense" | "transfer" = "receipt",
  ) =>
    assessPostingConfirmation({
      httpStatus,
      body,
      operation,
      businessDate: "2026-10-18",
      amountKobo: 2500000,
    });

  it("confirms a 201 new posting with a usable journal identity", () => {
    expect(
      assess(201, { data: { replayed: false, journal: journal() } }),
    ).toMatchObject({ confirmed: true, replayed: false });
  });

  it("confirms a 200 replay with explicit replay information", () => {
    expect(
      assess(200, { data: { replayed: true, journal: journal() } }),
    ).toMatchObject({ confirmed: true, replayed: true });
  });

  it("rejects a missing journal identity", () => {
    expect(assess(201, { data: { replayed: false, journal: null } })).toMatchObject({
      confirmed: false,
    });
    expect(
      assess(201, {
        data: { replayed: false, journal: journal({ id: undefined }) },
      }),
    ).toMatchObject({ confirmed: false });
  });

  it("rejects missing or contradictory replay information", () => {
    expect(assess(201, { data: { journal: journal() } })).toMatchObject({
      confirmed: false,
    });
    expect(
      assess(201, { data: { replayed: true, journal: journal() } }),
    ).toMatchObject({ confirmed: false });
    expect(
      assess(200, { data: { replayed: false, journal: journal() } }),
    ).toMatchObject({ confirmed: false });
  });

  it("rejects a journal that does not match the operation, date, amount or number", () => {
    expect(
      assess(201, {
        data: { replayed: false, journal: journal({ sourceType: "cash_expense" }) },
      }),
    ).toMatchObject({ confirmed: false });
    expect(
      assess(201, {
        data: { replayed: false, journal: journal({ businessDate: "2026-10-17" }) },
      }),
    ).toMatchObject({ confirmed: false });
    expect(
      assess(201, {
        data: { replayed: false, journal: journal({ totalKobo: 1 }) },
      }),
    ).toMatchObject({ confirmed: false });
    expect(
      assess(201, {
        data: { replayed: false, journal: journal({ entry: {} }) },
      }),
    ).toMatchObject({ confirmed: false });
  });

  it("rejects unexpected 2xx statuses", () => {
    expect(assess(204, { data: { replayed: false, journal: journal() } })).toMatchObject({
      confirmed: false,
    });
    expect(assess(undefined, { data: { replayed: false, journal: journal() } })).toMatchObject({
      confirmed: false,
    });
  });
});

describe("toPostingResponse", () => {
  it("reads the confirmed journal, entry and replay flag", () => {
    const parsed = toPostingResponse({
      data: {
        replayed: true,
        journal: {
          id: "j1",
          businessDate: "2026-10-18",
          reference: "R1",
          note: "Donation",
          sourceType: "cash_receipt",
          totalKobo: 2500000,
          postedAt: "2026-10-18T10:00:00.000Z",
          postedBy: { id: "u1", name: "treasurer" },
          sourceId: "s1",
          entry: {
            number: "R-000001",
            method: "cash",
            counterpartyName: "Ada Obi",
            externalReference: "BANK-1",
            evidenceReference: "till roll",
          },
          lines: [],
        },
      },
    });
    expect(parsed.replayed).toBe(true);
    expect(parsed.journal).toMatchObject({
      id: "j1",
      number: "R-000001",
      method: "cash",
      totalKobo: 2500000,
      counterpartyName: "Ada Obi",
      postedByName: "treasurer",
    });
  });

  it("does not invent a journal from a malformed 2xx body", () => {
    expect(toPostingResponse({ data: { replayed: false } })).toEqual({
      journal: null,
      replayed: false,
    });
    expect(toPostingResponse({})).toEqual({ journal: null, replayed: null });
  });
});

describe("classifyPostingFailure", () => {
  const error = (status: number, code?: string, message = "Refused") => ({
    response: { status, data: { error: message, ...(code ? { code } : {}) } },
  });

  it("treats a first 422 as a clean refusal", () => {
    expect(classifyPostingFailure(error(422, "LEDGER_PERIOD_LOCKED"), false)).toMatchObject({
      kind: "clean-refusal",
      message: "Refused",
    });
  });

  it("never treats a 422 as clean after an ambiguous attempt", () => {
    expect(classifyPostingFailure(error(422, "LEDGER_PERIOD_LOCKED"), true)).toMatchObject({
      kind: "keep-pending",
      ambiguous: false,
    });
  });

  it("keeps 401, 403 and 404 pending without calling them ambiguous", () => {
    for (const statusCode of [401, 403, 404]) {
      const result = classifyPostingFailure(error(statusCode), false);
      expect(result).toMatchObject({ kind: "keep-pending", ambiguous: false });
    }
    expect(classifyPostingFailure(error(401), false)).toMatchObject({
      ownerResolution: false,
    });
    expect(classifyPostingFailure(error(403), false)).toMatchObject({
      ownerResolution: true,
    });
    expect(classifyPostingFailure(error(404), false)).toMatchObject({
      ownerResolution: true,
    });
  });

  it("treats posting contention as retryable, not as owner resolution", () => {
    expect(
      classifyPostingFailure(error(409, "LEDGER_POSTING_CONTENDED"), false),
    ).toMatchObject({
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: false,
    });
  });

  it("treats a timeout/network failure and 5xx as ambiguous", () => {
    expect(
      classifyPostingFailure({ code: "ECONNABORTED" }, false),
    ).toMatchObject({ kind: "keep-pending", ambiguous: true });
    expect(classifyPostingFailure(error(502), false)).toMatchObject({
      kind: "keep-pending",
      ambiguous: true,
    });
    expect(classifyPostingFailure(error(500, "LEDGER_POSTING_OUTCOME_UNKNOWN"), false)).toMatchObject({
      kind: "keep-pending",
      ambiguous: true,
    });
  });

  it("keeps a known nothing-written 503 pending but not ambiguous", () => {
    expect(
      classifyPostingFailure(error(503, "LEDGER_WRITES_DISABLED"), false),
    ).toMatchObject({ kind: "keep-pending", ambiguous: false });
  });

  it("recognises key reuse and a void as proof", () => {
    expect(
      classifyPostingFailure(error(409, "LEDGER_IDEMPOTENCY_KEY_REUSED"), true),
    ).toMatchObject({ kind: "key-reused" });
    expect(
      classifyPostingFailure(error(409, "LEDGER_IDEMPOTENCY_KEY_VOIDED"), true),
    ).toMatchObject({ kind: "voided" });
  });
});

describe("postingReadiness", () => {
  const ready = (overrides: Partial<LedgerStatus> = {}, canManage = true) =>
    postingReadiness({ status: status(overrides), canManage, accounts: ACCOUNTS });

  it("is ready only for an active, verified, unblocked ledger", () => {
    expect(ready()).toEqual({ ready: true, reason: null });
  });

  it("never trusts postingEnabled over blockers or an unreported blocker list", () => {
    expect(
      ready({ postingEnabled: true, blockers: ["LEDGER_WRITES_DISABLED"] }),
    ).toMatchObject({ ready: false });
    expect(ready({ postingEnabled: true, blockers: null })).toMatchObject({
      ready: false,
    });
  });

  it("explains permission, inactive, suspended and unverified states", () => {
    expect(ready({}, false).reason).toMatch(/permission to manage finance/);
    expect(ready({ state: { kind: "known", state: "suspended" } }).reason).toMatch(
      /suspended/,
    );
    expect(ready({ state: { kind: "known", state: "setup" } }).reason).toMatch(
      /setup is still in progress/,
    );
    expect(ready({ state: { kind: "known", state: "not_active" } }).reason).toMatch(
      /hasn't been activated/,
    );
    expect(
      ready({ state: { kind: "known", state: "pending_verification" } }).reason,
    ).toMatch(/awaiting independent verification/);
    expect(ready({ openingBalancesVerified: false }).reason).toMatch(
      /aren't verified/,
    );
  });

  it("explains server blockers instead of offering a form", () => {
    expect(
      ready({
        postingEnabled: false,
        blockers: ["LEDGER_WRITES_DISABLED"],
      }).reason,
    ).toMatch(/switched off on the server/);
    expect(
      ready({ postingEnabled: false, blockers: null }).reason,
    ).toMatch(/didn't report whether posting is available/);
    expect(
      ready({ postingEnabled: false, blockers: ["SOMETHING_NEW"] }).reason,
    ).toMatch(/SOMETHING_NEW/);
  });

  it("fails closed without an opening date, a known lock or eligible accounts", () => {
    expect(ready({ openingDate: null }).reason).toMatch(/opening date/);
    expect(
      ready({ lockedThroughState: "unknown" }).reason,
    ).toMatch(/period lock/);
    expect(
      postingReadiness({ status: status(), canManage: true, accounts: null }).reason,
    ).toMatch(/accounts couldn't be loaded/);
    expect(
      postingReadiness({
        status: status(),
        canManage: true,
        accounts: [account({ id: "unverified", openingVerified: false })],
      }).reason,
    ).toMatch(/No active cash or bank account/);
  });
});

describe("summary text", () => {
  it("never treats a receipt as dues", () => {
    const summary: PostingSummary = {
      operation: "receipt",
      amountKobo: 2500000,
      businessDate: "2026-10-18",
      method: "cash",
      fromAccountName: null,
      toAccountName: "Cash in hand",
      categoryName: "Donations",
    };
    expect(postingSummaryText(summary)).toContain("Money in");
  });
});
