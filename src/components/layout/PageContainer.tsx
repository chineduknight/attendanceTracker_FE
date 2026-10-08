import { Box, BoxProps } from "@chakra-ui/react";
import { ReactNode } from "react";
import { withSafeInset } from "styles/safeArea";

const WIDTHS = {
  /** Single-column forms. */
  form: "md",
  /** Most pages: lists, reports, settings. */
  content: "3xl",
  /** Dashboards and wide tables. */
  wide: "6xl",
} as const;

export interface PageContainerProps extends Omit<BoxProps, "width"> {
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}

/**
 * A page's outer frame: the page background (dark-safe), a readable content
 * width, the app's standard padding, and room for the iPhone home bar.
 *
 * It does not size itself to the screen: it grows (flex="1") into the page
 * area of a flex-column shell (ProtectedLayout) that owns 100dvh, so short
 * pages fill the screen below the header without scrolling and long pages
 * grow normally. Public routes need the same shell before they adopt it.
 */
const PageContainer = ({ width = "content", children, ...contentProps }: PageContainerProps) => (
  <Box as="main" flex="1" bg="bg.subtle">
    <Box
      maxW={WIDTHS[width]}
      mx="auto"
      px={{ base: 4, md: 6 }}
      pt={{ base: 4, md: 6 }}
      pb={{ base: withSafeInset("bottom", "1.5rem"), md: withSafeInset("bottom", "2rem") }}
      {...contentProps}
    >
      {children}
    </Box>
  </Box>
);

export default PageContainer;
