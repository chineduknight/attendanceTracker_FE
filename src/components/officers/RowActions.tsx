import { ReactNode } from "react";
import { IconButton, Menu, Portal } from "@chakra-ui/react";
import { FaEllipsisV } from "react-icons/fa";

export interface RowAction {
  value: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

/** A row's actions behind one 44px ⋯ button, so rows fit a phone. */
const RowActions = ({ label, actions }: { label: string; actions: RowAction[] }) => (
  <Menu.Root positioning={{ placement: "bottom-end" }}>
    <Menu.Trigger asChild>
      <IconButton aria-label={label} variant="ghost" minW="44px" h="44px" flexShrink={0}>
        <FaEllipsisV />
      </IconButton>
    </Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content>
          {actions.map((action) => (
            <Menu.Item
              key={action.value}
              value={action.value}
              minH="44px"
              color={action.destructive ? "fg.error" : undefined}
              onSelect={action.onSelect}
            >
              {action.icon}
              {action.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);

export default RowActions;
