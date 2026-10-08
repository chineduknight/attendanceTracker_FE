/**
 * Amount entry helpers. The form/API value stays a plain number string
 * ("6000.5"); only the input shows separators ("6,000.5").
 */

/** Keep digits and one decimal point, capped at `decimals` places. */
export const toRawAmount = (typed: string, decimals = 2): string => {
  let raw = typed.replace(/[^\d.]/g, "");
  const dot = raw.indexOf(".");
  if (dot !== -1) {
    const whole = raw.slice(0, dot);
    const fraction = raw.slice(dot + 1).replace(/\./g, "");
    raw = decimals > 0 ? `${whole}.${fraction.slice(0, decimals)}` : whole;
  }
  // Drop leading zeros ("007" -> "7") but keep "0" and "0.5".
  return raw.replace(/^0+(?=\d)/, "");
};

/** "6000.5" -> "6,000.5"; a trailing "." while typing is kept. */
export const formatAmount = (raw: string): string => {
  if (!raw) return "";
  const [whole, fraction] = raw.split(".");
  const grouped = (whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
};

/**
 * Where the caret goes after reformatting: just after the same number of
 * digits (and decimal point) it followed before, so separators appearing or
 * vanishing never make it jump.
 */
export const caretAfter = (formatted: string, significantBefore: number): number => {
  if (significantBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/[\d.]/.test(formatted[i])) seen += 1;
    if (seen === significantBefore) return i + 1;
  }
  return formatted.length;
};

/** Digits and points before `position` in what the officer typed. */
export const significantBefore = (typed: string, position: number): number =>
  typed.slice(0, position).replace(/[^\d.]/g, "").length;
