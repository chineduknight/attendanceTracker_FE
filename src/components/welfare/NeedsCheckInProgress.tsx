import { useMemo, useState } from "react";
import { Box, Progress, Tab, TabList, Tabs, Text } from "@chakra-ui/react";
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

/**
 * Operational Welfare progress for the attendance-derived Needs Check-in list
 * (welfare.view only). All is the backend list length; Followed Up and
 * Pending only partition it by linked follow-ups for this review date. The
 * tabs carry the counts, with one "N of M followed up" line above them. The
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
      <Box mb={3} maxW="md">
        <Text fontSize="sm" mb={1}>
          {`${progress.followedUp.length} of ${progress.all.length} followed up`}
        </Text>
        {/* The sentence above is the accessible value; the bar is visual. */}
        <Progress.Root
          aria-hidden="true"
          value={progress.followedUp.length}
          max={Math.max(progress.all.length, 1)}
          size="xs"
          colorPalette="green"
          borderRadius="full">
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      </Box>

      <Tabs.Root
        variant='subtle'
        colorPalette="orange"
        size="sm"
        value={VIEWS.indexOf(view)}
        onValueChange={(index) => setView(VIEWS[index])}
        mb={4}
      >
        <Tabs.List flexWrap="wrap" gap={2}>
          <Tab>{`Pending ${progress.pending.length}`}</Tab>
          <Tab>{`Followed Up ${progress.followedUp.length}`}</Tab>
          <Tab>{`All ${progress.all.length}`}</Tab>
        </Tabs.List>
      </Tabs.Root>

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
