import { useState } from "react";
import { Box, Button, Flex, Heading, Select, Text, Spinner } from "@chakra-ui/react";
import { FaMoneyBillWave } from "react-icons/fa";
import { financeRequest, orgRequest } from "services";
import { useQueryWrapper, queryClient } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import { Obligation, ComplianceRow } from "components/finance/financeTypes";
import RecordPaymentModal from "components/finance/RecordPaymentModal";
import { Can } from "rbac/Can";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface Props {
  organisationId: string;
}

const PaymentsTab = ({ organisationId }: Props) => {
  const terms = useTerms();
  const [obligationId, setObligationId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [open, setOpen] = useState(false);

  const obUrl = convertParamsToString(financeRequest.LIST_OBLIGATIONS, { organisationId });
  const memUrl = convertParamsToString(orgRequest.MEMBERS, { organisationId });
  const { data: obData, isLoading: obLoading } = useQueryWrapper(
    queryKeys.finance.obligations(organisationId),
    obUrl
  );
  // Same endpoint and payload shape as the members UI, so share its cache.
  const { data: memData, isLoading: memLoading } = useQueryWrapper(
    queryKeys.members(organisationId),
    memUrl
  );

  // Fetch the selected obligation's compliance so the Correct grid can pre-fill
  // and lock months. Shares the cache key with the Compliance tab.
  const complianceUrl = obligationId
    ? convertParamsToString(financeRequest.COMPLIANCE, {
        organisationId,
        id: obligationId,
      })
    : "";
  const { data: compData } = useQueryWrapper(
    queryKeys.finance.compliance(organisationId, obligationId),
    complianceUrl,
    { enabled: Boolean(obligationId) }
  );

  const obligations: Obligation[] = obData?.data ?? [];
  const members: Array<Record<string, any>> = memData?.data ?? [];
  const selectedObligation = obligations.find((o) => o.id === obligationId);
  const selectedMember = members.find((m) => (m.id ?? m._id) === memberId);
  const complianceRows: ComplianceRow[] = compData?.data?.rows ?? [];
  const selectedRow = complianceRows.find((r) => r.memberId === memberId);

  if (obLoading || memLoading) return <Spinner />;

  return (
    <Box>
      <Heading size="md" mb={4}>
        Record / correct a payment
      </Heading>
      <Flex direction={["column", "row"]} gap={4} maxW="2xl">
        <Select
          placeholder="Select obligation"
          value={obligationId}
          onChange={(e) => setObligationId(e.target.value)}
        >
          {obligations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.type})
            </option>
          ))}
        </Select>
        <Select
          placeholder={`Select ${lowerTerm(terms.memberSingular)}`}
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          {members.map((m) => {
            const id = m.id ?? m._id;
            return (
              <option key={id} value={id}>
                {m.name}
              </option>
            );
          })}
        </Select>
        <Can perm="finance.manage">
          <Button
            colorScheme="green"
            variant="solid"
            leftIcon={<FaMoneyBillWave />}
            isDisabled={!obligationId || !memberId}
            onClick={() => setOpen(true)}
          >
            Record payment
          </Button>
        </Can>
      </Flex>

      {!obligations.length && <Text mt={4}>Create an obligation first.</Text>}

      {open && selectedObligation && selectedMember && (
        <RecordPaymentModal
          isOpen={open}
          onClose={() => setOpen(false)}
          organisationId={organisationId}
          obligation={selectedObligation}
          memberId={memberId}
          memberName={selectedMember.name}
          complianceRow={selectedRow}
          onSuccess={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.finance.complianceRoot(organisationId),
            })
          }
        />
      )}
    </Box>
  );
};

export default PaymentsTab;
