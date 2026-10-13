import { Badge, Box, Flex, Heading, Text, Wrap } from "@chakra-ui/react";
import { FaLayerGroup } from "react-icons/fa";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { useCategories } from "hooks/useCategories";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";

interface ExistingCategoriesProps {
  organisationId: string;
  /** Highlights the category a new sub-category will go under. */
  selectedCategoryId?: string;
}

/**
 * What already exists, under the create form, so officers don't add the same
 * category or sub-category twice. Reads the same tenant-scoped cache the form
 * invalidates, so a new entry appears as soon as it's saved.
 */
const ExistingCategories = ({ organisationId, selectedCategoryId }: ExistingCategoriesProps) => {
  const terms = useTerms();
  const { categories, isLoading, isError, error, refetch, isRefetching } = useCategories(organisationId);

  const body = () => {
    if (isLoading) return <PageLoader h="20vh" />;
    if (isError && !categories.length) {
      return (
        <ErrorState
          title={`Couldn't load ${lowerTerm(terms.categoryPlural)}`}
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      );
    }
    if (!categories.length) {
      return <EmptyState icon={<FaLayerGroup />} title={`No ${lowerTerm(terms.categoryPlural)} yet`} />;
    }
    return (
      <GroupedList>
        {categories.map((category) => (
          <GroupedListItem
            key={category.id}
            bg={category.id === selectedCategoryId ? "blue.subtle" : undefined}
          >
            <Flex align="center" gap={2}>
              <Text fontWeight="semibold" flex="1" minW={0} lineClamp={2}>{category.name}</Text>
              {category.status && category.status !== "active" && (
                <Badge colorPalette="gray">{category.status}</Badge>
              )}
            </Flex>
            {category.subCategories.length > 0 ? (
              <Wrap gap={1.5} mt={1.5}>
                {category.subCategories.map((sub) => (
                  <Badge key={sub.id} variant="subtle" colorPalette="blue">{sub.name}</Badge>
                ))}
              </Wrap>
            ) : (
              <Text fontSize="sm" color="fg.muted">{`No ${lowerTerm(terms.subCategoryPlural)}`}</Text>
            )}
          </GroupedListItem>
        ))}
      </GroupedList>
    );
  };

  return (
    <Box as="section" aria-labelledby="existing-categories" mt={6}>
      <Heading id="existing-categories" as="h2" size="sm" mb={2}>
        {`Existing ${lowerTerm(terms.categoryPlural)}`}
      </Heading>
      {body()}
    </Box>
  );
};

export default ExistingCategories;
