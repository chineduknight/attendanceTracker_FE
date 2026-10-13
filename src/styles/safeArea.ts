/**
 * iOS safe areas. viewport-fit=cover (public/index.html) lets the page draw
 * under the notch, status bar and home indicator: in the installed app and in
 * landscape. Anything at a screen edge adds the matching inset; elsewhere the
 * insets are 0, so these resolve to the plain spacing.
 */
export type SafeSide = "top" | "right" | "bottom" | "left";

/** `spacing` plus the device's inset on that side, e.g. "calc(1rem + env(...))". */
export const withSafeInset = (side: SafeSide, spacing = "0px") =>
  `calc(${spacing} + env(safe-area-inset-${side}))`;

/** Where a sticky top bar should stop: under the status bar, not behind it. */
export const SAFE_TOP = "env(safe-area-inset-top)";
