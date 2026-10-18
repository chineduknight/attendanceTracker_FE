import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  amountsToLines,
  buildCorrectionOpeningInput,
  buildInitialOpeningInput,
  buildSupplementaryOpeningInput,
  canSubmitOpeningProposal,
  earliestOpeningDate,
  emptyMemberMoneyDraft,
  formatLagosTimestamp,
  hasMultipleOpenProposals,
  initialOpeningReadiness,
  memberMoneyDraftProblem,
  memberMoneyDraftsToInputs,
  moneyAccountsAwaitingOpening,
  openProposalOf,
  openingDateIssue,
  openingDecisionPermissions,
  openingPreview,
  openingStatusKey,
  parseNairaToKobo,
  toEffectiveOpenings,
  toOpeningProposal,
  toOpeningProposalPage,
  todayInLagos,
  verifiedZeroAccounts,
} from "helpers/openingBalances";
import { OpeningProposal } from "components/finance/openingBalanceTypes";

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "cash",
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 1,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

const statusOf = (
  state: "not_active" | "setup" | "pending_verification" | "active" | "suspended",
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
  revision: 4,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  ...overrides,
});

const FINGERPRINT = "a".repeat(64);

const proposalWire = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  kind: "initial",
  status: "submitted",
  asOfDate: "2026-10-10",
  lines: [
    { accountId: "cash", amountKobo: 0 },
    { accountId: "bank", amountKobo: 34050050 },
  ],
  memberMoneyItems: [
    {
      id: "i1",
      payerName: "Ada Obi",
      memberId: null,
      purpose: "dues",
      obligationId: null,
      amountKobo: 200000,
      evidence: "Envelope 7",
    },
  ],
  itemChanges: [],
  summary: { moneyKobo: 34050050, memberMoneyKobo: 200000, equityKobo: 33850050 },
  evidence: "Counted by the treasurer",
  reason: null,
  fingerprint: FINGERPRINT,
  proposedBy: "proposer",
  proposedAt: "2026-10-18T10:00:00.000Z",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  journalId: null,
  revision: 0,
  ...overrides,
});

const proposal = (overrides: Record<string, unknown> = {}): OpeningProposal =>
  toOpeningProposal(proposalWire(overrides)) as OpeningProposal;

