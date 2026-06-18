import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Finance from "pages/Finance";

test("renders the four finance tabs", () => {
  render(
    <MemoryRouter>
      <Finance />
    </MemoryRouter>
  );
  expect(screen.getByText("Obligations")).toBeInTheDocument();
  expect(screen.getByText("Compliance")).toBeInTheDocument();
  expect(screen.getByText("Payments")).toBeInTheDocument();
  expect(screen.getByText("Accountability")).toBeInTheDocument();
});
