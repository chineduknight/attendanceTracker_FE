import { useRef } from "react";
import {
  patchRequest,
  queryClient,
  useMutationWrapper,
} from "services/api/apiHelper";
import { attendanceRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { AnalyticsInclusionChange } from "helpers/attendanceAnalyticsInclusion";

/**
 * Exclude a session from, or restore it to, analytics. Only the current
 * organisation's attendance and analytics caches are invalidated; failures
 * surface the backend error through the default mutation handler and leave
 * every cache untouched.
 */
export const useAttendanceAnalyticsInclusion = (
  organisationId: string,
  attendanceId: string
) => {
  const mutation = useMutationWrapper(patchRequest);
  // isLoading reaches the UI a tick late; this blocks a fast second submit.
  const inFlight = useRef(false);

  const setInclusion = (
    change: AnalyticsInclusionChange,
    onSuccess?: () => void
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(
      {
        url: convertParamsToString(attendanceRequest.ANALYTICS_INCLUSION, {
          organisationId,
          id: attendanceId,
        }),
        data: change,
      },
      {
        onSuccess: () => {
          [
            queryKeys.attendance(organisationId, attendanceId),
            queryKeys.attendances(organisationId),
            queryKeys.analytics.root(organisationId),
            queryKeys.analytics.memberRoot(organisationId),
          ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
          onSuccess?.();
        },
        onSettled: () => {
          inFlight.current = false;
        },
      }
    );
  };

  return { setInclusion, isSaving: Boolean(mutation.isLoading) };
};
