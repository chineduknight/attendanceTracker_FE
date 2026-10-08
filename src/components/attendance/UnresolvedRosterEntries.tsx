import { Box, Text } from "@chakra-ui/react";
import { UnresolvedRosterEntry } from "helpers/storedRoster";
import { AttendanceStatusConfig } from "helpers/attendanceStatuses";
import AttendanceMemberRow from "components/attendance/AttendanceMemberRow";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface UnresolvedRosterEntriesProps {
  entries: readonly UnresolvedRosterEntry[];
  statuses: AttendanceStatusConfig;
}

/**
 * Read-only placeholders for stored roster entries whose member profile no
 * longer resolves. They stay part of the historical roster but can't be edited.
 */
const UnresolvedRosterEntries = ({ entries, statuses }: UnresolvedRosterEntriesProps) => {
  const terms = useTerms();
  const member = lowerTerm(terms.memberSingular);
  const members = lowerTerm(terms.memberPlural);
  return entries.length ? (
    <Box mt="4">
      <Text fontSize="sm" color="gray.500">
        {entries.length === 1
          ? `1 ${member} on this roster no longer has a profile. Their stored status is kept and can't be edited.`
          : `${entries.length} ${members} on this roster no longer have a profile. Their stored statuses are kept and can't be edited.`}
      </Text>
      {entries.map((entry) => (
        <AttendanceMemberRow
          key={entry.memberId}
          memberId={entry.memberId}
          name={`Former ${member} (profile unavailable)`}
          status={statuses.resolve(entry.attendanceStatus)}
          isManual={entry.manuallyAdded}
        />
      ))}
    </Box>
  ) : null;
};

export default UnresolvedRosterEntries;
