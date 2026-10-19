import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";

/**
 * Shown over a posting form after another tab changed this organisation's
 * posting record while the form was open (F2B-1 integration finding F1).
 *
 * This tab only sees that the record changed. It cannot tell whether the
 * other tab's posting was saved, refused or voided, or whether it was the
 * same money, so the copy claims none of those. The officer's entries stay on
 * screen but locked; the only way forward is to check the journal entries and
 * deliberately start a new posting.
 */
const PostingSupersededNotice = ({
  hasPendingIntent,
  isRechecking,
  onRecheck,
  onStartNew,
}: {
  /** Another posting is still unconfirmed, so a new one can't start yet. */
  hasPendingIntent: boolean;
  isRechecking: boolean;
  onRecheck: () => void;
  onStartNew: () => void;
}) => (
  <Box
    role="alert"
    borderWidth="1px"
    borderColor="border.warning"
    borderRadius="md"
    p={3}
    bg="bg.panel"
  >
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="semibold">
        Check the journal entries before posting this
      </Text>
      <Text fontSize="sm" color="fg.muted">
        Another open tab changed this organisation's posting record while this form was
        open. This tab can't tell whether that posting was saved, refused or voided, or
        whether it was the same money as this form.
      </Text>
      <Text fontSize="sm" color="fg.muted">
        Your entries below are locked. Check the journal entries for this transaction. If
        it isn't there, start a new posting and enter it again.
      </Text>
      {hasPendingIntent && (
        <Text fontSize="sm" color="fg.muted">
          Another posting is still unconfirmed, so a new posting can't start until it is
          proved.
        </Text>
      )}
      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onRecheck} loading={isRechecking}>
          Recheck journal entries
        </Button>
        <Button
          variant="outline"
          onClick={onStartNew}
          disabled={hasPendingIntent || isRechecking}
        >
          Start a new posting
        </Button>
      </Flex>
    </Stack>
  </Box>
);

export default PostingSupersededNotice;
