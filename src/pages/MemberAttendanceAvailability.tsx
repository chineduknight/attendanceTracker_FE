import { useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { format, isBefore, parseISO } from "date-fns";
import useGlobalStore from "zStore";
import { useMembers } from "hooks/useMembers";
import {
  useAttendanceAvailabilityForMember,
  useAttendanceAvailabilityMutations,
} from "hooks/useAttendanceAvailability";
import { AttendanceAvailability } from "helpers/attendanceAvailability";
import { Can } from "rbac/Can";
import { PROTECTED_PATHS } from "routes/pagePath";

type FormValue = { startDate: string; endDate: string; reason: string };
const EMPTY_FORM: FormValue = { startDate: "", endDate: "", reason: "" };

const displayDate = (value: string) => format(parseISO(value), "dd MMM yyyy");

const MemberAttendanceAvailability = () => {
  const organisationId = useGlobalStore((state) => state.organisation.id);
  const memberId = useParams<{ memberId: string }>().memberId ?? "";
  const navigate = useNavigate();
  const { members } = useMembers(organisationId);
  const member = members.find((candidate) => candidate.id === memberId);
  const { periods, isLoading, isError } = useAttendanceAvailabilityForMember(
    organisationId,
    memberId
  );
  const { create, update, archive, isSaving } =
    useAttendanceAvailabilityMutations(organisationId);
  const [form, setForm] = useState<FormValue>(EMPTY_FORM);
  const [editing, setEditing] = useState<AttendanceAvailability | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const { current, upcoming, past } = useMemo(() => {
    const currentPeriods = periods.filter(
      (period) => period.startDate <= today && period.endDate >= today
    );
    const upcomingPeriods = periods.filter(
      (period) => period.startDate > today
    );
    const pastPeriods = periods.filter((period) => period.endDate < today);
    return {
      current: currentPeriods,
      upcoming: upcomingPeriods,
      past: pastPeriods,
    };
  }, [periods, today]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
  };

  const submit = () => {
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (isBefore(parseISO(form.endDate), parseISO(form.startDate))) {
      toast.error("End date cannot be before start date");
      return;
    }
    const reason = form.reason.trim();
    if (editing) {
      update(
        editing.id,
        {
          startDate: form.startDate,
          endDate: form.endDate,
          ...(reason ? { reason } : {}),
        },
        resetForm
      );
    } else {
      create(
        {
          memberId,
          startDate: form.startDate,
          endDate: form.endDate,
          ...(reason ? { reason } : {}),
        },
        resetForm
      );
    }
  };

  const startEditing = (period: AttendanceAvailability) => {
    setEditing(period);
    setForm({
      startDate: period.startDate,
      endDate: period.endDate,
      reason: period.reason ?? "",
    });
  };

  const remove = (period: AttendanceAvailability) => {
    if (!window.confirm("Remove this attendance availability period?")) return;
    archive(period.id, () => toast.success("Availability period removed"));
  };

  const renderPeriod = (period: AttendanceAvailability) => (
    <Box key={period.id} borderWidth="1px" borderRadius="md" p={4}>
      <Text fontWeight="bold">
        {displayDate(period.startDate)} - {displayDate(period.endDate)}
      </Text>
      <Text color="gray.600">{period.reason || "No reason provided"}</Text>
      <Can perm="attendance.manage">
        <Stack direction="row" mt={3}>
          <Button size="sm" onClick={() => startEditing(period)}>
            Edit
          </Button>
          <Button
            size="sm"
            colorScheme="red"
            variant="outline"
            onClick={() => remove(period)}
          >
            Remove
          </Button>
        </Stack>
      </Can>
    </Box>
  );

  return (
    <Box minH="100vh" bg="gray.50" px={{ base: 4, md: 8 }} py={6}>
      <Button
        variant="link"
        mb={4}
        onClick={() => navigate(PROTECTED_PATHS.VIEW_MEMBER)}
      >
        Back to members
      </Button>
      <Heading size="lg" mb={2}>
        {member?.name ?? "Member"} attendance availability
      </Heading>
      <Text mb={6}>
        This member will not be expected for sessions in an unavailable period.
      </Text>

      <Can perm="attendance.manage">
        <Box bg="white" borderRadius="lg" p={5} mb={8} boxShadow="sm">
          <Heading size="md" mb={4}>
            {editing ? "Edit unavailable period" : "Add unavailable period"}
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>Start date</FormLabel>
              <Input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
              />
            </FormControl>
            <FormControl>
              <FormLabel>End date</FormLabel>
              <Input
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
              />
            </FormControl>
          </SimpleGrid>
          <FormControl mt={4}>
            <FormLabel>Reason (optional)</FormLabel>
            <Textarea
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
              placeholder="Travel, examinations, work assignment..."
            />
          </FormControl>
          <Stack direction="row" mt={4}>
            <Button colorScheme="blue" onClick={submit} isLoading={isSaving}>
              {editing ? "Save changes" : "Add period"}
            </Button>
            {editing && <Button onClick={resetForm}>Cancel</Button>}
          </Stack>
        </Box>
      </Can>

      {isError && (
        <Alert status="error" mb={5}>
          <AlertIcon />
          Unable to load attendance availability.
        </Alert>
      )}
      {isLoading && <Text>Loading attendance availability...</Text>}
      {!isLoading && !isError && periods.length === 0 && (
        <Box bg="white" borderRadius="lg" p={6}>
          <Text>No attendance availability periods have been added.</Text>
        </Box>
      )}
      {!isLoading && !isError && periods.length > 0 && (
        <Stack spacing={6}>
          {current.length > 0 && (
            <Box>
              <Heading size="sm" mb={3}>
                CURRENT
              </Heading>
              <Stack>{current.map(renderPeriod)}</Stack>
            </Box>
          )}
          {upcoming.length > 0 && (
            <Box>
              <Heading size="sm" mb={3}>
                UPCOMING
              </Heading>
              <Stack>{upcoming.map(renderPeriod)}</Stack>
            </Box>
          )}
          {past.length > 0 && (
            <Box>
              <Heading size="sm" mb={3}>
                PAST
              </Heading>
              <Stack>{past.map(renderPeriod)}</Stack>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default MemberAttendanceAvailability;
