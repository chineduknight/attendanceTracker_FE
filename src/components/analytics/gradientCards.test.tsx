import { screen } from "@testing-library/react";
import { generatedCss, render } from "test-utils/render";
import MemberHero from "components/analytics/MemberHero";
import StreakCard from "components/analytics/StreakCard";

// Both cards print white text, so they are only readable on their gradient.
// v2's bgGradient="linear(...)" strings type-check under v3 but generate no
// background at all, which left the text white-on-page.
describe("analytics gradient cards", () => {
  it("MemberHero paints a gradient behind its white text", () => {
    render(<MemberHero name="Ada Obi" fields={{ part: "soprano" }} />);
    const card = screen.getByText("Ada Obi").parentElement!.parentElement!;
    expect(generatedCss(card)).toMatch(/linear-gradient/);
  });

  it("StreakCard paints a gradient behind its white text", () => {
    render(<StreakCard currentStreak={3} longestStreak={5} attendanceRate={80} />);
    const card = screen.getByText("current streak").parentElement!.parentElement!.parentElement!;
    expect(generatedCss(card)).toMatch(/linear-gradient/);
  });
});
