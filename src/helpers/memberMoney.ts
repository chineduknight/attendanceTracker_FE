/**
 * F2B-2 member-money sources (RFC v0.3 §5.6, §8.2; `GET /ledger/member-money`).
 *
 * A source is a member receipt (`M-…`) or an opening member-money item
 * (`OM-…`). The server owns every figure: what each source received, what has
 * been refunded or allocated and what it still holds. Nothing here derives a
 * balance. The parser only checks that the figures the server sent agree with
 * each other; a malformed or contradictory item makes the whole list unusable
 * rather than silently shorter or wrong. Refund limits stay server-enforced
 * (`422 LEDGER_REFUND_EXCEEDS_REMAINING`).
 */

import {
  MEMBER_MONEY_PURPOSES,
  MemberMoneyPurpose,
  MemberMoneySourceRef,
} from "components/finance/ledgerPostingTypes";
import { isObjectId } from "helpers/ledgerPostingIntent";
import { isBusinessDate } from "helpers/openingBalances";

export interface MemberMoneySource extends MemberMoneySourceRef {
  payerName: string | null;
  memberId: string | null;
  /** `null` when the server sent a purpose this build doesn't know. */
  purpose: MemberMoneyPurpose | null;
  obligationId: string | null;
  effectiveKobo: number;
  refundedKobo: number;
  /**
   * F3 allocations from this source. `0` when the server predates F3-1 and
   * sends no `allocatedKobo`: that server has no allocations to report.
   */
  allocatedKobo: number;
}

export interface MemberMoneyPage {
  items: MemberMoneySource[];
  nextCursor: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asOptionalText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asNonNegativeKobo = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

const SOURCE_NUMBER: Record<MemberMoneySource["kind"], RegExp> = {
  receipt: /^M-\d{6,}$/,
  opening_item: /^OM-\d{6,}$/,
};

/**
 * `allocatedKobo` is additive (F3-1). Absent means an F2B-2 server, which has
 * no allocations, so it reads as 0 and `remaining = effective − refunded`
 * must still hold exactly. Present, it must be a valid amount like the rest.
 */
const allocatedKoboOf = (raw: Record<string, unknown>): number | null =>
  raw.allocatedKobo === undefined ? 0 : asNonNegativeKobo(raw.allocatedKobo);

export const toMemberMoneySource = (value: unknown): MemberMoneySource | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const kind = raw.kind;
  if (kind !== "receipt" && kind !== "opening_item") return null;
  // The id is the refund route's `:sourceId`; the server 404s anything that
  // isn't an ObjectId, so such a source could never be refunded.
  if (!isObjectId(raw.id)) return null;
  const number = asOptionalText(raw.number);
  if (!number || !SOURCE_NUMBER[kind].test(number)) return null;
  if (typeof raw.businessDate !== "string" || !isBusinessDate(raw.businessDate)) return null;
  const effectiveKobo = asNonNegativeKobo(raw.effectiveKobo);
  const refundedKobo = asNonNegativeKobo(raw.refundedKobo);
  const allocatedKobo = allocatedKoboOf(raw);
  const remainingKobo = asNonNegativeKobo(raw.remainingKobo);
  if (
    effectiveKobo === null ||
    refundedKobo === null ||
    allocatedKobo === null ||
    remainingKobo === null
  ) {
    return null;
  }
  // The server's own invariant (FRONTEND_API F2B-2): a source whose figures
  // disagree is contradictory, never "roughly right".
  if (refundedKobo + allocatedKobo + remainingKobo !== effectiveKobo) return null;
  return {
    kind,
    id: raw.id,
    number,
    businessDate: raw.businessDate,
    payerName: asOptionalText(raw.payerName),
    memberId: asOptionalText(raw.memberId),
    purpose:
      typeof raw.purpose === "string" &&
      (MEMBER_MONEY_PURPOSES as readonly string[]).includes(raw.purpose)
        ? (raw.purpose as MemberMoneyPurpose)
        : null,
    obligationId: asOptionalText(raw.obligationId),
    effectiveKobo,
    refundedKobo,
    allocatedKobo,
    remainingKobo,
  };
};

/**
 * One page, or null when the body or any item is malformed. With `open`, the
 * page answers `open=true`, so a source holding nothing contradicts it.
 */
export const toMemberMoneyPage = (
  value: unknown,
  { open = false }: { open?: boolean } = {},
): MemberMoneyPage | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items)) return null;
  const items: MemberMoneySource[] = [];
  for (const entry of raw.items) {
    const source = toMemberMoneySource(entry);
    if (!source || (open && source.remainingKobo === 0)) return null;
    items.push(source);
  }
  const nextCursor = raw.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== "string" || !nextCursor)) return null;
  return { items, nextCursor };
};

/** The fields a refund draft keeps of its source. */
export const memberMoneySourceRef = (source: MemberMoneySource): MemberMoneySourceRef => ({
  kind: source.kind,
  id: source.id,
  number: source.number,
  businessDate: source.businessDate,
  remainingKobo: source.remainingKobo,
});

/** Said wherever member money is recorded or confirmed (RFC §5.6.3). */
export const MEMBER_MONEY_NOT_DUES_NOTE =
  "Recording member money doesn't mark anyone's dues or levy as paid, and it isn't income. Keep recording dues and levies in Finance as you do today.";

export const MEMBER_MONEY_SOURCE_KIND_LABELS: Record<MemberMoneySource["kind"], string> = {
  receipt: "Member receipt",
  opening_item: "Opening member money",
};
