import { useMemo } from "react";
import {
  deleteRequest,
  postRequest,
  putRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { attendanceRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  AttendanceAvailability,
  AttendanceAvailabilityFields,
  AttendanceAvailabilityUpdateFields,
  isValidAvailabilityDate,
  sortAvailabilityPeriods,
  unavailableMemberIds,
} from "helpers/attendanceAvailability";

type AvailabilityResponse = {
  data: AttendanceAvailability[];
};

const emptyPeriods: AttendanceAvailability[] = [];

const availabilityListUrl = (
  organisationId: string,
  filters?: { memberId: string } | { date: string }
) => {
  const path = convertParamsToString(
    attendanceRequest.ATTENDANCE_AVAILABILITY,
    { organisationId }
  );
  return filters ? `${path}?${new URLSearchParams(filters)}` : path;
};

const availabilityItemUrl = (organisationId: string, availabilityId: string) =>
  convertParamsToString(attendanceRequest.ATTENDANCE_AVAILABILITY_ONE, {
    organisationId,
    availabilityId,
  });

const useAvailabilityMutation = () => {
  const invalidate = (organisationId: string) =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.attendanceAvailability.root(organisationId),
    });

  return { invalidate };
};

export const useAttendanceAvailabilityForMember = (
  organisationId: string,
  memberId: string
) => {
  const enabled = Boolean(organisationId && memberId);
  const { data, isLoading, isSuccess, isError, refetch } = useQueryWrapper(
    queryKeys.attendanceAvailability.member(organisationId, memberId),
    availabilityListUrl(organisationId, { memberId }),
    { enabled }
  );
  const periods = useMemo(
    () =>
      sortAvailabilityPeriods(
        (data as AvailabilityResponse | undefined)?.data ?? emptyPeriods
      ),
    [data]
  );

  return { periods, isLoading, isSuccess, isError, refetch };
};

export const useAttendanceAvailabilityForDate = (
  organisationId: string,
  date: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const queryEnabled =
    enabled && Boolean(organisationId && isValidAvailabilityDate(date));
  const { data, isLoading, isFetching, isSuccess, isError, refetch } =
    useQueryWrapper(
      queryKeys.attendanceAvailability.date(organisationId, date),
      availabilityListUrl(organisationId, { date }),
      { enabled: queryEnabled }
    );
  const periods = useMemo(
    () =>
      sortAvailabilityPeriods(
        (data as AvailabilityResponse | undefined)?.data ?? emptyPeriods
      ),
    [data]
  );

  return {
    periods,
    unavailableMemberIds: useMemo(
      () => unavailableMemberIds(periods),
      [periods]
    ),
    isLoading,
    isFetching,
    isSuccess,
    isError,
    refetch,
  };
};

export const useAttendanceAvailabilityMutations = (organisationId: string) => {
  const { invalidate } = useAvailabilityMutation();
  const createMutation = useMutationWrapper(postRequest);
  const updateMutation = useMutationWrapper(putRequest);
  const archiveMutation = useMutationWrapper(deleteRequest);

  const create = (
    fields: AttendanceAvailabilityFields,
    onSuccess?: () => void
  ) =>
    createMutation.mutate(
      { url: availabilityListUrl(organisationId), data: fields },
      { onSettled: () => invalidate(organisationId), onSuccess }
    );
  const update = (
    availabilityId: string,
    fields: AttendanceAvailabilityUpdateFields,
    onSuccess?: () => void
  ) =>
    updateMutation.mutate(
      {
        url: availabilityItemUrl(organisationId, availabilityId),
        data: fields,
      },
      { onSettled: () => invalidate(organisationId), onSuccess }
    );
  const archive = (availabilityId: string, onSuccess?: () => void) =>
    archiveMutation.mutate(
      { url: availabilityItemUrl(organisationId, availabilityId) },
      { onSettled: () => invalidate(organisationId), onSuccess }
    );

  return {
    create,
    update,
    archive,
    isSaving:
      createMutation.isLoading ||
      updateMutation.isLoading ||
      archiveMutation.isLoading,
  };
};
