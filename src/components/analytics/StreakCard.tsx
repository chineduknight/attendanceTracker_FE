import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import RateRing from "components/analytics/RateRing";
import { getMilestoneProgress } from "components/analytics/streakMilestones";

interface StreakCardProps {
  currentStreak: number;
  longestStreak: number;
  attendanceRate: number;
}

const getCheer = (currentStreak: number, longestStreak: number, isRecord: boolean) => {
  if (isRecord) return "🏆 Record territory — keep it going!";
  if (longestStreak > 0 && currentStreak >= longestStreak) return "🔥 New personal best!";
  if (longestStreak > 0) return `${longestStreak - currentStreak} more to beat your record of ${longestStreak}`;
  return "Start your streak!";
};

const StreakCard: React.FC<StreakCardProps> = ({ currentStreak, longestStreak, attendanceRate }) => {
  const { nextTier, percent, isRecord } = getMilestoneProgress(currentStreak);
  const cheer = getCheer(currentStreak, longestStreak, isRecord);

  return (
    <Box
      borderRadius="16px" p={5} color="white"
      bgGradient="linear(135deg, purple.600, blue.600)"
      boxShadow="0 10px 24px rgba(107,70,193,.35)"
    >
      <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
        <Box>
          <Text fontSize="3xl" fontWeight="extrabold" lineHeight="1">🔥 {currentStreak}</Text>
          <Text opacity={0.9}>current streak</Text>
          <Text fontSize="sm" opacity={0.85} mt={1}>Longest ever: <b>{longestStreak}</b></Text>
        </Box>
        <RateRing rate={attendanceRate} />
      </Flex>
      <Box mt={4} h="14px" bg="whiteAlpha.300" borderRadius="999px" overflow="hidden">
        <Box h="100%" width={`${percent}%`} borderRadius="999px" bgGradient="linear(90deg, yellow.400, orange.400)" />
      </Box>
      <Flex justify="space-between" fontSize="xs" opacity={0.9} mt={1}>
        <Text>0</Text>
        <Text textAlign="center">{cheer}</Text>
        <Text>{nextTier ? `🏅 ${nextTier}` : "🏆 max"}</Text>
      </Flex>
    </Box>
  );
};

export default StreakCard;
