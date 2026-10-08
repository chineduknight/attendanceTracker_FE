import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { render } from "test-utils/render";
import PinnedSearchBar from "components/PinnedSearchBar";
import { usePinnedSearch } from "hooks/usePinnedSearch";

const Page = ({ onValue = jest.fn() }: { onValue?: (value: string) => void }) => {
  const [query, setQuery] = useState("");
  const pinnedSearch = usePinnedSearch(query);
  return (
    <>
      <PinnedSearchBar
        pinnedSearch={pinnedSearch}
        value={query}
        onChange={(value) => {
          setQuery(value);
          onValue(value);
        }}
        placeholder="Search member"
      />
      <div ref={pinnedSearch.resultsRef}>results</div>
    </>
  );
};

describe("<PinnedSearchBar>", () => {
  it("is a search field with the phone's search key and no autofill", () => {
    render(<Page />);
    const input = screen.getByRole("searchbox", { name: "Search member" });
    expect(input).toHaveAttribute("enterkeyhint", "search");
    expect(input).toHaveAttribute("inputmode", "search");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("hands typed text to the page", () => {
    const onValue = jest.fn();
    render(<Page onValue={onValue} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ada" } });
    expect(onValue).toHaveBeenLastCalledWith("ada");
  });

  it("clears with a 44px button and keeps focus in the field", () => {
    render(<Page />);
    const input = screen.getByRole("searchbox");
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "ada" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });
});
