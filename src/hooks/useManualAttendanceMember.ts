import { useRef } from "react";
import {
  deleteRequest,
  postRequest,
  queryClient,
  useMutationWrapper,
} from "services/api/apiHelper";
import { attendanceRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  ManualAdditionInput,
  toManualAdditionPayload,
} from "helpers/manualAttendance";

/**
 * Add a not-expected member who physically attended to a stored session, or
 * remove such a manual entry. Nothing changes locally until the backend
 * confirms: failures surface the backend error through the default mutation
 * handler, and success invalidates only the current organisation's session,
 * list, export and analytics caches (the attendee counts there immediately).
 */
export const useManualAttendanceMember = (
  organisationId: string,
  attendanceId: string
) => {
  const addMutation = useMutationWrapper(postRequest);
  const removeMutation = useMutationWrapper(deleteRequest);
  // isLoading reaches the UI a tick late; this blocks a fast second submit.
  const inFlight = useRef(false);

  const run = (
    mutate: (variables: object, options: object) => void,
    variables: { url: string; data?: object },
    onSuccess?: () => void
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutate(variables, {
      onSuccess: () => {
        [
          queryKeys.attendance(organisationId, attendanceId),
          queryKeys.attendances(organisationId),
          queryKeys.attendanceExport(organisationId, attendanceId),
          queryKeys.analytics.root(organisationId),
          queryKeys.analytics.memberRoot(organisationId),
        ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
        onSuccess?.();
      },
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  const addMember = (input: ManualAdditionInput, onSuccess?: () => void) =>
    run(
      addMutation.mutate,
      {
        url: convertParamsToString(attendanceRequest.MANUAL_MEMBERS, {
          organisationId,
          id: attendanceId,
        }),
        data: toManualAdditionPayload(input),
      },
      onSuccess
    );

  const removeMember = (memberId: string, onSuccess?: () => void) =>
    run(
      removeMutation.mutate,
      {
        url: convertParamsToString(attendanceRequest.MANUAL_MEMBER, {
          organisationId,
          id: attendanceId,
          memberId,
        }),
      },
      onSuccess
    );

  return {
    addMember,
    removeMember,
    isAdding: Boolean(addMutation.isLoading),
    isRemoving: Boolean(removeMutation.isLoading),
  };
};
