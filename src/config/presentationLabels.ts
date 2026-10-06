import { OrganisationTerminology } from "helpers/organisationPresentation";

type Terms = OrganisationTerminology;

/** Display text built from an organisation's terminology. */
export type TermLabel = (terms: Terms) => string;

/**
 * Labels shared by navigation and page titles, so a destination reads the
 * same everywhere. With default terminology each matches today's wording.
 */
export const LABELS = {
  addMember: (t: Terms) => `Add ${t.memberSingular}`,
  updateMember: (t: Terms) => `Update ${t.memberSingular}`,
  viewMembers: (t: Terms) => `View ${t.memberPlural}`,
  memberAnalytics: (t: Terms) => `${t.memberSingular} Analytics`,
  markAttendance: (t: Terms) => `Mark ${t.attendanceSingular}`,
  createAttendance: (t: Terms) => `Create ${t.attendanceSingular}`,
  allAttendance: (t: Terms) => `All ${t.attendancePlural}`,
  viewAttendance: (t: Terms) => `View ${t.attendanceSingular}`,
  attendanceAnalytics: (t: Terms) => `${t.attendanceSingular} Analytics`,
  createCategory: (t: Terms) => `Create ${t.categorySingular}`,
  createSubCategory: (t: Terms) => `Create ${t.subCategorySingular}`,
  officersAndRoles: (t: Terms) => `${t.officerPlural} & Roles`,
};

/** A static string or one derived from terminology. */
export type PresentationText = string | TermLabel;

export const resolveText = (text: PresentationText, terms: OrganisationTerminology) =>
  typeof text === "function" ? text(terms) : text;
