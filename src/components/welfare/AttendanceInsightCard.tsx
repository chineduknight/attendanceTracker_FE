import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Link,
  List,
  ListItem,
  Stack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { BEHAVIOR_META } from "helpers/attendanceStatuses";
import { lowerTerm } from "helpers/organisationPresentation";
import { convertParamsToString } from "helpers/stringManipulations";
import { useTerms } from "hooks/useOrgPresentation";
import { PROTECTED_PATHS } from "routes/pagePath";
import { WelfareInsight } from "components/welfare/welfareTypes";

export type InsightVariant = "attention" | "communicated" | "encouragement";

interface AttendanceInsightCardProps {
  insight: WelfareInsight;
  variant: InsightVariant;
  /** Comparison horizon, so member analytics opens on the same periods. */
  previousFromDate: string;
  recentToDate: string;
  /**
   * Open follow-ups for this member (visible with welfare.view only).
   * Presentation hint — it never suppresses the insight. Undefined hides it.
   */
  openFollowUpCount?: number;
  /**
   * Welfare has logged at least one follow-up linked to this review's signal.
   * The attendance badge stays: the signal itself is still true.
   */
  followUpLogged?: boolean;
  /** Manage-only quick action; absent for view-only officers. */
  onAddFollowUp?: () => void;
}

const VARIANT_META: Record<
  InsightVariant,
  { label: string; colorScheme: string }
> = {
  attention: { label: "Needs check-in", colorScheme: "orange" },
  communicated: { label: "Communicated", colorScheme: "blue" },
  encouragement: { label: "Improving 🎉", colorScheme: "green" },
};

const dateLabel = (value: string): string => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM") : value;
};

const percent = (value: number): string => `${value}%`;

/** Both periods on one line; the words keep it readable without the arrow. */
const presenceSummary = (insight: WelfareInsight): string =>
  `Physical presence: previous ${percent(
    insight.previous.presenceRate,
  )} → recent ${percent(insight.recent.presenceRate)}`;

/**
 * The change badge: red for a drop, green for a rise. The arrow and the
 * "pts" text carry the direction, so meaning never relies on colour alone.
 */
const ChangeBadge = ({ points }: { points: number }) => (
  <Badge
    colorScheme={points < 0 ? "red" : points > 0 ? "green" : "gray"}
    textTransform="none"
    fontSize="xs"
    ml={1}
    verticalAlign="middle"
  >
    {`${points < 0 ? "↓" : "↑"} ${Math.abs(points)} pts`}
  </Badge>
);

const recentCounts = (insight: WelfareInsight): string =>
  `Recent: ${(["present", "excused", "absent"] as const)
    .map(
      (behavior) =>
        `${insight.recent[behavior]} ${BEHAVIOR_META[behavior].label}`,
    )
    .join(" · ")}`;

/** Why the member appears. Signal keys come from the backend untouched. */
const attentionReasons = (insight: WelfareInsight): string[] => {
  const reasons: string[] = [];
  insight.signals.forEach((signal) => {
    if (signal === "presence_drop_with_absence") {
      reasons.push("Physical presence reduced, with unexplained absences");
    }
    if (signal === "consecutive_absence") {
      reasons.push(
        `${insight.consecutiveAbsent} consecutive unexplained absences`,
      );
    }
  });
  return reasons;
};

const reasonsFor = (
  insight: WelfareInsight,
  variant: InsightVariant,
): string[] => {
  if (variant === "attention") return attentionReasons(insight);
  if (variant === "communicated") {
    return ["Physical presence reduced, but communicated"];
  }
  return ["Physical presence improved"];
};

/**
 * One member insight. Everything numeric and every classification comes from
 * the backend payload; the card only explains and links out. The variant
 * badge always carries a text label, so meaning never relies on colour.
 */
const AttendanceInsightCard = ({
  insight,
  variant,
  previousFromDate,
  recentToDate,
  openFollowUpCount,
  followUpLogged = false,
  onAddFollowUp,
}: AttendanceInsightCardProps) => {
  const terms = useTerms();
  const cardBg = useColorModeValue("white", "gray.700");
  const { label, colorScheme } = VARIANT_META[variant];
  const reasons = reasonsFor(insight, variant);
  const memberName =
    insight.name ?? `Unknown ${lowerTerm(terms.memberSingular)}`;
  const followUpBadge =
    openFollowUpCount && openFollowUpCount > 0
      ? openFollowUpCount === 1
        ? "Open follow-up"
        : `${openFollowUpCount} open follow-ups`
      : null;

  const analyticsPath = convertParamsToString(
    PROTECTED_PATHS.MEMBER_ANALYTICS,
    { memberId: insight.memberId },
  );
  const analyticsQuery = new URLSearchParams({
    fromDate: previousFromDate,
    toDate: recentToDate,
  }).toString();

  return (
    <Box
      role="group"
      aria-label={memberName}
      borderWidth="1px"
      borderRadius="lg"
      p={{ base: 3, md: 4 }}
      bg={cardBg}
      h="full"
    >
      <Flex
        align="flex-start"
        justify="space-between"
        gap={2}
        mb={reasons.length ? 2 : 3}
      >
        {/* Names wrap rather than truncate so the officer always knows who
            the card is about; the badge never shrinks. */}
        <Heading size="sm" minW={0} overflowWrap="anywhere">
          {memberName}
        </Heading>
        <Badge colorScheme={colorScheme} flexShrink={0}>
          {label}
        </Badge>
      </Flex>

      {(followUpLogged || followUpBadge) && (
        <Flex gap={2} wrap="wrap" mb={2}>
          {followUpLogged && (
            <Badge colorScheme="green">Follow-up logged</Badge>
          )}
          {followUpBadge && <Badge colorScheme="purple">{followUpBadge}</Badge>}
        </Flex>
      )}

      {reasons.length > 0 && (
        <List spacing={1} mb={3}>
          {reasons.map((reason) => (
            <ListItem key={reason}>
              <Text fontWeight="medium">{reason}</Text>
            </ListItem>
          ))}
        </List>
      )}

      <Stack spacing={1} fontSize="sm" mb={3}>
        <Text>
          {presenceSummary(insight)}
          {variant !== "communicated" &&
            insight.presenceChangePoints != null && (
              <ChangeBadge points={insight.presenceChangePoints} />
            )}
        </Text>
        <Text>{recentCounts(insight)}</Text>
        {variant === "attention" && insight.lastPresentDate && (
          <Text>{`Last present: ${dateLabel(insight.lastPresentDate)}`}</Text>
        )}
        {variant === "communicated" && (
          <Text>
            {`Attendance Rate: ${percent(insight.recent.attendanceRate)}`}
          </Text>
        )}
        {variant === "communicated" &&
          insight.recent.absent === 0 &&
          insight.recent.excused > 0 && (
            <Text color="gray.500">The missed sessions were excused.</Text>
          )}
      </Stack>

      <Flex justify="space-between" align="center" gap={2} wrap="wrap">
        <Link
          as={RouterLink}
          to={`${analyticsPath}?${analyticsQuery}`}
          color="blue.500"
          fontWeight="medium"
          py={2}
        >
          {`View ${lowerTerm(terms.attendanceSingular)} history`}
        </Link>
        {onAddFollowUp && (
          <Button
            size={{ base: "sm", md: "xs" }}
            variant="outline"
            onClick={onAddFollowUp}
          >
            {followUpLogged ? "Add another follow-up" : "Add follow-up"}
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default AttendanceInsightCard;
