import { useContext, useId } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { POSTING_METHODS, POSTING_METHOD_LABELS, PostingMethod } from "components/finance/ledgerPostingTypes";
import { FormLockContext } from "components/finance/postings/PostingForms";

/** How the money moved, as one row of tappable chips (all six, no menu). */
const MethodChips = ({
  value,
  onChange,
  hint,
}: {
  value: PostingMethod;
  onChange: (method: PostingMethod) => void;
  hint?: string;
}) => {
  const locked = useContext(FormLockContext);
  const labelId = useId();
  return (
    <Box>
      <Text id={labelId} fontWeight="medium" mb={1.5}>
        Method
      </Text>
      <Flex role="radiogroup" aria-labelledby={labelId} gap={2} wrap="wrap">
        {POSTING_METHODS.map((method) => {
          const selected = method === value;
          return (
            <chakra.button
              key={method}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => onChange(method)}
              minH="44px"
              px={4}
              borderRadius="full"
              borderWidth="1px"
              borderColor={selected ? "teal.solid" : "border"}
              bg={selected ? "teal.solid" : "bg.panel"}
              color={selected ? "teal.contrast" : "fg"}
              fontWeight="medium"
              cursor="pointer"
              _disabled={{ opacity: 0.6, cursor: "not-allowed" }}
            >
              {POSTING_METHOD_LABELS[method]}
            </chakra.button>
          );
        })}
      </Flex>
      {hint && (
        <Text fontSize="sm" color="fg.muted" mt={1}>
          {hint}
        </Text>
      )}
    </Box>
  );
};

export default MethodChips;
