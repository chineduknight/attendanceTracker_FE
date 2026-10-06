import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { MemberModelField } from "helpers/attendanceEligibility";

const NO_FIELDS: MemberModelField[] = [];

/** The organisation's configured member fields, from the canonical model cache. */
export const useMemberModel = (organisationId: string) => {
  const url = convertParamsToString(orgRequest.CONFIG_MODEL, { organisationId });
  const { data, isLoading, isSuccess, isError } = useQueryWrapper(
    queryKeys.memberModel(organisationId),
    url,
    { enabled: Boolean(organisationId) },
  );
  const fields: MemberModelField[] = data?.data?.fields ?? NO_FIELDS;
  return { fields, isLoading, isSuccess, isError };
};