describe("opening proposal parsing", () => {
  it("reads the full provisional proposal shape", () => {
    const parsed = toOpeningProposal(proposalWire());

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      id: "p1",
      kind: "initial",
      status: { kind: "known", status: "submitted" },
      asOfDate: "2026-10-10",
      evidence: "Counted by the treasurer",
      fingerprint: FINGERPRINT,
      proposedBy: "proposer",
      revision: 0,
    });
    expect(parsed?.lines).toEqual([
      {
        accountId: "cash",
        amountKobo: 0,
        correctedAmountKobo: null,
        effectiveBeforeKobo: null,
        deltaKobo: null,
      },
      {
        accountId: "bank",
        amountKobo: 34050050,
        correctedAmountKobo: null,
        effectiveBeforeKobo: null,
        deltaKobo: null,
      },
    ]);
    expect(parsed?.summary).toEqual({
      moneyKobo: 34050050,
      memberMoneyKobo: 200000,
      equityKobo: 33850050,
    });
  });

  it("keeps an unrecognised status verbatim instead of guessing", () => {
    const parsed = toOpeningProposal(proposalWire({ status: "frozen_for_review" }));
    expect(parsed?.status).toEqual({ kind: "unknown", raw: "frozen_for_review" });
    expect(openingStatusKey(parsed!.status)).toBe("unknown");
  });

  it("never turns a missing summary into zero totals", () => {
    expect(toOpeningProposal(proposalWire({ summary: undefined }))?.summary).toBeNull();
    expect(
      toOpeningProposal(proposalWire({ summary: { moneyKobo: 1, memberMoneyKobo: "x" } }))
        ?.summary,
    ).toBeNull();
  });

  it("fails closed on a malformed line, item or change", () => {
    expect(
      toOpeningProposal(
        proposalWire({ lines: [{ accountId: "cash", amountKobo: 1.5 }] }),
      ),
    ).toBeNull();
    expect(
      toOpeningProposal(
        proposalWire({
          lines: [
            { accountId: "cash", amountKobo: 0 },
            { accountId: "bank", amountKobo: -1 },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      toOpeningProposal(
        proposalWire({ memberMoneyItems: [{ id: "i1", payerName: "Ada" }] }),
      ),
    ).toBeNull();
    expect(
      toOpeningProposal(
        proposalWire({ itemChanges: [{ itemId: "i1", correctedAmountKobo: 1 }] }),
      ),
    ).toBeNull();
  });

  it("keeps an unusable fingerprint null rather than faking one", () => {
    expect(toOpeningProposal(proposalWire({ fingerprint: "abc" }))?.fingerprint).toBeNull();
    expect(toOpeningProposal(proposalWire({ fingerprint: null }))?.fingerprint).toBeNull();
  });

  it("reads correction lines with their server-computed figures", () => {
    const parsed = toOpeningProposal(
      proposalWire({
        kind: "correction",
        lines: [
          {
            accountId: "cash",
            correctedAmountKobo: 1200000,
            effectiveBeforeKobo: 1000000,
            deltaKobo: 200000,
          },
        ],
        itemChanges: [
          {
            itemId: "i1",
            correctedAmountKobo: 150000,
            effectiveBeforeKobo: 200000,
            deltaKobo: -50000,
          },
        ],
      }),
    );
    expect(parsed?.lines[0]).toMatchObject({
      correctedAmountKobo: 1200000,
      effectiveBeforeKobo: 1000000,
      deltaKobo: 200000,
    });
    expect(parsed?.itemChanges[0]).toMatchObject({ deltaKobo: -50000 });
  });

  it("parses a page and rejects a malformed envelope", () => {
    expect(
      toOpeningProposalPage({ items: [proposalWire()], nextCursor: null })?.items,
    ).toHaveLength(1);
    expect(toOpeningProposalPage({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(toOpeningProposalPage({ items: [proposalWire({ lines: "x" })] })).toBeNull();
    expect(toOpeningProposalPage({ items: [] })).toEqual({ items: [], nextCursor: null });
    expect(toOpeningProposalPage({})).toBeNull();
  });

  it("reads verified effective openings, including a genuine zero", () => {
    const effective = toEffectiveOpenings({
      openingDate: "2026-10-10",
      accounts: [
        {
          accountId: "cash",
          openingDate: "2026-10-10",
          proposalId: "p1",
          originalKobo: 0,
          corrections: [],
          effectiveKobo: 0,
        },
      ],
      memberMoneyItems: [],
    });
    expect(effective?.accounts[0].effectiveKobo).toBe(0);
    expect(verifiedZeroAccounts(effective)).toHaveLength(1);
  });

  it("rejects a malformed effective-openings body instead of showing empty", () => {
    expect(toEffectiveOpenings({ accounts: [], memberMoneyItems: [] })).toEqual({
      openingDate: null,
      accounts: [],
      memberMoneyItems: [],
    });
    expect(
      toEffectiveOpenings({
        accounts: [{ accountId: "cash", originalKobo: 10 }],
        memberMoneyItems: [],
      }),
    ).toBeNull();
    expect(toEffectiveOpenings(null)).toBeNull();
  });
});

describe("open proposal selection", () => {
  it("finds exactly one open proposal", () => {
    expect(openProposalOf([proposal()])?.id).toBe("p1");
    expect(openProposalOf([proposal({ status: "verified" })])).toBeNull();
    const twoOpen = [proposal(), proposal({ id: "p2" })];
    expect(hasMultipleOpenProposals(twoOpen)).toBe(true);
    expect(openProposalOf(twoOpen)).toBeNull();
  });
});

describe("money conversion and previews", () => {
  it("parses naira to integer kobo without floating point", () => {
    expect(parseNairaToKobo("1,250.50")).toBe(125050);
    expect(parseNairaToKobo("0")).toBe(0);
    expect(parseNairaToKobo("0.01")).toBe(1);
    expect(parseNairaToKobo("12.3")).toBe(1230);
    expect(parseNairaToKobo("6000.")).toBe(600000);
    expect(parseNairaToKobo("")).toBeNull();
    expect(parseNairaToKobo("abc")).toBeNull();
    expect(parseNairaToKobo("1.234")).toBeNull();
    expect(parseNairaToKobo("-5")).toBeNull();
  });

  it("previews money, member money and equity in kobo", () => {
    expect(
      openingPreview(
        [{ amountKobo: 125050 }, { amountKobo: 600000 }],
        [{ amountKobo: 200000 }],
      ),
    ).toEqual({
      moneyKobo: 725050,
      memberMoneyKobo: 200000,
      equityKobo: 525050,
      memberExceedsMoney: false,
    });
  });

  it("handles an all-zero opening without inventing values", () => {
    expect(
      openingPreview([{ amountKobo: 0 }], []),
    ).toEqual({ moneyKobo: 0, memberMoneyKobo: 0, equityKobo: 0, memberExceedsMoney: false });
  });

  it("shows a member-money excess instead of clamping it", () => {
    expect(openingPreview([{ amountKobo: 100000 }], [{ amountKobo: 200000 }])).toEqual({
      moneyKobo: 100000,
      memberMoneyKobo: 200000,
      equityKobo: -100000,
      memberExceedsMoney: true,
    });
  });

  it("returns null while any amount is still missing", () => {
    expect(openingPreview([{ amountKobo: 1 }, { amountKobo: null }], [])).toBeNull();
  });
});

describe("opening dates in Lagos", () => {
  it("uses the Lagos calendar day, not UTC", () => {
    expect(todayInLagos(new Date("2026-10-18T23:30:00.000Z"))).toBe("2026-10-19");
    expect(todayInLagos(new Date("2026-10-18T10:00:00.000Z"))).toBe("2026-10-18");
  });

  it("computes the earliest accepted opening date", () => {
    expect(earliestOpeningDate("2026-10-18")).toBe("2026-09-17");
  });

  it("explains date problems without pretending to be authoritative", () => {
    expect(openingDateIssue("", "2026-10-18")).toMatch(/valid opening date/);
    expect(openingDateIssue("2026-10-19", "2026-10-18")).toMatch(/can't be after today/);
    expect(openingDateIssue("2026-09-16", "2026-10-18")).toMatch(/at most 31 days/);
    expect(openingDateIssue("2026-09-17", "2026-10-18")).toBeNull();
    expect(openingDateIssue("2026-10-18", "2026-10-18")).toBeNull();
  });

  it("formats stored timestamps in Lagos time", () => {
    expect(formatLagosTimestamp("2026-10-18T10:00:00.000Z")).toBe(
      "18 Oct 2026, 11:00 WAT",
    );
    expect(formatLagosTimestamp(null)).toBeNull();
    expect(formatLagosTimestamp("not a date")).toBeNull();
  });
});

describe("chart readiness", () => {
  const equity = account({
    id: "equity",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  });

  it("requires a money account and an opening equity account", () => {
    expect(initialOpeningReadiness([], false).blockers).toHaveLength(2);
    expect(initialOpeningReadiness([equity], false).blockers[0]).toMatch(/cash or bank/);
    expect(initialOpeningReadiness([account()], false).blockers[0]).toMatch(/equity/);
    expect(initialOpeningReadiness([account(), equity], false).blockers).toEqual([]);
  });

  it("offers member-money entry only with receipts on and a holding account", () => {
    const holding = account({
      id: "holding",
      name: "Member money – unallocated",
      class: "liability",
      subtype: "member_receipts_unallocated",
    });
    expect(initialOpeningReadiness([account(), equity], true).memberMoneyReady).toBe(false);
    expect(
      initialOpeningReadiness([account(), equity, holding], true).memberMoneyReady,
    ).toBe(true);
  });

  it("lists all active money accounts before activation", () => {
    const inactive = account({ id: "old", active: false });
    expect(
      moneyAccountsAwaitingOpening(statusOf("setup"), [account(), inactive]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["cash"]);
  });

  it("lists only explicitly unverified accounts after activation", () => {
    const unverified = account({ id: "new", openingVerified: false });
    const verified = account({ id: "old", openingVerified: true });
    const unknown = account({ id: "unknown", openingVerified: null });
    expect(
      moneyAccountsAwaitingOpening(statusOf("active"), [unverified, verified, unknown]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["new"]);
  });
});

describe("opening decision permissions", () => {
  const permissionsFor = (input: {
    proposal?: OpeningProposal;
    isOwner: boolean;
    userId: string | null;
    ledgerRevision?: number | null;
  }) =>
    openingDecisionPermissions({
      proposal: input.proposal ?? proposal(),
      isOwner: input.isOwner,
      userId: input.userId,
      ledgerRevision:
        input.ledgerRevision === undefined ? 4 : input.ledgerRevision,
    });

  it("lets the owner verify someone else's submitted proposal", () => {
    expect(permissionsFor({ isOwner: true, userId: "owner" })).toEqual({
      canVerify: true,
      canReject: true,
      canWithdraw: true,
      verifyBlockedReason: null,
    });
  });

  it("never lets the proposer verify their own proposal", () => {
    const permissions = permissionsFor({ isOwner: true, userId: "proposer" });
    expect(permissions.canVerify).toBe(false);
    expect(permissions.verifyBlockedReason).toMatch(/another officer must verify/);
  });

  it("lets the proposer withdraw but not verify", () => {
    const permissions = permissionsFor({ isOwner: false, userId: "proposer" });
    expect(permissions).toMatchObject({
      canVerify: false,
      canReject: false,
      canWithdraw: true,
    });
  });

  it("makes a decided or unknown proposal read-only", () => {
    expect(
      permissionsFor({
        proposal: proposal({ status: "verified" }),
        isOwner: true,
        userId: "owner",
      }).canVerify,
    ).toBe(false);
    expect(
      permissionsFor({
        proposal: proposal({ status: "future_status" }),
        isOwner: true,
        userId: "owner",
      }).canVerify,
    ).toBe(false);
  });

  it("cannot verify without a fingerprint or ledger revision", () => {
    expect(
      permissionsFor({
        proposal: proposal({ fingerprint: null }),
        isOwner: true,
        userId: "owner",
      }).canVerify,
    ).toBe(false);
    expect(
      permissionsFor({ isOwner: true, userId: "owner", ledgerRevision: null }).canVerify,
    ).toBe(false);
  });

  it("never offers proposing to the owner", () => {
    expect(
      canSubmitOpeningProposal({ canManage: true, isOwner: true, hasOpenProposal: false })
        .allowed,
    ).toBe(false);
    expect(
      canSubmitOpeningProposal({ canManage: true, isOwner: false, hasOpenProposal: false })
        .allowed,
    ).toBe(true);
    expect(
      canSubmitOpeningProposal({ canManage: true, isOwner: false, hasOpenProposal: true })
        .reason,
    ).toMatch(/already waiting/);
  });
});

describe("payload builders", () => {
  it("sends explicit zero amounts and integer kobo", () => {
    const built = amountsToLines(
      [
        { id: "cash", name: "Cash in hand" },
        { id: "bank", name: "Main bank" },
      ],
      { cash: "0", bank: "340,500.50" },
    );
    expect(built.problem).toBeNull();
    expect(built.lines).toEqual([
      { accountId: "cash", amountKobo: 0 },
      { accountId: "bank", amountKobo: 34050050 },
    ]);
  });

  it("treats a blank amount as incomplete, not zero", () => {
    expect(
      amountsToLines([{ id: "cash", name: "Cash in hand" }], {}).problem,
    ).toMatch(/including 0 when the count was zero/);
  });

  it("builds an initial proposal with optional member money", () => {
    expect(
      buildInitialOpeningInput({
        asOfDate: "2026-10-10",
        expectedLedgerRevision: 3,
        evidence: "  counted  ",
        lines: [{ accountId: "cash", amountKobo: 0 }],
      }),
    ).toEqual({
      kind: "initial",
      asOfDate: "2026-10-10",
      expectedLedgerRevision: 3,
      evidence: "counted",
      lines: [{ accountId: "cash", amountKobo: 0 }],
    });

    const withItems = buildInitialOpeningInput({
      asOfDate: "2026-10-10",
      expectedLedgerRevision: 3,
      evidence: "counted",
      lines: [{ accountId: "cash", amountKobo: 200000 }],
      memberMoneyItems: [
        {
          payerName: " Ada Obi ",
          purpose: "dues",
          amountKobo: 200000,
          evidence: " Envelope 7 ",
          memberId: "",
          obligationId: "",
        },
      ],
    });
    expect(withItems.memberMoneyItems).toEqual([
      {
        payerName: "Ada Obi",
        purpose: "dues",
        amountKobo: 200000,
        evidence: "Envelope 7",
        memberId: null,
        obligationId: null,
      },
    ]);
  });

  it("omits member-money keys from a supplementary payload", () => {
    const built = buildSupplementaryOpeningInput({
      asOfDate: "2026-10-10",
      expectedLedgerRevision: 3,
      evidence: "counted",
      lines: [{ accountId: "bank", amountKobo: 0 }],
    });
    expect(built).toEqual({
      kind: "supplementary",
      asOfDate: "2026-10-10",
      expectedLedgerRevision: 3,
      evidence: "counted",
      lines: [{ accountId: "bank", amountKobo: 0 }],
    });
    expect(built).not.toHaveProperty("memberMoneyItems");
    expect(built).not.toHaveProperty("itemChanges");
  });

  it("builds a correction with corrected lines, item changes and new items", () => {
    const built = buildCorrectionOpeningInput({
      asOfDate: "2026-10-10",
      expectedLedgerRevision: 5,
      evidence: "Bank statement",
      reason: "Count was wrong",
      lines: [{ accountId: "cash", correctedAmountKobo: 1200000 }],
      itemChanges: [{ itemId: "i1", correctedAmountKobo: 150000 }],
      memberMoneyItems: [
        {
          payerName: "Bola",
          purpose: "levy",
          amountKobo: 50000,
          evidence: "Envelope 9",
        },
      ],
    });
    expect(built).toMatchObject({
      kind: "correction",
      reason: "Count was wrong",
      lines: [{ accountId: "cash", correctedAmountKobo: 1200000 }],
      itemChanges: [{ itemId: "i1", correctedAmountKobo: 150000 }],
    });
    expect(built.memberMoneyItems?.[0]).toMatchObject({ payerName: "Bola", purpose: "levy" });
  });
});

describe("member-money drafts", () => {
  it("requires payer, evidence and a positive amount", () => {
    const blank = emptyMemberMoneyDraft();
    expect(memberMoneyDraftProblem(blank)).toMatch(/payer/);
    expect(
      memberMoneyDraftProblem({ ...blank, payerName: "Ada", amount: "0", evidence: "env" }),
    ).toMatch(/more than zero/);
    expect(
      memberMoneyDraftProblem({
        ...blank,
        payerName: "Ada",
        amount: "2000",
        evidence: "env",
      }),
    ).toBeNull();
  });

  it("converts drafts to integer-kobo inputs", () => {
    const draft = {
      ...emptyMemberMoneyDraft(),
      payerName: " Ada Obi ",
      amount: "2,000.50",
      evidence: " Envelope 7 ",
      purpose: "dues" as const,
    };
    const built = memberMoneyDraftsToInputs([draft]);
    expect(built.problem).toBeNull();
    expect(built.inputs).toEqual([
      {
        payerName: "Ada Obi",
        purpose: "dues",
        amountKobo: 200050,
        evidence: "Envelope 7",
        memberId: null,
        obligationId: null,
      },
    ]);
  });
});
