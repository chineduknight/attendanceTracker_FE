import { ReactNode } from "react";
import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Text,
} from "@chakra-ui/react";

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
  <Drawer isOpen={isOpen} placement="bottom" onClose={onClose}>
    <DrawerOverlay />
    <DrawerContent
      borderTopRadius="xl"
      maxH="92vh"
      maxW={{ md: "lg" }}
      mx="auto"
    >
      <DrawerCloseButton />
      <DrawerHeader pr={12} pb={subtitle ? 1 : 3}>
        {title}
        {subtitle && (
          <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>
            {subtitle}
          </Text>
        )}
      </DrawerHeader>
      <DrawerBody pb={footer ? 2 : 6}>{children}</DrawerBody>
      {footer && (
        <DrawerFooter gap={3} pb={6} borderTopWidth="1px">
          {footer}
        </DrawerFooter>
      )}
    </DrawerContent>
  </Drawer>
);

export default FinanceSheet;
