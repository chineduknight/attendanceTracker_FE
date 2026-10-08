import { useLayoutEffect, useRef, useState } from "react";
import { Text, TextProps } from "@chakra-ui/react";

interface TruncatedTextProps extends Omit<TextProps, "children" | "noOfLines"> {
  children: string;
}

/**
 * One line with an ellipsis. Only when the text actually overflows does it
 * become a button that expands to the full value on tap (phones have no
 * hover for a tooltip); short values stay plain text.
 */
const TruncatedText = ({ children, ...textProps }: TruncatedTextProps) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || isExpanded) return;
    const measure = () =>
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    measure();
    // Rotating the phone or resizing the window changes what fits.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, isExpanded]);

  const isToggle = isOverflowing || isExpanded;
  return (
    <Text
      ref={ref}
      title={children}
      {...textProps}
      {...(isExpanded
        ? { wordBreak: "break-word" }
        : {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
      {...(isToggle && {
        as: "button",
        type: "button",
        display: "block",
        w: "full",
        textAlign: "left",
        cursor: "pointer",
        "aria-expanded": isExpanded,
        onClick: () => setIsExpanded((expanded) => !expanded),
      })}
    >
      {children}
    </Text>
  );
};

export default TruncatedText;
