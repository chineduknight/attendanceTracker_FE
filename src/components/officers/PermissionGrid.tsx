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
    <Stack spacing={4}>
      {areas.map((area) => (
        <Box key={area} borderWidth="1px" borderRadius="md" p={3}>
          <Text fontWeight="bold" mb={2}>{resolveText(AREA_LABEL[area], terms)}</Text>
          <SimpleGrid columns={2} spacing={2}>
            {ACTIONS.map((action) => {
              const key: PermissionKey = `${area}.${action}`;
              return (
                <Checkbox
                  key={key}
                  aria-label={key}
                  isChecked={selected.has(key)}
                  isDisabled={disabled}
                  onChange={() => toggle(key)}
                >
                  {PERMISSION_COPY[key].label} — {resolveText(PERMISSION_COPY[key].description, terms)}
                </Checkbox>
              );
            })}
          </SimpleGrid>
        </Box>
      ))}
    </Stack>
  );
};

export default PermissionGrid;
