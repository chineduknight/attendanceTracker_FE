import { Switch as ChakraSwitch } from "@chakra-ui/react";
import {
  Control,
  FieldPath,
  FieldValues,
  useController,
} from "react-hook-form";

export interface SwitchProps
  extends Omit<ChakraSwitch.RootProps, "checked" | "onCheckedChange"> {
  /** Id of the underlying input, so a Field.Label htmlFor can target it. */
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** A controlled on/off switch with an accessible hidden checkbox input. */
export const Switch = ({
  id,
  checked,
  onCheckedChange,
  ...rootProps
}: SwitchProps) => (
  <ChakraSwitch.Root
    {...rootProps}
    ids={id ? { hiddenInput: id } : undefined}
    checked={checked}
    onCheckedChange={(details) => onCheckedChange(details.checked)}
  >
    <ChakraSwitch.HiddenInput />
    <ChakraSwitch.Control>
      <ChakraSwitch.Thumb />
    </ChakraSwitch.Control>
  </ChakraSwitch.Root>
);

interface FormSwitchProps<T extends FieldValues>
  extends Omit<SwitchProps, "checked" | "onCheckedChange"> {
  control: Control<T>;
  name: FieldPath<T>;
}

/**
 * A Switch bound to react-hook-form. Controlled on purpose: v3's switch only
 * syncs its state to the hidden input, so `register` + `reset(values)` would
 * leave the visible switch showing a stale value.
 */
export const FormSwitch = <T extends FieldValues>({
  control,
  name,
  ...switchProps
}: FormSwitchProps<T>) => {
  const { field } = useController({ control, name });
  return (
    <Switch
      {...switchProps}
      checked={Boolean(field.value)}
      onCheckedChange={field.onChange}
      onBlur={field.onBlur}
    />
  );
};
