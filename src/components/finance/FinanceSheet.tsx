import { ReactNode } from "react";
import { CloseButton, Drawer, Portal } from "@chakra-ui/react";

interface FinanceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Bottom sheet used for every Finance detail and form: thumb-reachable on a
 * phone, capped to a readable width on larger screens.
 */
const FinanceSheet = ({ isOpen, onClose, title, subtitle, children, footer }: FinanceSheetProps) => (
  <Drawer.Root open={isOpen} placement='bottom' onOpenChange={e => {
    if (!e.open) {
      onClose();
    }
  }}>
    <Portal>

      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content borderTopRadius="xl" maxH="92vh" maxW={{ md: "lg" }} mx="auto">
          <Drawer.CloseTrigger asChild><CloseButton size="sm" /></Drawer.CloseTrigger>
          {/* Stacked like v2: v3 drawer headers lay out in a row. */}
          <Drawer.Header
            pr={12}
            pb={subtitle ? 1 : 3}
            flexDirection="column"
            alignItems="flex-start"
            gap={0}
          >
            <Drawer.Title>{title}</Drawer.Title>
            {subtitle && (
              <Drawer.Description fontSize="sm" color="gray.500" mt={0.5}>
                {subtitle}
              </Drawer.Description>
            )}
          </Drawer.Header>
          <Drawer.Body pb={footer ? 2 : 6}>{children}</Drawer.Body>
          {footer && (
            <Drawer.Footer gap={3} pb={6} borderTopWidth="1px">
              {footer}
            </Drawer.Footer>
          )}
        </Drawer.Content>
      </Drawer.Positioner>

    </Portal>
  </Drawer.Root>
);

export default FinanceSheet;
