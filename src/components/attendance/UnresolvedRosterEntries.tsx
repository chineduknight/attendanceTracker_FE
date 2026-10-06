import { Box, Text } from "@chakra-ui/react";
import { UnresolvedRosterEntry } from "helpers/storedRoster";
import { AttendanceStatusConfig } from "helpers/attendanceStatuses";
import AttendanceMemberRow from "components/attendance/AttendanceMemberRow";

export const UNRESOLVED_MEMBER_LABEL = "Former member (profile unavailable)";

interface UnresolvedRosterEntriesProps {
  entries: readonly UnresolvedRosterEntry[];
  statuses: AttendanceStatusConfig;
}

/**
 * Read-only placeholders for stored roster entries whose member profile no
 * longer resolves. They stay part of the historical roster but can't be edited.
 */
const UnresolvedRosterEntries = ({ entries, statuses }: UnresolvedRosterEntriesProps) =>
  entries.length ? (
    <Box mt="4">
      <Text fontSize="sm" color="gray.500">
        {entries.length === 1
          ? "1 member on this roster no longer has a profile. Their stored status is kept and can't be edited."
          : `${entries.length} members on this roster no longer have a profile. Their stored statuses are kept and can't be edited.`}
      </Text>
      {entries.map((entry) => (
        <AttendanceMemberRow
          key={entry.memberId}
          memberId={entry.memberId}
          name={UNRESOLVED_MEMBER_LABEL}
          status={statuses.resolve(entry.attendanceStatus)}
        />
      ))}
    </Box>
  ) : null;

export default UnresolvedRosterEntries;
