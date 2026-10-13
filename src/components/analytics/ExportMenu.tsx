import { Button, Menu, Portal } from "@chakra-ui/react";
import { FaDownload, FaFileExcel, FaFilePdf } from "react-icons/fa";

interface ExportMenuProps {
  onExcel: () => void;
  onPdf: () => void;
  disabled?: boolean;
  /** An export is being generated; the trigger spins until its URL opens. */
  busy?: boolean;
}

/** One Export button for a report, so phones don't spend a row on two. */
const ExportMenu = ({ onExcel, onPdf, disabled, busy }: ExportMenuProps) => (
  <Menu.Root positioning={{ placement: "bottom-end" }}>
    <Menu.Trigger asChild>
      <Button
        variant="outline"
        colorPalette="gray"
        minH="44px"
        px={3}
        flexShrink={0}
        disabled={disabled}
        loading={busy}
      >
        <FaDownload />
        Export
      </Button>
    </Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content>
          <Menu.Item value="excel" minH="44px" onSelect={onExcel}>
            <FaFileExcel color="var(--chakra-colors-green-fg)" />
            Export Excel
          </Menu.Item>
          <Menu.Item value="pdf" minH="44px" onSelect={onPdf}>
            <FaFilePdf color="var(--chakra-colors-red-fg)" />
            Export PDF
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);

export default ExportMenu;
