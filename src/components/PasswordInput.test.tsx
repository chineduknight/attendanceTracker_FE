import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "test-utils/render";
import PasswordInput from "components/PasswordInput";

const renderInForm = () => {
  const onSubmit = jest.fn((e) => e.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" />
      <input aria-label="After" />
    </form>,
  );
  return { onSubmit, input: screen.getByLabelText("Password") };
};

describe("<PasswordInput> show/hide toggle", () => {
  it("is reached by Tab straight after the field, then focus moves on", () => {
    const { input } = renderInForm();
    input.focus();
    userEvent.tab();
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
    userEvent.tab();
    expect(screen.getByLabelText("After")).toHaveFocus();
  });

  it("toggles with Enter and Space without submitting the form", () => {
    const { onSubmit, input } = renderInForm();
    userEvent.type(input, "secret1");
    userEvent.tab();

    userEvent.keyboard("{Enter}");
    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveFocus();

    userEvent.keyboard(" ");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("secret1");
  });

  it("is a non-submit button in the tab order", () => {
    renderInForm();
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
  });
});
