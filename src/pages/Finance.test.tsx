import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import Finance from "pages/Finance";

test("renders the four finance tabs", () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Finance />
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByText("Obligations")).toBeInTheDocument();
  expect(screen.getByText("Compliance")).toBeInTheDocument();
  expect(screen.getByText("Payments")).toBeInTheDocument();
  expect(screen.getByText("Accountability")).toBeInTheDocument();
});
