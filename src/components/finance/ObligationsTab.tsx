import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Text,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  useDisclosure,
  Badge,
} from "@chakra-ui/react";
import { FaPlus, FaEye, FaPen, FaTrash } from "react-icons/fa";
import { toast } from "react-toastify";
import { financeRequest } from "services";
import {
  useQueryWrapper,
  useMutationWrapper,
  postRequest,
  putRequest,
  deleteRequest,
  queryClient,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { formatMoney } from "helpers/financeConstants";
import ConfirmModal from "components/finance/ConfirmModal";
import { Obligation, ObligationType } from "components/finance/financeTypes";

interface Props {
  organisationId: string;
  selectedObligationId: string;
  onSelectObligation: (id: string) => void;
}

const ObligationsTab = ({ organisationId, selectedObligationId, onSelectObligation }: Props) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editing, setEditing] = useState<Obligation | null>(null);
  const [toDelete, setToDelete] = useState<Obligation | null>(null);
  const [type, setType] = useState<ObligationType>("dues");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [amountPerMonth, setAmountPerMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");

  const listUrl = convertParamsToString(financeRequest.LIST_OBLIGATIONS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["finance-obligations", organisationId], listUrl);
  const obligations: Obligation[] = data?.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries(["finance-obligations", organisationId]);

  const { mutate: createMutate, isLoading: creating } = useMutationWrapper(postRequest, () => {
    toast.success("Obligation created");
    invalidate();
    closeModal();
  });
  const { mutate: renameMutate, isLoading: renaming } = useMutationWrapper(putRequest, () => {
    toast.success("Obligation updated");
    invalidate();
    closeModal();
  });
  const { mutate: deleteMutate } = useMutationWrapper(deleteRequest, () => {
    toast.success("Obligation deleted");
    invalidate();
  });

  const resetForm = () => {
    setEditing(null);
    setType("dues");
    setName("");
    setYear("");
    setAmountPerMonth("");
    setAmount("");
    setDate("");
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  const openCreate = () => {
    resetForm();
    onOpen();
  };

  const openEdit = (ob: Obligation) => {
    setEditing(ob);
    setType(ob.type);
    setName(ob.name);
    setYear(ob.year ? String(ob.year) : "");
    setAmountPerMonth(ob.amountPerMonth ? String(ob.amountPerMonth) : "");
    setAmount(ob.amount ? String(ob.amount) : "");
    setDate(ob.date ?? "");
    onOpen();
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editing) {
      // amounts immutable — name only
      const url = convertParamsToString(financeRequest.UPDATE_OBLIGATION, { id: editing.id });
      renameMutate({ url, data: { organisationId, name } });
      return;
    }
    const data =
      type === "dues"
        ? { organisationId, type, name, year: Number(year), amountPerMonth: Number(amountPerMonth) }
        : { organisationId, type, name, amount: Number(amount), date };
    createMutate({ url: financeRequest.OBLIGATIONS, data });
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    const url = convertParamsToString(financeRequest.ONE_OBLIGATION, {
      organisationId,
      id: toDelete.id,
    });
    deleteMutate({ url });
    setToDelete(null);
  };

  if (isLoading) return <Spinner />;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="md">Obligations</Heading>
        <Button colorScheme="teal" variant="solid" leftIcon={<FaPlus />} onClick={openCreate}>
          Create obligation
        </Button>
      </Flex>

      {obligations.length === 0 ? (
        <Text>No obligations yet. Create one to get started.</Text>
      ) : (
        <SimpleGrid columns={[1, 2, 3]} spacing={4}>
          {obligations.map((ob) => (
            <Box
              key={ob.id}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              borderColor={ob.id === selectedObligationId ? "blue.400" : "gray.200"}
              bg="white"
            >
              <Flex justify="space-between" align="center" mb={2}>
                <Text fontWeight="bold">{ob.name}</Text>
                <Badge colorScheme={ob.type === "dues" ? "purple" : "orange"}>{ob.type}</Badge>
              </Flex>
              <Text fontSize="sm" color="gray.600">
                {ob.type === "dues"
                  ? `${ob.year} · ${formatMoney(ob.amountPerMonth ?? 0)}/mo`
                  : `${ob.date} · ${formatMoney(ob.amount ?? 0)}`}
              </Text>
              <Flex gap={2} mt={3}>
                <Button
                  size="sm"
                  colorScheme="blue"
                  variant="solid"
                  leftIcon={<FaEye />}
                  onClick={() => onSelectObligation(ob.id)}
                >
                  View compliance
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="gray"
                  leftIcon={<FaPen />}
                  onClick={() => openEdit(ob)}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="ghost"
                  leftIcon={<FaTrash />}
                  onClick={() => setToDelete(ob)}
                >
                  Delete
                </Button>
              </Flex>
            </Box>
          ))}
        </SimpleGrid>
      )}

      <Modal isOpen={isOpen} onClose={closeModal}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? "Rename obligation" : "Create obligation"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={3}>
              <FormLabel>Type</FormLabel>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as ObligationType)}
                isDisabled={!!editing}
              >
                <option value="dues">Dues (yearly)</option>
                <option value="levy">Levy (one-off)</option>
              </Select>
            </FormControl>
            <FormControl mb={3} isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormControl>
            {type === "dues" ? (
              <>
                <FormControl mb={3}>
                  <FormLabel>Year</FormLabel>
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
                <FormControl mb={3}>
                  <FormLabel>Amount per month</FormLabel>
                  <Input
                    type="number"
                    value={amountPerMonth}
                    onChange={(e) => setAmountPerMonth(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
              </>
            ) : (
              <>
                <FormControl mb={3}>
                  <FormLabel>Amount</FormLabel>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
                <FormControl mb={3}>
                  <FormLabel>Date</FormLabel>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeModal}>
              Cancel
            </Button>
            <Button colorScheme="teal" variant="solid" onClick={submit} isLoading={creating || renaming}>
              {editing ? "Save" : "Create"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={!!toDelete}
        title="Delete obligation"
        body={`Delete "${toDelete?.name}"? This cannot be undone.`}
        confirmLabel="Yes, delete"
        cancelLabel="No"
        confirmColorScheme="red"
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </Box>
  );
};

export default ObligationsTab;
