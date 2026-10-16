import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { useUnsavedChangesGuard } from "hooks/useUnsavedChangesGuard";

const ask = () => Promise.resolve(false);

const Guarded = ({ when, savedLocally }: { when: boolean; savedLocally?: boolean }) => {
  useUnsavedChangesGuard(when, ask, { savedLocally });
  return null;
};

/** True when the browser would show its "Leave site?" prompt. */
const reloadPrompts = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("useUnsavedChangesGuard on reload or closing the tab", () => {
  it("lets the browser ask about work held only in memory", () => {
    const { unmount } = render(
      <BrowserRouter>
        <Guarded when />
      </BrowserRouter>,
    );
    expect(reloadPrompts()).toBe(true);
    unmount();
    expect(reloadPrompts()).toBe(false);
  });

  it("never asks about a draft saved on this device", () => {
    const { unmount } = render(
      <BrowserRouter>
        <Guarded when savedLocally />
      </BrowserRouter>,
    );
    expect(reloadPrompts()).toBe(false);
    unmount();
    expect(reloadPrompts()).toBe(false);
  });

  // jsdom runs capture listeners first at the window; Chrome keeps
  // registration order there, so the skip must be registered before history's
  // prompt for a real reload to stay silent.
  it("registers the draft's skip before history's prompt", () => {
    const add = jest.spyOn(window, "addEventListener");
    render(
      <BrowserRouter>
        <Guarded when savedLocally />
      </BrowserRouter>,
    );
    const unloadListeners = add.mock.calls
      .filter(([type]) => type === "beforeunload")
      .map(([, , capture]) => (capture ? "skip" : "prompt"));
    expect(unloadListeners).toEqual(["skip", "prompt"]);
    add.mockRestore();
  });

  it("does not ask while nothing is in progress", () => {
    render(
      <BrowserRouter>
        <Guarded when={false} />
      </BrowserRouter>,
    );
    expect(reloadPrompts()).toBe(false);
  });

  it("stops skipping the prompt once the draft guard is gone", () => {
    const { rerender } = render(
      <BrowserRouter>
        <Guarded when savedLocally />
      </BrowserRouter>,
    );
    rerender(
      <BrowserRouter>
        <Guarded when />
      </BrowserRouter>,
    );
    expect(reloadPrompts()).toBe(true);
  });
});
