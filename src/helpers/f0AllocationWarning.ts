/**
 * The read-only F0 correction warning (F3 RFC v0.3 O11(b); backend
 * FRONTEND_API F3-3 "Over-linked positions").
 *
 * When an officer corrects an F0 recorded amount, warn if the new value would
 * be below what the ledger has already allocated to that position. It is a
 * warning only: the correction request, its rules and its outcome are
 * unchanged, nothing is reversed or repaired, and when the allocations can't
 * be read the officer is told so rather than warned or reassured falsely.
 */

import { formatKobo } from "helpers/financeConstants";
import { sameId } from "helpers/ledgerReconciliation";
import { PositionsReport } from "components/finance/ledgerReconciliationTypes";
import { formatLagosTimestamp } from "helpers/openingBalances";

export type LinkedAllocation =
  | { kind: "loading" }
  /** The read failed or couldn't be understood: no warning can be given. */
  | { kind: "unavailable" }
  /** The ledger's allocated total for the position (0 when none). */
  | { kind: "known"; allocatedKobo: number; readAt: string };

export const LINKED_ALLOCATION_CHECKING_NOTE =
  "Checking what the books have already allocated to this record. The correction can still be saved.";

export const LINKED_ALLOCATION_UNAVAILABLE_NOTE =
  "Allocations linked to this record couldn't be checked, so this screen can't warn if the new value is below them. The correction itself works as usual.";

/**
 * The allocated total for one position from the server's positions report.
 * No row means nothing is allocated and Finance has no row: ₦0 allocated.
 * Allocations are ledger figures, so they stay known even when F0's own
 * value for the position is unknown or ambiguous.
 *
 * Only a read that completed after this screen mounted is trusted. While a
 * fresh read is in flight, or before it completes, cached figures are not a
 * current answer; a failed read is unavailable, never the old report.
 */
export const linkedAllocationOf = ({
  report,
  isFetching,
  isFetchedAfterMount,
  isError,
  memberId,
  obligationId,
}: {
  report: PositionsReport | null;
  /** A fresh read is in flight: cached figures are not a current result. */
  isFetching: boolean;
  /** False until a read has completed after this screen mounted. */
  isFetchedAfterMount: boolean;
  isError: boolean;
  memberId: string;
  obligationId: string;
}): LinkedAllocation => {
  if (isFetching) return { kind: "loading" };
  if (isError) return { kind: "unavailable" };
  // The cache can hold an older allocated total from before this screen
  // opened. Until the fresh read has completed, it is not a current answer.
  if (!isFetchedAfterMount) return { kind: "loading" };
  if (!report) return { kind: "unavailable" };
  if (report.items.length === 0) return { kind: "known", allocatedKobo: 0, readAt: report.readAt };
  const position = report.items[0];
  if (report.items.length > 1 || !sameId(position.memberId, memberId) || !sameId(position.obligationId, obligationId)) {
    return { kind: "unavailable" };
  }
  return { kind: "known", allocatedKobo: position.allocatedKobo, readAt: report.readAt };
};

/**
 * A naira amount as entered on the F0 form, in whole kobo, or null when it
 * isn't a whole number of kobo (F0 refuses sub-kobo values; never rounded).
 */
export const nairaAmountToKobo = (naira: number): number | null => {
  if (!Number.isFinite(naira) || naira < 0) return null;
  const kobo = Math.round(naira * 100);
  if (Math.abs(naira * 100 - kobo) > 1e-6 || !Number.isSafeInteger(kobo)) return null;
  return kobo;
};

/** The warning for a proposed recorded value, or null when there is none to give. */
export const correctionAllocationWarning = (
  proposedKobo: number | null,
  link: LinkedAllocation | undefined,
): string | null => {
  if (!link || link.kind !== "known" || proposedKobo === null) return null;
  if (proposedKobo >= link.allocatedKobo) return null;
  const readAt = formatLagosTimestamp(link.readAt);
  return `This sets the recorded value to ${formatKobo(proposedKobo)}, below the ${formatKobo(
    link.allocatedKobo,
  )} already allocated to it in the books${
    readAt ? ` (as read at ${readAt})` : ""
  }. The correction can still be saved and the allocations stay as they are; the position will show as over-linked until an allocation is reversed or Finance is corrected again.`;
};
