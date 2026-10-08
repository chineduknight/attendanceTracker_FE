import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { format, isValid, parseISO } from "date-fns";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { WelfareAwayInsight } from "components/welfare/welfareTypes";
import { sectionTargetProps } from "components/welfare/welfareSections";

const dateLabel = (value: string): string => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM") : value;
};

const memberName = (item: WelfareAwayInsight, fallbackTerm: string): string =>
  item.name ?? `Unknown ${fallbackTerm}`;

/**
 * Members on an active availability period. The backend decides who is away;
 * this section only presents the facts — no frontend reclassification.
 */
export const CurrentlyAwaySection = ({
  items,
}: {
  items: WelfareAwayInsight[];
}) => {
  const terms = useTerms();

  return (
    <Box
      as="section"
      aria-label="Currently Away"
      mt={8}
      {...sectionTargetProps("currentlyAway")}
    >
      <Heading size="md" mb={3}>
        Currently Away
      </Heading>
      {items.length === 0 ? (
        <Text color="gray.500">
          {`No ${lowerTerm(
            terms.memberPlural,
          )} are currently recorded as away.`}
        </Text>
      ) : (
        <GroupedList>
          {items.map((item) => (
            <GroupedListItem key={item.memberId}>
              <Flex align="flex-start" justify="space-between" gap={3}>
                <Text fontWeight="semibold" minW={0} overflowWrap="anywhere">
                  {memberName(item, lowerTerm(terms.memberSingular))}
                </Text>
                <Text fontSize="sm" flexShrink={0}>
                  {`Returns: ${dateLabel(item.returnDate)}`}
                </Text>
              </Flex>
              <Text fontSize="sm" color="gray.500">
                {`Away: ${dateLabel(item.startDate)} – ${dateLabel(
                  item.endDate,
                )}`}
              </Text>
              {item.reason && item.reason.trim() !== "" && (
                <Text fontSize="sm" color="gray.500">
                  {`Reason: ${item.reason.trim()}`}
                </Text>
              )}
            </GroupedListItem>
          ))}
        </GroupedList>
      )}
    </Box>
  );
};

/** Members due back within the backend's returning-soon window. */
export const ReturningSoonSection = ({
  items,
  days,
}: {
  items: WelfareAwayInsight[];
  days: number;
}) => {
  const terms = useTerms();

  return (
    <Box
      as="section"
      aria-label="Returning Soon"
      mt={8}
      {...sectionTargetProps("returningSoon")}
    >
      <Heading size="md" mb={1}>
        Returning Soon
      </Heading>
      <Text fontSize="sm" color="gray.500" mb={3}>
        {`Returning in the next ${days} days`}
      </Text>
      {items.length === 0 ? (
        <Text color="gray.500">
          {`No ${lowerTerm(terms.memberPlural)} are returning in the next ${days} days.`}
        </Text>
      ) : (
        <GroupedList>
          {items.map((item) => (
            <GroupedListItem key={`${item.memberId}-${item.returnDate}`}>
              <Text>
                {`${dateLabel(item.returnDate)} — ${memberName(
                  item,
                  lowerTerm(terms.memberSingular),
                )}`}
              </Text>
            </GroupedListItem>
          ))}
        </GroupedList>
      )}
    </Box>
  );
};
