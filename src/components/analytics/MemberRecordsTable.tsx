import React from "react";
import { Box, Table, Thead, Tbody, Tr, Th, Td, Badge, Text } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import { MemberRecord } from "components/analytics/memberAnalyticsTypes";
import { AttendanceStatusConfig } from "helpers/attendanceStatuses";
import { FULL_DATE_FORMAT } from "components/analytics/dateFormats";

interface MemberRecordsTableProps {
  records: MemberRecord[];
  statuses: AttendanceStatusConfig;
}

const MemberRecordsTable: React.FC<MemberRecordsTableProps> = ({ records, statuses }) => (
  <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200" p={2} overflowX="auto">
    <Text fontSize="sm" fontWeight="semibold" p={2}>Session records</Text>
    <Table variant="striped" size="sm">
      <Thead>
        <Tr>
          <Th isNumeric>SN</Th>
          <Th>Date</Th>
          <Th>Session</Th>
          <Th>Status</Th>
          <Th>Note</Th>
        </Tr>
      </Thead>
      <Tbody>
        {records.map((record, index) => {
          const status = statuses.resolve(record.status);
          return (
            <Tr key={record.attendanceId}>
              <Td isNumeric>{index + 1}</Td>
              <Td>{format(parseISO(record.date), FULL_DATE_FORMAT)}</Td>
              <Td>{record.sessionName}</Td>
              <Td><Badge colorScheme={status.color}>{status.label}</Badge></Td>
              <Td>{record.hasBeenUpdated && <Badge colorScheme="purple">{record.editCount ? `edited ${record.editCount}×` : "edited"}</Badge>}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  </Box>
);

export default MemberRecordsTable;
