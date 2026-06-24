import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Badge,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import LoadingSpinner from "components/LoadingSpinner";
import useGlobalStore from "zStore";
import { Can } from "rbac/Can";
import { Officer } from "rbac/types";
import InviteOfficerModal from "components/officers/InviteOfficerModal";
import EditOfficerRoleModal from "components/officers/EditOfficerRoleModal";
import EditOfficerPermissionsModal from "components/officers/EditOfficerPermissionsModal";

interface Props { organisationId: string; }

const OfficersTab = ({ organisationId }: Props) => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Officer | null>(null);
  const [permsTarget, setPermsTarget] = useState<Officer | null>(null);

  const url = convertParamsToString(rbacRequest.OFFICERS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["officers", organisationId], url);
  const officers: Officer[] = data?.data ?? [];

  const { mutate: removeMutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries(["officers", organisationId])
  );

  const handleRemove = (o: Officer) =>
    confirmAlert({
      title: "Remove officer",
      message: `Remove ${o.username} from this organisation?`,
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () =>
            removeMutate({
              url: convertParamsToString(rbacRequest.OFFICER_ONE, {
                organisationId,
                userId: o.userId,
              }),
            }),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Flex justify="flex-end" mb={3}>
        <Can perm="officers.manage">
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            Invite officer
          </Button>
        </Can>
      </Flex>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Permissions</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {officers.map((o) => {
              const isOwnerRow = o.userId === organisation.owner;
              return (
                <Tr key={o.userId}>
                  <Td>{o.username}</Td>
                  <Td>{o.email}</Td>
                  <Td>
                    <Badge>{o.roleName}</Badge>
                  </Td>
                  <Td>
                    <Wrap>
                      {o.permissions.map((p) => (
                        <WrapItem key={p}>
                          <Badge colorScheme="green" variant="subtle">
                            {p}
                          </Badge>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Td>
                  <Td>
                    {!isOwnerRow && (
                      <Can perm="officers.manage">
                        <HStack spacing={2}>
                          <Button size="xs" onClick={() => setRoleTarget(o)}>
                            Role
                          </Button>
                          <Button size="xs" onClick={() => setPermsTarget(o)}>
                            Permissions
                          </Button>
                          <Button
                            size="xs"
                            colorScheme="red"
                            onClick={() => handleRemove(o)}
                          >
                            Remove
                          </Button>
                        </HStack>
                      </Can>
                    )}
                  </Td>
                </Tr>
              );
            })}
            {officers.length === 0 && (
              <Tr>
                <Td colSpan={5}>
                  <Text color="gray.500">No officers yet.</Text>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

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
    </Box>
  );
};

export default OfficersTab;
