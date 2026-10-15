import { render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { usePrefetchMemberModel } from "hooks/useMemberModel";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

const modelFor = (organisationId: string) => ({
  data: { fields: [{ name: `${organisationId}-field`, label: "Field", type: "string" }] },
});

const Prefetcher = ({ organisationId, enabled }: { organisationId: string; enabled: boolean }) => {
  usePrefetchMemberModel(organisationId, enabled);
  return null;
};

const renderPrefetcher = (organisationId: string, enabled: boolean) =>
  render(
    <QueryClientProvider client={queryClient}>
      <Prefetcher organisationId={organisationId} enabled={enabled} />
    </QueryClientProvider>
  );

describe("usePrefetchMemberModel", () => {
  beforeEach(() => {
    queryClient.clear();
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: modelFor(url.split("/")[2]) })
    );
  });

  it("fills the organisation's own member-model cache", async () => {
    renderPrefetcher("orgA", true);
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.memberModel("orgA"))).toEqual(modelFor("orgA"))
    );
    expect(mockGet).toHaveBeenCalledWith("/organisations/orgA/model");
  });

  it("loads the new organisation on a switch without touching the old one's cache", async () => {
    const { rerender } = renderPrefetcher("orgA", true);
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.memberModel("orgA"))).toBeDefined());

    rerender(
      <QueryClientProvider client={queryClient}>
        <Prefetcher organisationId="orgB" enabled />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.memberModel("orgB"))).toEqual(modelFor("orgB"))
    );
    expect(queryClient.getQueryData(queryKeys.memberModel("orgA"))).toEqual(modelFor("orgA"));
  });

  it("sends nothing without members.view or before an organisation is chosen", async () => {
    renderPrefetcher("orgA", false);
    renderPrefetcher("", true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });
});
