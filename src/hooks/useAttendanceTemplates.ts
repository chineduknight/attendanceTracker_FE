import { useCallback } from "react";
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
  AttendanceTemplate,
  AttendanceTemplateFields,
} from "helpers/attendanceTemplates";

interface MutationCallbacks<T> {
  onSuccess?: (result: T) => void;
}

/**
 * The selected organisation's attendance templates plus their create, update
 * and delete mutations. Every mutation invalidates only this organisation's
 * template list, so no other tenant's cache is touched.
 */
export const useAttendanceTemplates = (organisationId: string) => {
  const listKey = queryKeys.attendanceTemplates(organisationId);
  const listUrl = convertParamsToString(attendanceRequest.ATTENDANCE_TEMPLATES, {
    organisationId,
  });
  const templateUrl = (templateId: string) =>
    convertParamsToString(attendanceRequest.ATTENDANCE_TEMPLATE, {
      organisationId,
      templateId,
    });

  const { data, isLoading } = useQueryWrapper(listKey, listUrl, {
    enabled: Boolean(organisationId),
  });
  const templates: AttendanceTemplate[] = data?.data ?? [];

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.attendanceTemplates(organisationId),
      }),
    [organisationId],
  );

  const createMutation = useMutationWrapper(postRequest, invalidate);
  const updateMutation = useMutationWrapper(putRequest, invalidate);
  const removeMutation = useMutationWrapper(deleteRequest, invalidate);

  const create = (
    fields: AttendanceTemplateFields,
    { onSuccess }: MutationCallbacks<AttendanceTemplate> = {},
  ) =>
    createMutation.mutate(
      { url: listUrl, data: fields },
      { onSuccess: (res: { data: AttendanceTemplate }) => onSuccess?.(res.data) },
    );

  const update = (
    templateId: string,
    fields: AttendanceTemplateFields,
    { onSuccess }: MutationCallbacks<AttendanceTemplate> = {},
  ) =>
    updateMutation.mutate(
      { url: templateUrl(templateId), data: fields },
      { onSuccess: (res: { data: AttendanceTemplate }) => onSuccess?.(res.data) },
    );

  const remove = (
    templateId: string,
    { onSuccess }: MutationCallbacks<void> = {},
  ) =>
    removeMutation.mutate(
      { url: templateUrl(templateId) },
      { onSuccess: () => onSuccess?.() },
    );

  return {
    templates,
    isLoading,
    create,
    update,
    remove,
    isSaving:
      createMutation.isLoading ||
      updateMutation.isLoading ||
      removeMutation.isLoading,
  };
};
