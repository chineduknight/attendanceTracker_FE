import ReactSelect, { GroupBase, Props, StylesConfig } from "react-select";

/** Chakra semantic tokens as CSS variables, so the select follows colour mode. */
const token = (name: string) => `var(--chakra-colors-${name.replace(/\./g, "-")})`;

const themedStyles = <Option, IsMulti extends boolean, Group extends GroupBase<Option>>(): StylesConfig<
  Option,
  IsMulti,
  Group
> => ({
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    // 16px: below that, iOS zooms the page on focus.
    fontSize: 16,
    background: token("bg"),
    borderColor: state.isFocused ? token("blue.focusRing") : token("border"),
    boxShadow: state.isFocused ? `0 0 0 1px ${token("blue.focusRing")}` : "none",
    "&:hover": { borderColor: token("border.emphasized") },
  }),
  valueContainer: (base) => ({ ...base, paddingLeft: 12 }),
  placeholder: (base) => ({ ...base, color: token("fg.muted") }),
  singleValue: (base) => ({ ...base, color: token("fg") }),
  input: (base) => ({ ...base, color: token("fg") }),
  multiValue: (base) => ({
    ...base,
    background: token("bg.muted"),
    borderRadius: 4,
    alignItems: "center",
  }),
  multiValueLabel: (base) => ({ ...base, color: token("fg"), fontSize: 14 }),
  // The chip's ✕ is a real button; react-select's default is ~22x27. 44px
  // square (the chip grows with it) so it can be tapped without hitting the
  // control behind it.
  multiValueRemove: (base) => ({
    ...base,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    color: token("fg.muted"),
    "&:hover": { background: token("red.subtle"), color: token("red.fg") },
  }),
  indicatorSeparator: (base) => ({ ...base, background: token("border") }),
  // Clear-all and open-menu: 44px wide and as tall as the 44px control.
  dropdownIndicator: (base) => ({
    ...base,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    // Over the control's 1px borders too, so the target is the full 44px.
    marginBlock: -1,
    color: token("fg.muted"),
  }),
  clearIndicator: (base) => ({
    ...base,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    // Over the control's 1px borders too, so the target is the full 44px.
    marginBlock: -1,
    color: token("fg.muted"),
  }),
  indicatorsContainer: (base) => ({ ...base, alignSelf: "stretch" }),
  menu: (base) => ({
    ...base,
    background: token("bg.panel"),
    border: `1px solid ${token("border")}`,
    boxShadow: "var(--chakra-shadows-lg)",
  }),
  option: (base, state) => ({
    ...base,
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    color: state.isSelected ? token("blue.fg") : token("fg"),
    background: state.isSelected
      ? token("blue.subtle")
      : state.isFocused
        ? token("bg.muted")
        : "transparent",
    "&:active": { background: token("bg.emphasized") },
  }),
  noOptionsMessage: (base) => ({ ...base, color: token("fg.muted") }),
  loadingMessage: (base) => ({ ...base, color: token("fg.muted") }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
});

/**
 * react-select themed with the app's tokens (light and dark), 44px rows and
 * 16px text. Menus portal to <body> with fixed positioning by default so
 * they escape cards, drawers and the pinned search bar. Pass `styles` to
 * adjust; they are applied on top of the theme.
 */
export const ThemedSelect = <
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>({ styles, ...props }: Props<Option, IsMulti, Group>) => {
  const theme = themedStyles<Option, IsMulti, Group>();
  const merged = styles
    ? (Object.fromEntries(
        Object.keys({ ...theme, ...styles }).map((key) => {
          const ours = theme[key as keyof typeof theme] as ((b: object, s: object) => object) | undefined;
          const theirs = styles[key as keyof typeof styles] as ((b: object, s: object) => object) | undefined;
          return [
            key,
            (base: object, state: object) =>
              theirs ? theirs(ours ? ours(base, state) : base, state) : ours!(base, state),
          ];
        }),
      ) as StylesConfig<Option, IsMulti, Group>)
    : theme;
  return (
    <ReactSelect<Option, IsMulti, Group>
      menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
      menuPosition="fixed"
      {...props}
      styles={merged}
    />
  );
};
