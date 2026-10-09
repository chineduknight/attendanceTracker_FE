import { useMemo, useRef, useState } from "react";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  Alert,
  Box,
  Button,
  Heading,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Field,
} from "@chakra-ui/react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { format, isBefore, parseISO } from "date-fns";
import useGlobalStore from "zStore";
import { useMembers } from "hooks/useMembers";
import {
  useAttendanceAvailabilityForMember,
  useAttendanceAvailabilityMutations,
} from "hooks/useAttendanceAvailability";
import { AttendanceAvailability } from "helpers/attendanceAvailability";
import { formatSessionDate } from "helpers/sessionDate";
import { Can } from "rbac/Can";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import PageContainer from "components/layout/PageContainer";
import PageLoader from "components/PageLoader";
import { DateField } from "components/ui/date-field";
import { EmptyState, ErrorState } from "components/ui/states";

type FormValue = { startDate: string; endDate: string; reason: string };
const EMPTY_FORM: FormValue = { startDate: "", endDate: "", reason: "" };

// Periods are calendar days (YYYY-MM-DD): never shift them through a timezone.
const displayDate = (value: string) => formatSessionDate(value, "dd MMM yyyy");

const MemberAttendanceAvailability = () => {
  const { confirm, confirmDialog } = useConfirm();
  const organisationId = useGlobalStore((state) => state.organisation.id);
  const terms = useTerms();
  const memberId = useParams<{ memberId: string }>().memberId ?? "";
  const { members } = useMembers(organisationId);
  const member = members.find((candidate) => candidate.id === memberId);
  const { periods, isLoading, isError, refetch } = useAttendanceAvailabilityForMember(
    organisationId,
    memberId
  );
  const { create, update, archive, isSaving } =
    useAttendanceAvailabilityMutations(organisationId);
  const [form, setForm] = useState<FormValue>(EMPTY_FORM);
  const [editing, setEditing] = useState<AttendanceAvailability | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const today = format(new Date(), "yyyy-MM-dd");

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
    if (form.reason.trim().length > 200) {
      toast.error("Reason must be 200 characters or fewer");
      return;
    }
    const reason = form.reason.trim();
    if (editing) {
      update(
        editing.id,
        {
          startDate: form.startDate,
          endDate: form.endDate,
          reason,
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
    // The form is above the list: on a phone it is usually off screen.
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const remove = async (period: AttendanceAvailability) => {
    const confirmed = await confirm({
      title: "Remove availability period",
      body: `Remove this ${lowerTerm(
        terms.attendanceSingular
      )} availability period? This will affect only ${lowerTerm(
        terms.attendancePlural
      )} created after the change. Existing ${lowerTerm(
        terms.attendancePlural
      )} will stay unchanged.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    archive(period.id, () => toast.success("Availability period removed"));
  };

  const renderPeriod = (period: AttendanceAvailability) => (
    <Box
      key={period.id}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
      p={4}
    >
      <Text fontWeight="bold">
        {displayDate(period.startDate)} - {displayDate(period.endDate)}
      </Text>
      <Text color="fg.muted">{period.reason || "No reason provided"}</Text>
      <Can perm="attendance.manage">
        <Stack direction="row" mt={3}>
          <Button
            minH="44px"
            variant="outline"
            colorPalette="blue"
            onClick={() => startEditing(period)}
          >
            Edit
          </Button>
          <Button
            minH="44px"
            colorPalette="red"
            variant="outline"
            onClick={() => remove(period)}
          >
            Remove
          </Button>
        </Stack>
      </Can>
    </Box>
  );

  const group = (title: string, items: AttendanceAvailability[]) =>
    items.length > 0 && (
      <Box as="section">
        <Heading as="h2" size="sm" color="fg.muted" letterSpacing="wide" mb={3}>
          {title}
        </Heading>
        <Stack>{items.map(renderPeriod)}</Stack>
      </Box>
    );

  const attendanceTerm = lowerTerm(terms.attendanceSingular);

  return (
    <PageContainer width="form">
      <Heading as="h1" size="lg" mb={2}>
        {member?.name ?? terms.memberSingular}{" "}
        {attendanceTerm} availability
      </Heading>
      <Text mb={6} color="fg.muted">
        This {lowerTerm(terms.memberSingular)} will not be expected for{" "}
        {lowerTerm(terms.attendancePlural)} in an unavailable period.
      </Text>
      <Alert.Root status="info" mb={6}>
        <Alert.Indicator />
        Availability affects {lowerTerm(terms.attendancePlural)} created after
        it is saved. Existing {lowerTerm(terms.attendancePlural)} are not
        recalculated.
      </Alert.Root>

      <Can perm="attendance.manage">
        <Box
          ref={formRef}
          bg="bg.panel"
          rounded="xl"
          boxShadow="lg"
          p={{ base: 4, md: 6 }}
          mb={8}
          scrollMarginTop="4"
        >
          <Heading as="h2" size="md" mb={4}>
            {editing ? "Edit unavailable period" : "Add unavailable period"}
          </Heading>
          <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4}>
            <Field.Root>
              <Field.Label>Start date</Field.Label>
              <DateField
                value={form.startDate}
                onChange={(startDate) => setForm({ ...form, startDate })}
                range={{ role: "start", start: form.startDate, end: form.endDate }}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>End date</Field.Label>
              <DateField
                value={form.endDate}
                onChange={(endDate) => setForm({ ...form, endDate })}
                min={form.startDate || undefined}
                range={{ role: "end", start: form.startDate, end: form.endDate }}
              />
            </Field.Root>
          </SimpleGrid>
          <Field.Root mt={4}>
            <Field.Label>Reason (optional)</Field.Label>
            <Textarea
              value={form.reason}
              maxLength={200}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
              placeholder="Travel, examinations, work assignment..."
            />
          </Field.Root>
          <Stack direction="row" mt={4}>
            <Button
              variant="solid"
              colorPalette="blue"
              onClick={submit}
              loading={isSaving}
            >
              {editing ? "Save changes" : "Add period"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </Stack>
        </Box>
      </Can>

      {isLoading ? (
        <PageLoader h="20vh" label={`Loading ${attendanceTerm} availability...`} />
      ) : isError ? (
        <ErrorState
          title={`Couldn't load ${attendanceTerm} availability`}
          onRetry={() => refetch?.()}
        />
      ) : periods.length === 0 ? (
        <EmptyState
          title={`No ${attendanceTerm} availability periods`}
          description={`This ${lowerTerm(terms.memberSingular)} has no unavailable periods.`}
        />
      ) : (
        <Stack gap={6}>
          {group("CURRENT", current)}
          {group("UPCOMING", upcoming)}
          {group("PAST", past)}
        </Stack>
      )}
      {confirmDialog}
    </PageContainer>
  );
};

export default MemberAttendanceAvailability;
