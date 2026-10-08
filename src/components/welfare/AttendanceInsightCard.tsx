import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Link,
  List,
  ListItem,
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
  const change = insight.presenceChangePoints;
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
      p={4}
      bg={cardBg}
      h="full"
    >
      <Flex
        align="center"
        justify="space-between"
        gap={2}
        mb={reasons.length ? 2 : 3}
      >
        <Heading size="sm">{memberName}</Heading>
        <Badge colorScheme={colorScheme}>{label}</Badge>
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

      {variant === "communicated" ? (
        <Box mb={3}>
          <Text fontSize="sm">
            {`Previous presence: ${percent(insight.previous.presenceRate)}`}
          </Text>
          <Text fontSize="sm">
            {`Recent presence: ${percent(insight.recent.presenceRate)}`}
          </Text>
        </Box>
      ) : (
        <Box mb={3}>
          <Text fontWeight="semibold">Physical presence</Text>
          <Text fontSize="sm">
            {`Previous: ${percent(insight.previous.presenceRate)}`}
          </Text>
          <Text fontSize="sm">
            {`Recent: ${percent(insight.recent.presenceRate)}`}
          </Text>
          {change != null && (
            <Text fontSize="sm" fontWeight="medium">
              {`${change < 0 ? "↓" : "↑"} ${Math.abs(
                change,
              )} percentage points`}
            </Text>
          )}
        </Box>
      )}

      <Box mb={3}>
        <Text fontWeight="semibold">Recent</Text>
        <List spacing={0}>
          {(["present", "excused", "absent"] as const).map((behavior) => (
            <ListItem key={behavior}>
              <Text fontSize="sm">
                {`${insight.recent[behavior]} ${BEHAVIOR_META[behavior].label}`}
              </Text>
            </ListItem>
          ))}
        </List>
      </Box>

      {variant === "attention" && insight.lastPresentDate && (
        <Text fontSize="sm" mb={3}>
          {`Last present: ${dateLabel(insight.lastPresentDate)}`}
        </Text>
      )}

      {variant === "communicated" && (
        <Box mb={3}>
          <Text fontSize="sm">
            {`Attendance Rate: ${percent(insight.recent.attendanceRate)}`}
          </Text>
          {insight.recent.absent === 0 && insight.recent.excused > 0 && (
            <Text fontSize="sm" color="gray.500">
              The missed sessions were excused.
            </Text>
          )}
        </Box>
      )}

      <Flex justify="space-between" align="center" gap={2} wrap="wrap">
        <Link
          as={RouterLink}
          to={`${analyticsPath}?${analyticsQuery}`}
          color="blue.500"
          fontWeight="medium"
        >
          {`View ${lowerTerm(terms.attendanceSingular)} history`}
        </Link>
        {onAddFollowUp && (
          <Button size="xs" variant="outline" onClick={onAddFollowUp}>
            {followUpLogged ? "Add another follow-up" : "Add follow-up"}
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default AttendanceInsightCard;
