export const MILESTONE_TIERS = [3, 5, 10, 20, 50, 100];

export interface MilestoneProgress {
  nextTier: number | null; // null once past the top tier
  prevTier: number;        // floor tier (0 below the first)
  percent: number;         // 0..100 fill toward nextTier (100 when isRecord)
  isRecord: boolean;       // streak >= top tier
}

export const getMilestoneProgress = (currentStreak: number): MilestoneProgress => {
  const top = MILESTONE_TIERS[MILESTONE_TIERS.length - 1];
  if (currentStreak >= top) {
    return { nextTier: null, prevTier: top, percent: 100, isRecord: true };
  }
  const nextTier = MILESTONE_TIERS.find((tier) => tier > currentStreak) as number;
  const prevIndex = MILESTONE_TIERS.indexOf(nextTier) - 1;
  const prevTier = prevIndex >= 0 ? MILESTONE_TIERS[prevIndex] : 0;
  const percent = Math.round(((currentStreak - prevTier) / (nextTier - prevTier)) * 100);
  return { nextTier, prevTier, percent, isRecord: false };
};
