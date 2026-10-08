import { List } from "@chakra-ui/react";

import { useColorModeValue } from "./ui/color-mode";

/**
 * One bordered container with divider rows — denser on a phone than a
 * separate card per row. Pair with GroupedListItem.
 */
export const GroupedList = (props: List.RootProps) => {
  const bg = useColorModeValue("white", "gray.700");
  return (
    <List.Root
      borderWidth="1px"
      borderRadius="lg"
      bg={bg}
      overflow="hidden"
      {...props}
    />
  );
};

export const GroupedListItem = (props: List.ItemProps) => {
  const dividerColor = useColorModeValue("gray.100", "gray.600");
  return (
    <List.Item
      px={{ base: 3, md: 5 }}
      py={{ base: 2, md: 3 }}
      borderTopColor={dividerColor}
      _notFirst={{ borderTopWidth: "1px" }}
      {...props}
    />
  );
};
