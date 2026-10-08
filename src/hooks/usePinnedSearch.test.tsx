import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { usePinnedSearch } from "hooks/usePinnedSearch";

const BAR_HEIGHT = 56;
const RESULTS_TOP_IN_VIEWPORT = 300;

const Harness = () => {
  const [query, setQuery] = useState("");
  const { barRef, resultsRef, inputProps, resultsMinH } = usePinnedSearch(query);
  return (
    <>
      <div ref={barRef}>
        <input
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          {...inputProps}
        />
      </div>
      <div ref={resultsRef} data-testid="results" data-min-h={resultsMinH ?? ""} />
    </>
  );
};

const scrollTo = window.scrollTo as jest.Mock;
const setScrollY = (y: number) =>
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
const setResultsTop = (top: number) =>
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ top } as DOMRect);

beforeEach(() => {
  scrollTo.mockClear();
  setScrollY(120);
  setResultsTop(RESULTS_TOP_IN_VIEWPORT);
  jest
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockReturnValue(BAR_HEIGHT);
});
afterEach(() => jest.restoreAllMocks());

const search = () => screen.getByLabelText("Search");
const minH = () => screen.getByTestId("results").getAttribute("data-min-h");

it("lines the results up directly under the bar at the top of the screen on focus", () => {
  render(<Harness />);
  fireEvent.focus(search());
  expect(scrollTo).toHaveBeenCalledWith({
    top: 120 + RESULTS_TOP_IN_VIEWPORT - BAR_HEIGHT,
  });
});

it("re-aligns on every keystroke so a shrinking list cannot drag the bar down", () => {
  render(<Harness />);
  fireEvent.focus(search());
  scrollTo.mockClear();
  fireEvent.change(search(), { target: { value: "Ad" } });
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

it("does not scroll when the bar is already pinned with results beneath it", () => {
  setScrollY(500);
  setResultsTop(BAR_HEIGHT);
  render(<Harness />);
  fireEvent.focus(search());
  expect(scrollTo).not.toHaveBeenCalled();
});

it("never scrolls while unfocused, e.g. when Clear empties the query", () => {
  render(<Harness />);
  fireEvent.change(search(), { target: { value: "Ad" } });
  expect(scrollTo).not.toHaveBeenCalled();
});

it("holds the results at one screen minus the bar while searching, and only then", () => {
  render(<Harness />);
  expect(minH()).toBe("");
  fireEvent.focus(search());
  expect(minH()).toBe(`calc(100vh - ${BAR_HEIGHT}px)`);
  fireEvent.change(search(), { target: { value: "Ad" } });
  fireEvent.blur(search());
  // A query still filters the list after the keyboard closes.
  expect(minH()).toBe(`calc(100vh - ${BAR_HEIGHT}px)`);
  fireEvent.change(search(), { target: { value: "" } });
  expect(minH()).toBe("");
});
