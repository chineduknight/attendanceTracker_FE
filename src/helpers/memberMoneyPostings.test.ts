import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  MemberMoneySourceRef,
  MemberReceiptDraft,
  PostingSummary,
  RefundDraft,
} from "components/finance/ledgerPostingTypes";
import {
  RECEIVED_AFTER_OPENING_COUNT_ISSUE,
  assessPostingConfirmation,
  buildMemberReceiptBody,
  buildPostingBody,
  buildRefundBody,
  classifyPostingFailure,
  memberMoneyReadiness,
  memberReceiptDraftIssue,
  postingEndpoint,
  postingSourceId,
  postingSummaryText,
  refundDraftIssue,
  toPostingJournal,
} from "helpers/ledgerPostings";
import { toMemberMoneyPage, toMemberMoneySource } from "helpers/memberMoney";

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

const HOLDING = account({
  id: "holding",
  name: "Member money held",
  class: "liability",
  subtype: "member_receipts_unallocated",
  openingVerified: null,
});

const ACCOUNTS: LedgerAccount[] = [
  account({ id: "cash" }),
  account({ id: "bank", name: "Main bank", subtype: "bank" }),
  account({ id: "unverified", name: "New bank", subtype: "bank", openingVerified: false }),
  account({ id: "income", name: "Donations", class: "income", subtype: null, openingVerified: null }),
  HOLDING,
];

const CONTEXT = {
  today: "2026-10-19",
  openingDate: "2026-10-01",
  lockedThrough: null,
  lockedThroughState: "none" as const,
  accounts: ACCOUNTS,
};

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
  memberReceiptsEnabled: true,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: "2026-10-02T09:00:00.000Z",
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

const memberReceipt = (overrides: Partial<MemberReceiptDraft> = {}): MemberReceiptDraft => ({
  businessDate: "2026-10-18",
  amountKobo: 600000,
  toAccountId: "cash",
  method: "cash",
  counterpartyName: "Ada Obi",
  purpose: "dues",
  memberId: "",
  obligationId: "",
  receivedAfterOpeningCount: true,
  externalReference: "",
  evidenceReference: "",
  reference: "",
  note: "",
  ...overrides,
});

const SOURCE: MemberMoneySourceRef = {
  kind: "receipt",
  id: "a".repeat(24),
  number: "M-000012",
  businessDate: "2026-10-10",
  remainingKobo: 500000,
};

const refund = (overrides: Partial<RefundDraft> = {}): RefundDraft => ({
  source: SOURCE,
  businessDate: "2026-10-18",
  amountKobo: 100000,
  fromAccountId: "cash",
  method: "cash",
  counterpartyName: "Ada Obi",
  reason: "Paid twice",
  externalReference: "",
  evidenceReference: "",
  reference: "",
  note: "",
  ...overrides,
});

describe("member receipt validation", () => {
  it("accepts a complete member receipt", () => {
    expect(memberReceiptDraftIssue(memberReceipt(), CONTEXT)).toBeNull();
  });

  it("requires the payer, an explicit purpose and the opening-count attestation", () => {
    expect(memberReceiptDraftIssue(memberReceipt({ counterpartyName: "  " }), CONTEXT)).toBe(
      "Paid by is required.",
    );
    expect(memberReceiptDraftIssue(memberReceipt({ purpose: "" }), CONTEXT)).toBe(
      "Choose what the money is for.",
    );
    expect(
      memberReceiptDraftIssue(memberReceipt({ receivedAfterOpeningCount: false }), CONTEXT),
    ).toBe(RECEIVED_AFTER_OPENING_COUNT_ISSUE);
  });

  it("only takes money into an active, verified cash or bank account", () => {
    for (const toAccountId of ["unverified", "income", "holding", ""]) {
      expect(memberReceiptDraftIssue(memberReceipt({ toAccountId }), CONTEXT)).toMatch(
        /cash or bank account/,
      );
    }
  });

  it("applies the ledger's date rules", () => {
    expect(memberReceiptDraftIssue(memberReceipt({ businessDate: "2026-09-30" }), CONTEXT)).toMatch(
      /opening date/,
    );
    expect(
      memberReceiptDraftIssue(memberReceipt({ businessDate: "2026-10-05" }), {
        ...CONTEXT,
        lockedThrough: "2026-10-05",
        lockedThroughState: "set",
      }),
    ).toMatch(/locked/);
  });
});

describe("refund validation", () => {
  it("accepts a refund within what the source still holds", () => {
    expect(refundDraftIssue(refund(), CONTEXT)).toBeNull();
    expect(refundDraftIssue(refund({ amountKobo: 500000 }), CONTEXT)).toBeNull();
  });

  it("never exceeds what the source still holds", () => {
    expect(refundDraftIssue(refund({ amountKobo: 500001 }), CONTEXT)).toBe(
      "A refund can't be more than the ₦5,000 still held from M-000012.",
    );
  });

  it("can't be dated before the money it returns was received", () => {
    expect(refundDraftIssue(refund({ businessDate: "2026-10-09" }), CONTEXT)).toMatch(
      /can't be dated before the money it returns was received/,
    );
  });

  it("requires the recipient and a reason", () => {
    expect(refundDraftIssue(refund({ counterpartyName: "" }), CONTEXT)).toBe("Paid to is required.");
    expect(refundDraftIssue(refund({ reason: " " }), CONTEXT)).toBe("Reason is required.");
    expect(refundDraftIssue(refund({ reason: "x".repeat(501) }), CONTEXT)).toMatch(
      /500 characters or fewer/,
    );
  });

  it("pays back only from an eligible cash or bank account", () => {
    expect(refundDraftIssue(refund({ fromAccountId: "holding" }), CONTEXT)).toMatch(
      /cash or bank account/,
    );
  });
});

