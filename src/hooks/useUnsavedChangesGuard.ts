import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";
import type { History, Transition } from "history";
import type { ConfirmOptions } from "components/ui/confirm-dialog";
import { discardChangesQuestion } from "helpers/leaveQuestions";

/** Why the officer is leaving, so the question can name the outcome. */
export type LeaveReason = "navigate" | "logout";

export interface UnsavedChangesGuardOptions {
  /**
   * The work is already saved on this device (a resumable draft) and leaving
   * only interrupts it. In-app leaving still asks, but reloading or closing
   * the tab does not: the browser's own prompt says changes may be lost, and
   * nothing would be.
   */
  savedLocally?: boolean;
}

// The screen currently holding work in progress registers its question here,
// so actions that leave without a navigation (Logout) can ask the same thing.
let activeLeaveCheck: ((reason: LeaveReason) => Promise<boolean>) | null = null;

/**
 * Resolves true when it is fine to leave: nothing is in progress, or the
 * officer chose to leave anyway. Only for deliberate officer actions such as
 * Logout, never for token expiry or other security sign-outs, which must not
 * wait.
 */
export const confirmLeaveWork = (reason: LeaveReason): Promise<boolean> =>
  activeLeaveCheck ? activeLeaveCheck(reason) : Promise.resolve(true);

// history's block() always adds a beforeunload prompt on window. This
// listener stops it, so it must be added before block(): browsers differ on
// whether capture runs first at the window, but registration order holds.
const skipBrowserPrompt = (event: Event) => event.stopImmediatePropagation();

/**
 * Asks before leaving a screen with work in progress. While `when` is true,
 * every in-app navigation (links, Back, Cancel, the organisation list) waits
 * for `confirmLeave`; unless the work is `savedLocally`, the browser's own
 * prompt covers refresh and closing the tab (history's block adds a
 * beforeunload listener). React Router 6.3 has no blocker API, so this uses
 * its history directly.
 *
 * Call `release()` right before a navigation that must not ask, such as the
 * one after a successful save: it unblocks synchronously, before the next
 * render could.
 */
export const useUnsavedChangesGuard = (
  when: boolean,
  confirmLeave: (reason: LeaveReason) => Promise<boolean>,
  { savedLocally = false }: UnsavedChangesGuardOptions = {},
) => {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const unblockRef = useRef<(() => void) | null>(null);
  const releasedRef = useRef(false);

  // A layout effect, so the block is in place as soon as the change that
  // needs it is on screen: a tap right after it can never slip through.
  useLayoutEffect(() => {
    const block = (navigator as unknown as Partial<History>).block;
    if (!when || releasedRef.current || !block) return undefined;
    if (savedLocally) {
      window.addEventListener("beforeunload", skipBrowserPrompt, true);
    }
    let asking = false;
    const unblock = block.call(navigator, (transition: Transition) => {
      if (asking) return;
      asking = true;
      void confirmLeave("navigate").then((leave) => {
        asking = false;
        if (!leave) return;
        release();
        unblockRef.current = null;
        transition.retry();
      });
    });
    function release() {
      unblock();
      window.removeEventListener("beforeunload", skipBrowserPrompt, true);
    }
    unblockRef.current = release;
    const check = (reason: LeaveReason) => confirmLeave(reason);
    activeLeaveCheck = check;
    return () => {
      release();
      if (unblockRef.current === release) unblockRef.current = null;
      if (activeLeaveCheck === check) activeLeaveCheck = null;
    };
  }, [navigator, when, confirmLeave, savedLocally]);

  return useCallback(() => {
    releasedRef.current = true;
    unblockRef.current?.();
    unblockRef.current = null;
    activeLeaveCheck = null;
  }, []);
};

/**
 * The guard for a form whose changes live only in memory: while `dirty`,
 * leaving or logging out asks "Discard your changes?" about `subject`.
 * Returns the same `release()` as useUnsavedChangesGuard.
 */
export const useDiscardChangesGuard = (
  dirty: boolean,
  subject: string,
  confirm: (options: ConfirmOptions) => Promise<boolean>,
) =>
  useUnsavedChangesGuard(
    dirty,
    useCallback(
      (reason: LeaveReason) => confirm(discardChangesQuestion(subject, reason)),
      [confirm, subject],
    ),
  );
