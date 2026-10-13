import { useState } from "react";
import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaKey, FaUserMinus, FaUserShield, FaUsers } from "react-icons/fa";
import { useConfirm } from "components/ui/confirm-dialog";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import PageLoader from "components/PageLoader";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import useGlobalStore from "zStore";
import { Can } from "rbac/Can";
import { Officer } from "rbac/types";
import InviteOfficerModal from "components/officers/InviteOfficerModal";
import EditOfficerRoleModal from "components/officers/EditOfficerRoleModal";
import EditOfficerPermissionsModal from "components/officers/EditOfficerPermissionsModal";
import PermissionSummary from "components/officers/PermissionSummary";
import RowActions from "components/officers/RowActions";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface Props { organisationId: string; }

const OfficersTab = ({ organisationId }: Props) => {
  const { confirm, confirmDialog } = useConfirm();
  const [organisation] = useGlobalStore((s) => [s.organisation]);
  const terms = useTerms();
  const officerWord = lowerTerm(terms.officerSingular);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Officer | null>(null);
  const [permsTarget, setPermsTarget] = useState<Officer | null>(null);

  const url = convertParamsToString(rbacRequest.OFFICERS, { organisationId });
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useQueryWrapper(queryKeys.rbac.officers(organisationId), url);
  const officers: Officer[] | undefined = data?.data;

  const { mutate: removeMutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.rbac.officers(organisationId),
    })
  );

  const handleRemove = async (o: Officer) => {
    const confirmed = await confirm({
      title: `Remove ${officerWord}`,
      body: `Remove ${o.username} from this organisation?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    removeMutate({
      url: convertParamsToString(rbacRequest.OFFICER_ONE, {
        organisationId,
        userId: o.userId,
      }),
    });
  };

  const body = () => {
    if (isLoading) return <PageLoader h="20vh" />;
    // A failed load is not "no officers": say so and offer a retry.
    if (isError && !officers) {
      return (
        <ErrorState
          title={`Couldn't load ${lowerTerm(terms.officerPlural)}`}
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      );
    }
    if (!officers?.length) {
      return <EmptyState icon={<FaUsers />} title={`No ${lowerTerm(terms.officerPlural)} yet`} />;
    }
    return (
      <GroupedList>
        {officers.map((o) => {
          const isOwnerRow = o.userId === organisation.owner;
          return (
            <GroupedListItem key={o.userId}>
              <Flex align="flex-start" gap={2}>
                <Box flex="1" minW={0}>
                  <Flex align="center" gap={2} wrap="wrap">
                    <Text fontWeight="semibold" lineClamp={1} minW={0}>{o.username}</Text>
                    <Badge colorPalette="blue" variant="subtle">{o.roleName}</Badge>
                    {isOwnerRow && <Badge colorPalette="purple">Owner</Badge>}
                  </Flex>
                  {o.email && (
                    <Text fontSize="sm" color="fg.muted" truncate title={o.email}>{o.email}</Text>
                  )}
                  <PermissionSummary permissions={o.permissions} />
                </Box>
                {!isOwnerRow && (
                  <Can perm="officers.manage">
                    <RowActions
                      label={`Actions for ${o.username}`}
                      actions={[
                        { value: "role", label: "Change role", icon: <FaUserShield />, onSelect: () => setRoleTarget(o) },
                        { value: "permissions", label: "Edit permissions", icon: <FaKey />, onSelect: () => setPermsTarget(o) },
                        { value: "remove", label: "Remove", icon: <FaUserMinus />, onSelect: () => handleRemove(o), destructive: true },
                      ]}
                    />
                  </Can>
                )}
              </Flex>
            </GroupedListItem>
          );
        })}
      </GroupedList>
    );
  };

  return (
    <Box>
      <Can perm="officers.manage">
        <Flex justify="flex-end" mb={3}>
          <Button variant="primary" minH="44px" onClick={() => setInviteOpen(true)}>
            {`Invite ${officerWord}`}
          </Button>
        </Flex>
      </Can>
      {body()}

      <InviteOfficerModal
        organisationId={organisationId}
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <EditOfficerRoleModal
        organisationId={organisationId}
        officer={roleTarget}
        onClose={() => setRoleTarget(null)}
      />
      <EditOfficerPermissionsModal
        organisationId={organisationId}
        officer={permsTarget}
        onClose={() => setPermsTarget(null)}
      />
      {confirmDialog}
    </Box>
  );
};

export default OfficersTab;
