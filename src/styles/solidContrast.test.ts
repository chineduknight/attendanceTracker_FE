import { system } from "styles/theme";

// White text on every palette's `.solid` fill must stay readable (WCAG AA,
// 4.5:1): it is the fill behind solid buttons, badges, avatars, attendance
// rows and summary tiles. Yellow is the exception: its contrast text is dark.
const WHITE_TEXT_PALETTES = ["orange", "green", "teal", "cyan", "blue", "pink", "red", "purple"];

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

type TokenValue = string | { _light?: string; _dark?: string; base?: string };
const semanticColors = system._config.theme?.semanticTokens?.colors as Record<
  string,
  Record<string, { value: TokenValue }>
>;

/** The hex a palette's semantic colour resolves to in a mode, following `{colors.x.y}` references. */
const semanticHex = (palette: string, key: "solid" | "contrast", mode: "_light" | "_dark"): string => {
  const value = semanticColors[palette][key].value;
  const raw = typeof value === "string" ? value : value[mode] ?? value.base ?? "";
  const ref = raw.match(/^\{colors\.(.+)\}$/);
  const resolved = ref ? (system.token(`colors.${ref[1]}`) as string) : raw;
  return resolved.toLowerCase() === "white" ? "#ffffff" : resolved.toLowerCase();
};

describe("solid palette fills", () => {
  it.each(WHITE_TEXT_PALETTES)("%s.solid carries white contrast text at 4.5:1 or more in both modes", (palette) => {
    for (const mode of ["_light", "_dark"] as const) {
      const hex = semanticHex(palette, "solid", mode);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      // The text Chakra puts on the fill (colorPalette.contrast) is white...
      expect(semanticHex(palette, "contrast", mode)).toBe("#ffffff");
      // ...and readable on it.
      expect(contrastWithWhite(hex)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
