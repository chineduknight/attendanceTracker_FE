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
