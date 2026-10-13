import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "components/ui/provider";
import ColorModeSwitcher from "components/ColorModeSwitcher";
import { DARK_MODE_ENABLED, THEME_PREVIEW_STORAGE_KEY, THEME_STORAGE_KEY } from "config/colorMode";

const renderAt = (url: string) => {
  window.history.pushState({}, "", url);
  return render(
    <Provider>
      <ColorModeSwitcher />
    </Provider>,
  );
};

const htmlClass = () => document.documentElement.className;

/** Pretend the device is in dark or light mode. */
const deviceDark = (dark: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const choose = async (name: string) => {
  const radio = await screen.findByRole("radio", { name });
  // Ark radios settle asynchronously: flush before clicking, then wait.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  act(() => radio.click());
  await waitFor(() => expect(radio).toBeChecked());
};

describe("<ColorModeSwitcher> with dark mode on for everyone", () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    document.documentElement.className = "";
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });
  afterAll(() => window.history.pushState({}, "", "/"));

  it("is switched on", () => {
    expect(DARK_MODE_ENABLED).toBe(true);
  });

  it("shows the control with System chosen by default, following a dark device", async () => {
    deviceDark(true);
    renderAt("/dashboard");
    expect(await screen.findByRole("radio", { name: "System" })).toBeChecked();
    await waitFor(() => expect(htmlClass()).toContain("dark"));
  });

  it("follows a light device by default", async () => {
    deviceDark(false);
    renderAt("/dashboard");
    expect(await screen.findByRole("radio", { name: "System" })).toBeChecked();
    await waitFor(() => expect(htmlClass()).toContain("light"));
  });

  it("saves a chosen mode as the user's preference and applies it", async () => {
    deviceDark(false);
    renderAt("/dashboard");
    await choose("Dark");
    await waitFor(() => expect(htmlClass()).toContain("dark"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("keeps a saved Light choice on a dark device", async () => {
    deviceDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderAt("/dashboard");
    expect(await screen.findByRole("radio", { name: "Light" })).toBeChecked();
    await waitFor(() => expect(htmlClass()).toContain("light"));
  });

  it("ignores ?theme= previews: the user's own choice wins", async () => {
    deviceDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderAt("/dashboard?theme=dark");
    expect(await screen.findByRole("radio", { name: "Light" })).toBeChecked();
    await waitFor(() => expect(htmlClass()).toContain("light"));
    expect(localStorage.getItem(THEME_PREVIEW_STORAGE_KEY)).toBeNull();
  });
});
