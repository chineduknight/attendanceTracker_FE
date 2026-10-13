/** Where View Members remembers which extra fields an organisation shows. */
export const shownFieldsStorageKey = (organisationId: string) =>
  `memberListFields-${organisationId}`;

/** The key an older build used; still read once and then migrated. */
export const legacyShownFieldsStorageKey = (organisationId: string) =>
  `selectedFields-${organisationId}`;
