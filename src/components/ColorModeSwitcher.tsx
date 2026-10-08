import { Box, HStack, SegmentGroup, Text } from "@chakra-ui/react";
import { IconType } from "react-icons";
import { LuMonitor, LuMoon, LuSun } from "react-icons/lu";
import { ThemePreference } from "config/colorMode";
import {
  useColorModeControlsVisible,
  useThemePreference,
} from "components/ui/color-mode";

const OPTIONS: { value: ThemePreference; label: string; icon: IconType }[] = [
  { value: "system", label: "System", icon: LuMonitor },
  { value: "light", label: "Light", icon: LuSun },
  { value: "dark", label: "Dark", icon: LuMoon },
];

/**
 * System / Light / Dark. Renders nothing until dark mode is enabled for users
 * (or a ?theme= preview is running), so the app can keep shipping light-only.
 */
const ColorModeSwitcher = () => {
  const visible = useColorModeControlsVisible();
  const { preference, setPreference } = useThemePreference();
  if (!visible) return null;

  return (
    <Box px={4} py={3}>
      <Text id="color-mode-label" fontSize="sm" fontWeight="medium" color="fg.muted" mb={2}>
        Appearance
      </Text>
      <SegmentGroup.Root
        aria-labelledby="color-mode-label"
        value={preference}
        onValueChange={({ value }) => value && setPreference(value)}
        w="full"
      >
        <SegmentGroup.Indicator />
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <SegmentGroup.Item key={value} value={value} flex="1" minH="44px" justifyContent="center">
            <SegmentGroup.ItemText>
              <HStack gap={1.5}>
                <Icon aria-hidden />
                {label}
              </HStack>
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
    </Box>
  );
};

export default ColorModeSwitcher;
