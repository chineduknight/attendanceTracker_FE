import {
  resolveColorModeSetup,
  THEME_PREVIEW_SESSION_KEY,
  THEME_PREVIEW_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "config/colorMode";

describe("resolveColorModeSetup", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  const resolve = (search: string, enabled = false) =>
    resolveColorModeSetup(search, sessionStorage, localStorage, enabled);

  it("forces light for users while dark mode is off", () => {
    expect(resolve("")).toEqual({ mode: "forced-light" });
  });

  it("starts a preview from ?theme= and stores the requested mode apart from the user's", () => {
    expect(resolve("?theme=dark")).toEqual({ mode: "preview", storageKey: THEME_PREVIEW_STORAGE_KEY });
    expect(localStorage.getItem(THEME_PREVIEW_STORAGE_KEY)).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("keeps the preview across navigation in the same tab", () => {
    resolve("?theme=dark");
    expect(resolve("")).toEqual({ mode: "preview", storageKey: THEME_PREVIEW_STORAGE_KEY });
  });

  it("does not carry a preview into a new tab", () => {
    resolve("?theme=dark");
    sessionStorage.clear(); // a new tab has its own sessionStorage
    expect(resolve("")).toEqual({ mode: "forced-light" });
  });

  it("ends the preview with ?theme=off", () => {
    resolve("?theme=dark");
    expect(resolve("?theme=off")).toEqual({ mode: "forced-light" });
    expect(resolve("")).toEqual({ mode: "forced-light" });
  });

  it("ignores unknown values", () => {
    expect(resolve("?theme=purple")).toEqual({ mode: "forced-light" });
  });

  it("follows the user's preference once dark mode is enabled, ignoring previews", () => {
    expect(resolve("?theme=dark", true)).toEqual({ mode: "user", storageKey: THEME_STORAGE_KEY });
    expect(sessionStorage.getItem(THEME_PREVIEW_SESSION_KEY)).toBeNull();
  });

  it("falls back to forced light when storage is unavailable", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(resolveColorModeSetup("?theme=dark", broken, broken, false)).toEqual({ mode: "forced-light" });
  });
});
