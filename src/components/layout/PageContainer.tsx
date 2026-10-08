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
 * 100dvh, not 100vh: on iOS 100vh is taller than the visible screen while
 * Safari's toolbar shows.
 */
const PageContainer = ({ width = "content", children, ...contentProps }: PageContainerProps) => (
  <Box as="main" minH="100dvh" bg="bg.subtle">
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
