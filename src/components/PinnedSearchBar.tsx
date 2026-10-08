import { Box, BoxProps, Icon, IconButton, Input, InputGroup } from "@chakra-ui/react";
import { useRef } from "react";
import { FaSearch } from "react-icons/fa";
import { FiX } from "react-icons/fi";
import { usePinnedSearch } from "hooks/usePinnedSearch";
import { SAFE_TOP } from "styles/safeArea";

export interface PinnedSearchBarProps extends Omit<BoxProps, "onChange"> {
  /** The page's usePinnedSearch(query) result; its resultsRef goes on the list. */
  pinnedSearch: ReturnType<typeof usePinnedSearch>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Defaults to the placeholder. */
  "aria-label"?: string;
}

/**
 * The roster search bar that pins to the top while an officer searches (see
 * usePinnedSearch). Only this bar is pinned: anything taller squeezes the
 * results under the phone keyboard. It sits on the page background, edge to
 * edge within the page padding, below the status bar in the installed app.
 */
const PinnedSearchBar = ({
  pinnedSearch,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  ...barProps
}: PinnedSearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Box
      ref={pinnedSearch.barRef}
      position="sticky"
      top={SAFE_TOP}
      zIndex="sticky"
      bg="bg.subtle"
      mx={-4}
      px={4}
      py={2}
      mt="2"
      {...barProps}
    >
      <InputGroup
        startElement={
          <Icon color="fg.muted" asChild>
            <FaSearch />
          </Icon>
        }
        startElementProps={{ pointerEvents: "none" }}
        endElement={
          value ? (
            <IconButton
              aria-label="Clear search"
              variant="ghost"
              minW="44px"
              h="44px"
              // Keep the keyboard up: clearing usually precedes a new search.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
            >
              <FiX />
            </IconButton>
          ) : undefined
        }
        endElementProps={{ pe: 0 }}
      >
        <Input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          // Our own 44px clear button replaces WebKit's small one.
          css={{ "&::-webkit-search-cancel-button": { display: "none" } }}
          aria-label={ariaLabel ?? placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...pinnedSearch.inputProps}
        />
      </InputGroup>
    </Box>
  );
};

export default PinnedSearchBar;
