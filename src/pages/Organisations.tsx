import { Badge, Box, Button, chakra, Flex, IconButton, Menu, Portal, Spinner, Text } from "@chakra-ui/react";
import { NameAvatar } from "components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
  deleteRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { FaBuilding, FaChevronRight, FaCog, FaEllipsisV, FaPlus, FaTrashAlt } from "react-icons/fa";
import { useConfirm } from "components/ui/confirm-dialog";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import SetEmailModal from "components/auth/SetEmailModal";
import { OrganisationSummary } from "rbac/types";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import PageContainer from "components/layout/PageContainer";
import PageLoader from "components/PageLoader";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { forgetOrganisation } from "helpers/forgetOrganisation";

const orgUrl = (id: string) => convertParamsToString(orgRequest.ORGANISATION_ONE, { id });

const OrgList = () => {
  const { confirm, confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const [setOrg] = useGlobalStore((state) => [state.updateOrganisation]);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQueryWrapper(
    queryKeys.allOrganisations,
    orgRequest.ORGANISATIONS,
  );
  const organisations: OrganisationSummary[] | undefined = data?.data;

  const {
    mutate,
    isLoading: isDeleting,
    variables: deleting,
  } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations }),
  );
  const deletingUrl: string | undefined = isDeleting ? deleting?.url : undefined;

  const handleDelete = async (org: OrganisationSummary) => {
    const confirmed = await confirm({
      title: "Delete organisation",
      body: `Are you sure you want to delete "${org.name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    // Only once the backend has deleted it: a failed delete changes nothing.
    if (confirmed) mutate({ url: orgUrl(org.id) }, { onSuccess: () => forgetOrganisation(org.id) });
  };

  const open = (org: OrganisationSummary) => {
    setOrg(org);
    navigate(PROTECTED_PATHS.DASHBOARD, { state: org });
  };

  const openSettings = (org: OrganisationSummary) => {
    setOrg(org);
    navigate(PROTECTED_PATHS.SETTINGS);
  };

  const addButton = (
    <Button minH="44px" onClick={() => navigate(PROTECTED_PATHS.ADD_ORG)}>
      <FaPlus />
      Add organisation
    </Button>
  );

  const body = () => {
    if (isLoading) return <PageLoader h="30vh" />;
    // A failed refresh keeps the list already on screen.
    if (isError && !organisations) {
      return (
        <ErrorState
          title="Couldn't load your organisations"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      );
    }
    if (!organisations?.length) {
      return (
        <EmptyState
          icon={<FaBuilding />}
          title="No organisation yet"
          description="Create one to start taking attendance."
          action={addButton}
        />
      );
    }
    return (
      <GroupedList>
        {organisations.map((org) => {
          const canSettings = org.isOwner || org.permissions?.includes("settings.view");
          const busy = deletingUrl === orgUrl(org.id);
          return (
            <GroupedListItem key={org.id} px={0} py={0} opacity={busy ? 0.6 : 1}>
              <Flex align="center">
                <chakra.button
                  type="button"
                  flex="1"
                  minW={0}
                  minH="64px"
                  px={{ base: 3, md: 4 }}
                  py={2}
                  display="flex"
                  alignItems="center"
                  gap={3}
                  textAlign="start"
                  _hover={{ bg: "bg.muted" }}
                  _focusVisible={{ outline: "2px solid", outlineColor: "blue.focusRing", outlineOffset: "-2px" }}
                  onClick={() => open(org)}
                  disabled={busy}
                >
                  <NameAvatar
                    w="44px"
                    h="44px"
                    flexShrink={0}
                    // Neutral backing for logos with transparency, so Chakra's
                    // name-derived colour doesn't show through the image.
                    bg={org.image ? "white" : undefined}
                    name={org.name}
                    src={org.image}
                  />
                  <Box minW={0} flex="1">
                    <Text fontWeight="semibold" lineClamp={2}>{org.name}</Text>
                    {org.roleName && (
                      <Badge mt={0.5} colorPalette="blue" variant="subtle">{org.roleName}</Badge>
                    )}
                  </Box>
                  {!canSettings && !org.isOwner && (
                    <Box color="fg.subtle" aria-hidden="true"><FaChevronRight /></Box>
                  )}
                </chakra.button>
                {busy && <Spinner size="sm" mx={4} aria-label={`Deleting ${org.name}`} />}
                {!busy && (canSettings || org.isOwner) && (
                  <Menu.Root positioning={{ placement: "bottom-end" }}>
                    <Menu.Trigger asChild>
                      <IconButton
                        aria-label={`More actions for ${org.name}`}
                        variant="ghost"
                        minW="44px"
                        h="44px"
                        flexShrink={0}
                        mr={1}
                      >
                        <FaEllipsisV />
                      </IconButton>
                    </Menu.Trigger>
                    <Portal>
                      <Menu.Positioner>
                        <Menu.Content>
                          {canSettings && (
                            <Menu.Item value="settings" minH="44px" onSelect={() => openSettings(org)}>
                              <FaCog />
                              Settings
                            </Menu.Item>
                          )}
                          {org.isOwner && (
                            <Menu.Item
                              value="delete"
                              minH="44px"
                              color="fg.error"
                              onSelect={() => handleDelete(org)}
                            >
                              <FaTrashAlt />
                              Delete
                            </Menu.Item>
                          )}
                        </Menu.Content>
                      </Menu.Positioner>
                    </Portal>
                  </Menu.Root>
                )}
              </Flex>
            </GroupedListItem>
          );
        })}
      </GroupedList>
    );
  };

  return (
    <PageContainer width="form">
      <SetEmailModal />
      {Boolean(organisations?.length) && (
        <Flex justify="flex-end" mb={3}>{addButton}</Flex>
      )}
      {body()}
      {confirmDialog}
    </PageContainer>
  );
};

export default OrgList;
