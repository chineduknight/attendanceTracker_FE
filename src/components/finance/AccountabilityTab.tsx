import { ReactNode, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { FaUserCheck } from "react-icons/fa";
import { toast } from "react-toastify";
import { financeRequest, orgRequest } from "services";
import {
  useQueryWrapper,
  patchRequest,
  useMutationWrapper,
  queryClient,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import ConfirmModal from "components/finance/ConfirmModal";

interface Props {
  organisationId: string;
  prefillMemberId: string;
}

type PendingConfirm = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmColorScheme: string;
  action: () => void;
};

const AccountabilityTab = ({ organisationId, prefillMemberId }: Props) => {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    prefillMemberId ? { [prefillMemberId]: true } : {}
  );
  const [bulkDate, setBulkDate] = useState("");
  const [rowDates, setRowDates] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const memUrl = convertParamsToString(orgRequest.MEMBERS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["finance-members", organisationId], memUrl);
  const members: Array<Record<string, any>> = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries(["finance-members", organisationId]);
    queryClient.invalidateQueries(["finance-compliance", organisationId]);
  };
  const { mutate, mutateAsync } = useMutationWrapper(patchRequest);

  const patchOne = (memberId: string, financialStartDate: string | null) => {
    const url = convertParamsToString(financeRequest.FINANCIAL_START_DATE, { memberId });
    mutate(
      { url, data: { organisationId, financialStartDate } },
      {
        onSuccess: () => {
          toast.success("Updated");
          invalidate();
        },
      }
    );
  };

  const applyBulk = async () => {
    if (!bulkDate) return toast.error("Pick a date");
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) return toast.error("Select members");
    const promises: Promise<unknown>[] = ids.map((id) => {
      const url = convertParamsToString(financeRequest.FINANCIAL_START_DATE, { memberId: id });
      return mutateAsync({ url, data: { organisationId, financialStartDate: bulkDate } });
    });
    const results = await Promise.allSettled(promises);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(`Applied to ${ok} member(s)`);
    } else {
      toast.warn(`Applied to ${ok}, ${failed} failed`);
    }
    invalidate();
  };

  // --- Confirmation triggers (financial start date is a critical action) ---
  const runConfirm = () => {
    confirm?.action();
    setConfirm(null);
  };

  const requestSave = (m: Record<string, any>) => {
    const id = m.id ?? m._id;
    const date = rowDates[id] ?? m.financialStartDate ?? "";
    setConfirm({
      title: "Set financial start date",
      body: `Set ${m.name}'s financial start date to ${date}? They will be financially accountable from that month onward.`,
      confirmLabel: "Yes, set date",
      confirmColorScheme: "purple",
      action: () => patchOne(id, date),
    });
  };

  const requestClear = (m: Record<string, any>) => {
    const id = m.id ?? m._id;
    setConfirm({
      title: "Clear financial start date",
      body: `Clear ${m.name}'s financial start date? They will no longer be financially accountable.`,
      confirmLabel: "Yes, clear",
      confirmColorScheme: "red",
      action: () => patchOne(id, null),
    });
  };

  const requestBulk = () => {
    if (!bulkDate) return toast.error("Pick a date");
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) return toast.error("Select members");
    setConfirm({
      title: "Set start date for selected",
      body: `Set the financial start date to ${bulkDate} for ${ids.length} selected member(s)? They will be financially accountable from that month onward.`,
      confirmLabel: `Yes, set ${ids.length}`,
      confirmColorScheme: "purple",
      action: applyBulk,
    });
  };

  if (isLoading) return <Spinner />;

  return (
    <Box>
      <Heading size="md" mb={4}>
        Member accountability
      </Heading>

      <Flex gap={3} mb={4} align="center" wrap="wrap">
        <Input
          type="date"
          maxW="xs"
          value={bulkDate}
          onChange={(e) => setBulkDate(e.target.value)}
        />
        <Button colorScheme="purple" variant="solid" leftIcon={<FaUserCheck />} onClick={requestBulk}>
          Set start date for selected
        </Button>
      </Flex>

      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th></Th>
              <Th>Name</Th>
              <Th>Current start date</Th>
              <Th>Set</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members.map((m) => {
              const id = m.id ?? m._id;
              return (
                <Tr key={id}>
                  <Td>
                    <Checkbox
                      isChecked={!!selected[id]}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [id]: e.target.checked }))
                      }
                    />
                  </Td>
                  <Td>{m.name}</Td>
                  <Td>{m.financialStartDate ?? <Text as="span" color="gray.400">none</Text>}</Td>
                  <Td>
                    <Flex gap={2} align="center">
                      <Input
                        type="date"
                        size="sm"
                        maxW="40"
                        value={rowDates[id] ?? m.financialStartDate ?? ""}
                        onChange={(e) =>
                          setRowDates((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                      />
                      <Button
                        size="xs"
                        colorScheme="purple"
                        variant="outline"
                        isDisabled={!rowDates[id] && !m.financialStartDate}
                        onClick={() => requestSave(m)}
                      >
                        Save
                      </Button>
                      <Button
                        size="xs"
                        colorScheme="red"
                        variant="outline"
                        isDisabled={!m.financialStartDate}
                        onClick={() => requestClear(m)}
                      >
                        Clear
                      </Button>
                    </Flex>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      <ConfirmModal
        isOpen={!!confirm}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.confirmLabel}
        confirmColorScheme={confirm?.confirmColorScheme}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </Box>
  );
};

export default AccountabilityTab;
