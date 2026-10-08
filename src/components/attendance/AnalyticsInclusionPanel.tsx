import { useState } from "react";
import { Badge, Box, Button, Flex, Text, Textarea, Field } from "@chakra-ui/react";
import { format } from "date-fns";
import { toast } from "react-toastify";
import { ConfirmDialog } from "components/ui/confirm-dialog";
import { Can } from "rbac/Can";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import { useAttendanceAnalyticsInclusion } from "hooks/useAttendanceAnalyticsInclusion";
import {
  ANALYTICS_EXCLUSION_REASON_MAX,
  AnalyticsInclusion,
  RESTORE_CHANGE,
  exclusionChange,
} from "helpers/attendanceAnalyticsInclusion";

interface AnalyticsInclusionPanelProps {
  organisationId: string;
  attendanceId: string;
  inclusion: AnalyticsInclusion;
}

/**
 * Read-only inclusion state for anyone viewing the session, plus a deliberate
 * exclude/restore confirmation for `attendance.manage`. Independent of the
 * marking edit limit: a locked session can still be excluded or restored.
 */
const AnalyticsInclusionPanel = ({
  organisationId,
  attendanceId,
  inclusion,
}: AnalyticsInclusionPanelProps) => {
  const terms = useTerms();
  const session = lowerTerm(terms.attendanceSingular);
  const member = lowerTerm(terms.memberSingular);
  const { setInclusion, isSaving } = useAttendanceAnalyticsInclusion(
    organisationId,
    attendanceId
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const close = () => {
    setIsConfirming(false);
    setReason("");
  };

  const confirm = () =>
    setInclusion(
      inclusion.included ? exclusionChange(reason) : RESTORE_CHANGE,
      () => {
        toast.success(
          `${terms.attendanceSingular} ${
            inclusion.included ? "excluded from" : "restored to"
          } analytics.`
        );
        close();
      }
    );

  const actionLabel = inclusion.included
    ? "Exclude from analytics"
    : "Restore to analytics";

  return (
    <Box mt="4" borderWidth="1px" borderRadius="md" p={3}>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        flexWrap="wrap"
      >
        <Badge colorPalette={inclusion.included ? "green" : "gray"}>
          {inclusion.included
            ? "Included in analytics"
            : "Excluded from analytics"}
        </Badge>
        <Can perm="attendance.manage">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsConfirming(true)}
            disabled={isSaving}
          >
            {actionLabel}
          </Button>
        </Can>
      </Flex>
      {inclusion.reason && (
        <Text fontSize="sm" mt={2}>
          Reason: {inclusion.reason}
        </Text>
      )}
      {inclusion.excludedAt && (
        <Text fontSize="sm" color="gray.500">
          Excluded date: {format(new Date(inclusion.excludedAt), "dd MMM yyyy")}
        </Text>
      )}

      <ConfirmDialog
        open={isConfirming}
        title={
          inclusion.included
            ? `Exclude this ${session} from analytics?`
            : `Restore this ${session} to analytics?`
        }
        body={
          inclusion.included ? (
            <>
              <Text mb={4}>
                {`This ${session} will remain available in ${session} history, but it will not count toward organisation or ${member} analytics.`}
              </Text>
              <Field.Root>
                <Field.Label>Reason (optional)</Field.Label>
                <Textarea
                  value={reason}
                  maxLength={ANALYTICS_EXCLUSION_REASON_MAX}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Attendance was incompletely recorded"
                />
                <Field.HelperText>
                  {`${reason.length}/${ANALYTICS_EXCLUSION_REASON_MAX} characters`}
                </Field.HelperText>
              </Field.Root>
            </>
          ) : (
            `Its stored attendance will count again in organisation and ${member} analytics.`
          )
        }
        cancelLabel="Cancel"
        confirmLabel={inclusion.included ? "Exclude from analytics" : "Restore"}
        confirmPalette={inclusion.included ? "orange" : "blue"}
        loading={isSaving}
        onConfirm={confirm}
        onClose={close}
      />
    </Box>
  );
};

export default AnalyticsInclusionPanel;
