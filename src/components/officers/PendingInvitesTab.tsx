import {
  Box, Button, Table, Thead, Tbody, Tr, Th, Td, Text, Badge,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { Invite } from "rbac/types";

interface Props { organisationId: string; }

const PendingInvitesTab = ({ organisationId }: Props) => {
  const url = convertParamsToString(rbacRequest.INVITES, { organisationId });
  const { data, isLoading } = useQueryWrapper(["officer-invites", organisationId], url);
  const invites: Invite[] = data?.data ?? [];

  const { mutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries(["officer-invites", organisationId])
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
        No emails are sent yet. Share the org name with the person and ask them to sign up (or set their email) with this exact address — they'll appear as an officer automatically.
      </Text>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Email</Th><Th>Role</Th><Th></Th></Tr></Thead>
          <Tbody>
            {invites.map((inv) => (
              <Tr key={inv.id}>
                <Td>{inv.email}</Td>
                <Td><Badge>{inv.roleName}</Badge></Td>
                <Td>
                  <Can perm="officers.manage">
                    <Button size="xs" colorScheme="red" onClick={() => revoke(inv)}>Revoke</Button>
                  </Can>
                </Td>
              </Tr>
            ))}
            {invites.length === 0 && (
              <Tr><Td colSpan={3}><Text color="gray.500">No pending invites.</Text></Td></Tr>
            )}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
};

export default PendingInvitesTab;
