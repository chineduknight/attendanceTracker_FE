import { screen } from "@testing-library/react";
import { render } from "test-utils/render";
import PageLoader from "components/PageLoader";

describe("<PageLoader>", () => {
  it("announces its label as a status", () => {
    render(<PageLoader label="Loading members..." h="40vh" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading members...");
  });

  it("defaults to a generic label", () => {
    render(<PageLoader />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });
});
