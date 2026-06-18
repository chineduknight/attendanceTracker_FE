import { useState } from "react";
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
import { toast } from "react-toastify";
import { financeRequest, orgRequest } from "services";
import {
  useQueryWrapper,
  patchRequest,
  useMutationWrapper,
  queryClient,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";

interface Props {
  organisationId: string;
  prefillMemberId: string;
}

const AccountabilityTab = ({ organisationId, prefillMemberId }: Props) => {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    prefillMemberId ? { [prefillMemberId]: true } : {}
  );
  const [bulkDate, setBulkDate] = useState("");
  const [rowDates, setRowDates] = useState<Record<string, string>>({});

  const memUrl = convertParamsToString(orgRequest.MEMBERS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["finance-members", organisationId], memUrl);
  const members: Array<Record<string, any>> = data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries(["finance-members", organisationId]);
  const { mutate } = useMutationWrapper(patchRequest);

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

  const applyBulk = () => {
    if (!bulkDate) return toast.error("Pick a date");
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) return toast.error("Select members");
    ids.forEach((id) => patchOne(id, bulkDate));
    toast.success(`Applied to ${ids.length} member(s)`);
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
        <Button colorScheme="green" onClick={applyBulk}>
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
                        colorScheme="blue"
                        onClick={() => patchOne(id, rowDates[id] ?? m.financialStartDate ?? "")}
                      >
                        Save
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => patchOne(id, null)}>
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
    </Box>
  );
};

export default AccountabilityTab;
