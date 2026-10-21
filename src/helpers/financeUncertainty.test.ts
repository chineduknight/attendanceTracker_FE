import {
  acknowledgeCollectionUncertainty,
  clearAllCollectionUncertainty,
  collectionUncertaintyKey,
  collectionUncertaintyOf,
  markCollectionRefreshed,
  markCollectionUncertain,
  scopeCollectionUncertaintyToAccount,
} from "helpers/financeUncertainty";

const target = {
  accountId: "user-1",
  organisationId: "org-1",
  obligationId: "obligation-1",
  memberId: "member-1",
};
const key = collectionUncertaintyKey(target);

beforeEach(() => clearAllCollectionUncertainty());

describe("collection uncertainty latch", () => {
  it("stays pending until a response completes after detection", () => {
    markCollectionUncertain(key, 100);

    expect(collectionUncertaintyOf(key)).toEqual({ detectedAt: 100 });
    markCollectionRefreshed(key, 100); // completed at detection: not fresh
    expect(collectionUncertaintyOf(key)).toEqual({ detectedAt: 100 });
    expect(acknowledgeCollectionUncertainty(key)).toBe(false);

    markCollectionRefreshed(key, 101);
    expect(collectionUncertaintyOf(key)).toEqual({ detectedAt: 100, refreshedAt: 101 });
  });

  it("clears only on an explicit acknowledgement after the fresh response", () => {
    markCollectionUncertain(key, 100);
    markCollectionRefreshed(key, 150);

    expect(acknowledgeCollectionUncertainty(key)).toBe(true);
    expect(collectionUncertaintyOf(key)).toBeUndefined();
    // A second acknowledgement is a no-op.
    expect(acknowledgeCollectionUncertainty(key)).toBe(false);
  });

  it("a repeated ambiguity restarts the wait and drops an older refresh", () => {
    markCollectionUncertain(key, 100);
    markCollectionRefreshed(key, 150);
    expect(acknowledgeCollectionUncertainty(key)).toBe(true);

    markCollectionUncertain(key, 100);
    markCollectionRefreshed(key, 150);
    expect(collectionUncertaintyOf(key)?.refreshedAt).toBe(150);

    // A newer ambiguous attempt cannot reuse the 150 response.
    markCollectionUncertain(key, 200);
    expect(collectionUncertaintyOf(key)).toEqual({ detectedAt: 200 });
    expect(acknowledgeCollectionUncertainty(key)).toBe(false);

    // Only a response after 200 refreshes it.
    markCollectionRefreshed(key, 199);
    expect(acknowledgeCollectionUncertainty(key)).toBe(false);
    markCollectionRefreshed(key, 201);
    expect(collectionUncertaintyOf(key)).toEqual({ detectedAt: 200, refreshedAt: 201 });
  });

  it("keys every account, organisation, obligation and member separately", () => {
    const otherOrg = collectionUncertaintyKey({ ...target, organisationId: "org-2" });
    const otherAccount = collectionUncertaintyKey({ ...target, accountId: "user-2" });
    const otherMember = collectionUncertaintyKey({ ...target, memberId: "member-2" });
    const otherObligation = collectionUncertaintyKey({ ...target, obligationId: "obligation-2" });

    expect(new Set([key, otherOrg, otherAccount, otherMember, otherObligation]).size).toBe(5);

    markCollectionUncertain(key, 100);
    expect(collectionUncertaintyOf(otherOrg)).toBeUndefined();
    expect(collectionUncertaintyOf(otherAccount)).toBeUndefined();
    expect(collectionUncertaintyOf(otherMember)).toBeUndefined();
    expect(collectionUncertaintyOf(otherObligation)).toBeUndefined();
  });

  it("drops another account's latches but keeps the same account's across orgs", () => {
    scopeCollectionUncertaintyToAccount("user-1");
    markCollectionUncertain(key, 100);
    const otherOrg = collectionUncertaintyKey({ ...target, organisationId: "org-2" });
    markCollectionUncertain(otherOrg, 100);

    // Switching organisations keeps both: same authenticated account.
    scopeCollectionUncertaintyToAccount("user-1");
    expect(collectionUncertaintyOf(key)).toBeDefined();
    expect(collectionUncertaintyOf(otherOrg)).toBeDefined();

    // A different account never sees the previous account's warnings.
    scopeCollectionUncertaintyToAccount("user-2");
    expect(collectionUncertaintyOf(key)).toBeUndefined();
    expect(collectionUncertaintyOf(otherOrg)).toBeUndefined();
  });
});
