import { SimpleGrid } from "@chakra-ui/react";
import AttendanceInsightCard, {
  InsightVariant,
} from "components/welfare/AttendanceInsightCard";
import {
  WelfareInsight,
  WelfareOverview,
} from "components/welfare/welfareTypes";

interface InsightGridProps {
  insights: readonly WelfareInsight[];
  variant: InsightVariant;
  periods: WelfareOverview["periods"];
  /** Open follow-up counts by memberId (welfare.view only). */
  followUpCounts?: ReadonlyMap<string, number>;
  /** Members whose review signal already has a linked follow-up. */
  followedUpIds?: ReadonlySet<string>;
  onAddFollowUp?: (insight: WelfareInsight, variant: InsightVariant) => void;
}

const InsightGrid = ({
  insights,
  variant,
  periods,
  followUpCounts,
  followedUpIds,
  onAddFollowUp,
}: InsightGridProps) => (
  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
    {insights.map((insight) => (
      <AttendanceInsightCard
        key={insight.memberId}
        insight={insight}
        variant={variant}
        previousFromDate={periods.previous.fromDate}
        recentToDate={periods.recent.toDate}
        openFollowUpCount={followUpCounts?.get(insight.memberId)}
        followUpLogged={followedUpIds?.has(insight.memberId)}
        onAddFollowUp={
          onAddFollowUp ? () => onAddFollowUp(insight, variant) : undefined
        }
      />
    ))}
  </SimpleGrid>
);

export default InsightGrid;
