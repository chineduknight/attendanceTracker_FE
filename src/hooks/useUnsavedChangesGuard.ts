import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";
import type { History, Transition } from "history";

/** Why the officer is leaving, so the question can name the outcome. */
export type LeaveReason = "navigate" | "logout";

// The screen currently holding unsaved work registers its question here, so
// actions that leave without a navigation (Logout) can ask the same thing.
let activeLeaveCheck: ((reason: LeaveReason) => Promise<boolean>) | null = null;

/**
 * Resolves true when it is fine to leave: nothing is unsaved, or the officer
 * chose to discard. Only for deliberate officer actions such as Logout, never
 * for token expiry or other security sign-outs, which must not wait.
 */
export const confirmDiscardUnsaved = (reason: LeaveReason): Promise<boolean> =>
  activeLeaveCheck ? activeLeaveCheck(reason) : Promise.resolve(true);

/**
 * Asks before leaving a screen with unsaved work. While `when` is true, every
 * in-app navigation (links, Back, Cancel, the organisation list) waits for
 * `confirmLeave`; the browser's own prompt covers refresh and closing the tab
 * (history's block adds a beforeunload listener). React Router 6.3 has no
 * blocker API, so this uses its history directly.
 *
 * Call `release()` right before a navigation that must not ask, such as the
 * one after a successful save: it unblocks synchronously, before the next
 * render could.
 */
export const useUnsavedChangesGuard = (
  when: boolean,
  confirmLeave: (reason: LeaveReason) => Promise<boolean>,
) => {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const unblockRef = useRef<(() => void) | null>(null);
  const releasedRef = useRef(false);

  // A layout effect, so the block is in place as soon as the change that
  // needs it is on screen: a tap right after it can never slip through.
  useLayoutEffect(() => {
    const block = (navigator as unknown as Partial<History>).block;
    if (!when || releasedRef.current || !block) return undefined;
    let asking = false;
    const unblock = block.call(navigator, (transition: Transition) => {
      if (asking) return;
      asking = true;
      void confirmLeave("navigate").then((leave) => {
        asking = false;
        if (!leave) return;
        unblock();
        unblockRef.current = null;
        transition.retry();
      });
    });
    unblockRef.current = unblock;
    const check = (reason: LeaveReason) => confirmLeave(reason);
    activeLeaveCheck = check;
    return () => {
      unblock();
      if (unblockRef.current === unblock) unblockRef.current = null;
      if (activeLeaveCheck === check) activeLeaveCheck = null;
    };
  }, [navigator, when, confirmLeave]);

  return useCallback(() => {
    releasedRef.current = true;
    unblockRef.current?.();
    unblockRef.current = null;
    activeLeaveCheck = null;
  }, []);
};
