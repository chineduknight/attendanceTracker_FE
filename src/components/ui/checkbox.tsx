import { Checkbox as ChakraCheckbox } from "@chakra-ui/react";
import {
  Control,
  FieldPath,
  FieldValues,
  PathValue,
  useController,
} from "react-hook-form";

interface FormCheckboxProps<T extends FieldValues>
  extends Omit<
    ChakraCheckbox.RootProps,
    "checked" | "defaultChecked" | "onCheckedChange" | "name"
  > {
  control: Control<T>;
  name: FieldPath<T>;
  /** Accessible name, set on the hidden native input. */
  label: string;
}

/**
 * A checkbox bound to react-hook-form. Controlled on purpose, like FormSwitch:
 * `register` on the v3 root never reaches the hidden input, and a
 * `defaultChecked` box ignores a later `reset(values)`. The form value is
 * always a real boolean.
 */
export const FormCheckbox = <T extends FieldValues>({
  control,
  name,
  label,
  ...rootProps
}: FormCheckboxProps<T>) => {
  const { field } = useController({
    control,
    name,
    // Unticked means false, not missing, when nothing has set the field.
    defaultValue: false as PathValue<T, FieldPath<T>>,
  });
  return (
    <ChakraCheckbox.Root
      {...rootProps}
      checked={field.value === true}
      onCheckedChange={({ checked }) => field.onChange(checked === true)}
    >
      <ChakraCheckbox.HiddenInput aria-label={label} onBlur={field.onBlur} />
      <ChakraCheckbox.Control>
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
    </ChakraCheckbox.Root>
  );
};
