import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaEnvelopeOpen } from "react-icons/fa";
import { useConfirm } from "components/ui/confirm-dialog";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { queryKeys } from "services/api/queryKeys";
import PageLoader from "components/PageLoader";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { Can } from "rbac/Can";
import { Invite } from "rbac/types";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm, withArticle } from "helpers/organisationPresentation";

interface Props { organisationId: string; }

const PendingInvitesTab = ({ organisationId }: Props) => {
  const { confirm, confirmDialog } = useConfirm();
  const terms = useTerms();
  const url = convertParamsToString(rbacRequest.INVITES, { organisationId });
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useQueryWrapper(queryKeys.rbac.invites(organisationId), url);
  const invites: Invite[] | undefined = data?.data;

  const { mutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.rbac.invites(organisationId) })
  );

  const revoke = async (inv: Invite) => {
    const confirmed = await confirm({
      title: "Revoke invite",
      body: `Revoke the invite for ${inv.email}?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (confirmed) {
      mutate({ url: convertParamsToString(rbacRequest.INVITE_ONE, { organisationId, inviteId: inv.id }) });
    }
  };

  const body = () => {
    if (isLoading) return <PageLoader h="20vh" />;
    if (isError && !invites) {
      return (
        <ErrorState
          title="Couldn't load pending invites"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      );
    }
    if (!invites?.length) {
      return <EmptyState icon={<FaEnvelopeOpen />} title="No pending invites" />;
    }
    return (
      <GroupedList>
        {invites.map((inv) => (
          <GroupedListItem key={inv.id}>
            <Flex align="center" gap={2}>
              <Box flex="1" minW={0}>
                <Text fontWeight="semibold" truncate title={inv.email}>{inv.email}</Text>
                <Badge colorPalette="blue" variant="subtle">{inv.roleName}</Badge>
              </Box>
              <Can perm="officers.manage">
                <Button
                  size="sm"
                  minH="44px"
                  variant="outline"
                  colorPalette="red"
                  flexShrink={0}
                  aria-label={`Revoke the invite for ${inv.email}`}
                  onClick={() => revoke(inv)}
                >
                  Revoke
                </Button>
              </Can>
            </Flex>
          </GroupedListItem>
        ))}
      </GroupedList>
    );
  };

  return (
    <Box>
      <Text mb={3} fontSize="sm" color="fg.muted">
        No emails are sent yet. Share the org name with the person and ask them to sign up (or set their email) with this exact address — they'll appear as {withArticle(lowerTerm(terms.officerSingular))} automatically.
      </Text>
      {body()}
      {confirmDialog}
    </Box>
  );
};

export default PendingInvitesTab;
