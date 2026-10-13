import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "test-utils/render";
import PermissionGrid from "components/officers/PermissionGrid";
import { PERMISSION_AREAS } from "rbac/permissions";

describe("<PermissionGrid>", () => {
  it("pre-checks the provided permissions", () => {
    render(
      <PermissionGrid
        areas={[...PERMISSION_AREAS]}
        value={["finance.view"]}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText("finance.view")).toBeChecked();
    expect(screen.getByLabelText("finance.manage")).not.toBeChecked();
  });

  it("adds a permission when an unchecked box is toggled", async () => {
    const onChange = jest.fn();
    render(
      <PermissionGrid areas={["finance"]} value={["finance.view"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("finance.manage"));
    // v3 checkboxes report changes asynchronously.
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(["finance.view", "finance.manage"])
    );
  });

  it("removes a permission when a checked box is toggled", async () => {
    const onChange = jest.fn();
    render(
      <PermissionGrid areas={["finance"]} value={["finance.view", "finance.manage"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("finance.view"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["finance.manage"]));
  });
});
