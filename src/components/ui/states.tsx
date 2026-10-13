import { Button, EmptyState as ChakraEmptyState, VStack } from "@chakra-ui/react";
import { ReactNode } from "react";
import { FiAlertTriangle, FiInbox } from "react-icons/fi";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** e.g. a button to add the first item or clear a search. */
  action?: ReactNode;
}

/** Nothing to show yet, or nothing matches: say so and offer the next step. */
export const EmptyState = ({ title, description, icon, action }: EmptyStateProps) => (
  <ChakraEmptyState.Root size="sm">
    <ChakraEmptyState.Content>
      <ChakraEmptyState.Indicator>{icon ?? <FiInbox />}</ChakraEmptyState.Indicator>
      <VStack textAlign="center" gap={1}>
        <ChakraEmptyState.Title>{title}</ChakraEmptyState.Title>
        {description && (
          <ChakraEmptyState.Description>{description}</ChakraEmptyState.Description>
        )}
      </VStack>
      {action}
    </ChakraEmptyState.Content>
  </ChakraEmptyState.Root>
);

export interface ErrorStateProps {
  /** What failed, in the page's own words. */
  title: string;
  /** The backend's error text when there is one. */
  description?: ReactNode;
  /** Usually the query's refetch; shows a Try again button. */
  onRetry?: () => void;
  retrying?: boolean;
}

/** A load failed: explain it and let the officer retry without a reload. */
export const ErrorState = ({ title, description, onRetry, retrying }: ErrorStateProps) => (
  <ChakraEmptyState.Root size="sm" role="alert">
    <ChakraEmptyState.Content>
      <ChakraEmptyState.Indicator color="fg.error">
        <FiAlertTriangle />
      </ChakraEmptyState.Indicator>
      <VStack textAlign="center" gap={1}>
        <ChakraEmptyState.Title>{title}</ChakraEmptyState.Title>
        {description && (
          <ChakraEmptyState.Description>{description}</ChakraEmptyState.Description>
        )}
      </VStack>
      {onRetry && (
        <Button variant="outline" colorPalette="gray" minH="44px" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </ChakraEmptyState.Content>
  </ChakraEmptyState.Root>
);

/** The backend's `{ error }` text from a failed request, if any. */
export const errorMessage = (error: unknown): string | undefined =>
  (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;
