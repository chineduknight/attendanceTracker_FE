/**
 * F2B-2 member-money sources (RFC v0.3 §5.6, §8.2; `GET /ledger/member-money`).
 *
 * A source is a member receipt (`M-…`) or an opening member-money item
 * (`OM-…`). The server owns every figure: what each source received, what has
 * been refunded and what it still holds. Nothing here derives a balance; a
 * malformed item makes the whole page unusable rather than silently shorter.
 */

import {
  MEMBER_MONEY_PURPOSES,
  MemberMoneyPurpose,
  MemberMoneySourceRef,
} from "components/finance/ledgerPostingTypes";
import { isBusinessDate } from "helpers/openingBalances";

export interface MemberMoneySource extends MemberMoneySourceRef {
  payerName: string | null;
  memberId: string | null;
  /** `null` when the server sent a purpose this build doesn't know. */
  purpose: MemberMoneyPurpose | null;
  obligationId: string | null;
  effectiveKobo: number;
  refundedKobo: number;
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

export const toMemberMoneySource = (value: unknown): MemberMoneySource | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const kind = raw.kind;
  if (kind !== "receipt" && kind !== "opening_item") return null;
  const id = asOptionalText(raw.id);
  const number = asOptionalText(raw.number);
  if (!id || !number || !SOURCE_NUMBER[kind].test(number)) return null;
  if (typeof raw.businessDate !== "string" || !isBusinessDate(raw.businessDate)) return null;
  const effectiveKobo = asNonNegativeKobo(raw.effectiveKobo);
  const refundedKobo = asNonNegativeKobo(raw.refundedKobo);
  const remainingKobo = asNonNegativeKobo(raw.remainingKobo);
  if (effectiveKobo === null || refundedKobo === null || remainingKobo === null) return null;
  return {
    kind,
    id,
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
    remainingKobo,
  };
};

/** One page, or null when the body or any item is malformed. */
export const toMemberMoneyPage = (value: unknown): MemberMoneyPage | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items)) return null;
  const items: MemberMoneySource[] = [];
  for (const entry of raw.items) {
    const source = toMemberMoneySource(entry);
    if (!source) return null;
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
