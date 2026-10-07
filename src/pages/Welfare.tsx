import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  SimpleGrid,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { format, isValid, parseISO } from "date-fns";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import { usePermissions } from "rbac/usePermissions";
import { useOrgPresentation, useTerms } from "hooks/useOrgPresentation";
import { useMemberModel } from "hooks/useMemberModel";
import { useWelfareOverview } from "hooks/useWelfareOverview";
import { useWelfareBirthdays } from "hooks/useWelfareBirthdays";
import { useWelfareFollowUps } from "hooks/useWelfareFollowUps";
import LoadingSpinner from "components/LoadingSpinner";
import WelfareSummaryCards from "components/welfare/WelfareSummaryCards";
import AttendanceInsightCard, {
  InsightVariant,
} from "components/welfare/AttendanceInsightCard";
import {
  CurrentlyAwaySection,
  ReturningSoonSection,
} from "components/welfare/AvailabilitySection";
import BirthdaySnapshot from "components/welfare/BirthdaySnapshot";
import WelfareFollowUpSection from "components/welfare/followUps/WelfareFollowUpSection";
import WelfareFollowUpDialog, {
  WelfareFollowUpDialogRequest,
} from "components/welfare/followUps/WelfareFollowUpDialog";
import WelfareFollowUpMemberHistory, {
  WelfareFollowUpMemberHistoryRequest,
} from "components/welfare/followUps/WelfareFollowUpMemberHistory";
import { followUpPrefillReason } from "components/welfare/followUps/followUpPresentation";
import { WelfareFollowUp } from "components/welfare/followUps/types";
import { lowerTerm } from "helpers/organisationPresentation";
import { hasDobDateField } from "helpers/birthday";
import {
  WelfareInsight,
  WelfareOverview,
} from "components/welfare/welfareTypes";

const periodLabel = (value: string): string => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM") : value;
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <Box as="section" aria-label={title} mt={8}>
    <Heading size="md" mb={3}>
      {title}
    </Heading>
    {children}
  </Box>
);

const EmptyState = ({ children }: { children: ReactNode }) => (
  <Text color="gray.500">{children}</Text>
);

/** Exact periods, never a bare percentage change without its context. */
const ReviewWindowPanel = ({ overview }: { overview: WelfareOverview }) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const days = overview.settings.reviewWindowDays;
  return (
    <Box mt={6} p={4} borderWidth="1px" borderRadius="lg" bg={cardBg}>
      <Heading size="sm">{`Review window: ${days} days`}</Heading>
      <Text fontSize="sm" color="gray.500" mb={2}>
        {`Last ${days} days vs previous ${days} days`}
      </Text>
      <Text fontSize="sm">
        {`Recent: ${periodLabel(
          overview.periods.recent.fromDate,
        )} – ${periodLabel(overview.periods.recent.toDate)}`}
      </Text>
      <Text fontSize="sm">
        {`Previous: ${periodLabel(
          overview.periods.previous.fromDate,
        )} – ${periodLabel(overview.periods.previous.toDate)}`}
      </Text>
    </Box>
  );
};

const InsightGrid = ({
  insights,
  variant,
  periods,
  followUpCounts,
  onAddFollowUp,
}: {
  insights: WelfareInsight[];
  variant: InsightVariant;
  periods: WelfareOverview["periods"];
  /** Open follow-up counts by memberId (welfare.view only). */
  followUpCounts?: Map<string, number>;
  onAddFollowUp?: (insight: WelfareInsight, variant: InsightVariant) => void;
}) => (
  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
    {insights.map((insight) => (
      <AttendanceInsightCard
        key={insight.memberId}
        insight={insight}
        variant={variant}
        previousFromDate={periods.previous.fromDate}
        recentToDate={periods.recent.toDate}
        openFollowUpCount={followUpCounts?.get(insight.memberId)}
        onAddFollowUp={
          onAddFollowUp ? () => onAddFollowUp(insight, variant) : undefined
        }
      />
    ))}
  </SimpleGrid>
);

/**
 * Phase 7A Welfare & Engagement: read-only insight derived entirely from the
 * backend. This page renders the backend's arrays as returned, exposes the
 * exact comparison periods, and never classifies members itself.
 */
