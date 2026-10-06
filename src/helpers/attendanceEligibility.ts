import { capitalizeFirstLetter } from "helpers/stringManipulations";

/**
 * Who is expected at a session: a member is expected when, for every rule,
 * their value for `field` is one of `values`. Values within a rule are OR'd,
 * rules are AND'd, and no rules means everyone is expected.
 */
export interface AttendanceEligibilityRule {
  field: string;
  values: string[];
}

/** One configured member-model field, as returned by the model endpoint. */
export interface MemberModelField {
  name: string;
  type: string;
  options?: string[];
  required?: boolean;
}

/** A member-model field eligibility can be defined on. */
export interface EligibilityField {
  name: string;
  options: string[];
}

export type EligibilityIssueKind = "missing-field" | "not-option" | "missing-option";

/** Why a stored rule no longer fits the current member model. */
export interface EligibilityIssue {
  field: string;
  kind: EligibilityIssueKind;
  /** The selected options the field no longer offers (`missing-option` only). */
  values?: string[];
}

export const EVERYONE_LABEL = "Everyone";

/** Option-type fields with at least one option — the only eligible criteria. */
export const eligibilityFields = (
  fields: readonly MemberModelField[] | null | undefined,
): EligibilityField[] =>
  (fields ?? [])
    .filter(
      (field) =>
        field.type === "option" &&
        Array.isArray(field.options) &&
        field.options.length > 0,
    )
    .map((field) => ({ name: field.name, options: [...(field.options ?? [])] }));

const isRuleLike = (value: unknown): value is { field: unknown; values: unknown } =>
  typeof value === "object" && value !== null && "field" in value && "values" in value;

/**
 * Canonical form of possibly-untrusted rules (a template from an older client,
 * a persisted draft): drops malformed entries and rules without values,
 * de-duplicates values and merges repeated fields. Anything else — including
 * `undefined` — normalises to `[]` (Everyone).
 */
export const normalizeEligibilityRules = (
  rules: unknown,
): AttendanceEligibilityRule[] => {
  if (!Array.isArray(rules)) return [];
  const valuesByField = new Map<string, Set<string>>();
  rules.forEach((rule) => {
    if (!isRuleLike(rule) || typeof rule.field !== "string" || !rule.field) return;
    if (!Array.isArray(rule.values)) return;
    const values = valuesByField.get(rule.field) ?? new Set<string>();
    rule.values.forEach((value) => {
      if (typeof value === "string" && value) values.add(value);
    });
    valuesByField.set(rule.field, values);
  });
  return Array.from(valuesByField, ([field, values]) => ({
    field,
    values: Array.from(values),
  })).filter((rule) => rule.values.length > 0);
};

/**
 * How each rule no longer matches the current member model. An empty result
 * means every rule can still be evaluated as it was written.
 */
export const eligibilityIssues = (
  rules: readonly AttendanceEligibilityRule[],
  modelFields: readonly MemberModelField[],
): EligibilityIssue[] =>
  rules.flatMap((rule): EligibilityIssue[] => {
    const field = modelFields.find((f) => f.name === rule.field);
    if (!field) return [{ field: rule.field, kind: "missing-field" }];
    if (field.type !== "option") return [{ field: rule.field, kind: "not-option" }];
    const missing = rule.values.filter((value) => !field.options?.includes(value));
    return missing.length
      ? [{ field: rule.field, kind: "missing-option", values: missing }]
      : [];
  });

/** Whether `member` is expected under `rules`; a missing value never matches. */
export const matchesEligibility = (
  member: Readonly<Record<string, unknown>>,
  rules: readonly AttendanceEligibilityRule[],
): boolean =>
  rules.every((rule) => {
    const value = member[rule.field];
    return typeof value === "string" && rule.values.includes(value);
  });

/** The members expected under `rules`, in their original order. */
export const filterEligibleMembers = <T extends Readonly<Record<string, unknown>>>(
  members: readonly T[],
  rules: readonly AttendanceEligibilityRule[],
): T[] => members.filter((member) => matchesEligibility(member, rules));

export const countEligibleMembers = (
  members: readonly Readonly<Record<string, unknown>>[],
  rules: readonly AttendanceEligibilityRule[],
): number => filterEligibleMembers(members, rules).length;

/** e.g. `Part: Soprano, Alto · Status: Active`, or `Everyone`. */
export const summarizeEligibilityRules = (
  rules: readonly AttendanceEligibilityRule[],
): string =>
  rules.length
    ? rules
        .map(
          (rule) =>
            `${capitalizeFirstLetter(rule.field)}: ${rule.values
              .map(capitalizeFirstLetter)
              .join(", ")}`,
        )
        .join(" · ")
    : EVERYONE_LABEL;

/**
 * The rules with `field` set to `values`, keeping each rule's position; an
 * empty selection removes the rule.
 */
export const setRuleValues = (
  rules: readonly AttendanceEligibilityRule[],
  field: string,
  values: readonly string[],
): AttendanceEligibilityRule[] => {
  if (!values.length) return rules.filter((rule) => rule.field !== field);
  const next = { field, values: [...values] };
  return rules.some((rule) => rule.field === field)
    ? rules.map((rule) => (rule.field === field ? next : rule))
    : [...rules, next];
};
