import { useState } from "react";
import { Box, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LedgerAccount } from "components/finance/ledgerTypes";
import NavRow, { NavGroup } from "components/finance/books/NavRow";
import { BalanceTile, balanceTiles } from "helpers/booksOverview";
import { formatReportKobo } from "helpers/ledgerReports";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerBalances } from "hooks/useLedgerReports";

const Tile = ({ tile }: { tile: BalanceTile }) => (
  <Box
    role="group"
    aria-label={tile.name}
    borderWidth="1px"
    borderColor="border"
    borderRadius="lg"
    bg="bg.panel"
    px={4}
    py={3}
    minW={0}
  >
    <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" textTransform="uppercase" color="fg.muted">
      {tile.type}
    </Text>
    <Text fontWeight="medium" lineClamp={2}>
      {tile.name}
    </Text>
    <Text fontSize="2xl" fontWeight="bold" css={{ fontVariantNumeric: "tabular-nums" }} wordBreak="break-word">
      {formatReportKobo(tile.balanceKobo)}
    </Text>
    {tile.reason && (
      <Text fontSize="xs" color="fg.muted">
        {tile.reason}
      </Text>
    )}
  </Box>
);

/**
 * Cash and bank balances, one tile per active account, straight from the
 * server's balances read. The only total is the server's own
 * `moneyTotalKobo`; nothing is added up here.
 */
const BalanceTiles = ({
  organisationId,
  accounts,
  enabled,
  memberReceiptsOn,
  onOpenHeld,
}: {
  organisationId: string;
  accounts: readonly LedgerAccount[];
  enabled: boolean;
  memberReceiptsOn: boolean;
  onOpenHeld: () => void;
}) => {
  const [showInactive, setShowInactive] = useState(false);
  const query = useLedgerBalances(organisationId, todayInLagos(), enabled);

  if (query.isLoading) return <PageLoader h="120px" label="Loading balances..." />;
  if (query.isError && !query.report) {
    return (
      <ErrorState
        title="Couldn't load balances"
        description={errorMessage(query.error)}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (!query.report) return <EmptyState title="Balances aren't available yet" />;

  const tiles = balanceTiles(query.report, accounts, memberReceiptsOn);
  if (!tiles.active.length && !tiles.inactive.length) {
    return <EmptyState title="No cash or bank account yet" />;
  }

  return (
    <Stack gap={3} as="section" aria-label="Balances">
      {/* Two tiles a row from 360px, one below. */}
      <Grid templateColumns="repeat(auto-fill, minmax(150px, 1fr))" gap={3}>
        {tiles.active.map((tile) => (
          <Tile key={tile.accountId} tile={tile} />
        ))}
      </Grid>

      {(tiles.inactive.length > 0 || tiles.showTotal || tiles.heldKobo !== undefined) && (
        <NavGroup>
          {tiles.inactive.length > 0 && (
            <NavRow
              label={`Inactive accounts (${tiles.inactive.length})`}
              ariaExpanded={showInactive}
              onClick={() => setShowInactive((open) => !open)}
            />
          )}
          {showInactive &&
            tiles.inactive.map((tile) => (
              <Flex key={tile.accountId} justify="space-between" gap={3} px={4} py={2} bg="bg.panel">
                <Text color="fg.muted">{tile.name}</Text>
                <Text css={{ fontVariantNumeric: "tabular-nums" }}>{formatReportKobo(tile.balanceKobo)}</Text>
              </Flex>
            ))}
          {tiles.showTotal && (
            <Flex justify="space-between" align="center" gap={3} px={4} py={3} bg="bg.panel" minH="52px">
              <Text color="fg.muted">
                {tiles.totalKobo === null
                  ? "Total unknown until every account's opening is verified"
                  : tiles.totalIncludesInactive
                    ? "Total in cash and bank (includes inactive accounts)"
                    : "Total in cash and bank"}
              </Text>
              {tiles.totalKobo !== null && (
                <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatReportKobo(tiles.totalKobo)}
                </Text>
              )}
            </Flex>
          )}
          {tiles.heldKobo !== undefined && (
            <NavRow
              label="Held for members"
              caption="Members' money, not income"
              value={formatReportKobo(tiles.heldKobo)}
              onClick={onOpenHeld}
            />
          )}
        </NavGroup>
      )}
    </Stack>
  );
};

export default BalanceTiles;
