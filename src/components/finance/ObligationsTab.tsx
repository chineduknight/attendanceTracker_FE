import { FormEvent, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputLeftAddon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Progress,
  Stack,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { FaChevronRight, FaEllipsisV, FaPen, FaPlus, FaTrash } from "react-icons/fa";
import { toast } from "react-toastify";
import { financeRequest } from "services/api/request";
import {
  deleteRequest,
  postRequest,
  putRequest,
  queryClient,
  useMutationWrapper,
} from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { formatMoney } from "helpers/financeConstants";
import { collectionPct, formatBusinessDate, formatPct } from "helpers/financeCompliance";
import { invalidateFinance } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import { Obligation, ObligationType } from "components/finance/financeTypes";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import ConfirmModal from "components/finance/ConfirmModal";
import FinanceSheet from "components/finance/FinanceSheet";
import FilterChips from "components/finance/FilterChips";

interface ObligationsTabProps {
  organisationId: string;
  obligations: readonly Obligation[];
  onOpen: (id: string) => void;
}

type FormRequest = { mode: "create" } | { mode: "rename"; obligation: Obligation };

const TYPE_LABEL: Record<ObligationType, string> = { dues: "Monthly dues", levy: "One-off levy" };

const describe = (o: Obligation) =>
  o.type === "dues"
    ? `${o.year ?? ""} · ${formatMoney(o.amountPerMonth ?? 0)} per month`
    : `${o.date ? formatBusinessDate(o.date) : "No date"} · ${formatMoney(o.amount ?? 0)}`;

/** Progress only renders when the backend sends the obligation's summary. */
const SummaryLine = ({ obligation }: { obligation: Obligation }) => {
  const muted = useColorModeValue("gray.600", "gray.300");
  const summary = obligation.summary;
  if (!summary) return null;
  const pct = collectionPct(summary);
  return (
    <Stack spacing={1}>
      <Progress value={pct} size="xs" colorScheme="green" borderRadius="full" aria-label="Share collected" />
      <Flex justify="space-between" fontSize="xs" color={muted} gap={2} wrap="wrap">
        <Text>{`${formatMoney(summary.totalCollected)} of ${formatMoney(summary.totalExpected)} · ${formatPct(pct)}`}</Text>
        <Text>{`${summary.paidMembers} of ${summary.accountableMembers} paid up`}</Text>
      </Flex>
    </Stack>
  );
};

const ObligationForm = ({
  request,
  organisationId,
  onDone,
}: {
  request: FormRequest;
  organisationId: string;
  onDone: () => void;
}) => {
  const editing = request.mode === "rename" ? request.obligation : null;
  const [type, setType] = useState<ObligationType>(editing?.type ?? "dues");
  const [name, setName] = useState(editing?.name ?? "");
  const [year, setYear] = useState(String(editing?.year ?? new Date().getFullYear()));
  const [perMonth, setPerMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const saved = (message: string) => () => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: queryKeys.finance.obligations(organisationId) });
    onDone();
  };
  const create = useMutationWrapper(postRequest, saved("Obligation created"));
  const rename = useMutationWrapper(putRequest, saved("Obligation renamed"));

  const errors = {
    name: !name.trim() ? "Give it a name" : "",
    year: type === "dues" && !/^\d{4}$/.test(year) ? "Enter a 4-digit year" : "",
    perMonth: type === "dues" && !(Number(perMonth) > 0) ? "Enter the monthly amount" : "",
    amount: type === "levy" && !(Number(amount) > 0) ? "Enter the levy amount" : "",
    date: type === "levy" && !date ? "Pick the levy date" : "",
  };
  const relevant = editing ? [errors.name] : Object.values(errors);
  const show = (message: string) => submitted && !!message;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (relevant.some(Boolean)) return;
    if (editing) {
      rename.mutate({
        url: convertParamsToString(financeRequest.UPDATE_OBLIGATION, { id: editing.id }),
        data: { organisationId, name: name.trim() },
      });
      return;
    }
    const data =
      type === "dues"
        ? { organisationId, type, name: name.trim(), year: Number(year), amountPerMonth: Number(perMonth) }
        : { organisationId, type, name: name.trim(), amount: Number(amount), date };
    create.mutate({ url: financeRequest.OBLIGATIONS, data });
  };

  return (
    <Stack as="form" spacing={4} onSubmit={submit} noValidate>
      {!editing && (
        <FormControl as="fieldset">
          <FormLabel as="legend">Type</FormLabel>
          <FilterChips<ObligationType>
            label="Obligation type"
            value={type}
            onChange={setType}
            options={[
              { value: "dues", label: TYPE_LABEL.dues },
              { value: "levy", label: TYPE_LABEL.levy },
            ]}
          />
        </FormControl>
      )}
      <FormControl isInvalid={show(errors.name)}>
        <FormLabel htmlFor="obligation-name">Name</FormLabel>
        <Input
          id="obligation-name"
          placeholder={type === "dues" ? "e.g. 2026 Monthly Dues" : "e.g. Building Levy"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FormErrorMessage>{errors.name}</FormErrorMessage>
        {editing && <FormHelperText>Amounts can't be changed once created.</FormHelperText>}
      </FormControl>
      {!editing && type === "dues" && (
        <Flex gap={3}>
          <FormControl isInvalid={show(errors.year)} flex="1">
            <FormLabel htmlFor="obligation-year">Year</FormLabel>
            <Input
              id="obligation-year"
              type="number"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <FormErrorMessage>{errors.year}</FormErrorMessage>
          </FormControl>
          <FormControl isInvalid={show(errors.perMonth)} flex="2">
            <FormLabel htmlFor="obligation-per-month">Per month</FormLabel>
            <InputGroup>
              <InputLeftAddon>₦</InputLeftAddon>
              <Input
                id="obligation-per-month"
                type="number"
                inputMode="decimal"
                value={perMonth}
                onChange={(e) => setPerMonth(e.target.value)}
              />
            </InputGroup>
            <FormErrorMessage>{errors.perMonth}</FormErrorMessage>
          </FormControl>
        </Flex>
      )}
      {!editing && type === "levy" && (
        <Flex gap={3} direction={{ base: "column", sm: "row" }}>
          <FormControl isInvalid={show(errors.amount)}>
            <FormLabel htmlFor="obligation-amount">Amount</FormLabel>
            <InputGroup>
              <InputLeftAddon>₦</InputLeftAddon>
              <Input
                id="obligation-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </InputGroup>
            <FormErrorMessage>{errors.amount}</FormErrorMessage>
          </FormControl>
          <FormControl isInvalid={show(errors.date)}>
            <FormLabel htmlFor="obligation-date">Date</FormLabel>
            <Input id="obligation-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <FormErrorMessage>{errors.date}</FormErrorMessage>
          </FormControl>
        </Flex>
      )}
      {!editing && (
        <Text fontSize="sm" color="gray.500">
          Amounts and dates can't be changed after creating.
        </Text>
      )}
      <Button
        type="submit"
        size="lg"
        colorScheme="teal"
        isLoading={create.isLoading || rename.isLoading}
      >
        {editing ? "Save name" : "Create obligation"}
      </Button>
    </Stack>
  );
};

/** All active obligations; tap one to collect against it. */
const ObligationsTab = ({ organisationId, obligations, onOpen }: ObligationsTabProps) => {
  const canManage = usePermissions().has("finance.manage");
  const [form, setForm] = useState<FormRequest | null>(null);
  const [toDelete, setToDelete] = useState<Obligation | null>(null);
  const muted = useColorModeValue("gray.600", "gray.300");
  const hoverBg = useColorModeValue("gray.50", "whiteAlpha.100");

  const { mutate: remove } = useMutationWrapper(deleteRequest, () => {
    toast.success("Obligation deleted");
    invalidateFinance(organisationId);
  });

  return (
    <Stack spacing={4}>
      {canManage && (
        <Button colorScheme="teal" leftIcon={<FaPlus />} onClick={() => setForm({ mode: "create" })}>
          New obligation
        </Button>
      )}

      {obligations.length === 0 ? (
        <Text color={muted} textAlign="center" py={8}>
          {canManage
            ? "No obligations yet. Create monthly dues or a one-off levy to start collecting."
            : "No obligations yet."}
        </Text>
      ) : (
        <GroupedList>
          {obligations.map((o) => (
            <GroupedListItem key={o.id} p={0}>
              <Flex align="center">
                <Box
                  as="button"
                  type="button"
                  onClick={() => onOpen(o.id)}
                  flex="1"
                  minW={0}
                  textAlign="left"
                  px={{ base: 3, md: 5 }}
                  py={3}
                  _hover={{ bg: hoverBg }}
                  _focusVisible={{ boxShadow: "outline", outline: "none" }}
                >
                  <Stack spacing={1.5}>
                    <Flex align="center" gap={2}>
                      <Text fontWeight="semibold" noOfLines={1}>
                        {o.name}
                      </Text>
                      <Badge colorScheme={o.type === "dues" ? "purple" : "orange"} flexShrink={0}>
                        {o.type === "dues" ? "Dues" : "Levy"}
                      </Badge>
                    </Flex>
                    <Text fontSize="sm" color={muted}>
                      {describe(o)}
                    </Text>
                    <SummaryLine obligation={o} />
                  </Stack>
                </Box>
                {canManage ? (
                  <Menu placement="bottom-end">
                    <MenuButton
                      as={IconButton}
                      aria-label={`More actions for ${o.name}`}
                      icon={<FaEllipsisV />}
                      variant="ghost"
                      mr={1}
                    />
                    <MenuList>
                      <MenuItem icon={<FaPen />} onClick={() => setForm({ mode: "rename", obligation: o })}>
                        Rename
                      </MenuItem>
                      <MenuItem icon={<FaTrash />} color="red.500" onClick={() => setToDelete(o)}>
                        Delete
                      </MenuItem>
                    </MenuList>
                  </Menu>
                ) : (
                  <Box as={FaChevronRight} color="gray.400" mr={4} aria-hidden="true" />
                )}
              </Flex>
            </GroupedListItem>
          ))}
        </GroupedList>
      )}

      {form && (
        <FinanceSheet
          isOpen
          onClose={() => setForm(null)}
          title={form.mode === "create" ? "New obligation" : "Rename obligation"}
        >
          <ObligationForm request={form} organisationId={organisationId} onDone={() => setForm(null)} />
        </FinanceSheet>
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title="Delete obligation"
        body={`Delete "${toDelete?.name}"? This cannot be undone.`}
        confirmLabel="Yes, delete"
        cancelLabel="No"
        confirmColorScheme="red"
        onConfirm={() => {
          if (toDelete) {
            remove({
              url: convertParamsToString(financeRequest.ONE_OBLIGATION, {
                organisationId,
                id: toDelete.id,
              }),
            });
          }
          setToDelete(null);
        }}
        onClose={() => setToDelete(null)}
      />
    </Stack>
  );
};

export default ObligationsTab;
