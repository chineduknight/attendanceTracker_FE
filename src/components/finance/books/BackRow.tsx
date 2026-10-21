import { RefObject, useEffect } from "react";
import { Button, Text } from "@chakra-ui/react";
import { FiChevronLeft } from "react-icons/fi";

/**
 * The back row at the top of a Books screen, plus the screen heading. When
 * the screen is shown, focus moves to the heading so screen readers announce
 * where the officer landed.
 */
const BackRow = ({
  label,
  title,
  onBack,
  shown,
  headingRef,
}: {
  label: string;
  title: string;
  onBack: () => void;
  shown: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
}) => {
  useEffect(() => {
    if (shown) headingRef.current?.focus();
  }, [shown, headingRef]);

  return (
    <>
      <Button variant="ghost" alignSelf="flex-start" minH="44px" px={2} ml={-2} onClick={onBack}>
        <FiChevronLeft aria-hidden />
        {label}
      </Button>
      <Text as="h2" ref={headingRef} tabIndex={-1} fontSize="xl" fontWeight="semibold" outline="none">
        {title}
      </Text>
    </>
  );
};

export default BackRow;
