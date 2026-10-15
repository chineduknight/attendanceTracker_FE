import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";
import type { History, Transition } from "history";

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
  confirmLeave: () => Promise<boolean>,
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
      void confirmLeave().then((leave) => {
        asking = false;
        if (!leave) return;
        unblock();
        unblockRef.current = null;
        transition.retry();
      });
    });
    unblockRef.current = unblock;
    return () => {
      unblock();
      if (unblockRef.current === unblock) unblockRef.current = null;
    };
  }, [navigator, when, confirmLeave]);

  return useCallback(() => {
    releasedRef.current = true;
    unblockRef.current?.();
    unblockRef.current = null;
  }, []);
};
