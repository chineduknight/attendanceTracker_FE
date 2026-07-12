import React from "react";
import { Box, Text } from "@chakra-ui/react";

interface RateRingProps {
  rate: number; // 0..100
  size?: number;
  trackColor?: string;
}

const RateRing: React.FC<RateRingProps> = ({ rate, size = 76, trackColor = "#0BC5EA" }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(rate)));
  const inner = size - 18;
  return (
    <Box
      position="relative" flex="0 0 auto"
      width={`${size}px`} height={`${size}px`} borderRadius="50%"
      display="flex" alignItems="center" justifyContent="center"
      sx={{ background: `conic-gradient(${trackColor} 0 ${clamped}%, rgba(255,255,255,0.22) ${clamped}% 100%)` }}
    >
      <Box
        width={`${inner}px`} height={`${inner}px`} borderRadius="50%" bg="purple.600"
        display="flex" flexDirection="column" alignItems="center" justifyContent="center" color="white"
      >
        <Text fontWeight="bold" fontSize="md" lineHeight="1">{clamped}%</Text>
        <Text fontSize="9px" textTransform="uppercase" opacity={0.8}>rate</Text>
      </Box>
    </Box>
  );
};

export default RateRing;
