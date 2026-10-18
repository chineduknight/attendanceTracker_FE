import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { formatKobo } from "helpers/financeConstants";
import { OpeningPreview } from "helpers/openingBalances";

/**
 * A clearly-labelled preview of the proposal's own figures. The backend
 * computes, stores and verifies the authoritative totals and deltas.
 */
const OpeningPreviewCard = ({
  preview,
  title = "Proposal preview",
}: {
  preview: OpeningPreview | null;
  title?: string;
}) => (
  <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3} bg="bg.panel">
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="semibold">
        {title}
      </Text>
      {preview === null ? (
        <Text fontSize="sm" color="fg.muted">
          Enter every counted amount to see a preview. Nothing is calculated until then.
        </Text>
      ) : (
        <>
          <Flex justify="space-between" gap={3}>
            <Text fontSize="sm" color="fg.muted">
              Cash and bank counted
            </Text>
            <Text fontSize="sm" fontWeight="medium">
              {formatKobo(preview.moneyKobo)}
            </Text>
          </Flex>
          <Flex justify="space-between" gap={3}>
            <Text fontSize="sm" color="fg.muted">
              Individually identified member money
            </Text>
            <Text fontSize="sm" fontWeight="medium">
              {formatKobo(preview.memberMoneyKobo)}
            </Text>
          </Flex>
          <Flex justify="space-between" gap={3}>
            <Text fontSize="sm" color="fg.muted">
              Remaining opening balance equity
            </Text>
            <Text fontSize="sm" fontWeight="medium">
              {formatKobo(preview.equityKobo)}
            </Text>
          </Flex>
          {preview.memberExceedsMoney && (
            <Text role="alert" fontSize="sm" color="fg.error">
              Member money cannot be more than the cash and bank money counted.
            </Text>
          )}
          <Text fontSize="xs" color="fg.muted">
            Preview only. The backend recalculates and verifies these figures, and the
            approver confirms its fingerprint.
          </Text>
        </>
      )}
    </Stack>
  </Box>
);

export default OpeningPreviewCard;
