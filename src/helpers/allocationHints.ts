/**
 * Source hints versus an allocation's target (F3 RFC v0.3 O5; backend
 * `memberMoneyRules.hintMismatches`). The same three rules as the server:
 *
 * | Hint on the source | Disagrees when                                  |
 * |--------------------|-------------------------------------------------|
 * | `memberId`         | set and different from the target member        |
 * | `obligationId`     | set and different from the target obligation    |
 * | `purpose`          | `dues` or `levy` and different from its type    |
 *
 * Hints never choose the target. Each mismatch needs its own explicit
 * confirmation, and a flag is never sent for a hint that agrees (the server
 * refuses that with a 422).
 */

import {
  AllocationBody,
  HINT_MISMATCHES,
  HintMismatch,
  MemberMoneyPurpose,
} from "components/finance/ledgerPostingTypes";

const sameId = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export const hintMismatches = (
  hints: { memberId: string | null; obligationId: string | null; purpose: MemberMoneyPurpose | null },
  target: { memberId: string; obligationId: string; obligationType: "dues" | "levy" },
): HintMismatch[] => {
  const disagrees: Record<HintMismatch, boolean> = {
    member: Boolean(hints.memberId) && !sameId(hints.memberId as string, target.memberId),
    obligation: Boolean(hints.obligationId) && !sameId(hints.obligationId as string, target.obligationId),
    purpose: (hints.purpose === "dues" || hints.purpose === "levy") && hints.purpose !== target.obligationType,
  };
  return HINT_MISMATCHES.filter((hint) => disagrees[hint]);
};

export const CONFIRMATION_FIELDS: Record<
  HintMismatch,
  "confirmMemberMismatch" | "confirmObligationMismatch" | "confirmPurposeMismatch"
> = {
  member: "confirmMemberMismatch",
  obligation: "confirmObligationMismatch",
  purpose: "confirmPurposeMismatch",
};

/** The flags for exactly these confirmed mismatches, in a stable order. */
export const confirmationFlags = (confirmed: readonly HintMismatch[]): Partial<AllocationBody> => {
  const flags: Partial<AllocationBody> = {};
  for (const hint of HINT_MISMATCHES) {
    if (confirmed.includes(hint)) flags[CONFIRMATION_FIELDS[hint]] = true;
  }
  return flags;
};

/**
 * Whether the confirmed set is exactly the detected mismatches: none missing
 * (the server would refuse with `LEDGER_MISMATCH_UNCONFIRMED`) and none extra
 * (a flag without a mismatch is a 422).
 */
export const confirmationsMatch = (detected: readonly HintMismatch[], confirmed: readonly HintMismatch[]) =>
  detected.length === confirmed.length && detected.every((hint) => confirmed.includes(hint));
