import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { LedgerStatus } from "components/finance/ledgerTypes";
import { BooksScreen } from "helpers/booksNavigation";
import { ledgerStateKey } from "helpers/ledger";

/**
 * Overview for books that are not active: says where things stand and
 * offers the next step to whoever may take it. Returns null when active.
 */
const BooksStateCard = ({
  status,
  canManage,
  isOwner,
  onGo,
}: {
  status: LedgerStatus;
  canManage: boolean;
  isOwner: boolean;
  onGo: (screen: BooksScreen) => void;
}) => {
  const state = ledgerStateKey(status);
  const card = (() => {
    switch (state) {
      case "not_active":
        return {
          title: "Books aren't set up",
          body: "Set up the organisation's cash and bank accounts to start recording money in and out.",
          action: canManage ? { label: "Set up books", screen: "manage-setup" as const } : null,
        };
      case "setup":
        return {
          title: "Setup in progress",
          body: "Finish the setup steps, then record and verify opening balances.",
          action: canManage ? { label: "Continue setup", screen: "manage-setup" as const } : null,
        };
      case "pending_verification":
        return {
          title: "Opening balances are waiting for verification",
          body: isOwner
            ? "Review the proposed opening balances. Books start once you verify them."
            : "Waiting for the owner to verify the opening balances.",
          action: isOwner || canManage
            ? { label: isOwner ? "Review and verify" : "View opening balances", screen: "manage-opening" as const }
            : null,
        };
      case "suspended":
        return {
          title: "Books are suspended",
          body: "Nothing can be recorded until an owner resumes them in Manage Books.",
          action: isOwner ? { label: "Open books status", screen: "manage-status" as const } : null,
        };
      default:
        return null;
    }
  })();
  if (!card) return null;
  const { action } = card;

  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={4}>
      <Stack gap={2}>
        <Text as="h3" fontWeight="semibold">
          {card.title}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {card.body}
        </Text>
        {action && (
          <Button alignSelf="flex-start" minH="44px" onClick={() => onGo(action.screen)}>
            {action.label}
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default BooksStateCard;
