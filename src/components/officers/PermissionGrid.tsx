import { Box, Checkbox, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { PermissionAction, PermissionArea, PermissionKey } from "rbac/permissions";
import { AREA_LABEL, PERMISSION_COPY } from "rbac/copy";
import { useTerms } from "hooks/useOrgPresentation";
import { resolveText } from "config/presentationLabels";

const ACTIONS: PermissionAction[] = ["view", "manage"];

interface PermissionGridProps {
  areas: PermissionArea[];
  value: PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
  disabled?: boolean;
}

const PermissionGrid = ({ areas, value, onChange, disabled }: PermissionGridProps) => {
  const terms = useTerms();
  const selected = new Set(value);

  const toggle = (key: PermissionKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  return (
    <Stack gap={4}>
      {areas.map((area) => (
        <Box key={area} borderWidth="1px" borderRadius="md" p={3}>
          <Text fontWeight="bold" mb={2}>{resolveText(AREA_LABEL[area], terms)}</Text>
          <SimpleGrid columns={2} gap={2}>
            {ACTIONS.map((action) => {
              const key: PermissionKey = `${area}.${action}`;
              return (
                <Checkbox.Root
                  key={key}
                  aria-label={key}
                  disabled={disabled}
                  onCheckedChange={() => toggle(key)}
                  checked={selected.has(key)}
                ><Checkbox.HiddenInput /><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Label>
                    {PERMISSION_COPY[key].label}— {resolveText(PERMISSION_COPY[key].description, terms)}
                  </Checkbox.Label></Checkbox.Root>
              );
            })}
          </SimpleGrid>
        </Box>
      ))}
    </Stack>
  );
};

export default PermissionGrid;
