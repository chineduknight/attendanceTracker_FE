import fs from "fs";
import path from "path";
import { THEME_STORAGE_KEY } from "config/colorMode";

// The inline script in public/index.html that applies the colour mode before
// the app's JavaScript (and styles) load, so dark phones get no white flash.
const html = fs.readFileSync(path.join(__dirname, "../../public/index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

const run = ({ stored, systemDark }: { stored: string | null; systemDark: boolean }) => {
  document.documentElement.className = "";
  if (stored === null) localStorage.removeItem(THEME_STORAGE_KEY);
  else localStorage.setItem(THEME_STORAGE_KEY, stored);
  window.matchMedia = jest.fn().mockReturnValue({ matches: systemDark }) as never;
  // eslint-disable-next-line no-new-func
  new Function(script)();
  return document.documentElement.className;
};

describe("pre-paint colour mode script", () => {
  afterEach(() => localStorage.clear());

  it("reads the same storage key as the app", () => {
    expect(script).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it("follows the device when nothing is saved (System is the default)", () => {
    expect(run({ stored: null, systemDark: true })).toBe("dark");
    expect(run({ stored: null, systemDark: false })).toBe("light");
  });

  it("follows the device for a saved System choice", () => {
    expect(run({ stored: "system", systemDark: true })).toBe("dark");
  });

  it("keeps a saved Light or Dark choice whatever the device says", () => {
    expect(run({ stored: "light", systemDark: true })).toBe("light");
    expect(run({ stored: "dark", systemDark: false })).toBe("dark");
  });

  it("paints the dark page background before the app's styles load", () => {
    expect(html).toMatch(/html\.dark \{ background-color: #111111; color-scheme: dark; \}/);
  });
});
