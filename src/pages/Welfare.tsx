import { ReactNode, useEffect, useMemo, useState } from "react";
import { Box, Heading, Text, useColorModeValue } from "@chakra-ui/react";
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
import { useWelfareReviewDate } from "hooks/useWelfareReviewDate";
import LoadingSpinner from "components/LoadingSpinner";
import WelfareSummaryCards from "components/welfare/WelfareSummaryCards";
import WelfareReviewControls from "components/welfare/WelfareReviewControls";
import InsightGrid from "components/welfare/InsightGrid";
import NeedsCheckInProgress from "components/welfare/NeedsCheckInProgress";
import type { InsightVariant } from "components/welfare/AttendanceInsightCard";
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
import { hasDobDateField, localBusinessDate } from "helpers/birthday";
import {
  effectiveWelfareStatus,
  statusesParam,
  welfareStatusScope,
} from "helpers/welfareReview";
import {
  WelfareInsight,
  WelfareOverview,
} from "components/welfare/welfareTypes";
import {
  sectionTargetProps,
  WelfareSectionKey,
} from "components/welfare/welfareSections";

const periodLabel = (value: string): string => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM") : value;
};

const Section = ({
  title,
  target,
  children,
}: {
  title: string;
  /** Set when a summary tile jumps here. */
  target?: WelfareSectionKey;
  children: ReactNode;
}) => (
  <Box
    as="section"
    aria-label={title}
    mt={8}
    {...(target ? sectionTargetProps(target) : {})}
  >
    <Heading size="md" mb={3}>
      {title}
    </Heading>
    {children}
  </Box>
);

const EmptyState = ({ children }: { children: ReactNode }) => (
  <Text color="gray.500">{children}</Text>
);

/**
 * Exact periods, never a bare percentage change without its context — on one
 * line so the tiles and Needs Check-in stay near the top on a phone.
 */
const ReviewWindowCaption = ({ overview }: { overview: WelfareOverview }) => {
  const days = overview.settings.reviewWindowDays;
  const { recent, previous } = overview.periods;
  return (
    <Text fontSize="sm" color="gray.500" mb={3}>
      {`Review window: last ${days} days (${periodLabel(
        recent.fromDate,
      )} – ${periodLabel(recent.toDate)}) vs previous ${days} days (${periodLabel(
        previous.fromDate,
      )} – ${periodLabel(previous.toDate)})`}
    </Text>
  );
};

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

  const { asOf, today, isToday, setAsOf, resetToToday } =
    useWelfareReviewDate();

  // The member model (members.view) supplies both the member-status scope and
  // the birthday `dob` check. Without members.view no model request is made
  // and the overview covers every status.
  const canReadMemberModel = has("members.view");
  const memberModel = useMemberModel(organisationId, {
    enabled: canReadMemberModel,
  });
  const { fields } = memberModel;
  const statusScope = useMemo(() => welfareStatusScope(fields), [fields]);
  // Wait for the model so the first overview request already carries the
  // Active default instead of fetching All and then refetching. A failed
  // model read falls back to All rather than blocking Welfare.
  const statusScopeReady = !canReadMemberModel || !memberModel.isLoading;

  // The selection remembers which organisation it was made under, so a
  // switch (or an option removed from the model) falls back to that
  // organisation's Active default, or All.
  const [statusSelection, setStatusSelection] = useState<{
    organisationId: string;
    value: string;
  } | null>(null);
  const status = effectiveWelfareStatus(
    statusSelection,
    organisationId,
    statusScope,
  );

  const { overview, isLoading, isError } = useWelfareOverview(organisationId, {
    asOf,
    status: statusesParam(status),
    enabled: statusScopeReady,
  });

  // Birthdays are an optional, independent snapshot: they need members.view,
  // the birthdays module and a configured `dob` date field, and the Birthday
  // API is never called without all three.
  const birthdaysPermitted =
    canReadMemberModel && isFeatureVisible("birthdays");
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
  // The manual picker reads the canonical member list, which requires
  // members.view. Insight-based follow-ups already know their member and stay
  // available to a Welfare manager without members.view.
  const canCreateManualFollowUp = canManageFollowUps && has("members.view");

  // The follow-up list shares the review date so due/overdue state and
  // Needs Check-in progress describe the same review as the overview.
  const followUps = useWelfareFollowUps(organisationId, {
    asOf,
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
      // Progress matches on this exact review date.
      sourceAsOf: asOf,
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
          <WelfareReviewControls
            asOf={asOf}
            maxDate={today}
            isToday={isToday}
            onAsOfChange={setAsOf}
            onToday={resetToToday}
            statusOptions={statusScope.options}
            status={status}
            onStatusChange={(value) =>
              setStatusSelection({ organisationId, value })
            }
          />

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
              <ReviewWindowCaption overview={overview} />
              <WelfareSummaryCards
                summary={overview.summary}
                birthdayCount={birthdayCount}
              />

              {canViewFollowUps && (
                <WelfareFollowUpSection
                  key={organisationId}
                  summary={followUps.summary}
                  records={followUps.followUps}
                  asOf={followUps.asOf}
                  isLoading={followUps.isLoading}
                  isError={followUps.isError}
                  canManage={canManageFollowUps}
                  canCreateManualFollowUp={canCreateManualFollowUp}
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

              <Section title="Needs Check-in" target="attention">
                {overview.attention.length === 0 ? (
                  <EmptyState>
                    {`No ${lowerTerm(
                      terms.memberPlural,
                    )} currently meet the check-in signals for this review window.`}
                  </EmptyState>
                ) : canViewFollowUps && followUps.isSuccess ? (
                  <NeedsCheckInProgress
                    // A new organisation/review/scope starts on Pending.
                    key={`${organisationId}:${asOf}:${status}`}
                    attention={overview.attention}
                    periods={overview.periods}
                    asOf={asOf}
                    followUps={followUps.followUps}
                    openFollowUpCounts={openFollowUpCounts}
                    onAddFollowUp={
                      canManageFollowUps ? openInsightFollowUp : undefined
                    }
                  />
                ) : canViewFollowUps && !followUps.isError ? (
                  // Never show progress from another scope, or an
                  // everyone-pending guess, while this review's records load.
                  <EmptyState>Loading follow-up progress...</EmptyState>
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

              <Section title="Encouragement" target="encouragement">
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
                // The record date is when Welfare acted, not the review date.
                asOf={localBusinessDate()}
                memberStatusOptions={statusScope.options}
                defaultMemberStatus={status}
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
