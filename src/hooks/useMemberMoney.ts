import { useQuery } from "@tanstack/react-query";
import axiosInstance from "services/api";
import { queryKeys } from "services/api/queryKeys";
import { financeRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { MemberMoneySource, toMemberMoneyPage } from "helpers/memberMoney";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

interface OpenMemberMoney {
  /** null when any page was malformed. */
  items: MemberMoneySource[] | null;
  /** false when the page cap was reached with a cursor still outstanding. */
  complete: boolean;
}

/** Reads every open source (bounded) so "nothing held" is real evidence. */
const fetchOpenMemberMoney = async (baseUrl: string): Promise<OpenMemberMoney> => {
  const items: MemberMoneySource[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = `?open=true&limit=${PAGE_SIZE}${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;
    const response = await axiosInstance.get(`${baseUrl}${query}`);
    const parsed = toMemberMoneyPage(response?.data?.data);
    if (!parsed) return { items: null, complete: false };
    items.push(...parsed.items);
    if (!parsed.nextCursor) return { items, complete: true };
    cursor = parsed.nextCursor;
  }
  return { items, complete: false };
};

/**
 * Member-money sources that still hold money, for this organisation only
 * (F2B-2 read, `finance.view`). The server owns every figure.
 */
export const useOpenMemberMoney = (organisationId: string, enabled: boolean) => {
  const baseUrl = convertParamsToString(financeRequest.LEDGER_MEMBER_MONEY, {
    organisationId,
  });
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    queryKeys.finance.ledger.openMemberMoney(organisationId),
    () => fetchOpenMemberMoney(baseUrl),
    { enabled: Boolean(organisationId) && enabled },
  );
  return {
    /** null means unknown or malformed, never "nothing held". */
    sources: data?.items ?? null,
    complete: data ? data.complete : null,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};
