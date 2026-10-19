import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import {
  LedgerPostingIntentRead,
  LedgerPostingIntentRecord,
} from "helpers/ledgerPostingIntent";
import {
  POSTING_STORAGE_UNAVAILABLE_MESSAGE,
  POSTING_UNKNOWN_RECORD_MESSAGE,
} from "hooks/useLedgerPostings";
import { formatLagosTimestamp } from "helpers/openingBalances";
import { postingSummaryText } from "helpers/ledgerPostings";
import { formatBusinessDate } from "helpers/financeCompliance";

/**
 * The block shown while a financial posting is unconfirmed.
 *
 * Unlike the lifecycle intent notice, this one never offers a "discard"
 * action: a posting is money, and only a proved outcome may clear it. The
 * officer can resend the exact stored body with the same key, which either
 * posts once or returns the original journal.
 */
const PostingIntentNotice = ({
  read,
  canManage,
  isPosting,
  isRechecking,
  onRetry,
  onRecheck,
}: {
  read: LedgerPostingIntentRead;
  canManage: boolean;
  isPosting: boolean;
  isRechecking: boolean;
  onRetry: (record: LedgerPostingIntentRecord) => void;
  onRecheck: () => void;
}) => {
  if (read.kind === "none") return null;

  if (read.kind === "storage-unavailable") {
    return (
      <Box
        role="alert"
        borderWidth="1px"
        borderColor="border.warning"
        borderRadius="md"
        p={3}
        bg="bg.panel"
      >
        <Text fontSize="sm" fontWeight="semibold" mb={1}>
          Financial postings are blocked
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {POSTING_STORAGE_UNAVAILABLE_MESSAGE}
        </Text>
      </Box>
    );
  }

  if (read.kind === "unknown") {
    return (
      <Box
        role="alert"
        borderWidth="1px"
        borderColor="border.error"
        borderRadius="md"
        p={3}
        bg="bg.panel"
      >
        <Text fontSize="sm" fontWeight="semibold" mb={1}>
          A posting record can't be read
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {POSTING_UNKNOWN_RECORD_MESSAGE}
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap={3}>
      {read.intents.map((record) => {
        const started = formatLagosTimestamp(record.startedAt);
        return (
          <Box
            key={record.key}
            role="alert"
            borderWidth="1px"
            borderColor="border.warning"
            borderRadius="md"
            p={3}
            bg="bg.panel"
          >
            <Stack gap={2}>
              <Text fontSize="sm" fontWeight="semibold">
                A financial posting is unconfirmed
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {postingSummaryText(record.summary)}
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {`Business date: ${formatBusinessDate(record.summary.businessDate)}`}
                {started ? ` · first attempted ${started}` : ""}
              </Text>
              {record.lastFailure && (
                <Text fontSize="sm" color="fg.muted">
                  {record.lastFailure}
                </Text>
              )}
              <Text fontSize="sm" color="fg.muted">
                Retry sends the exact original request with the same request key. If it was
                already saved, the server returns the original journal and does not post it
                again. Do not enter this transaction from a new form.
              </Text>
              <Flex gap={2} wrap="wrap">
                {record.retryMode === "retry" ? (
                  <Button
                    size="sm"
                    colorPalette="teal"
                    loading={isPosting}
                    disabled={!canManage || isPosting}
                    onClick={() => onRetry(record)}
                  >
                    Retry this posting
                  </Button>
                ) : (
                  <Text fontSize="sm" color="fg.muted">
                    Resending this request cannot fix it. An owner or finance manager must
                    resolve the earlier attempt from the unconfirmed attempts list before
                    this transaction can be relied on.
                  </Text>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  loading={isRechecking}
                  onClick={onRecheck}
                >
                  Recheck the books
                </Button>
              </Flex>
              {!canManage && record.retryMode === "retry" && (
                <Text fontSize="sm" color="fg.muted">
                  Only an officer with permission to manage finance can retry this posting.
                </Text>
              )}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
};

export default PostingIntentNotice;
