import { useMemo } from "react";
import axiosInstance from "services/api";
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

/**
 * Always a fresh network read of the periods covering `date` — never an
 * earlier cached answer, which an edit or archive since could have made
 * wrong, and never one still in flight from an earlier preparation (that
 * request is cancelled first). For one-off reads such as preparing a share
 * message. The answer is cached under the same key as
 * useAttendanceAvailabilityForDate, so the existing per-organisation
 * invalidation still covers it.
 */
export const fetchAttendanceAvailabilityForDate = async (
  organisationId: string,
  date: string
): Promise<AttendanceAvailability[]> => {
  const queryKey = queryKeys.attendanceAvailability.date(organisationId, date);
  await queryClient.cancelQueries({ queryKey, exact: true });
  const response = await queryClient.fetchQuery<AvailabilityResponse>({
    queryKey,
    queryFn: async () =>
      (
        await axiosInstance.get(availabilityListUrl(organisationId, { date }))
      ).data,
    staleTime: 0,
  });
  // A success without a list is not "nobody away": treat it as a failure so
  // a report is never shared with unknown AWAY data. [] is a real answer.
  if (!Array.isArray(response?.data)) {
    throw new Error("Couldn't read who is away for this date.");
  }
  return response.data;
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
