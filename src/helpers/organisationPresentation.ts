/**
 * Organisation presentation: the words officers see and which optional
 * modules appear. Both are display-only — terminology never becomes an API
 * identifier, and feature visibility is not authorization (RBAC still is).
 * Every read goes through this module so legacy or partial org objects fall
 * back to today's defaults in one place.
 */

export interface OrganisationTerminology {
  memberSingular: string;
  memberPlural: string;
  attendanceSingular: string;
  attendancePlural: string;
  categorySingular: string;
  categoryPlural: string;
  subCategorySingular: string;
  subCategoryPlural: string;
  officerSingular: string;
  officerPlural: string;
}

export interface OrganisationFeatureVisibility {
  finance: boolean;
  birthdays: boolean;
  analytics: boolean;
}

export type TermKey = keyof OrganisationTerminology;
export type OptionalFeature = keyof OrganisationFeatureVisibility;

export const DEFAULT_TERMINOLOGY: Readonly<OrganisationTerminology> = Object.freeze({
  memberSingular: "Member",
  memberPlural: "Members",
  attendanceSingular: "Attendance",
  attendancePlural: "Attendance",
  categorySingular: "Category",
  categoryPlural: "Categories",
  subCategorySingular: "Sub-category",
  subCategoryPlural: "Sub-categories",
  officerSingular: "Officer",
  officerPlural: "Officers",
});

export const DEFAULT_FEATURE_VISIBILITY: Readonly<OrganisationFeatureVisibility> =
  Object.freeze({ finance: true, birthdays: true, analytics: true });

export const TERM_KEYS = Object.keys(DEFAULT_TERMINOLOGY) as TermKey[];
export const OPTIONAL_FEATURES = Object.keys(DEFAULT_FEATURE_VISIBILITY) as OptionalFeature[];
export const TERM_MAX_LENGTH = 40;

/** The parts of an organisation this module reads; older caches may lack both. */
export interface PresentationSource {
  terminology?: Partial<OrganisationTerminology> | null;
  featureVisibility?: Partial<OrganisationFeatureVisibility> | null;
}

/** Complete terminology: each stored non-blank term, otherwise the default. */
export const effectiveTerminology = (
  org: PresentationSource | null | undefined,
): OrganisationTerminology => {
  const stored = org?.terminology ?? {};
  return TERM_KEYS.reduce((terms, key) => {
    const value = stored[key];
    terms[key] = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TERMINOLOGY[key];
    return terms;
  }, {} as OrganisationTerminology);
};

/** Complete visibility: each stored boolean, otherwise visible. */
export const effectiveFeatureVisibility = (
  org: PresentationSource | null | undefined,
): OrganisationFeatureVisibility => {
  const stored = org?.featureVisibility ?? {};
  return OPTIONAL_FEATURES.reduce((visibility, feature) => {
    const value = stored[feature];
    visibility[feature] = typeof value === "boolean" ? value : DEFAULT_FEATURE_VISIBILITY[feature];
    return visibility;
  }, {} as OrganisationFeatureVisibility);
};

export const isFeatureVisible = (
  org: PresentationSource | null | undefined,
  feature: OptionalFeature,
): boolean => effectiveFeatureVisibility(org)[feature];

/** Validation message for one term, or null when valid (trimmed, 1–40 chars). */
export const termError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Required";
  if (trimmed.length > TERM_MAX_LENGTH) return `At most ${TERM_MAX_LENGTH} characters`;
  return null;
};

/**
 * A term inside a sentence, e.g. `Search ${lowerTerm(t.memberSingular)}`.
 * Only plainly capitalised words are lowercased, so acronyms and stylised
 * terms ("CYON Member" → "CYON member", "MP") keep their casing. Hyphenated
 * terms lowercase per part ("Sub-category" → "sub-category").
 */
export const lowerTerm = (term: string): string =>
  term
    .split(/(\s+|-)/)
    .map((part) => (/^[A-Z][a-z]+$/.test(part) ? part.toLowerCase() : part))
    .join("");

/** One editable term pair in Organisation Settings. */
export interface TermGroup {
  title: string;
  singular: TermKey;
  plural: TermKey;
}

export const TERM_GROUPS: readonly TermGroup[] = [
  { title: "Member", singular: "memberSingular", plural: "memberPlural" },
  { title: "Attendance", singular: "attendanceSingular", plural: "attendancePlural" },
  { title: "Category", singular: "categorySingular", plural: "categoryPlural" },
  { title: "Sub-category", singular: "subCategorySingular", plural: "subCategoryPlural" },
  { title: "Officer", singular: "officerSingular", plural: "officerPlural" },
];

export const FEATURE_LABELS: Record<OptionalFeature, string> = {
  finance: "Finance",
  birthdays: "Birthdays",
  analytics: "Analytics",
};
