import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { useCategories } from "hooks/useCategories";
import { queryKeys } from "services/api/queryKeys";

function Probe({ orgId }: { orgId: string }) {
  const { categories } = useCategories(orgId);
  return <div>count:{categories.length}</div>;
}

const renderProbe = (orgId: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <Probe orgId={orgId} />
    </QueryClientProvider>,
  );

it("derives the category list from the cached query payload", () => {
  // The API wraps payloads as { data: ... }; the hook should read data.data.
  queryClient.setQueryData(queryKeys.categories("org1"), {
    data: [
      { id: "c1", name: "Sunday Service", status: "active", subCategories: [] },
    ],
  });
  renderProbe("org1");
  expect(screen.getByText("count:1")).toBeInTheDocument();
});

it("returns an empty list before any data has loaded", () => {
  queryClient.removeQueries({ queryKey: queryKeys.categories("org1") });
  // orgId "" keeps the query disabled, so no data is ever present.
  renderProbe("");
  expect(screen.getByText("count:0")).toBeInTheDocument();
});
