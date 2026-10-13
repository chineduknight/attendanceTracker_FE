import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Button } from "@chakra-ui/react";
import { useState } from "react";
import { render } from "test-utils/render";
import { useConfirm, ConfirmOptions } from "components/ui/confirm-dialog";

const Asker = ({ options }: { options: ConfirmOptions }) => {
  const { confirm, confirmDialog } = useConfirm();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <Button onClick={async () => setAnswer(String(await confirm(options)))}>Ask</Button>
      <p>answer: {answer}</p>
      {confirmDialog}
    </>
  );
};

const DELETE: ConfirmOptions = {
  title: "Delete role",
  body: 'Delete the "Treasurer" role?',
  confirmLabel: "Delete",
  destructive: true,
};

const ask = async (options = DELETE) => {
  render(<Asker options={options} />);
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  return screen.findByRole("alertdialog", { name: options.title });
};

describe("useConfirm", () => {
  it("shows the question with Cancel and the named action", async () => {
    const dialog = await ask();
    expect(dialog).toHaveTextContent('Delete the "Treasurer" role?');
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("resolves true when the action is confirmed", async () => {
    const dialog = await ask();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("answer: true")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("resolves false on Cancel", async () => {
    const dialog = await ask();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("answer: false")).toBeInTheDocument();
  });

  it("resolves false on Escape", async () => {
    const dialog = await ask();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(await screen.findByText("answer: false")).toBeInTheDocument();
  });

  // jsdom can't compute colours; read the palette the button's rule maps to.
  const paletteOf = (button: HTMLElement) => {
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules) as CSSStyleRule[])
      .filter((rule) => Array.from(button.classList).some((cls) => rule.selectorText === `.${cls}`))
      .map((rule) => rule.cssText)
      .join(" ");
    return css.match(/--chakra-colors-color-palette-solid: var\(--chakra-colors-(\w+)-solid\)/)?.[1];
  };

  it("colours a destructive action red", async () => {
    const dialog = await ask();
    expect(paletteOf(within(dialog).getByRole("button", { name: "Delete" }))).toBe("red");
  });

  it("colours other actions blue", async () => {
    const dialog = await ask({ title: "Confirmation", body: "Submit?", confirmLabel: "Submit" });
    expect(paletteOf(within(dialog).getByRole("button", { name: "Submit" }))).toBe("blue");
  });
});
