import { useQueryWrapper } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services/api/request";

export interface CommonTypeCategory {
  name: string;
  status: string;
  id: string;
}

export interface SubCategoryType extends CommonTypeCategory {
  parentCategoryId: string;
}

export interface CategoryType extends CommonTypeCategory {
  subCategories: SubCategoryType[];
}

/**
 * Fetches the org's categories (with nested sub-categories). Shared by the
 * create and edit attendance screens. Uses the existing "get-all-category"
 * query key so React Query dedupes across screens.
 */
export const useCategories = (organisationId: string) => {
  const url = convertParamsToString(orgRequest.CATEGORY, { organisationId });
  const { data, isLoading } = useQueryWrapper(["get-all-category"], url, {
    enabled: Boolean(organisationId),
  });
  // The API wraps payloads as { data: ... }; derive the list straight from the
  // query cache rather than mirroring it into local state via onSuccess.
  const categories: CategoryType[] = data?.data ?? [];
  return { categories, isLoading };
};
