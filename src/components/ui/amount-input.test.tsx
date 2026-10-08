import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { render } from "test-utils/render";
import { AmountInput } from "components/ui/amount-input";

const Harness = ({ onValue }: { onValue: (value: string) => void }) => {
  const [value, setValue] = useState("");
  return (
    <AmountInput
      aria-label="Amount"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
};

describe("<AmountInput>", () => {
  it("shows 6,000 while handing the form 6000", () => {
    const onValue = jest.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "6000" } });

    expect(input.value).toBe("6,000");
    expect(onValue).toHaveBeenLastCalledWith("6000");
  });

  it("brings up the decimal keypad and ignores non-numeric input", () => {
    const onValue = jest.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(input).toHaveAttribute("inputmode", "decimal");

    fireEvent.change(input, { target: { value: "12ab50.75" } });

    expect(input.value).toBe("1,250.75");
    expect(onValue).toHaveBeenLastCalledWith("1250.75");
  });
});
