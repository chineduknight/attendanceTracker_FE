import { useLayoutEffect, useRef, useState } from "react";
import { useFieldContext } from "@chakra-ui/react";
import {
  Control,
  FieldPath,
  FieldValues,
  RegisterOptions,
  useController,
} from "react-hook-form";
import ReactSelect, { GroupBase, Props, StylesConfig } from "react-select";

/** Chakra semantic tokens as CSS variables, so the select follows colour mode. */
const token = (name: string) => `var(--chakra-colors-${name.replace(/\./g, "-")})`;

const themedStyles = <Option, IsMulti extends boolean, Group extends GroupBase<Option>>(): StylesConfig<
  Option,
  IsMulti,
  Group
> => ({
  // Full width like the native select it replaces; Chakra's Field.Root (a
  // flex column) would otherwise shrink it to its text.
  container: (base) => ({ ...base, width: "100%" }),
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    // 16px: below that, iOS zooms the page on focus.
    fontSize: 16,
    background: token("bg"),
    borderColor: state.isFocused
      ? token("blue.focusRing")
      : state.selectProps["aria-invalid"]
        ? token("border.error")
        : token("border"),
    boxShadow: state.isFocused ? `0 0 0 1px ${token("blue.focusRing")}` : "none",
    "&:hover": { borderColor: token("border.emphasized") },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingLeft: 12,
    // A non-searchable select keeps a 1px focus input for keyboard use; out
    // of the flow, it never wraps onto a line of its own after a chip that
    // fills the row. (A searchable input sits in its own wrapper, unaffected.)
    "& > input": { position: "absolute" },
  }),
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
  // The chip's ✕ is a real button. It stays chip-sized so a selected value
  // doesn't make the control taller than a 44px field (a 44px ✕ grew it to
  // ~54px and every wrapped row by 48px), while an invisible ::before zone
  // keeps the tap target 44x44 without hitting the control behind it.
  multiValueRemove: (base) => ({
    ...base,
    position: "relative",
    minWidth: 32,
    // The chip's full height (~26px), so the zone below reaches 44px.
    alignSelf: "stretch",
    justifyContent: "center",
    color: token("fg.muted"),
    "&::before": {
      content: '""',
      position: "absolute",
      top: -9,
      bottom: -9,
      left: -6,
      right: -6,
    },
    "&:hover": { background: token("red.subtle"), color: token("red.fg") },
  }),
  // No divider before the chevron (native selects had none): its room goes
  // to the value, which matters in narrow controls.
  indicatorSeparator: () => ({ display: "none" }),
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
 * The app's one dropdown: react-select themed with the app's tokens (light
 * and dark), 44px rows and 16px text. Not searchable by default — a tap
 * opens the list without the phone keyboard; pass `isSearchable` only for a
 * long list such as a member picker. Menus portal with fixed positioning so
 * they escape cards, drawers and the pinned search bar: to <body>, or inside
 * a dialog to the dialog itself — a modal hides everything outside it from
 * screen readers (aria-hidden) and treats a tap there as an outside click.
 * Pass `styles` to adjust; they are applied on top of the theme.
 * For one value from a list of strings, use OptionSelect / FormOptionSelect.
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
  const anchor = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | undefined>(() =>
    typeof document !== "undefined" ? document.body : undefined,
  );
  useLayoutEffect(() => {
    const dialog = anchor.current?.closest<HTMLElement>(
      '[role="dialog"], [role="alertdialog"]',
    );
    if (dialog) setPortalTarget(dialog);
  }, []);
  return (
    <>
      {/* Finds an enclosing dialog; takes no space. */}
      <span ref={anchor} hidden />
      <ReactSelect<Option, IsMulti, Group>
        menuPortalTarget={portalTarget}
        menuPosition="fixed"
        isSearchable={false}
        {...props}
        styles={merged}
      />
    </>
  );
};

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

export type OptionSelectProps<V extends string = string> = Omit<
  Props<SelectOption<V>, false>,
  "value" | "options" | "onChange" | "isMulti"
> & {
  /** The chosen value; "" or nullish shows the placeholder. */
  value: V | "" | null | undefined;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  /** For an optional value: shows a ✕ that clears the choice. */
  onClear?: () => void;
};

/**
 * One value from a list, by value — the replacement for a native select.
 * Inside a Chakra `Field.Root` it takes the field's control id (so
 * `Field.Label` names it), disabled and invalid state.
 */
export const OptionSelect = <V extends string = string>({
  value,
  options,
  onChange,
  onClear,
  inputId,
  isDisabled,
  ...props
}: OptionSelectProps<V>) => {
  const field = useFieldContext();
  return (
    <ThemedSelect<SelectOption<V>, false>
      inputId={inputId ?? field?.ids.control}
      isDisabled={isDisabled ?? field?.disabled}
      aria-invalid={field?.invalid || undefined}
      options={options}
      value={options.find((option) => option.value === value) ?? null}
      isClearable={Boolean(onClear)}
      onChange={(option) => {
        if (option) onChange(option.value);
        else onClear?.();
      }}
      {...props}
    />
  );
};

/** OptionSelect bound to react-hook-form (replaces `register` on a select). */
export const FormOptionSelect = <
  T extends FieldValues,
  V extends string = string,
>({
  control,
  name,
  rules,
  defaultValue,
  ...props
}: Omit<OptionSelectProps<V>, "value" | "onChange" | "name" | "defaultValue"> & {
  control: Control<T>;
  name: FieldPath<T>;
  /** Used when the form holds no value for `name` yet. */
  defaultValue?: V;
  rules?: Omit<RegisterOptions<T>, "valueAsNumber" | "valueAsDate" | "setValueAs" | "disabled">;
}) => {
  const { field } = useController({
    control,
    name,
    rules,
    defaultValue: defaultValue as never,
  });
  return (
    <OptionSelect<V>
      {...props}
      name={field.name}
      value={field.value as V | ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
    />
  );
};
