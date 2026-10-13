import { List } from "@chakra-ui/react";

/**
 * One bordered container with divider rows — denser on a phone than a
 * separate card per row. Pair with GroupedListItem.
 */
export const GroupedList = (props: List.RootProps) => (
  <List.Root
    borderWidth="1px"
    borderColor="border"
    borderRadius="lg"
    bg="bg.panel"
    overflow="hidden"
    {...props}
  />
);

export const GroupedListItem = (props: List.ItemProps) => (
  <List.Item
    px={{ base: 3, md: 5 }}
    py={{ base: 2, md: 3 }}
    borderTopColor="border.muted"
    _notFirst={{ borderTopWidth: "1px" }}
    {...props}
  />
);
