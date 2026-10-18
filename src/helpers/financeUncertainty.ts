import { useEffect, useSyncExternalStore } from "react";

/**
 * A collection whose response was lost may already have been stored. The
 * warning must outlive the dismissible sheet, so the latch lives here, keyed
 * by account + organisation + obligation + member. It is intentionally
 * in-memory: closing the drawer, switching tabs, navigating away and back, or
 * switching organisations does not reset it. A full page reload ends the
 * lifetime (and the Finance figures are fetched from scratch anyway).
 */
export interface CollectionUncertainty {
  /** When the ambiguous collection was detected. */
  detectedAt: number;
  /** When a compliance response completed after that detection. */
  refreshedAt?: number;
}

export interface CollectionUncertaintyTarget {
  accountId: string;
  organisationId: string;
  obligationId: string;
  memberId: string;
}

const latches = new Map<string, CollectionUncertainty>();
const listeners = new Set<() => void>();
/** Used only to drop another account's latches; never to weaken this one. */
let activeAccountId: string | null = null;

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** One latch per account + organisation + obligation + member. */
export const collectionUncertaintyKey = ({
  accountId,
  organisationId,
  obligationId,
  memberId,
}: CollectionUncertaintyTarget) => [accountId, organisationId, obligationId, memberId].join("\u0000");

/** The current latch, if any (also used by tests). */
export const collectionUncertaintyOf = (key: string) => latches.get(key);

/**
 * Record an ambiguous collection. A repeated ambiguous attempt restarts the
 * wait and clears any earlier "refreshed" flag: a response that landed before
 * the latest attempt cannot prove the latest write's outcome.
 */
export const markCollectionUncertain = (key: string, now = Date.now()) => {
  latches.set(key, { detectedAt: now });
  emit();
};

/**
 * Record a compliance response only when it completed after the ambiguity was
 * detected. Cached data, a failed reload and a response that landed before
 * detection never refresh the latch.
 */
export const markCollectionRefreshed = (key: string, fetchedAt: number) => {
  const current = latches.get(key);
  if (!current || current.refreshedAt !== undefined || !(fetchedAt > current.detectedAt)) return;
  latches.set(key, { ...current, refreshedAt: fetchedAt });
  emit();
};

/**
 * Explicit review. Refused until a post-detection response has completed, so
 * dismissing the sheet, switching tabs or cached figures cannot clear it.
 */
export const acknowledgeCollectionUncertainty = (key: string) => {
  const current = latches.get(key);
  if (!current || current.refreshedAt === undefined) return false;
  latches.delete(key);
  emit();
  return true;
};

/**
 * Sign-out / account change: never show one account's latch to another.
 * Organisation switches within the same account keep their latches.
 */
export const scopeCollectionUncertaintyToAccount = (accountId: string) => {
  if (activeAccountId === null) {
    activeAccountId = accountId;
    return;
  }
  if (activeAccountId === accountId) return;
  activeAccountId = accountId;
  if (latches.size) {
    latches.clear();
    emit();
  }
};

/** Explicit lifecycle reset (tests and sign-out); never called by the UI. */
export const clearAllCollectionUncertainty = () => {
  activeAccountId = null;
  if (latches.size) {
    latches.clear();
    emit();
  }
};

/**
 * The pending latch for this exact target, if any. The target key includes the
 * authenticated account, so another account's warning can never surface here.
 */
export const useCollectionUncertainty = (key: string, accountId: string) => {
  useEffect(() => {
    scopeCollectionUncertaintyToAccount(accountId);
  }, [accountId]);
  return useSyncExternalStore(
    subscribe,
    () => latches.get(key),
    () => latches.get(key),
  );
};
