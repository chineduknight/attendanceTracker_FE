import { fireEvent, screen } from "@testing-library/react";
import { generatedCss, render } from "test-utils/render";
import AnalyticsMemberList from "components/analytics/AnalyticsMemberList";

const ROWS = [
  { memberId: "m1", name: "Ada", counts: { present: 6, excused: 2, absent: 2 } },
  { memberId: "m2", name: "Bola", counts: { present: 0, excused: 0, absent: 0 } },
  { name: "Unlinked", counts: { present: 1, excused: 0, absent: 0 } },
];

describe("<AnalyticsMemberList>", () => {
  it("splits the bar in the backend's proportions, with no computed rate", () => {
    const { container } = render(<AnalyticsMemberList rows={ROWS} onOpen={jest.fn()} />);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const segments = Array.from(container.querySelectorAll("[data-behavior]")) as HTMLElement[];
    expect(segments.slice(0, 3).map((s) => s.dataset.behavior)).toEqual(["present", "excused", "absent"]);
    // 6 / 2 / 2 of Ada's 10.
    expect(segments.slice(0, 3).map((s) => generatedCss(s).match(/width: ([\d.]+%)/)?.[1])).toEqual([
      "60%",
      "20%",
      "20%",
    ]);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("says not on any roster instead of zero counts", () => {
    render(<AnalyticsMemberList rows={ROWS} onOpen={jest.fn()} />);
    expect(screen.getByText("Not on any attendance roster")).toBeInTheDocument();
  });

  it("opens a linked member and leaves an unlinked one as plain text", () => {
    const onOpen = jest.fn();
    render(<AnalyticsMemberList rows={ROWS} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /^Ada:/ }));
    expect(onOpen).toHaveBeenCalledWith("m1");
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("Unlinked")).toBeInTheDocument();
  });
});
