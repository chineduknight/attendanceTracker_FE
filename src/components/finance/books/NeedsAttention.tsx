import { Box, Stack, Text } from "@chakra-ui/react";
import NavRow, { NavGroup } from "components/finance/books/NavRow";
import { AttentionItem, AttentionTarget } from "helpers/booksOverview";

/**
 * Only what needs doing now; renders nothing when all is well. An item with
 * no target is not a link: its note says why nothing here can recover it.
 */
const NeedsAttention = ({
  items,
  onOpen,
}: {
  items: AttentionItem[];
  onOpen: (target: AttentionTarget) => void;
}) => {
  if (!items.length) return null;
  return (
    <Stack gap={2} as="section" aria-label="Needs attention">
      <Text as="h3" fontWeight="semibold">
        Needs attention
      </Text>
      <NavGroup>
        {items.map(({ id, text, note, target }) =>
          target ? (
            <NavRow key={id} label={text} caption={note} onClick={() => onOpen(target)} />
          ) : (
            <Box key={id} px={4} py={3} bg="bg.panel">
              <Text fontWeight="medium">{text}</Text>
              {note && (
                <Text fontSize="sm" color="fg.muted">
                  {note}
                </Text>
              )}
            </Box>
          ),
        )}
      </NavGroup>
    </Stack>
  );
};

export default NeedsAttention;
