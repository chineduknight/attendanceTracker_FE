import { getMilestoneProgress } from "components/analytics/streakMilestones";

describe("getMilestoneProgress", () => {
  it("targets the first tier from zero", () => {
    expect(getMilestoneProgress(0)).toEqual({
      nextTier: 3, prevTier: 0, percent: 0, isRecord: false,
    });
  });

  it("computes the fill percentage between tiers", () => {
    expect(getMilestoneProgress(4)).toEqual({
      nextTier: 5, prevTier: 3, percent: 50, isRecord: false,
    });
    expect(getMilestoneProgress(7)).toEqual({
      nextTier: 10, prevTier: 5, percent: 40, isRecord: false,
    });
  });

  it("resets to 0% toward the next tier when landing exactly on a tier", () => {
    expect(getMilestoneProgress(5)).toEqual({
      nextTier: 10, prevTier: 5, percent: 0, isRecord: false,
    });
  });

  it("flags record territory at/above the top tier", () => {
    expect(getMilestoneProgress(100)).toEqual({
      nextTier: null, prevTier: 100, percent: 100, isRecord: true,
    });
    expect(getMilestoneProgress(250).isRecord).toBe(true);
  });
});
