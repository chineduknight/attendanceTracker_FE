import { LedgerStatus } from "components/finance/ledgerTypes";
import {
  auditActionLabel,
  auditDetail,
  gapWindow,
  gapWindowProblem,
  latestAuditEntry,
  ledgerAuditActionLabels,
  lifecycleConfirmation,
  lifecycleOutcomeMessage,
  lifecyclePermission,
  lifecycleReasonIssue,
  periodLockChange,
  periodLockIssue,
  periodLockNeedsReason,
  periodLockReasonIssue,
  toLedgerAuditEntry,
  toLedgerAuditPage,
} from "helpers/ledgerLifecycle";
import { LEDGER_AUDIT_ACTIONS } from "components/finance/lifecycleTypes";

const statusOf = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
  state: { kind: "known", state: "active" },
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: "2026-10-01",
  lockedThrough: null,
  revision: 7,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: "2026-10-02T09:00:00.000Z",
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

const OWNER = { canManage: true, isOwner: true };
const MANAGER = { canManage: true, isOwner: false };
const VIEWER = { canManage: false, isOwner: false };

const auditWire = (overrides: Record<string, unknown> = {}) => ({
  id: "a1",
  action: "ledger_suspended",
  actorId: "owner-1",
  at: "2026-10-18T10:00:00.000Z",
  ledgerRevision: 8,
  subject: { type: "ledger", id: "org1" },
  before: { state: "active" },
  after: { state: "suspended" },
  reason: "Treasurer handover",
  voidId: null,
  ...overrides,
});

const entryOf = (value: unknown) => {
  const entry = toLedgerAuditEntry(value);
  if (!entry) throw new Error("Expected a parseable audit row");
  return entry;
};

describe("audit parsing", () => {
  it("reads a lifecycle row and preserves an unknown action verbatim", () => {
    const entry = toLedgerAuditEntry(auditWire());
    expect(entry).toMatchObject({
      id: "a1",
      action: { kind: "known", action: "ledger_suspended" },
      actorId: "owner-1",
      at: "2026-10-18T10:00:00.000Z",
      ledgerRevision: 8,
      subject: { type: "ledger", id: "org1" },
      before: { state: "active" },
      after: { state: "suspended" },
      reason: "Treasurer handover",
      voidId: null,
    });

    expect(toLedgerAuditEntry(auditWire({ action: "future_action" }))?.action).toEqual({
      kind: "unknown",
      raw: "future_action",
    });
  });

  it("keeps display fields null instead of dropping the row", () => {
    const entry = toLedgerAuditEntry({
      id: "a1",
      action: "period_locked",
      at: "not a date",
      ledgerRevision: -1,
      subject: { type: "ledger" },
    });
    expect(entry).toMatchObject({
      id: "a1",
      actorId: null,
      at: null,
      ledgerRevision: null,
      subject: null,
      before: null,
      after: null,
      reason: null,
    });
  });

  it("rejects a row without an id or action and a page with any bad row", () => {
    expect(toLedgerAuditEntry({ action: "ledger_suspended" })).toBeNull();
    expect(toLedgerAuditEntry({ id: "a1" })).toBeNull();
    expect(toLedgerAuditPage({ items: [auditWire(), { id: "a2" }] })).toBeNull();
    expect(toLedgerAuditPage({ items: "nope" })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("only ends the history when nextCursor is explicitly null", () => {
    // Missing or malformed pagination metadata must never read as "no more
    // records": the page is unreadable instead.
    expect(toLedgerAuditPage({ items: [] })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: undefined })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: "" })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: "   " })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: 42 })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: {} })).toBeNull();
    expect(toLedgerAuditPage({ items: [], nextCursor: "older" })).toEqual({
      items: [],
      nextCursor: "older",
    });
  });

  it("labels every backend action and summarises only what the row sent", () => {
    for (const action of LEDGER_AUDIT_ACTIONS) {
      expect(ledgerAuditActionLabels[action]).toBeTruthy();
    }
    expect(auditActionLabel({ kind: "unknown", raw: "future_action" })).toMatch(
      /future_action/,
    );

    expect(auditDetail(entryOf(auditWire()))).toBe("State: active → suspended");
    expect(
      auditDetail(
        entryOf(
          auditWire({
            action: "period_unlocked",
            before: { lockedThrough: "2026-10-10" },
            after: { lockedThrough: null },
          }),
        ),
      ),
    ).toBe("Period lock: 2026-10-10 → none");
    expect(
      auditDetail(
        entryOf(
          auditWire({ action: "ledger_resumed", before: null, after: { state: "active" } }),
        ),
      ),
    ).toBeNull();
  });

  it("finds the newest entry for one action", () => {
    const entries = [
      entryOf(auditWire({ id: "a2", action: "ledger_resumed" })),
      entryOf(auditWire({ id: "a1" })),
    ];
    expect(latestAuditEntry(entries, "ledger_suspended")?.id).toBe("a1");
    expect(latestAuditEntry(entries, "period_locked")).toBeNull();
  });
});

