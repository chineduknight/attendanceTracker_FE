import { Switch as ChakraSwitch } from "@chakra-ui/react";
import {
  Control,
  FieldPath,
  FieldValues,
  useController,
} from "react-hook-form";

export interface SwitchProps
  extends Omit<ChakraSwitch.RootProps, "checked" | "onCheckedChange" | "id"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * A controlled on/off switch. Place it in a Field.Root next to a Field.Label:
 * the switch takes its input id and accessible name from the field, so no
 * id/htmlFor pair is needed (overriding the ids leaves a dangling
 * aria-labelledby on the hidden input).
 */
export const Switch = ({
  checked,
  onCheckedChange,
  ...rootProps
}: SwitchProps) => (
  <ChakraSwitch.Root
    {...rootProps}
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
