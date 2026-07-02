import { render, screen, fireEvent } from "@testing-library/react";
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

  it("adds a permission when an unchecked box is toggled", () => {
    const onChange = jest.fn();
    render(
      <PermissionGrid areas={["finance"]} value={["finance.view"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("finance.manage"));
    expect(onChange).toHaveBeenCalledWith(["finance.view", "finance.manage"]);
  });

  it("removes a permission when a checked box is toggled", () => {
    const onChange = jest.fn();
    render(
      <PermissionGrid areas={["finance"]} value={["finance.view", "finance.manage"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("finance.view"));
    expect(onChange).toHaveBeenCalledWith(["finance.manage"]);
  });
});
