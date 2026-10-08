import { useLayoutEffect, useRef, useState } from "react";
import { Text, TextProps } from "@chakra-ui/react";

interface TruncatedTextProps extends Omit<TextProps, "children" | "noOfLines"> {
  children: string;
}

/**
 * One line with an ellipsis. Only when the text actually overflows does it
 * act as a button that expands to the full value on tap (phones have no
 * hover for a tooltip); short values stay plain text.
 *
 * The element is always the same <p>: swapping it for a <button> once an
 * overflow is measured detached the observed node, whose 0-width resize
 * then reported "fits" and flipped the toggle straight back off.
 */
const TruncatedText = ({ children, ...textProps }: TruncatedTextProps) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    // Expanded text wraps, so it never overflows; keep the last verdict.
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

  const toggle = () => setIsExpanded((expanded) => !expanded);
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
        role: "button",
        tabIndex: 0,
        cursor: "pointer",
        "aria-expanded": isExpanded,
        onClick: toggle,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        },
      })}
    >
      {children}
    </Text>
  );
};

export default TruncatedText;