describe("exact member-money bodies", () => {
  it("builds the member receipt the server expects, without any holding account", () => {
    expect(
      buildMemberReceiptBody(memberReceipt({ counterpartyName: "  Ada Obi ", reference: " R1 " }), "key-12345678"),
    ).toEqual({
      idempotencyKey: "key-12345678",
      businessDate: "2026-10-18",
      amountKobo: 600000,
      toAccountId: "cash",
      method: "cash",
      counterpartyName: "Ada Obi",
      purpose: "dues",
      receivedAfterOpeningCount: true,
      reference: "R1",
    });
  });

  it("sends hints only when chosen", () => {
    const body = buildMemberReceiptBody(
      memberReceipt({ memberId: "b".repeat(24), obligationId: "c".repeat(24) }),
      "key-12345678",
    );
    expect(body).toMatchObject({ memberId: "b".repeat(24), obligationId: "c".repeat(24) });
    expect("memberId" in buildMemberReceiptBody(memberReceipt(), "key-12345678")).toBe(false);
  });

  it("refuses to build a member receipt without an explicit purpose", () => {
    expect(() => buildMemberReceiptBody(memberReceipt({ purpose: "" }), "key-12345678")).toThrow();
  });

  it("keeps the refund source in the route, never the body", () => {
    const draft = { operation: "refund" as const, refund: refund({ note: " cash returned " }) };
    const body = buildPostingBody(draft, "key-12345678");
    expect(body).toEqual({
      idempotencyKey: "key-12345678",
      businessDate: "2026-10-18",
      amountKobo: 100000,
      fromAccountId: "cash",
      method: "cash",
      counterpartyName: "Ada Obi",
      reason: "Paid twice",
      note: "cash returned",
    });
    expect(postingSourceId(draft)).toBe(SOURCE.id);
    expect(postingEndpoint("refund")).toBe("/finance/:organisationId/ledger/member-money/:sourceId/refunds");
    expect(postingEndpoint("member_receipt")).toBe("/finance/:organisationId/ledger/member-receipts");
    expect(postingSourceId({ operation: "member_receipt", memberReceipt: memberReceipt() })).toBeNull();
    expect(buildRefundBody(refund(), "key-12345678")).not.toHaveProperty("sourceId");
  });
});