describe("lifecycle permissions", () => {
  it("requires finance.manage for every lifecycle action", () => {
    for (const action of ["suspend", "resume", "period-lock", "attest-gap-window"] as const) {
      expect(
        lifecyclePermission({ action, status: statusOf(), ...VIEWER }),
      ).toEqual({
        allowed: false,
        reason: "You need the finance manage permission.",
      });
    }
  });

  it("keeps suspend, resume and period lock owner-only", () => {
    expect(
      lifecyclePermission({ action: "suspend", status: statusOf(), ...MANAGER }).allowed,
    ).toBe(false);
    expect(
      lifecyclePermission({ action: "period-lock", status: statusOf(), ...MANAGER }).reason,
    ).toMatch(/owner/);
    expect(
      lifecyclePermission({
        action: "resume",
        status: statusOf({ state: { kind: "known", state: "suspended" } }),
        ...MANAGER,
      }).allowed,
    ).toBe(false);
  });

  it("lets a finance manager attest but not an owner-only action", () => {
    expect(
      lifecyclePermission({ action: "attest-gap-window", status: statusOf(), ...MANAGER })
        .allowed,
    ).toBe(true);
    expect(
      lifecyclePermission({ action: "suspend", status: statusOf(), ...MANAGER }).allowed,
    ).toBe(false);
  });

  it("requires the state each action belongs to", () => {
    const suspended = statusOf({ state: { kind: "known", state: "suspended" } });
    expect(lifecyclePermission({ action: "suspend", status: suspended, ...OWNER }).allowed).toBe(
      false,
    );
    expect(lifecyclePermission({ action: "resume", status: suspended, ...OWNER }).allowed).toBe(
      true,
    );
    expect(lifecyclePermission({ action: "resume", status: statusOf(), ...OWNER }).allowed).toBe(
      false,
    );
    for (const state of ["setup", "pending_verification", "not_active"] as const) {
      expect(
        lifecyclePermission({
          action: "period-lock",
          status: statusOf({ state: { kind: "known", state } }),
          ...OWNER,
        }).allowed,
      ).toBe(false);
      expect(
        lifecyclePermission({
          action: "attest-gap-window",
          status: statusOf({ state: { kind: "known", state } }),
          ...OWNER,
        }).allowed,
      ).toBe(false);
    }
    expect(lifecyclePermission({ action: "period-lock", status: suspended, ...OWNER }).allowed).toBe(
      true,
    );
  });

  it("fails closed when the state or the revision is unreadable", () => {
    expect(
      lifecyclePermission({
        action: "suspend",
        status: statusOf({ state: { kind: "unknown", raw: "frozen" } }),
        ...OWNER,
      }).reason,
    ).toMatch(/doesn't recognise the ledger state/);
    expect(
      lifecyclePermission({ action: "suspend", status: statusOf({ revision: null }), ...OWNER })
        .reason,
    ).toMatch(/ledger revision/);
  });

  it("never offers or claims an attestation the server didn't mark unattested", () => {
    for (const attestation of ["attested", "unknown"] as const) {
      const permission = lifecyclePermission({
        action: "attest-gap-window",
        status: statusOf({ gapWindowAttestation: attestation }),
        ...OWNER,
      });
      expect(permission.allowed).toBe(false);
      expect(permission.reason).toBeTruthy();
    }
    expect(
      lifecyclePermission({
        action: "attest-gap-window",
        status: statusOf({ gapWindowAttestation: "not_attested" }),
        ...OWNER,
      }).allowed,
    ).toBe(true);
  });

  it("needs both window dates before offering the attestation", () => {
    expect(
      lifecyclePermission({
        action: "attest-gap-window",
        status: statusOf({ activatedAt: null }),
        ...OWNER,
      }).reason,
    ).toMatch(/activation time/);
    expect(
      lifecyclePermission({
        action: "attest-gap-window",
        status: statusOf({ openingDate: null }),
        ...OWNER,
      }).reason,
    ).toMatch(/opening date/);
  });
});

describe("gap window", () => {
  it("shows both dates only when both are readable", () => {
    expect(gapWindow(statusOf())).toEqual({
      openingDate: "2026-10-01",
      activatedAt: "2026-10-02T09:00:00.000Z",
    });
    expect(gapWindow(statusOf({ activatedAt: null }))).toBeNull();
    expect(gapWindow(statusOf({ openingDate: null }))).toBeNull();
  });

  it("reports why the window can't be shown", () => {
    expect(gapWindowProblem(statusOf())).toBeNull();
    expect(gapWindowProblem(statusOf({ activatedAt: null }))).toMatch(/activation time/);
    expect(gapWindowProblem(statusOf({ openingDate: null }))).toMatch(/opening date/);
    // Activation before the opening date is contradictory, not an empty window.
    expect(
      gapWindowProblem(
        statusOf({ openingDate: "2026-10-05", activatedAt: "2026-10-01T09:00:00.000Z" }),
      ),
    ).toMatch(/earlier than the opening date/);
  });
});

describe("period lock", () => {
  it("classifies each move", () => {
    expect(periodLockChange(null, null)).toBe("unchanged");
    expect(periodLockChange(null, "2026-10-10")).toBe("set");
    expect(periodLockChange("2026-10-10", "2026-10-12")).toBe("forward");
    expect(periodLockChange("2026-10-12", "2026-10-10")).toBe("back");
    expect(periodLockChange("2026-10-12", null)).toBe("unlock");
    expect(periodLockChange("2026-10-12", "2026-10-12")).toBe("unchanged");
  });

  it("needs a reason only when moving back or removing the lock", () => {
    expect(periodLockNeedsReason("forward")).toBe(false);
    expect(periodLockNeedsReason("set")).toBe(false);
    expect(periodLockNeedsReason("back")).toBe(true);
    expect(periodLockNeedsReason("unlock")).toBe(true);
  });

  it("refuses invalid, pre-opening, future and unchanged dates", () => {
    const base = { current: null, openingDate: "2026-10-01", today: "2026-10-19" };
    expect(periodLockIssue({ ...base, next: "2026-10-10" })).toBeNull();
    expect(periodLockIssue({ ...base, next: "2026-02-30" })).toMatch(/valid lock date/);
    expect(periodLockIssue({ ...base, next: "2026-09-30" })).toMatch(/opening date/);
    expect(periodLockIssue({ ...base, next: "2026-10-20" })).toMatch(/today in Lagos/);
    expect(periodLockIssue({ ...base, current: "2026-10-10", next: "2026-10-10" })).toMatch(
      /already at this date/,
    );
    expect(periodLockIssue({ ...base, next: null })).toMatch(/already unlocked/);
    expect(
      periodLockIssue({ ...base, current: "2026-10-10", next: null }),
    ).toBeNull();
  });

  it("fails closed without an opening date and never guesses the rule", () => {
    expect(
      periodLockIssue({
        next: "2026-10-10",
        current: null,
        openingDate: null,
        today: "2026-10-19",
      }),
    ).toMatch(/opening date/);
  });

  it("requires a reason for the audited unlock", () => {
    expect(periodLockReasonIssue("", "forward")).toBeNull();
    expect(periodLockReasonIssue("", "set")).toBeNull();
    expect(periodLockReasonIssue("", "back")).toMatch(/moving the period lock back/);
    expect(periodLockReasonIssue("", "unlock")).toMatch(/removing the period lock/);
    expect(periodLockReasonIssue("Late bank charge", "back")).toBeNull();
    expect(periodLockReasonIssue("x".repeat(501), "back")).toMatch(/500/);
  });
});

describe("lifecycle reasons", () => {
  it("requires a reason for suspend and resume", () => {
    expect(lifecycleReasonIssue("")).toMatch(/Enter a reason/);
    expect(lifecycleReasonIssue("   ")).toMatch(/Enter a reason/);
    expect(lifecycleReasonIssue("Treasurer handover")).toBeNull();
    expect(lifecycleReasonIssue("x".repeat(501))).toMatch(/500/);
  });
});

describe("lifecycle confirmation", () => {
  const suspended = statusOf({ state: { kind: "known", state: "suspended" } });

  it("confirms a suspend only when the status reports suspended", () => {
    expect(
      lifecycleConfirmation({ action: "suspend", result: { status: suspended } }),
    ).toBe("confirmed");
    expect(
      lifecycleConfirmation({ action: "suspend", result: { status: statusOf() } }),
    ).toBe("contradicted");
    expect(
      lifecycleConfirmation({
        action: "suspend",
        result: { status: statusOf({ state: { kind: "unknown", raw: "frozen" } }) },
      }),
    ).toBe("contradicted");
    expect(lifecycleConfirmation({ action: "suspend", result: { status: null } })).toBe(
      "unreadable",
    );
  });

  it("confirms a resume only when the status reports active", () => {
    expect(lifecycleConfirmation({ action: "resume", result: { status: statusOf() } })).toBe(
      "confirmed",
    );
    expect(
      lifecycleConfirmation({ action: "resume", result: { status: suspended } }),
    ).toBe("contradicted");
  });

  it("confirms exactly the period lock that was requested", () => {
    expect(
      lifecycleConfirmation({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: "2026-10-10" }) },
        lockedThrough: "2026-10-10",
      }),
    ).toBe("confirmed");
    expect(
      lifecycleConfirmation({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: "2026-10-11" }) },
        lockedThrough: "2026-10-10",
      }),
    ).toBe("contradicted");
    expect(
      lifecycleConfirmation({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: null }) },
        lockedThrough: null,
      }),
    ).toBe("confirmed");
    expect(
      lifecycleConfirmation({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: "2026-10-10" }) },
        lockedThrough: null,
      }),
    ).toBe("contradicted");
    expect(
      lifecycleConfirmation({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: null }) },
        lockedThrough: "2026-10-10",
      }),
    ).toBe("contradicted");
  });

  it("distinguishes an unreadable attestation from a contradicting one", () => {
    expect(
      lifecycleConfirmation({
        action: "attest-gap-window",
        result: { status: statusOf({ gapWindowAttestation: "attested" }) },
      }),
    ).toBe("confirmed");
    expect(
      lifecycleConfirmation({
        action: "attest-gap-window",
        result: { status: statusOf({ gapWindowAttestation: "not_attested" }) },
      }),
    ).toBe("contradicted");
    expect(
      lifecycleConfirmation({
        action: "attest-gap-window",
        result: { status: statusOf({ gapWindowAttestation: "unknown" }) },
      }),
    ).toBe("unreadable");
  });
});

