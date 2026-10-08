import {
  Box, Button, Table,      Text, Badge,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { Invite } from "rbac/types";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm, withArticle } from "helpers/organisationPresentation";

interface Props { organisationId: string; }

const PendingInvitesTab = ({ organisationId }: Props) => {
  const terms = useTerms();
  const url = convertParamsToString(rbacRequest.INVITES, { organisationId });
  const { data, isLoading } = useQueryWrapper(queryKeys.rbac.invites(organisationId), url);
  const invites: Invite[] = data?.data ?? [];

  const { mutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.invites(organisationId) })
  );

  const revoke = (inv: Invite) =>
    confirmAlert({
      title: "Revoke invite",
      message: `Revoke the invite for ${inv.email}?`,
      buttons: [
        { label: "Yes", className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => mutate({ url: convertParamsToString(rbacRequest.INVITE_ONE, { organisationId, inviteId: inv.id }) }) },
        { label: "No", className: "confirm-alert-button confirm-alert-button-no" },
      ],
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Text mb={3} fontSize="sm" color="gray.600">
        No emails are sent yet. Share the org name with the person and ask them to sign up (or set their email) with this exact address — they'll appear as {withArticle(lowerTerm(terms.officerSingular))} automatically.
      </Text>
      <Box overflowX="auto">
        <Table.Root size="sm">
          <Table.Header><Table.Row><Table.ColumnHeader>Email</Table.ColumnHeader><Table.ColumnHeader>Role</Table.ColumnHeader><Table.ColumnHeader></Table.ColumnHeader></Table.Row></Table.Header>
          <Table.Body>
            {invites.map((inv) => (
              <Table.Row key={inv.id}>
                <Table.Cell>{inv.email}</Table.Cell>
                <Table.Cell><Badge>{inv.roleName}</Badge></Table.Cell>
                <Table.Cell>
                  <Can perm="officers.manage">
                    <Button size="xs" colorPalette="red" onClick={() => revoke(inv)}>Revoke</Button>
                  </Can>
                </Table.Cell>
              </Table.Row>
            ))}
            {invites.length === 0 && (
              <Table.Row><Table.Cell colSpan={3}><Text color="gray.500">No pending invites.</Text></Table.Cell></Table.Row>
            )}
          </Table.Body>
        </Table.Root>
      </Box>
    </Box>
  );
};

export default PendingInvitesTab;
