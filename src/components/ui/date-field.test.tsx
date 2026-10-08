import { fireEvent, screen } from "@testing-library/react";
import { Field } from "@chakra-ui/react";
import { useState } from "react";
import { render } from "test-utils/render";
import { DateField } from "components/ui/date-field";

const Harness = ({
  initial = "",
  onValue,
  ...rest
}: {
  initial?: string;
  onValue: (value: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <Field.Root>
      <Field.Label>Start date</Field.Label>
      <DateField
        {...rest}
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
    </Field.Root>
  );
};

describe("<DateField>", () => {
  it("is labelled by its field and shows a YYYY-MM-DD value readably", () => {
    render(<Harness initial="2026-10-08" onValue={jest.fn()} />);
    expect(screen.getByLabelText("Start date")).toHaveValue("Oct 8, 2026");
  });

  it("hands back a YYYY-MM-DD business date when a day is picked", () => {
    const onValue = jest.fn();
    render(<Harness initial="2026-10-08" onValue={onValue} />);
    fireEvent.click(screen.getByLabelText("Start date"));
    fireEvent.click(screen.getByRole("option", { name: /October 15th, 2026/ }));
    expect(onValue).toHaveBeenLastCalledWith("2026-10-15");
  });

  it("disables days past max", () => {
    render(<Harness initial="2026-10-08" max="2026-10-10" onValue={jest.fn()} />);
    fireEvent.click(screen.getByLabelText("Start date"));
    expect(screen.getByRole("option", { name: /October 11th, 2026/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("clears to an empty string", () => {
    const onValue = jest.fn();
    render(<Harness initial="2026-10-08" clearable onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onValue).toHaveBeenLastCalledWith("");
  });
});
