import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "components/ui/provider";
import ColorModeSwitcher from "components/ColorModeSwitcher";
import {
  THEME_PREVIEW_SESSION_KEY,
  THEME_PREVIEW_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "config/colorMode";

// The real Provider: it reads ?theme= from the URL, as the app does.
const renderAt = (url: string) => {
  window.history.pushState({}, "", url);
  return render(
    <Provider>
      <ColorModeSwitcher />
    </Provider>,
  );
};

const htmlClass = () => document.documentElement.className;

describe("<ColorModeSwitcher> while dark mode is off for users", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    document.documentElement.className = "";
  });
  afterAll(() => window.history.pushState({}, "", "/"));

  it("is hidden and the app is forced to light", async () => {
    renderAt("/dashboard");
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
    await waitFor(() => expect(htmlClass()).toContain("light"));
  });

  it("appears during a ?theme=dark preview and applies dark", async () => {
    renderAt("/dashboard?theme=dark");
    expect(await screen.findByRole("radio", { name: "Dark" })).toBeChecked();
    await waitFor(() => expect(htmlClass()).toContain("dark"));
    expect(sessionStorage.getItem(THEME_PREVIEW_SESSION_KEY)).toBe("1");
  });

  it("switches to light from the control without touching the user's preference", async () => {
    renderAt("/dashboard?theme=dark");
    const light = await screen.findByRole("radio", { name: "Light" });
    // Ark radios settle asynchronously: flush before clicking, then wait.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    act(() => light.click());
    await waitFor(() => expect(light).toBeChecked());
    await waitFor(() => expect(htmlClass()).toContain("light"));
    expect(localStorage.getItem(THEME_PREVIEW_STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("goes back to hidden and light after ?theme=off", async () => {
    sessionStorage.setItem(THEME_PREVIEW_SESSION_KEY, "1");
    renderAt("/dashboard?theme=off");
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
    await waitFor(() => expect(htmlClass()).toContain("light"));
  });
});
