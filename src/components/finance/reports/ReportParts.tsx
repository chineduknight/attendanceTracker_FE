import { ReactNode } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import {
  LEDGER_FORBIDDEN_NOTE,
  LEDGER_FORBIDDEN_TITLE,
  LEDGER_UNAVAILABLE_NOTE,
  LEDGER_UNAVAILABLE_TITLE,
  ledgerHttpStatus,
} from "helpers/ledger";
import { formatLoadedAt } from "helpers/ledgerReports";
import { ReportQueryState } from "hooks/useLedgerReports";

export const ReportNotice = ({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "warning";
}) => (
  <Box
    borderWidth="1px"
    borderColor={tone === "warning" ? "border.warning" : "border"}
    borderRadius="md"
    p={3}
    bg="bg.panel"
  >
    {title && (
      <Text fontSize="sm" fontWeight="semibold" mb={1}>
        {title}
      </Text>
    )}
    <Text fontSize="sm" color="fg.muted">
      {children}
    </Text>
  </Box>
);

/**
 * How fresh the figures on screen are. A background refresh is announced,
 * and a failed one keeps the old figures but says when they were loaded, so
 * stale numbers never read as freshly confirmed.
 */
const failureText = (error: unknown) => errorMessage(error) ?? "Something went wrong.";

const ReportFreshness = ({ query }: { query: ReportQueryState<unknown> }) => {
  const loadedAt = query.dataUpdatedAt ? formatLoadedAt(query.dataUpdatedAt) : null;
  if (query.isFetching) {
    return (
      <Text role="status" fontSize="xs" color="fg.muted">
        Refreshing these figures…
      </Text>
    );
  }
  if (query.isError) {
    return (
      <Box role="alert" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3}>
        <Text fontSize="sm" mb={2}>
          {`Couldn't refresh these figures. ${failureText(query.error)} They were loaded${
            loadedAt ? ` at ${loadedAt} (Lagos time)` : " earlier"
          } and may be out of date.`}
        </Text>
        <Button size="sm" variant="outline" minH="44px" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Box>
    );
  }
  return loadedAt ? (
    <Text fontSize="xs" color="fg.muted">
      {`Loaded at ${loadedAt} (Lagos time)`}
    </Text>
  ) : null;
};

/**
 * Loading, failure and unreadable-response states for one report. Only a
 * parsed report reaches `children`: a failed or malformed response never
 * renders as zeros or an empty financial position.
 */
export const ReportGate = <T,>({
  query,
  name,
  children,
}: {
  query: ReportQueryState<T>;
  /** e.g. "cashbook", used in the copy. */
  name: string;
  children: (report: T) => ReactNode;
}) => {
  if (query.isLoading) return <PageLoader h="20vh" label={`Loading ${name}...`} />;
  if (query.isError && !query.hasData) {
    // 403: no access. 501: not built on this server. Any other failure
    // (including a 404 for an unknown account) shows the server's text.
    const status = ledgerHttpStatus(query.error);
    if (status === 403) {
      return <EmptyState title={LEDGER_FORBIDDEN_TITLE} description={LEDGER_FORBIDDEN_NOTE} />;
    }
    if (status === 501) {
      return <EmptyState title={LEDGER_UNAVAILABLE_TITLE} description={LEDGER_UNAVAILABLE_NOTE} />;
    }
    return (
      <ErrorState
        title={`Couldn't load the ${name}`}
        description={`${failureText(query.error)} No figures are shown.`}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (!query.report) {
    return (
      <ErrorState
        title={`The ${name} couldn't be read`}
        description="The server's response wasn't in a shape this app understands, so no figures are shown."
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return (
    <>
      <ReportFreshness query={query as ReportQueryState<unknown>} />
      {children(query.report)}
    </>
  );
};

/**
 * A label and a server figure on one line; the figure keeps its sign. The
 * row is a named group so assistive tech reads the label with its figure.
 */
export const FigureRow = ({
  label,
  value,
  strong = false,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
}) => (
  <Flex role="group" aria-label={label} justify="space-between" align="baseline" gap={3} py={1}>
    <Box minW={0}>
      <Text fontSize="sm" fontWeight={strong ? "semibold" : "normal"}>
        {label}
      </Text>
      {hint && (
        <Text fontSize="xs" color="fg.muted">
          {hint}
        </Text>
      )}
    </Box>
    <Text
      fontSize="sm"
      fontWeight={strong ? "semibold" : "normal"}
      flexShrink={0}
      css={{ fontVariantNumeric: "tabular-nums" }}
    >
      {value}
    </Text>
  </Flex>
);
