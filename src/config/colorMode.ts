/**
 * Dark mode stays off for users until every page is dark-safe (the
 * mobile-first + dark pass). Flip this once the last page batch lands: users
 * then follow their device setting and get the System/Light/Dark toggle.
 */
export const DARK_MODE_ENABLED = false;

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** next-themes' localStorage key for a user's real preference. */
export const THEME_STORAGE_KEY = "presence-pro-theme";
/** Separate key for a preview, so trying dark never sets a user's preference. */
export const THEME_PREVIEW_STORAGE_KEY = "presence-pro-theme-preview";
/** sessionStorage flag: a preview lasts for the tab, not forever. */
export const THEME_PREVIEW_SESSION_KEY = "presence-pro-theme-preview-active";

export type ColorModeSetup =
  | { mode: "forced-light" }
  | { mode: "preview"; storageKey: string }
  | { mode: "user"; storageKey: string };

const isPreference = (value: string | null): value is ThemePreference =>
  THEME_PREFERENCES.includes(value as ThemePreference);

const safely = (run: () => void) => {
  try {
    run();
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
};

/**
 * Decide how colour mode runs for this tab.
 *
 * While dark mode is off for users, `?theme=dark|light|system` starts a
 * preview for this tab (it survives navigation, which drops the query) and
 * `?theme=off` ends it. Without a preview everyone is forced to light.
 */
export const resolveColorModeSetup = (
  search: string,
  session: Storage,
  local: Storage,
  enabled: boolean = DARK_MODE_ENABLED,
): ColorModeSetup => {
  if (enabled) return { mode: "user", storageKey: THEME_STORAGE_KEY };

  const requested = new URLSearchParams(search).get("theme");
  if (requested === "off") {
    safely(() => session.removeItem(THEME_PREVIEW_SESSION_KEY));
  } else if (isPreference(requested)) {
    safely(() => {
      session.setItem(THEME_PREVIEW_SESSION_KEY, "1");
      local.setItem(THEME_PREVIEW_STORAGE_KEY, requested);
    });
  }

  let previewing = false;
  safely(() => {
    previewing = session.getItem(THEME_PREVIEW_SESSION_KEY) === "1";
  });
  return previewing
    ? { mode: "preview", storageKey: THEME_PREVIEW_STORAGE_KEY }
    : { mode: "forced-light" };
};
