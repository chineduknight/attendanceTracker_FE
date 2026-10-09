import { useState } from "react";
import { Button, Tabs } from "@chakra-ui/react";
import CollectTab from "components/finance/CollectTab";
import ObligationsTab from "components/finance/ObligationsTab";
import StartDatesTab from "components/finance/StartDatesTab";
import { defaultObligationId } from "helpers/financeCompliance";
import { useObligations } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import useGlobalStore from "zStore";
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";

const TABS = ["Collect", "Obligations", "Start dates"] as const;
const COLLECT = 0;
const OBLIGATIONS = 1;

const FinanceWorkspace = ({ organisationId }: { organisationId: string }) => {
  const canManage = usePermissions().has("finance.manage");
  const [tabIndex, setTabIndex] = useState(COLLECT);
  const [chosenId, setChosenId] = useState("");
  const { obligations, hasData, isLoading, isError, error, refetch } =
    useObligations(organisationId);
  // A failed load is not "nothing set up yet": say so and offer a retry.
  const loadFailed = isError && !hasData;

  // A chosen obligation that has since been deleted falls back to the default.
  const obligationId = obligations.some((o) => o.id === chosenId)
    ? chosenId
    : defaultObligationId(obligations);

  // Both tabs read the one obligations query. Until it has data, neither
  // may treat `[]` as "nothing set up": show the loader or the load error
  // instead. Cached obligations survive a failed background refetch.
  const obligationsGate = () => {
    if (isLoading) {
      return <PageLoader h="30vh" label="Loading obligations..." />;
    }
    if (loadFailed) {
      return (
        <ErrorState
          title="Couldn't load obligations"
          description={errorMessage(error)}
          onRetry={() => refetch()}
        />
      );
    }
    return null;
  };

  const collect = () => {
    const gate = obligationsGate();
    if (gate) return gate;
    if (!obligations.length) {
      return (
        <EmptyState
          title="Nothing to collect yet"
          description="Set up monthly dues or a one-off levy first."
          action={
            canManage && (
              <Button colorPalette="teal" onClick={() => setTabIndex(OBLIGATIONS)}>
                Set up an obligation
              </Button>
            )
          }
        />
      );
    }
    return (
      <CollectTab
        organisationId={organisationId}
        obligations={obligations}
        obligationId={obligationId}
        onObligationChange={setChosenId}
      />
    );
  };

  return (
    <PageContainer width="content">
        {/* lazyMount + unmountOnExit = v2's isLazy: a tab mounts when opened and
            unmounts when left, so its local state resets as before. */}
        <Tabs.Root
          value={String(tabIndex)}
          onValueChange={({ value }) => setTabIndex(Number(value))}
          variant="subtle"
          colorPalette="teal"
          fitted
          lazyMount
          unmountOnExit
        >
          <Tabs.List bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="full" p={1} mb={4}>
            {TABS.map((label, index) => (
              <Tabs.Trigger
                key={label}
                value={String(index)}
                fontSize="sm"
                px={2}
                minH="44px"
                borderRadius="full"
                color="fg.muted"
                // Selected: the solid accent, readable in both modes (the
                // subtle teal is near-black in dark mode).
                _selected={{ bg: "colorPalette.solid", color: "colorPalette.contrast" }}
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value={String(COLLECT)} p={0}>
            {collect()}
          </Tabs.Content>
          <Tabs.Content value={String(OBLIGATIONS)} p={0}>
            {obligationsGate() ?? (
              <ObligationsTab
                organisationId={organisationId}
                obligations={obligations}
                onOpen={(id) => {
                  setChosenId(id);
                  setTabIndex(COLLECT);
                }}
              />
            )}
          </Tabs.Content>
          <Tabs.Content value="2" p={0}>
            <StartDatesTab organisationId={organisationId} />
          </Tabs.Content>
        </Tabs.Root>
    </PageContainer>
  );
};

/**
 * Finance owns no selection state itself: `FinanceWorkspace` is keyed by the
 * organisation id so switching organisations remounts it, clearing the
 * chosen obligation, open member sheet, selections and tab before
 * Organisation B can use an Organisation A id.
 */
const Finance = () => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return <FinanceWorkspace key={organisation.id} organisationId={organisation.id} />;
};

export default Finance;
