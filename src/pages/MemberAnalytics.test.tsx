import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import MemberAnalytics from "pages/MemberAnalytics";

test("renders the header and back button", () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/analytics/member/m1?fromDate=2026-01-01&toDate=2026-06-30"]}>
        <Routes>
          <Route path="/analytics/member/:memberId" element={<MemberAnalytics />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText("Member Analytics")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
});
