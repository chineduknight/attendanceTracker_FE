import { ReactNode } from "react";
import {
  Box,
  Heading,
  SimpleGrid,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { format, isValid, parseISO } from "date-fns";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import { usePermissions } from "rbac/usePermissions";
import { useOrgPresentation, useTerms } from "hooks/useOrgPresentation";
import { useMemberModel } from "hooks/useMemberModel";
import { useWelfareOverview } from "hooks/useWelfareOverview";
import { useWelfareBirthdays } from "hooks/useWelfareBirthdays";
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
        {`Recent: ${periodLabel(overview.periods.recent.fromDate)} – ${periodLabel(
          overview.periods.recent.toDate,
        )}`}
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
}: {
  insights: WelfareInsight[];
  variant: InsightVariant;
  periods: WelfareOverview["periods"];
}) => (
  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
    {insights.map((insight) => (
      <AttendanceInsightCard
        key={insight.memberId}
        insight={insight}
        variant={variant}
        previousFromDate={periods.previous.fromDate}
        recentToDate={periods.recent.toDate}
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
        </Box>
      </Box>
    </RequirePermission>
  );
};

export default Welfare;
