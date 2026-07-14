import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { useCategories } from "hooks/useCategories";

jest.mock("services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() =>
      Promise.resolve({
        data: {
          data: [
            { id: "c1", name: "Sunday Service", status: "active", subCategories: [] },
          ],
        },
      }),
    ),
  },
}));

function Probe({ orgId }: { orgId: string }) {
  const { categories } = useCategories(orgId);
  return <div>count:{categories.length}</div>;
}

it("returns the fetched categories", async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <Probe orgId="org1" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("count:1")).toBeInTheDocument();
});
