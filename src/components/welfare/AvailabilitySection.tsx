import {
  Box,
  Heading,
  List,
  ListItem,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { format, isValid, parseISO } from "date-fns";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { WelfareAwayInsight } from "components/welfare/welfareTypes";

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
  const cardBg = useColorModeValue("white", "gray.700");

  return (
    <Box as="section" aria-label="Currently Away" mt={8}>
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
        <List spacing={3}>
          {items.map((item) => (
            <ListItem
              key={item.memberId}
              borderWidth="1px"
              borderRadius="lg"
              p={4}
              bg={cardBg}
            >
              <Text fontWeight="semibold">
                {memberName(item, lowerTerm(terms.memberSingular))}
              </Text>
              <Text fontSize="sm">
                {`Away: ${dateLabel(item.startDate)} – ${dateLabel(
                  item.endDate,
                )}`}
              </Text>
              <Text fontSize="sm">
                {`Returns: ${dateLabel(item.returnDate)}`}
              </Text>
              {item.reason && item.reason.trim() !== "" && (
                <Text fontSize="sm">{`Reason: ${item.reason.trim()}`}</Text>
              )}
            </ListItem>
          ))}
        </List>
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
    <Box as="section" aria-label="Returning Soon" mt={8}>
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
        <List spacing={2}>
          {items.map((item) => (
            <ListItem key={`${item.memberId}-${item.returnDate}`}>
              <Text>
                {`${dateLabel(item.returnDate)} — ${memberName(
                  item,
                  lowerTerm(terms.memberSingular),
                )}`}
              </Text>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};