describe("outcome wording", () => {
  it("never reports an unreadable or contradictory state as success", () => {
    const unreadable = lifecycleOutcomeMessage({
      action: "suspend",
      result: { status: null },
    });
    expect(unreadable).toMatch(/couldn't read the resulting ledger state/);
    expect(unreadable).toMatch(/safety record from this attempt is kept/);

    const stillActive = lifecycleOutcomeMessage({
      action: "suspend",
      result: { status: statusOf() },
    });
    expect(stillActive).toMatch(/still reports the ledger as Active/);
    expect(stillActive).not.toMatch(/is suspended/);
    expect(stillActive).toMatch(/safety record from this attempt is kept/);
  });

  it("confirms each transition only from the returned status", () => {
    expect(
      lifecycleOutcomeMessage({
        action: "suspend",
        result: {
          status: statusOf({ state: { kind: "known", state: "suspended" } }),
        },
      }),
    ).toMatch(/The ledger is suspended/);
    expect(
      lifecycleOutcomeMessage({
        action: "suspend",
        result: {
          status: statusOf({ state: { kind: "known", state: "suspended" } }),
        },
      }),
    ).not.toMatch(/safety record from this attempt is kept/);
    expect(
      lifecycleOutcomeMessage({ action: "resume", result: { status: statusOf() } }),
    ).toMatch(/active again/);
    expect(
      lifecycleOutcomeMessage({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: "2026-10-10" }) },
        lockedThrough: "2026-10-10",
      }),
    ).toMatch(/locked through/);
    expect(
      lifecycleOutcomeMessage({
        action: "period-lock",
        result: { status: statusOf({ lockedThrough: "2026-10-10" }) },
        lockedThrough: null,
      }),
    ).toMatch(/still reports a period lock/);
  });

  it("does not claim an attestation the status does not show", () => {
    expect(
      lifecycleOutcomeMessage({
        action: "attest-gap-window",
        result: { status: statusOf({ gapWindowAttestation: "not_attested" }) },
      }),
    ).toMatch(/doesn't report the gap window as attested/);
    expect(
      lifecycleOutcomeMessage({
        action: "attest-gap-window",
        result: {
          status: statusOf({
            gapWindowAttestation: "attested",
            gapWindowAttestedAt: "2026-10-19T09:30:00.000Z",
          }),
        },
      }),
    ).toMatch(/recorded as attested/);
    expect(
      lifecycleOutcomeMessage({
        action: "attest-gap-window",
        result: { status: statusOf({ gapWindowAttestation: "unknown" }) },
      }),
    ).toMatch(/doesn't report the gap window as attested/);
  });
});
