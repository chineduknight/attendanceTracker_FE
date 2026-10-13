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
 *
 * Chips look 32px tall but each takes a 44px tap: an invisible zone extends
 * 6px above and below. The row pads 6px vertically (pulled back by margin)
 * because its sideways scroll would otherwise clip the zones.
 */
const FilterChips = <T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) => (
  <Flex
    role="group"
    aria-label={label}
    gap={2}
    overflowX="auto"
    py="6px"
    my="-6px"
    mx={-1}
    px={1}
    css={{
      scrollbarWidth: "none",
      '& &::-webkit-scrollbar': { display: "none" }
    }}
  >
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <Button
          key={option.value}
          size="sm"
          borderRadius="full"
          flexShrink={0}
          position="relative"
          _before={{ content: '""', position: "absolute", insetInline: 0, insetBlock: "-6px" }}
          variant={isActive ? "solid" : "outline"}
          colorPalette={isActive ? "teal" : "gray"}
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
