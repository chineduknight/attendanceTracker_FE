import { capitalizeFirstLetter } from "helpers/stringManipulations";
import {
  displayMemberFieldLabel,
  fallbackFieldLabel,
  MemberModelField,
} from "helpers/memberFields";
import {
  DEFAULT_TERMINOLOGY,
  lowerTerm,
  OrganisationTerminology,
} from "helpers/organisationPresentation";

export type { MemberModelField };

/**
 * Who is expected at a session: a member is expected when, for every rule,
 * their value for `field` is one of `values`. Values within a rule are OR'd,
 * rules are AND'd, and no rules means everyone is expected.
 */
export interface AttendanceEligibilityRule {
  field: string;
  values: string[];
}

/** A member-model field eligibility can be defined on. */
export interface EligibilityField {
  /** Storage key — what rules are keyed by. */
  name: string;
  /** Display label only; never written into a rule. */
  label: string;
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

/** The part of an organisation that switches eligibility on; older caches may lack it. */
export interface EligibilitySettingSource {
  attendanceEligibilityEnabled?: boolean | null;
}

/**
 * Whether the organisation has opted in to eligibility rules when creating
 * attendance. Off unless explicitly enabled. Only creation UX depends on this —
 * attendance already stored with rules keeps its roster regardless.
 */
export const isAttendanceEligibilityEnabled = (
  org: EligibilitySettingSource | null | undefined,
): boolean => org?.attendanceEligibilityEnabled === true;


// Field names and values compare case-insensitively, as the backend does when
// it stores rules (lowercased fields) and resolves rosters (legacy member
// casing still matches its option).
const matchKey = (value: string) => value.trim().toLowerCase();

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
    .map((field) => ({
      name: field.name,
      label: displayMemberFieldLabel(field),
      options: [...(field.options ?? [])],
    }));

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

const isWellFormedRule = (rule: unknown): boolean =>
  isRuleLike(rule) &&
  typeof rule.field === "string" &&
  rule.field.length > 0 &&
  Array.isArray(rule.values) &&
  rule.values.length > 0 &&
  rule.values.every((value) => typeof value === "string" && value.length > 0);

/**
 * Stored rules this client cannot read faithfully. Only a missing value means
 * Everyone; anything else malformed must never be widened to Everyone.
 */
export const isUnreadableEligibility = (rules: unknown): boolean =>
  rules != null && !(Array.isArray(rules) && rules.every(isWellFormedRule));

/**
 * How each rule no longer matches the current member model. An empty result
 * means every rule can still be evaluated as it was written.
 */
export const eligibilityIssues = (
  rules: readonly AttendanceEligibilityRule[],
  modelFields: readonly MemberModelField[],
): EligibilityIssue[] =>
  rules.flatMap((rule): EligibilityIssue[] => {
    const field = modelFields.find((f) => matchKey(f.name) === matchKey(rule.field));
    if (!field) return [{ field: rule.field, kind: "missing-field" }];
    if (field.type !== "option") return [{ field: rule.field, kind: "not-option" }];
    const options = new Set((field.options ?? []).map(matchKey));
    const missing = rule.values.filter((value) => !options.has(matchKey(value)));
    return missing.length
      ? [{ field: rule.field, kind: "missing-option", values: missing }]
      : [];
  });

const memberValue = (
  member: Readonly<Record<string, unknown>>,
  field: string,
): unknown => {
  if (field in member) return member[field];
  const key = Object.keys(member).find((k) => matchKey(k) === matchKey(field));
  return key === undefined ? undefined : member[key];
};

/** Whether `member` is expected under `rules`; a missing value never matches. */
export const matchesEligibility = (
  member: Readonly<Record<string, unknown>>,
  rules: readonly AttendanceEligibilityRule[],
): boolean =>
  rules.every((rule) => {
    const value = memberValue(member, rule.field);
    return (
      typeof value === "string" &&
      rule.values.some((option) => matchKey(option) === matchKey(value))
    );
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

const fieldLabel = fallbackFieldLabel;

/** One sentence explaining an issue, e.g. `Part: Mezzo is no longer an option.` */
export const describeEligibilityIssue = (
  issue: EligibilityIssue,
  labelFor: (field: string) => string = fieldLabel,
  terminology: OrganisationTerminology = DEFAULT_TERMINOLOGY,
): string => {
  const label = labelFor(issue.field);
  switch (issue.kind) {
    case "missing-field":
      return `${label} is no longer a ${lowerTerm(terminology.memberSingular)} field.`;
    case "not-option":
      return `${label} is no longer an option field.`;
    case "missing-option": {
      const values = (issue.values ?? []).map(capitalizeFirstLetter).join(", ");
      return `${label}: ${values} ${issue.values?.length === 1 ? "is" : "are"} no longer an option.`;
    }
  }
};

/**
 * e.g. `Voice Part: Soprano, Alto · Status: Active`, or `Everyone`. Pass the
 * current model to show field labels; rules themselves stay keyed by name.
 */
export const summarizeEligibilityRules = (
  rules: readonly AttendanceEligibilityRule[],
  labelFor: (field: string) => string = fieldLabel,
): string =>
  rules.length
    ? rules
        .map(
          (rule) =>
            `${labelFor(rule.field)}: ${rule.values
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
