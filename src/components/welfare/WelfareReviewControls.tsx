import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Select,
} from "@chakra-ui/react";
import { useTerms } from "hooks/useOrgPresentation";
import { ALL_STATUSES } from "helpers/welfareReview";

interface WelfareReviewControlsProps {
  asOf: string;
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
  isToday,
  onAsOfChange,
  onToday,
  statusOptions,
  status,
  onStatusChange,
}: WelfareReviewControlsProps) => {
  const terms = useTerms();
  return (
    <Flex gap={4} wrap="wrap" align="flex-end" mb={4}>
      <FormControl w="auto">
        <FormLabel htmlFor="welfare-as-of" fontSize="sm" mb={1}>
          Review as of
        </FormLabel>
        <Flex gap={2}>
          <Input
            id="welfare-as-of"
            type="date"
            size="sm"
            w="auto"
            value={asOf}
            onChange={(event) => onAsOfChange(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onToday}
            isDisabled={isToday}
          >
            Today
          </Button>
        </Flex>
      </FormControl>

      {statusOptions.length > 0 && (
        <FormControl w="auto">
          <FormLabel htmlFor="welfare-status" fontSize="sm" mb={1}>
            {`${terms.memberSingular} status`}
          </FormLabel>
          <Select
            id="welfare-status"
            size="sm"
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value={ALL_STATUSES}>All</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormControl>
      )}
    </Flex>
  );
};

export default WelfareReviewControls;