const Welfare = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  const terms = useTerms();
  const { has } = usePermissions();
  const { isFeatureVisible } = useOrgPresentation();
  const pageBg = useColorModeValue("gray.50", "gray.800");

  const { overview, isLoading, isError } = useWelfareOverview(organisationId);

  // Birthdays are an optional, independent snapshot: they need members.view,
  // the birthdays module and a configured `dob` date field, and the Birthday
  // API is never called without all three.
  const birthdaysPermitted =
    has("members.view") && isFeatureVisible("birthdays");
  const { fields } = useMemberModel(organisationId, {
    enabled: birthdaysPermitted,
  });
  const showBirthdays = birthdaysPermitted && hasDobDateField(fields);
  const birthdays = useWelfareBirthdays(organisationId, {
    enabled: showBirthdays,
  });
  // A failed birthday query hides its card rather than showing a fake zero.
  const birthdayCount =
    showBirthdays && birthdays.isSuccess ? birthdays.members.length : null;

  // Phase 7C: private follow-ups are separately permissioned. Without
  // welfare.view no follow-up request is made and no note text can render.
  const canViewFollowUps = has("welfare.view");
  const canManageFollowUps = canViewFollowUps && has("welfare.manage");

  const followUps = useWelfareFollowUps(organisationId, {
    enabled: canViewFollowUps,
  });

  // Dialog/history requests capture the organisation they were opened under,
  // so an organisation switch can never show Org A notes under Org B or let a
  // stale draft submit into the wrong tenant.
  const [followUpDialog, setFollowUpDialog] =
    useState<WelfareFollowUpDialogRequest | null>(null);
  const [memberHistory, setMemberHistory] =
    useState<WelfareFollowUpMemberHistoryRequest | null>(null);

  useEffect(() => {
    setFollowUpDialog(null);
    setMemberHistory(null);
  }, [organisationId]);

  const openFollowUpCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!canViewFollowUps) return counts;
    followUps.followUps.forEach((record) => {
      if (record.workflowStatus !== "open") return;
      counts.set(record.memberId, (counts.get(record.memberId) ?? 0) + 1);
    });
    return counts;
  }, [followUps.followUps, canViewFollowUps]);

  const openInsightFollowUp = (
    insight: WelfareInsight,
    variant: InsightVariant,
  ) => {
    if (!overview) return;
    setFollowUpDialog({
      mode: "create",
      organisationId,
      manual: false,
      source: variant,
      memberId: insight.memberId,
      memberName: insight.name,
      sourceSignals: insight.signals,
      sourceAsOf: overview.asOf,
      reason: followUpPrefillReason(variant, insight),
    });
  };

  const closeFollowUp = (record: WelfareFollowUp) =>
    followUps.update(
      record.id,
      { expectedRevision: record.revision, workflowStatus: "closed" },
      { onSuccess: () => toast.success("Follow-up closed") },
    );

  const reopenFollowUp = (record: WelfareFollowUp) =>
    followUps.update(
      record.id,
      { expectedRevision: record.revision, workflowStatus: "open" },
      { onSuccess: () => toast.success("Follow-up reopened") },
    );

  return (
    <RequirePermission perm="attendance.view">
      <Box minH="100vh" bg={pageBg}>
        <Box p={4} maxW="6xl" mx="auto">
          {isLoading && (
            <LoadingSpinner h="30vh" text="Loading Welfare & Engagement..." />
          )}

          {!isLoading && isError && (
            <Text color="red.500">
              Error loading Welfare & Engagement insights.
            </Text>
          )}

          {!isLoading && !isError && overview && (
            <>
              <WelfareSummaryCards
                summary={overview.summary}
                birthdayCount={birthdayCount}
              />
              <ReviewWindowPanel overview={overview} />

              {canViewFollowUps && (
                <WelfareFollowUpSection
                  key={organisationId}
                  summary={followUps.summary}
                  records={followUps.followUps}
                  asOf={followUps.asOf}
                  isLoading={followUps.isLoading}
                  isError={followUps.isError}
                  canManage={canManageFollowUps}
                  isSaving={followUps.isSaving}
                  onAdd={() =>
                    setFollowUpDialog({
                      mode: "create",
                      organisationId,
                      manual: true,
                    })
                  }
                  onEdit={(record) =>
                    setFollowUpDialog({ mode: "edit", organisationId, record })
                  }
                  onCloseRecord={closeFollowUp}
                  onReopen={reopenFollowUp}
                  onViewHistory={(record) =>
                    setMemberHistory({
                      organisationId,
                      memberId: record.memberId,
                      memberName: record.member?.name ?? null,
                    })
                  }
                />
              )}

              <Section title="Needs Check-in">
                {overview.attention.length === 0 ? (
                  <EmptyState>
                    {`No ${lowerTerm(
                      terms.memberPlural,
                    )} currently meet the check-in signals for this review window.`}
                  </EmptyState>
                ) : (
                  <InsightGrid
                    insights={overview.attention}
                    variant="attention"
                    periods={overview.periods}
                    followUpCounts={
                      canViewFollowUps ? openFollowUpCounts : undefined
                    }
                    onAddFollowUp={
                      canManageFollowUps ? openInsightFollowUp : undefined
                    }
                  />
                )}
              </Section>

              <Section title="Communicated">
                {overview.communicated.length === 0 ? (
                  <EmptyState>
                    {`No ${lowerTerm(
                      terms.memberPlural,
                    )} had a communicated reduction in physical presence for this comparison period.`}
                  </EmptyState>
                ) : (
                  <InsightGrid
                    insights={overview.communicated}
                    variant="communicated"
                    periods={overview.periods}
                    followUpCounts={
                      canViewFollowUps ? openFollowUpCounts : undefined
                    }
                    onAddFollowUp={
                      canManageFollowUps ? openInsightFollowUp : undefined
                    }
                  />
                )}
              </Section>

              <Section title="Encouragement">
                {overview.encouragement.length === 0 ? (
                  <EmptyState>
                    No major improvement signal yet for this comparison period.
                  </EmptyState>
                ) : (
                  <InsightGrid
                    insights={overview.encouragement}
                    variant="encouragement"
                    periods={overview.periods}
                    followUpCounts={
                      canViewFollowUps ? openFollowUpCounts : undefined
                    }
                    onAddFollowUp={
                      canManageFollowUps ? openInsightFollowUp : undefined
                    }
                  />
                )}
              </Section>

              <CurrentlyAwaySection items={overview.currentlyAway} />
              <ReturningSoonSection
                items={overview.returningSoon}
                days={overview.settings.returningSoonDays}
              />

              {showBirthdays && (
                <BirthdaySnapshot
                  members={birthdays.members}
                  range={{
                    fromDate: birthdays.fromDate,
                    toDate: birthdays.toDate,
                  }}
                  asOf={birthdays.asOf}
                  isFetching={birthdays.isFetching}
                  isError={birthdays.isError}
                />
              )}
            </>
          )}

          {/* Independent query: an overview failure must not hide birthdays
              that loaded fine. */}
          {!isLoading && isError && showBirthdays && (
            <Box mt={6}>
              <BirthdaySnapshot
                members={birthdays.members}
                range={{
                  fromDate: birthdays.fromDate,
                  toDate: birthdays.toDate,
                }}
                asOf={birthdays.asOf}
                isFetching={birthdays.isFetching}
                isError={birthdays.isError}
              />
            </Box>
          )}

          {/* The private follow-up editor only ever renders for the exact
              organisation it was opened under — a switch unmounts it. */}
          {followUpDialog &&
            followUpDialog.organisationId === organisationId && (
              <WelfareFollowUpDialog
                key={
                  followUpDialog.mode === "edit"
                    ? `edit-${followUpDialog.record.id}`
                    : `create-${
                        followUpDialog.manual ? "manual" : followUpDialog.source
                      }`
                }
                request={followUpDialog}
                asOf={followUps.asOf}
                canManageAssignedOfficers={has("officers.view")}
                onClose={() => setFollowUpDialog(null)}
                create={followUps.create}
                update={followUps.update}
                archive={followUps.archive}
                isSaving={followUps.isSaving}
              />
            )}

          {memberHistory && memberHistory.organisationId === organisationId && (
            <WelfareFollowUpMemberHistory
              request={memberHistory}
              onClose={() => setMemberHistory(null)}
            />
          )}
        </Box>
      </Box>
    </RequirePermission>
  );
};

export default Welfare;
