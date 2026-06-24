// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom doesn't implement window.scrollTo; stub it so components that call it
// (e.g. ScrollToTop) don't emit "Not implemented" noise during tests.
window.scrollTo = jest.fn();
