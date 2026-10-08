import { Box, Flex, Button, Text, Stack, Avatar, Badge } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
  deleteRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { FaTrashAlt, FaCog } from "react-icons/fa";
import { confirmAlert } from "react-confirm-alert";
import { useState } from "react";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import SetEmailModal from "components/auth/SetEmailModal";
import { OrganisationSummary } from "rbac/types";
import { queryKeys } from "services/api/queryKeys";

const OrgList = () => {
  const navigate = useNavigate();
  const [setOrg] = useGlobalStore((state) => [state.updateOrganisation]);
  const onSuccess = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.allOrganisations });
  };

  const { mutate } = useMutationWrapper(deleteRequest, onSuccess);

  const [allOrg, setAllOrg] = useState<OrganisationSummary[]>([]);
  const handleGetOrgSuccess = (res: { data: OrganisationSummary[] }) => {
    setAllOrg(res.data);
  };
  const { refetch } = useQueryWrapper(
    queryKeys.allOrganisations,
    orgRequest.ORGANISATIONS,
    {
      onSuccess: handleGetOrgSuccess,
    }
  );

  function handleDelete(orgDelete, e) {
    e.stopPropagation();
    confirmAlert({
      title: "Delete organisation",
      message: `Are you sure you want to delete "${orgDelete.name}"?`,
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () =>
            mutate({
              url: `/organisations/${orgDelete.id}`,
            }),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
  }

  function handOrg(org) {
    setOrg(org);
    navigate(PROTECTED_PATHS.DASHBOARD, { state: org });
  }

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <SetEmailModal />
      <Button  mt="4" ml="6" onClick={() => navigate(PROTECTED_PATHS.ADD_ORG)}>
        + Add Org
      </Button>
      <Stack
        gap={4}
        w={"full"}
        maxW={"md"}
        bg={useColorModeValue("white", "gray.700")}
        rounded={"xl"}
        boxShadow={"lg"}
        p={6}
        my={12}
        mx="auto"
      >
        {allOrg.length ? (
          <>
            {allOrg.map((org) => (
              <Flex
                key={org.id}
                cursor="pointer"
                borderRadius="10px"
                alignItems="center"
                justifyContent="space-between"
                p="4"
                mb="10px"
                border="1px solid rebeccapurple"
                onClick={() => {
                  handOrg(org);
                }}
              >
                <Flex alignItems="center">
                  <Avatar.Root
                    w="45px"
                    h="45px"
                    // Neutral backing for logos with transparency, so Chakra's
                    // name-derived colour doesn't show through the image.
                    bg={org.image ? "white" : undefined}
                    borderWidth="2px"
                    borderColor="blue.400"><Avatar.Fallback name={org.name} /><Avatar.Image src={org.image} /></Avatar.Root>
                  <Text ml="4" textAlign="left">
                    {" "}
                    {org.name}
                  </Text>
                  {org.roleName && <Badge ml={2}>{org.roleName}</Badge>}
                </Flex>
                <Flex gap={2}>
                  {(org.isOwner ||
                    org.permissions?.includes("settings.view")) && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrg(org);
                        navigate(PROTECTED_PATHS.SETTINGS);
                      }}
                      variant="outline"
                      colorPalette="blue"
                    >
                      <FaCog />
                    </Button>
                  )}
                  {org.isOwner && (
                    <Button
                      onClick={(e) => handleDelete(org, e)}
                      variant="danger"
                    >
                      <FaTrashAlt color="#fff" />
                    </Button>
                  )}
                </Flex>
              </Flex>
            ))}
          </>
        ) : (
          <Text ml="4" fontWeight="bold">
            No organisation yet
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default OrgList;
