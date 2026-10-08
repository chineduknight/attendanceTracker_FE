import { Button, Flex, Input, NativeSelect, Field } from "@chakra-ui/react";
import { useTerms } from "hooks/useOrgPresentation";
import { ALL_STATUSES } from "helpers/welfareReview";

interface WelfareReviewControlsProps {
  asOf: string;
  /** Latest selectable review date (local business today). */
  maxDate: string;
  isToday: boolean;
  onAsOfChange: (value: string) => void;
  onToday: () => void;
  /** Configured member-status options; the filter is hidden when empty. */
  statusOptions: readonly string[];
  status: string;
  onStatusChange: (value: string) => void;
}

/**
 * Review scope for the Welfare overview: the pinned review date and the
 * member-status population. There is deliberately no From/To range — the
 * backend compares two equal periods ending on `asOf`.
 */
const WelfareReviewControls = ({
  asOf,
  maxDate,
  isToday,
  onAsOfChange,
  onToday,
  statusOptions,
  status,
  onStatusChange,
}: WelfareReviewControlsProps) => {
  const terms = useTerms();
  return (
    // Always one row on phones: nowrap, with zero flex bases and minW 0 so
    // the controls shrink to share the width (date + Today get the larger
    // share) rather than pushing the status filter onto a second line.
    <Flex
      gap={{ base: 2, md: 4 }}
      wrap={{ base: "nowrap", sm: "wrap" }}
      align="flex-end"
      mb={4}
    >
      <Field.Root
        flex={{ base: "1.6 1 0", sm: "0 0 auto" }}
        minW={0}
        w="auto"
      >
        <Field.Label htmlFor="welfare-as-of" fontSize="sm" mb={1}>
          Review as of
        </Field.Label>
        <Flex gap={2}>
          {/* md (16px) on phones: iOS Safari zooms into any smaller input. */}
          <Input
            id="welfare-as-of"
            type="date"
            size={{ base: "md", md: "sm" }}
            flex={{ base: 1, sm: "initial" }}
            minW={0}
            w={{ base: "full", sm: "auto" }}
            max={maxDate}
            value={asOf}
            onChange={(event) => onAsOfChange(event.target.value)}
          />
          <Button
            size={{ base: "md", md: "sm" }}
            variant="outline"
            flexShrink={0}
            onClick={onToday}
            disabled={isToday}
          >
            Today
          </Button>
        </Flex>
      </Field.Root>

      {statusOptions.length > 0 && (
        <Field.Root
          flex={{ base: "1 1 0", sm: "0 0 auto" }}
          minW={0}
          w="auto"
        >
          <Field.Label htmlFor="welfare-status" fontSize="sm" mb={1}>
            {`${terms.memberSingular} status`}
          </Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              id="welfare-status"
              size={{ base: "md", md: "sm" }}
              value={status}
              onValueChange={(event) => onStatusChange(event.target.value)}>
              <option value={ALL_STATUSES}>All</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
      )}
    </Flex>
  );
};

export default WelfareReviewControls;
