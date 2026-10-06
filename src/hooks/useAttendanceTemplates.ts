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

type TemplateResponse = { data: AttendanceTemplate };

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

  const { data, isLoading, isError } = useQueryWrapper(listKey, listUrl, {
    enabled: Boolean(organisationId),
  });
  const templates: AttendanceTemplate[] = data?.data ?? [];

  // Refetch after failures too: a 404/422 usually means the list is out of date
  // (e.g. the template was deleted or renamed on another device).
  const onSettled = () => queryClient.invalidateQueries({ queryKey: listKey });
  const withTemplate =
    (onSuccess?: (template: AttendanceTemplate) => void) =>
    ({ onSettled, onSuccess: (res: TemplateResponse) => onSuccess?.(res.data) });

  const createMutation = useMutationWrapper(postRequest);
  const updateMutation = useMutationWrapper(putRequest);
  const removeMutation = useMutationWrapper(deleteRequest);

  const create = (
    fields: AttendanceTemplateFields,
    { onSuccess }: MutationCallbacks<AttendanceTemplate> = {},
  ) => createMutation.mutate({ url: listUrl, data: fields }, withTemplate(onSuccess));

  const update = (
    templateId: string,
    fields: AttendanceTemplateFields,
    { onSuccess }: MutationCallbacks<AttendanceTemplate> = {},
  ) =>
    updateMutation.mutate(
      { url: templateUrl(templateId), data: fields },
      withTemplate(onSuccess),
    );

  const remove = (
    templateId: string,
    { onSuccess }: MutationCallbacks<void> = {},
  ) =>
    removeMutation.mutate(
      { url: templateUrl(templateId) },
      { onSettled, onSuccess: () => onSuccess?.() },
    );

  return {
    templates,
    isLoading,
    isError,
    create,
    update,
    remove,
    isSaving:
      createMutation.isLoading ||
      updateMutation.isLoading ||
      removeMutation.isLoading,
  };
};
