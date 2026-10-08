import { Box, Center, Spinner, Text, VStack } from "@chakra-ui/react";

type PageLoaderProps = {
  /** Visible label, also what screen readers announce. */
  label?: string;
  /** Height of the area the loader centres in: the page, or a section of it. */
  h?: string;
};

/** The app's one loading indicator for a page, tab or section. */
const PageLoader = ({ label = "Loading...", h = "100vh" }: PageLoaderProps) => (
  <Center h={h} w="100%" role="status" aria-live="polite">
    <VStack gap={4}>
      <Box position="relative" w="56px" h="56px" aria-hidden>
        <Spinner
          position="absolute"
          top={0}
          left={0}
          w="56px"
          h="56px"
          borderWidth="4px"
          animationDuration="0.85s"
          css={{ "--spinner-track-color": "colors.blue.muted" }}
          color="blue.solid"
        />
        <Spinner
          position="absolute"
          top="10px"
          left="10px"
          w="36px"
          h="36px"
          borderWidth="3px"
          animationDuration="0.65s"
          css={{ "--spinner-track-color": "colors.teal.muted" }}
          color="teal.solid"
        />
      </Box>
      <Text fontSize="sm" fontWeight="medium" color="fg.muted">
        {label}
      </Text>
    </VStack>
  </Center>
);

export default PageLoader;
