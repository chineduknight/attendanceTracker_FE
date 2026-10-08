import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  
  
  
  
  
  Text,
  Badge,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import LoadingSpinner from "components/LoadingSpinner";
import useGlobalStore from "zStore";
import { Can } from "rbac/Can";
import { Officer } from "rbac/types";
import InviteOfficerModal from "components/officers/InviteOfficerModal";
import EditOfficerRoleModal from "components/officers/EditOfficerRoleModal";
import EditOfficerPermissionsModal from "components/officers/EditOfficerPermissionsModal";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface Props { organisationId: string; }

const OfficersTab = ({ organisationId }: Props) => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);
  const terms = useTerms();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Officer | null>(null);
  const [permsTarget, setPermsTarget] = useState<Officer | null>(null);

  const url = convertParamsToString(rbacRequest.OFFICERS, { organisationId });
  const { data, isLoading } = useQueryWrapper(queryKeys.rbac.officers(organisationId), url);
  const officers: Officer[] = data?.data ?? [];

  const { mutate: removeMutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.rbac.officers(organisationId),
    })
  );

  const handleRemove = (o: Officer) =>
    confirmAlert({
      title: `Remove ${lowerTerm(terms.officerSingular)}`,
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
            {`Invite ${lowerTerm(terms.officerSingular)}`}
          </Button>
        </Can>
      </Flex>
      <Box overflowX="auto">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Email</Table.ColumnHeader>
              <Table.ColumnHeader>Role</Table.ColumnHeader>
              <Table.ColumnHeader>Permissions</Table.ColumnHeader>
              <Table.ColumnHeader></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {officers.map((o) => {
              const isOwnerRow = o.userId === organisation.owner;
              return (
                <Table.Row key={o.userId}>
                  <Table.Cell>{o.username}</Table.Cell>
                  <Table.Cell>{o.email}</Table.Cell>
                  <Table.Cell>
                    <Badge>{o.roleName}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Wrap>
                      {o.permissions.map((p) => (
                        <WrapItem key={p}>
                          <Badge colorPalette="green" variant="subtle">
                            {p}
                          </Badge>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Table.Cell>
                  <Table.Cell>
                    {!isOwnerRow && (
                      <Can perm="officers.manage">
                        <HStack gap={2}>
                          <Button size="xs" onClick={() => setRoleTarget(o)}>
                            Role
                          </Button>
                          <Button size="xs" onClick={() => setPermsTarget(o)}>
                            Permissions
                          </Button>
                          <Button
                            size="xs"
                            colorPalette="red"
                            onClick={() => handleRemove(o)}
                          >
                            Remove
                          </Button>
                        </HStack>
                      </Can>
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
            {officers.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text color="gray.500">{`No ${lowerTerm(terms.officerPlural)} yet.`}</Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Root>
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
