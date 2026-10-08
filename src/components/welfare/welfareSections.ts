/** DOM ids for the Welfare sections the summary tiles jump to. */
export const WELFARE_SECTION_IDS = {
  attention: "welfare-needs-check-in",
  encouragement: "welfare-encouragement",
  currentlyAway: "welfare-currently-away",
  returningSoon: "welfare-returning-soon",
  birthdays: "welfare-birthdays",
} as const;

export type WelfareSectionKey = keyof typeof WELFARE_SECTION_IDS;

/**
 * Scrolls to a section and moves focus there (sections are tabIndex -1), so
 * keyboard and screen-reader users land where sighted users see the page go.
 * Deliberately not a URL hash: Welfare keeps its state out of the URL.
 */
export const jumpToWelfareSection = (key: WelfareSectionKey): void => {
  const section = document.getElementById(WELFARE_SECTION_IDS[key]);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.focus({ preventScroll: true });
};

/** Props that make a section a focusable jump target. */
export const sectionTargetProps = (key: WelfareSectionKey) => ({
  id: WELFARE_SECTION_IDS[key],
  tabIndex: -1,
  _focus: { outline: "none" },
});
