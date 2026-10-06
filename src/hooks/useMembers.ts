import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";

/** A current member: identity plus the organisation's configured field values. */
export type MemberRecord = { id: string; name: string } & Record<string, unknown>;

const NO_MEMBERS: MemberRecord[] = [];

/**
 * The organisation's full current roster from the canonical members cache.
 * Never filtered by eligibility — that is derived per session by the caller.
 */
export const useMembers = (
  organisationId: string,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const url = convertParamsToString(orgRequest.MEMBERS, { organisationId });
  const { data, isLoading, isSuccess, isError, refetch } = useQueryWrapper(
    queryKeys.members(organisationId),
    url,
    { enabled: enabled && Boolean(organisationId) },
  );
  const members: MemberRecord[] = data?.data ?? NO_MEMBERS;
  return { members, isLoading, isSuccess, isError, refetch };
};
