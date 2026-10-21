import { Stack, Text } from "@chakra-ui/react";
import NavRow, { NavGroup } from "components/finance/books/NavRow";
import { AttentionItem } from "helpers/booksOverview";

/** Only what needs doing now; renders nothing when all is well. */
const NeedsAttention = ({
  items,
  onOpen,
}: {
  items: AttentionItem[];
  onOpen: (target: AttentionItem["target"]) => void;
}) => {
  if (!items.length) return null;
  return (
    <Stack gap={2} as="section" aria-label="Needs attention">
      <Text as="h3" fontWeight="semibold">
        Needs attention
      </Text>
      <NavGroup>
        {items.map((item) => (
          <NavRow key={item.id} label={item.text} onClick={() => onOpen(item.target)} />
        ))}
      </NavGroup>
    </Stack>
  );
};

export default NeedsAttention;
