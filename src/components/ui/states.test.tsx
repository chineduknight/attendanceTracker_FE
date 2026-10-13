import { fireEvent, screen } from "@testing-library/react";
import { Button } from "@chakra-ui/react";
import { render } from "test-utils/render";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";

describe("<EmptyState>", () => {
  it("shows its title, description and next step", () => {
    const onClear = jest.fn();
    render(
      <EmptyState
        title="No member found"
        description='Nothing matches "zed".'
        action={<Button onClick={onClear}>Clear search</Button>}
      />,
    );
    expect(screen.getByText("No member found")).toBeInTheDocument();
    expect(screen.getByText('Nothing matches "zed".')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("<ErrorState>", () => {
  it("is announced and retries on Try again", () => {
    const onRetry = jest.fn();
    render(<ErrorState title="Couldn't load members" description="Server busy" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load members");
    expect(alert).toHaveTextContent("Server busy");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("has no Try again without a retry", () => {
    render(<ErrorState title="Couldn't load members" />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("errorMessage", () => {
  it("reads the backend's error text", () => {
    expect(errorMessage({ response: { data: { error: "Not found" } } })).toBe("Not found");
    expect(errorMessage(new Error("offline"))).toBeUndefined();
    expect(errorMessage(null)).toBeUndefined();
  });
});
