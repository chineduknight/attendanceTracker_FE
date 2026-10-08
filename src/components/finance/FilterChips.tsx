import { Button, Flex } from "@chakra-ui/react";

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string> {
  label: string;
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * One-tap filters with live counts. Scrolls sideways on a narrow phone
 * instead of wrapping into a tall block above the list.
 */
const FilterChips = <T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) => (
  <Flex
    role="group"
    aria-label={label}
    gap={2}
    overflowX="auto"
    pb={1}
    mx={-1}
    px={1}
    sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
  >
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <Button
          key={option.value}
          size="sm"
          borderRadius="full"
          flexShrink={0}
          variant={isActive ? "solid" : "outline"}
          colorScheme={isActive ? "teal" : "gray"}
          aria-pressed={isActive}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && ` ${option.count}`}
        </Button>
      );
    })}
  </Flex>
);

export default FilterChips;
