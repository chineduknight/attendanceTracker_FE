import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Keeps a sticky roster search bar pinned at the top of the screen while an
 * officer searches, with the matches starting directly beneath it.
 *
 * Without this, filtering shortens the page under the officer: the browser
 * clamps the scroll position, the bar drops back to its in-flow spot
 * mid-screen and the matches land behind the phone keyboard; and a sticky
 * bar with too little content below it scrolls away with the page.
 *
 * So while searching, the results area is held at exactly one screen minus
 * the bar — enough for the bar to sit at the top, never enough to leave
 * blank screens to scroll through — and each keystroke lines the results
 * up directly under the bar.
 */
/**
 * How far below the viewport top the bar sticks: the iOS safe-area inset in
 * the installed app (see styles/safeArea), 0 elsewhere.
 */
const stickyOffset = (bar: HTMLElement) =>
  parseFloat(window.getComputedStyle(bar).top) || 0;

export const usePinnedSearch = (query: string) => {
  const barRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [barHeight, setBarHeight] = useState(0);

  const isSearching = isFocused || query !== "";

  useLayoutEffect(() => {
    if (isSearching && barRef.current) {
      setBarHeight(barRef.current.offsetHeight + stickyOffset(barRef.current));
    }
  }, [isSearching]);

  // The results box is never sticky, so its position is real even while the
  // bar above it is stuck; the bar belongs exactly one bar-height above it,
  // and the bar itself sticks below any safe-area inset.
  const pinToTop = useCallback(() => {
    const bar = barRef.current;
    const results = resultsRef.current;
    if (!bar || !results) return;
    const top =
      results.getBoundingClientRect().top +
      window.scrollY -
      bar.offsetHeight -
      stickyOffset(bar);
    if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top });
  }, []);

  // Layout effect: realign before paint so the filtered list never flashes
  // at the clamped position first.
  useLayoutEffect(() => {
    if (isFocused) pinToTop();
  }, [isFocused, query, pinToTop]);

  return {
    /** The sticky search bar. */
    barRef,
    /** The container holding the matches (and the empty state). */
    resultsRef,
    isFocused,
    /** Spread onto the search input. */
    inputProps: {
      onFocus: () => setIsFocused(true),
      onBlur: () => setIsFocused(false),
    },
    /** Min height for the results container while a search is in progress. */
    resultsMinH: isSearching ? `calc(100vh - ${barHeight}px)` : undefined,
  };
};
