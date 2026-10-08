import React from "react";
import { Box, Table,      Badge, Text } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import { MemberRecord } from "components/analytics/memberAnalyticsTypes";
import { AttendanceStatusConfig } from "helpers/attendanceStatuses";
import { FULL_DATE_FORMAT } from "components/analytics/dateFormats";
import { useTerms } from "hooks/useOrgPresentation";

interface MemberRecordsTableProps {
  records: MemberRecord[];
  statuses: AttendanceStatusConfig;
}

const MemberRecordsTable: React.FC<MemberRecordsTableProps> = ({ records, statuses }) => {
  const terms = useTerms();
  return (
    <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200" p={2} overflowX="auto">
      <Text fontSize="sm" fontWeight="semibold" p={2}>{`${terms.attendanceSingular} records`}</Text>
      <Table.Root striped size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader textAlign='end'>SN</Table.ColumnHeader>
            <Table.ColumnHeader>Date</Table.ColumnHeader>
            <Table.ColumnHeader>{terms.attendanceSingular}</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
            <Table.ColumnHeader>Note</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {records.map((record, index) => {
            const status = statuses.resolve(record.status);
            return (
              <Table.Row key={record.attendanceId}>
                <Table.Cell textAlign='end'>{index + 1}</Table.Cell>
                <Table.Cell>{format(parseISO(record.date), FULL_DATE_FORMAT)}</Table.Cell>
                <Table.Cell>{record.sessionName}</Table.Cell>
                <Table.Cell><Badge colorPalette={status.color}>{status.label}</Badge></Table.Cell>
                <Table.Cell>{record.hasBeenUpdated && <Badge colorPalette="purple">{record.editCount ? `edited ${record.editCount}×` : "edited"}</Badge>}</Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

export default MemberRecordsTable;
