import { render, screen } from "@testing-library/react";
import BirthdayList from "components/birthday/BirthdayList";
import { BirthdayMember } from "helpers/birthday";

const TODAY = "2026-10-08";
const RANGE = { fromDate: "2026-10-04", toDate: "2026-10-11" };
const occurring = (name: string, occurrenceDate: string): BirthdayMember => ({
  name,
  birthdayOccurrence: { month: 10, day: 0, occurrenceDate },
});
const MEMBERS = [
  occurring("Past Person", "2026-10-05"),
  occurring("Ada", "2026-10-08"),
  occurring("Grace", "2026-10-09"),
  occurring("John", "2026-10-11"),
];

const renderList = (showRelativeLabels?: boolean) =>
  render(
    <BirthdayList
      members={MEMBERS}
      range={RANGE}
      asOf={TODAY}
      showRelativeLabels={showRelativeLabels}
      emptyState="None"
    />
  );

describe("<BirthdayList>", () => {
  it("shows relative labels and the today accent by default", () => {
    renderList();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("In 3 days")).toBeInTheDocument();
    expect(screen.getByText("🎂")).toBeInTheDocument();
  });

  it("keeps every date but drops relative wording and the accent when off", () => {
    renderList(false);
    ["Mon, 5 Oct", "Thu, 8 Oct", "Fri, 9 Oct", "Sun, 11 Oct"].forEach((date) =>
      expect(screen.getByText(date)).toBeInTheDocument()
    );
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByText("Tomorrow")).toBeNull();
    expect(screen.queryByText(/^In \d+ days$/)).toBeNull();
    expect(screen.queryByText("🎂")).toBeNull();
  });
});
