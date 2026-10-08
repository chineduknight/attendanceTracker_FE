import { useMemo, useState } from "react";
import {
  Box,
  SimpleGrid,
  Tab,
  TabList,
  Tabs,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import InsightGrid from "components/welfare/InsightGrid";
import type { InsightVariant } from "components/welfare/AttendanceInsightCard";
import {
  WelfareInsight,
  WelfareOverview,
} from "components/welfare/welfareTypes";
import { WelfareFollowUp } from "components/welfare/followUps/types";
import { attentionProgress } from "helpers/welfareReview";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";

type ProgressView = "pending" | "followedUp" | "all";
const VIEWS: readonly ProgressView[] = ["pending", "followedUp", "all"];

interface NeedsCheckInProgressProps {
  /** The backend's attention list for this review — never altered here. */
  attention: readonly WelfareInsight[];
  periods: WelfareOverview["periods"];
  /** The review date the overview was requested for. */
  asOf: string;
  followUps: readonly WelfareFollowUp[];
  openFollowUpCounts: ReadonlyMap<string, number>;
  onAddFollowUp?: (insight: WelfareInsight, variant: InsightVariant) => void;
}

const Counter = ({ label, value }: { label: string; value: number }) => {
  const bg = useColorModeValue("white", "gray.700");
  return (
    <Box
      role="group"
      aria-label={label}
      borderWidth="1px"
      borderRadius="lg"
      px={3}
      py={2}
      bg={bg}
    >
      <Text fontSize="xl" fontWeight="bold">
        {value}
      </Text>
      <Text fontSize="sm" color="gray.500">
        {label}
      </Text>
    </Box>
  );
};

/**
 * Operational Welfare progress for the attendance-derived Needs Check-in list
 * (welfare.view only). Flagged is the backend list length; Followed Up and
 * Pending only partition it by linked follow-ups for this review date. The
 * attendance signal is never suppressed — a followed-up member still shows
 * "Needs check-in", plus "Follow-up logged".
 */
const NeedsCheckInProgress = ({
  attention,
  periods,
  asOf,
  followUps,
  openFollowUpCounts,
  onAddFollowUp,
}: NeedsCheckInProgressProps) => {
  const terms = useTerms();
  const [view, setView] = useState<ProgressView>("pending");
  const progress = useMemo(
    () => attentionProgress(attention, followUps, asOf),
    [attention, followUps, asOf],
  );

  const lists: Record<ProgressView, readonly WelfareInsight[]> = {
    pending: progress.pending,
    followedUp: progress.followedUp,
    all: progress.all,
  };
  const shown = lists[view];

  return (
    <>
      <SimpleGrid columns={3} spacing={3} mb={4} maxW="md">
        <Counter label="Flagged" value={progress.all.length} />
        <Counter label="Followed Up" value={progress.followedUp.length} />
        <Counter label="Pending" value={progress.pending.length} />
      </SimpleGrid>

      <Tabs
        variant="soft-rounded"
        colorScheme="orange"
        size="sm"
        index={VIEWS.indexOf(view)}
        onChange={(index) => setView(VIEWS[index])}
        mb={4}
      >
        <TabList flexWrap="wrap" gap={2}>
          <Tab>{`Pending ${progress.pending.length}`}</Tab>
          <Tab>{`Followed Up ${progress.followedUp.length}`}</Tab>
          <Tab>{`All ${progress.all.length}`}</Tab>
        </TabList>
      </Tabs>

      {shown.length === 0 ? (
        <Text color="gray.500">
          {view === "pending"
            ? `All Needs Check-in ${lowerTerm(
                terms.memberPlural,
              )} for this review have been followed up.`
            : "No follow-ups have been logged for this review yet."}
        </Text>
      ) : (
        <InsightGrid
          insights={shown}
          variant="attention"
          periods={periods}
          followUpCounts={openFollowUpCounts}
          followedUpIds={progress.followedUpIds}
          onAddFollowUp={onAddFollowUp}
        />
      )}
    </>
  );
};

export default NeedsCheckInProgress;
