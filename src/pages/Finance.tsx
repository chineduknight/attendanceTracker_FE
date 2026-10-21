import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Tabs } from "@chakra-ui/react";
import BooksTab from "components/finance/BooksTab";
import CollectTab from "components/finance/CollectTab";
import ObligationsTab from "components/finance/ObligationsTab";
import StartDatesTab from "components/finance/StartDatesTab";
import { defaultObligationId } from "helpers/financeCompliance";
import {
  FINANCE_TABS,
  FinanceTab,
  booksDepthOf,
  readFinanceTab,
  writeFinanceTab,
} from "helpers/booksNavigation";
import { useObligations } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import useGlobalStore from "zStore";
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";

const TAB_LABELS: Record<FinanceTab, string> = {
  collect: "Collect",
  obligations: "Obligations",
  "start-dates": "Start dates",
  books: "Books",
};

const FinanceWorkspace = ({ organisationId }: { organisationId: string }) => {
  const canManage = usePermissions().has("finance.manage");
  // The tab lives in the URL so Books can keep its screens there too (Back
  // and Forward move through them). Switching tabs replaces the entry, so
  // Back from Collect, Obligations or Start dates leaves Finance as before.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = readFinanceTab(searchParams);
  // Leaving Books from one of its inner screens first steps back over every
  // entry Books pushed, then replaces the entry it opened on. Otherwise Back
  // from the new tab would land on an earlier Books screen.
  const leavingBooksFor = useRef<FinanceTab | null>(null);
  const setTab = (next: FinanceTab) => {
    const depth = booksDepthOf(location.state);
    if (tab === "books" && next !== "books" && depth > 0) {
      leavingBooksFor.current = next;
      navigate(-depth);
      return;
    }
    setSearchParams(writeFinanceTab(searchParams, next), { replace: true });
  };
  useEffect(() => {
    const next = leavingBooksFor.current;
    if (next === null || booksDepthOf(location.state) > 0) return;
    leavingBooksFor.current = null;
    setSearchParams(writeFinanceTab(searchParams, next), { replace: true });
  }, [location, searchParams, setSearchParams]);
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
              <Button colorPalette="teal" onClick={() => setTab("obligations")}>
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
          value={tab}
          onValueChange={({ value }) => setTab(value as FinanceTab)}
          variant="subtle"
          colorPalette="teal"
          fitted
          lazyMount
          unmountOnExit
        >
          <Tabs.List bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="full" p={1} mb={4}>
            {FINANCE_TABS.map((value) => (
              <Tabs.Trigger
                key={value}
                value={value}
                fontSize="sm"
                px={2}
                minH="44px"
                borderRadius="full"
                color="fg.muted"
                // Selected: the solid accent, readable in both modes (the
                // subtle teal is near-black in dark mode).
                _selected={{ bg: "colorPalette.solid", color: "colorPalette.contrast" }}
              >
                {TAB_LABELS[value]}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="collect" p={0}>
            {collect()}
          </Tabs.Content>
          <Tabs.Content value="obligations" p={0}>
            {obligationsGate() ?? (
              <ObligationsTab
                organisationId={organisationId}
                obligations={obligations}
                onOpen={(id) => {
                  setChosenId(id);
                  setTab("collect");
                }}
              />
            )}
          </Tabs.Content>
          <Tabs.Content value="start-dates" p={0}>
            <StartDatesTab organisationId={organisationId} />
          </Tabs.Content>
          <Tabs.Content value="books" p={0}>
            <BooksTab organisationId={organisationId} />
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
  const [, setSearchParams] = useSearchParams();
  // The tab and Books screen live in the URL, which survives the remount.
  // Clear them when the organisation changes so Organisation B starts on
  // Collect, as it always has.
  const shownOrgId = useRef(organisation.id);
  useEffect(() => {
    if (shownOrgId.current === organisation.id) return;
    shownOrgId.current = organisation.id;
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [organisation.id, setSearchParams]);

  return <FinanceWorkspace key={organisation.id} organisationId={organisation.id} />;
};

export default Finance;