describe("member money readiness", () => {
  it("needs member receipts on and an active holding account", () => {
    expect(memberMoneyReadiness({ status: status(), accounts: ACCOUNTS })).toEqual({
      ready: true,
      reason: null,
    });
    expect(
      memberMoneyReadiness({ status: status({ memberReceiptsEnabled: false }), accounts: ACCOUNTS }).reason,
    ).toMatch(/turned off/);
    expect(
      memberMoneyReadiness({ status: status({ memberReceiptsEnabled: null }), accounts: ACCOUNTS }).reason,
    ).toMatch(/didn't report/);
    expect(
      memberMoneyReadiness({
        status: status(),
        accounts: ACCOUNTS.filter((entry) => entry.id !== "holding"),
      }).reason,
    ).toMatch(/holding account/);
    expect(
      memberMoneyReadiness({
        status: status(),
        accounts: [...ACCOUNTS.filter((entry) => entry.id !== "holding"), { ...HOLDING, active: false }],
      }).ready,
    ).toBe(false);
    expect(memberMoneyReadiness({ status: status(), accounts: null }).ready).toBe(false);
  });
});

describe("member money proof", () => {
  const memberReceiptJournal = (overrides: Record<string, unknown> = {}) => ({
    id: "journal-m",
    businessDate: "2026-10-18",
    sourceType: "member_receipt",
    totalKobo: 600000,
    entry: {
      number: "M-000001",
      method: "cash",
      counterpartyName: "Ada Obi",
      memberId: null,
      purpose: "dues",
      obligationId: null,
      receivedAfterOpeningCount: true,
    },
    ...overrides,
  });
  const refundJournal = (sourceId: string) => ({
    id: "journal-f",
    businessDate: "2026-10-18",
    sourceType: "member_receipt_refund",
    totalKobo: 100000,
    entry: {
      number: "F-000001",
      method: "cash",
      counterpartyName: "Ada Obi",
      memberMoneySource: { kind: "receipt", id: sourceId, number: "M-000012" },
      memberId: null,
      reason: "Paid twice",
    },
  });

  it("confirms a member receipt with its member-money fields", () => {
    const assessment = assessPostingConfirmation({
      httpStatus: 201,
      body: { data: { replayed: false, journal: memberReceiptJournal() } },
      operation: "member_receipt",
      businessDate: "2026-10-18",
      amountKobo: 600000,
    });
    expect(assessment).toMatchObject({
      confirmed: true,
      journal: { number: "M-000001", purpose: "dues", receivedAfterOpeningCount: true },
    });
  });

  it("refuses a cash receipt journal as proof of a member receipt", () => {
    expect(
      assessPostingConfirmation({
        httpStatus: 201,
        body: { data: { replayed: false, journal: memberReceiptJournal({ sourceType: "cash_receipt" }) } },
        operation: "member_receipt",
        businessDate: "2026-10-18",
        amountKobo: 600000,
      }),
    ).toMatchObject({ confirmed: false });
  });

  it("accepts a refund only against the source it was sent to", () => {
    const assess = (journalSource: string) =>
      assessPostingConfirmation({
        httpStatus: 200,
        body: { data: { replayed: true, journal: refundJournal(journalSource) } },
        operation: "refund",
        businessDate: "2026-10-18",
        amountKobo: 100000,
        sourceId: SOURCE.id,
      });
    expect(assess(SOURCE.id)).toMatchObject({
      confirmed: true,
      replayed: true,
      journal: { memberMoneySourceNumber: "M-000012", reason: "Paid twice" },
    });
    expect(assess("b".repeat(24))).toMatchObject({ confirmed: false });
  });

  it("reads member-money fields tolerantly", () => {
    expect(toPostingJournal({ id: "j", entry: { memberMoneySource: "oops", receivedAfterOpeningCount: "yes" } })).toMatchObject({
      memberMoneySourceId: null,
      receivedAfterOpeningCount: null,
    });
  });

  it("treats member-money business refusals like other first clean refusals", () => {
    for (const code of [
      "LEDGER_REFUND_EXCEEDS_REMAINING",
      "LEDGER_MEMBER_RECEIPTS_DISABLED",
      "LEDGER_REQUIRED_ACCOUNT_MISSING",
    ]) {
      expect(
        classifyPostingFailure({ response: { status: 422, data: { error: "Refused.", code } } }, false),
      ).toEqual({ kind: "clean-refusal", message: "Refused." });
      expect(
        classifyPostingFailure({ response: { status: 422, data: { error: "Refused.", code } } }, true),
      ).toMatchObject({ kind: "keep-pending" });
    }
  });
});

describe("member money summaries", () => {
  const summary = (overrides: Partial<PostingSummary>): PostingSummary => ({
    operation: "member_receipt",
    amountKobo: 600000,
    businessDate: "2026-10-18",
    method: "cash",
    fromAccountName: null,
    toAccountName: "Cash in hand",
    categoryName: null,
    counterpartyName: "Ada Obi",
    purpose: "dues",
    sourceNumber: null,
    ...overrides,
  });

  it("names the payer, account and purpose, never an income category", () => {
    expect(postingSummaryText(summary({}))).toBe(
      "Member money in: ₦6,000 into Cash in hand from Ada Obi (dues)",
    );
    expect(
      postingSummaryText(
        summary({ operation: "refund", amountKobo: 100000, fromAccountName: "Cash in hand", toAccountName: null, purpose: null, sourceNumber: "M-000012" }),
      ),
    ).toBe("Member money refund: ₦1,000 from Cash in hand to Ada Obi, against M-000012");
  });
});

describe("member money sources", () => {
  const item = (overrides: Record<string, unknown> = {}) => ({
    kind: "receipt",
    id: SOURCE.id,
    number: "M-000012",
    payerName: "Ada Obi",
    memberId: null,
    purpose: "dues",
    obligationId: null,
    businessDate: "2026-10-10",
    effectiveKobo: 600000,
    refundedKobo: 100000,
    remainingKobo: 500000,
    ...overrides,
  });

  it("reads receipts and opening items as the server reports them", () => {
    expect(toMemberMoneySource(item())).toMatchObject({ number: "M-000012", remainingKobo: 500000 });
    expect(
      toMemberMoneySource(item({ kind: "opening_item", number: "OM-000003", purpose: "levy" })),
    ).toMatchObject({ kind: "opening_item", purpose: "levy" });
    expect(toMemberMoneySource(item({ purpose: "future" }))?.purpose).toBeNull();
  });

  it("refuses an item it can't trust", () => {
    for (const bad of [
      item({ kind: "cash" }),
      item({ number: "OM-000001" }),
      item({ businessDate: "10/10/2026" }),
      item({ remainingKobo: -1 }),
      item({ effectiveKobo: 1.5 }),
      item({ id: "" }),
    ]) {
      expect(toMemberMoneySource(bad)).toBeNull();
    }
  });

  it("fails the whole page closed on any malformed item", () => {
    expect(toMemberMoneyPage({ items: [item()], nextCursor: null })?.items).toHaveLength(1);
    expect(toMemberMoneyPage({ items: [item(), item({ kind: "x" })], nextCursor: null })).toBeNull();
    expect(toMemberMoneyPage({ items: [], nextCursor: "" })).toBeNull();
    expect(toMemberMoneyPage({ nextCursor: null })).toBeNull();
  });
});
