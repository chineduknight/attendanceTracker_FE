// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom doesn't implement window.scrollTo; stub it so components that call it
// (e.g. ScrollToTop) don't emit "Not implemented" noise during tests.
window.scrollTo = jest.fn();

// Chakra v3 (Ark/Zag) measures dialogs, menus and popovers with
// ResizeObserver, which jsdom lacks. A no-op is enough: tests never resize.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

// next-themes (Chakra v3 colour mode) reads the system preference through
// matchMedia, which jsdom lacks. Report "no match" (light) by default; tests
// that need a breakpoint still install their own stub.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
