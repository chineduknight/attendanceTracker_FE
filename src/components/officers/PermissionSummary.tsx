import { useId, useState } from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { PERMISSION_AREAS, PermissionKey } from "rbac/permissions";
import { AREA_LABEL, PERMISSION_COPY } from "rbac/copy";
import { resolveText } from "config/presentationLabels";
import { useTerms } from "hooks/useOrgPresentation";

/** "Attendance: View, Manage" lines in catalogue order, from permission keys. */
export const describePermissions = (
  permissions: readonly string[],
  terms: Parameters<typeof resolveText>[1],
): string[] => {
  const held = new Set(permissions);
  return PERMISSION_AREAS.flatMap((area) => {
    const actions = (["view", "manage"] as const)
      .map((action) => `${area}.${action}` as PermissionKey)
      .filter((key) => held.has(key))
      .map((key) => PERMISSION_COPY[key].label);
    return actions.length ? [`${resolveText(AREA_LABEL[area], terms)}: ${actions.join(", ")}`] : [];
  });
};

/**
 * A permission count that expands into readable names ("Attendance: View,
 * Manage") instead of a wall of raw keys that made each row ~600px tall.
 */
const PermissionSummary = ({ permissions }: { permissions: readonly string[] }) => {
  const terms = useTerms();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const lines = describePermissions(permissions, terms);
  if (!permissions.length) {
    return <Text fontSize="sm" color="fg.muted">No permissions</Text>;
  }
  return (
    <Box>
      <Button
        variant="plain"
        size="sm"
        minH="44px"
        px={0}
        color="fg.muted"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <FaChevronDown /> : <FaChevronRight />}
        {`${permissions.length} ${permissions.length === 1 ? "permission" : "permissions"}`}
      </Button>
      {open && (
        <Box id={panelId} as="ul" listStyleType="none" fontSize="sm" pb={1}>
          {lines.map((line) => (
            <Text as="li" key={line}>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default PermissionSummary;
