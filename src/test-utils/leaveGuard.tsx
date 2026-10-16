import { act, fireEvent, screen } from "@testing-library/react";
import { Link } from "react-router-dom";
import { confirmLeaveWork } from "hooks/useUnsavedChangesGuard";

/** Path of the screen `LeaveLink` goes to; render a route for it. */
export const ELSEWHERE = "/elsewhere";

/**
 * Any in-app navigation away: Back, Cancel, the menu and drawer links all go
 * through the same history block as this link.
 */
export const LeaveLink = () => <Link to={ELSEWHERE}>Go elsewhere</Link>;

export const leave = () => fireEvent.click(screen.getByText("Go elsewhere"));

/** Starts a Logout as the drawer does, resolving to whether it may proceed. */
export const askToLogOut = () => {
  let answer: Promise<boolean> = Promise.resolve(true);
  act(() => {
    answer = confirmLeaveWork("logout");
  });
  return answer;
};

/**
 * Opens `path` in a real BrowserRouter history: only browser history adds the
 * reload/close-tab prompt (MemoryRouter's never does).
 */
export const openAt = (path: string) => window.history.replaceState({}, "", path);

/** Whether reloading or closing the tab would show the browser's prompt. */
export const browserWouldAsk = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

/** A request the test settles by hand, to act while it is in flight. */
export const deferred = <T = unknown>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const CONTROL_ROLES = [
  "textbox",
  "spinbutton",
  "checkbox",
  "switch",
  "radio",
  "combobox",
  "button",
] as const;

const isLocked = (control: HTMLElement) =>
  control.hasAttribute("readonly") ||
  control.hasAttribute("disabled") ||
  control.getAttribute("aria-disabled") === "true";

/**
 * Every control on screen is read-only or disabled: nothing can be edited
 * while a save is in flight. Returns how many were checked, so a test can
 * prove it looked at the controls it meant to.
 */
export const expectEveryControlLocked = () => {
  const controls = CONTROL_ROLES.flatMap((role) => screen.queryAllByRole(role));
  expect(controls.filter((control) => !isLocked(control))).toEqual([]);
  return controls.length;
};

/** No control is left locked once the save has settled. */
export const expectNothingLockedFor = (...controls: HTMLElement[]) =>
  controls.forEach((control) => expect(isLocked(control)).toBe(false));
